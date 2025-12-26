import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ItemAmbiente } from './entities/item-ambiente.entity';
import { CreateItemAmbienteDto } from './dto/create-item-ambiente.dto';
import { UpdateItemAmbienteDto } from './dto/update-item-ambiente.dto';

@Injectable()
export class ItensAmbienteService {
  constructor(
    @InjectRepository(ItemAmbiente)
    private readonly itemRepository: Repository<ItemAmbiente>,
  ) {}

  async create(ambienteId: string, createItemDto: CreateItemAmbienteDto): Promise<ItemAmbiente> {
    // Validar se o parentId existe, se fornecido
    if (createItemDto.parentId) {
      const parentExists = await this.itemRepository.findOne({
        where: { id: createItemDto.parentId, ambienteId },
      });

      if (!parentExists) {
        throw new NotFoundException(
          `Item pai com ID ${createItemDto.parentId} não encontrado neste ambiente`,
        );
      }
    }

    // Define a ordem automaticamente dentro do ambiente/parent
    const queryBuilder = this.itemRepository
      .createQueryBuilder('item')
      .where('item.ambienteId = :ambienteId', { ambienteId });

    if (createItemDto.parentId) {
      queryBuilder.andWhere('item.parentId = :parentId', { parentId: createItemDto.parentId });
    } else {
      queryBuilder.andWhere('item.parentId IS NULL');
    }

    const maxOrdem = await queryBuilder.select('MAX(item.ordem)', 'max').getRawOne();

    const proximaOrdem = (maxOrdem?.max || 0) + 1;

    const item = this.itemRepository.create({
      ...createItemDto,
      ambienteId,
      ordem: proximaOrdem,
    });

    return await this.itemRepository.save(item);
  }

  async findAllByAmbiente(ambienteId: string): Promise<ItemAmbiente[]> {
    // Retorna todos os itens do ambiente com seus filhos em estrutura hierárquica
    const allItems = await this.itemRepository.find({
      where: { ambienteId },
      order: { ordem: 'ASC' },
    });

    // Monta a árvore hierárquica
    return this.buildTree(allItems);
  }

  async findOne(id: string): Promise<ItemAmbiente> {
    const item = await this.itemRepository.findOne({
      where: { id },
      relations: ['filhos'],
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado');
    }

    return item;
  }

  async update(id: string, updateItemDto: UpdateItemAmbienteDto): Promise<ItemAmbiente> {
    const item = await this.findOne(id);

    // Troca ordem se necessário
    if (updateItemDto.ordem && updateItemDto.ordem !== item.ordem) {
      await this.trocarOrdem(
        item.ambienteId,
        item.parentId,
        item.id,
        item.ordem,
        updateItemDto.ordem,
      );
    }

    Object.assign(item, updateItemDto);
    return await this.itemRepository.save(item);
  }

  async remove(id: string): Promise<void> {
    const item = await this.findOne(id);
    await this.itemRepository.remove(item);
  }

  private buildTree(items: ItemAmbiente[]): ItemAmbiente[] {
    const map = new Map<string, ItemAmbiente>();
    const roots: ItemAmbiente[] = [];

    // Primeiro, criar o mapa
    items.forEach((item) => {
      map.set(item.id, { ...item, filhos: [] });
    });

    // Depois, construir a árvore
    items.forEach((item) => {
      const node = map.get(item.id);
      if (item.parentId) {
        const parent = map.get(item.parentId);
        if (parent) {
          parent.filhos.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  private async trocarOrdem(
    ambienteId: string,
    parentId: string,
    itemId: string,
    ordemAtual: number,
    novaOrdem: number,
  ): Promise<void> {
    const whereClause: any = { ambienteId, ordem: novaOrdem };
    if (parentId) {
      whereClause.parentId = parentId;
    } else {
      whereClause.parentId = IsNull();
    }

    const itemNaPosicao = await this.itemRepository.findOne({
      where: whereClause,
    });

    if (itemNaPosicao && itemNaPosicao.id !== itemId) {
      itemNaPosicao.ordem = ordemAtual;
      await this.itemRepository.save(itemNaPosicao);
    }
  }
}
