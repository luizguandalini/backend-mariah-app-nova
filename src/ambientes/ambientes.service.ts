import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ambiente } from './entities/ambiente.entity';
import { CreateAmbienteDto } from './dto/create-ambiente.dto';
import { UpdateAmbienteDto } from './dto/update-ambiente.dto';
import { ItensAmbienteService } from './itens-ambiente.service';
import { TipoUso, TipoImovel } from './enums/ambiente-tipos.enum';

@Injectable()
export class AmbientesService {
  constructor(
    @InjectRepository(Ambiente)
    private readonly ambienteRepository: Repository<Ambiente>,
    @Inject(forwardRef(() => ItensAmbienteService))
    private readonly itensAmbienteService: ItensAmbienteService,
  ) {}

  async create(createAmbienteDto: CreateAmbienteDto): Promise<Ambiente> {
    const ambienteExistente = await this.ambienteRepository.findOne({
      where: { nome: createAmbienteDto.nome },
    });

    if (ambienteExistente) {
      throw new ConflictException(
        `Já existe um ambiente chamado "${createAmbienteDto.nome}". Escolha outro nome!`,
      );
    }

    // Define a ordem automaticamente
    const maxOrdem = await this.ambienteRepository
      .createQueryBuilder('ambiente')
      .select('MAX(ambiente.ordem)', 'max')
      .getRawOne();

    const proximaOrdem = (maxOrdem?.max || 0) + 1;

    const ambiente = this.ambienteRepository.create({
      ...createAmbienteDto,
      ordem: proximaOrdem,
    });

    return await this.ambienteRepository.save(ambiente);
  }

  async findAll(): Promise<Ambiente[]> {
    return await this.ambienteRepository.find({
      where: { ativo: true },
      order: { ordem: 'ASC', nome: 'ASC' },
    });
  }

  async findAllWithTree(): Promise<any[]> {
    const ambientes = await this.ambienteRepository.find({
      where: { ativo: true },
      order: { ordem: 'ASC', nome: 'ASC' },
    });

    // Agrupar ambientes com mesmo grupoId
    const grupos = new Map<string, any>();
    const ambientesSemGrupo: any[] = [];

    for (const ambiente of ambientes) {
      const itens = await this.itensAmbienteService.findAllByAmbiente(ambiente.id);

      if (ambiente.grupoId) {
        if (!grupos.has(ambiente.grupoId)) {
          grupos.set(ambiente.grupoId, {
            id: ambiente.grupoId,
            nome: ambiente.nome,
            isGrupo: true,
            grupoId: ambiente.grupoId,
            ambientes: [],
            nomes: [],
            tiposUso: ambiente.tiposUso,
            tiposImovel: ambiente.tiposImovel,
            ativo: ambiente.ativo,
            ordem: ambiente.ordem,
            itens: itens,
            createdAt: ambiente.createdAt,
            updatedAt: ambiente.updatedAt,
          });
        }

        const grupo = grupos.get(ambiente.grupoId);
        grupo.ambientes.push({
          id: ambiente.id,
          nome: ambiente.nome,
          // NÃO incluir tipos - eles vêm do grupo
        });
        grupo.nomes.push(ambiente.nome);
        grupo.nome = grupo.nomes.join(' + ');
      } else {
        ambientesSemGrupo.push({
          ...ambiente,
          itens,
          isGrupo: false,
        });
      }
    }

    return [...Array.from(grupos.values()), ...ambientesSemGrupo];
  }

  async findOne(id: string): Promise<Ambiente> {
    const ambiente = await this.ambienteRepository.findOne({
      where: { id },
      relations: ['itens'],
    });

    if (!ambiente) {
      throw new NotFoundException('Ambiente não encontrado');
    }

    return ambiente;
  }

  async update(id: string, updateAmbienteDto: UpdateAmbienteDto): Promise<Ambiente> {
    const ambiente = await this.findOne(id);

    if (updateAmbienteDto.nome && updateAmbienteDto.nome !== ambiente.nome) {
      const ambienteExistente = await this.ambienteRepository.findOne({
        where: { nome: updateAmbienteDto.nome },
      });

      if (ambienteExistente) {
        throw new ConflictException(
          `Já existe um ambiente chamado "${updateAmbienteDto.nome}". Escolha outro nome!`,
        );
      }
    }

    // Troca ordem se necessário
    if (updateAmbienteDto.ordem && updateAmbienteDto.ordem !== ambiente.ordem) {
      await this.trocarOrdem(ambiente.id, ambiente.ordem, updateAmbienteDto.ordem);
    }

    Object.assign(ambiente, updateAmbienteDto);
    return await this.ambienteRepository.save(ambiente);
  }

  async updateTiposOnly(
    id: string,
    updateAmbienteDto: UpdateAmbienteDto,
  ): Promise<{ id: string; tiposUso?: string[]; tiposImovel?: string[] }> {
    // Busca ambiente com grupoId
    const ambiente = await this.ambienteRepository.findOne({
      where: { id },
      select: ['id', 'tiposUso', 'tiposImovel', 'grupoId'],
    });

    if (!ambiente) {
      throw new NotFoundException('Ambiente não encontrado');
    }

    // Atualiza apenas os tipos que foram fornecidos
    if (updateAmbienteDto.tiposUso !== undefined) {
      ambiente.tiposUso = updateAmbienteDto.tiposUso;
    }
    if (updateAmbienteDto.tiposImovel !== undefined) {
      ambiente.tiposImovel = updateAmbienteDto.tiposImovel;
    }

    // Se faz parte de um grupo, atualizar TODOS os ambientes do grupo de uma vez
    if (ambiente.grupoId) {
      const updateData: any = {};
      if (updateAmbienteDto.tiposUso !== undefined) {
        updateData.tiposUso = ambiente.tiposUso;
      }
      if (updateAmbienteDto.tiposImovel !== undefined) {
        updateData.tiposImovel = ambiente.tiposImovel;
      }

      // UPDATE otimizado - uma única query para todos do grupo
      await this.ambienteRepository.update({ grupoId: ambiente.grupoId }, updateData);
    } else {
      // Se não é grupo, apenas salva o ambiente individual
      await this.ambienteRepository.save(ambiente);
    }

    // Retorna apenas os campos necessários
    return {
      id: ambiente.id,
      tiposUso: ambiente.tiposUso,
      tiposImovel: ambiente.tiposImovel,
    };
  }

  async remove(id: string): Promise<void> {
    const ambiente = await this.findOne(id);
    await this.ambienteRepository.remove(ambiente);
  }

  /**
   * Adicionar tipo de uso a um ambiente (e todos do grupo se aplicável)
   */
  async adicionarTipoUso(id: string, tipo: string): Promise<{ id: string; tiposUso: string[] }> {
    const ambiente = await this.ambienteRepository.findOne({
      where: { id },
      select: ['id', 'tiposUso', 'grupoId'],
    });

    if (!ambiente) {
      throw new NotFoundException('Ambiente não encontrado');
    }

    // Validar se o tipo é válido
    const tiposValidos = Object.values(TipoUso);
    if (!tiposValidos.includes(tipo as TipoUso)) {
      throw new BadRequestException(`Tipo de uso inválido: ${tipo}`);
    }

    const tipoEnum = tipo as TipoUso;

    // Adicionar tipo se ainda não existir
    if (!ambiente.tiposUso.includes(tipoEnum)) {
      ambiente.tiposUso = [...ambiente.tiposUso, tipoEnum];

      if (ambiente.grupoId) {
        // UPDATE em todos do grupo
        await this.ambienteRepository
          .createQueryBuilder()
          .update()
          .set({ tiposUso: () => `array_append(tipos_uso, '${tipo}')` })
          .where('grupo_id = :grupoId', { grupoId: ambiente.grupoId })
          .andWhere(':tipo != ALL(tipos_uso)', { tipo })
          .execute();
      } else {
        await this.ambienteRepository.save(ambiente);
      }
    }

    return { id: ambiente.id, tiposUso: ambiente.tiposUso };
  }

  /**
   * Remover tipo de uso de um ambiente (e todos do grupo se aplicável)
   */
  async removerTipoUso(id: string, tipo: string): Promise<{ id: string; tiposUso: string[] }> {
    const ambiente = await this.ambienteRepository.findOne({
      where: { id },
      select: ['id', 'tiposUso', 'grupoId'],
    });

    if (!ambiente) {
      throw new NotFoundException('Ambiente não encontrado');
    }

    // Validar se o tipo é válido
    const tiposValidos = Object.values(TipoUso);
    if (!tiposValidos.includes(tipo as TipoUso)) {
      throw new BadRequestException(`Tipo de uso inválido: ${tipo}`);
    }

    const tipoEnum = tipo as TipoUso;

    // Remover tipo se existir
    if (ambiente.tiposUso.includes(tipoEnum)) {
      ambiente.tiposUso = ambiente.tiposUso.filter((t) => t !== tipoEnum);

      if (ambiente.grupoId) {
        // UPDATE em todos do grupo
        await this.ambienteRepository
          .createQueryBuilder()
          .update()
          .set({ tiposUso: () => `array_remove(tipos_uso, '${tipo}')` })
          .where('grupo_id = :grupoId', { grupoId: ambiente.grupoId })
          .execute();
      } else {
        await this.ambienteRepository.save(ambiente);
      }
    }

    return { id: ambiente.id, tiposUso: ambiente.tiposUso };
  }

  /**
   * Adicionar tipo de imóvel a um ambiente (e todos do grupo se aplicável)
   */
  async adicionarTipoImovel(
    id: string,
    tipo: string,
  ): Promise<{ id: string; tiposImovel: string[] }> {
    const ambiente = await this.ambienteRepository.findOne({
      where: { id },
      select: ['id', 'tiposImovel', 'grupoId'],
    });

    if (!ambiente) {
      throw new NotFoundException('Ambiente não encontrado');
    }

    // Validar se o tipo é válido
    const tiposValidos = Object.values(TipoImovel);
    if (!tiposValidos.includes(tipo as TipoImovel)) {
      throw new BadRequestException(`Tipo de imóvel inválido: ${tipo}`);
    }

    const tipoEnum = tipo as TipoImovel;

    // Adicionar tipo se ainda não existir
    if (!ambiente.tiposImovel.includes(tipoEnum)) {
      ambiente.tiposImovel = [...ambiente.tiposImovel, tipoEnum];

      if (ambiente.grupoId) {
        // UPDATE em todos do grupo
        await this.ambienteRepository
          .createQueryBuilder()
          .update()
          .set({ tiposImovel: () => `array_append(tipos_imovel, '${tipo}')` })
          .where('grupo_id = :grupoId', { grupoId: ambiente.grupoId })
          .andWhere(':tipo != ALL(tipos_imovel)', { tipo })
          .execute();
      } else {
        await this.ambienteRepository.save(ambiente);
      }
    }

    return { id: ambiente.id, tiposImovel: ambiente.tiposImovel };
  }

  /**
   * Remover tipo de imóvel de um ambiente (e todos do grupo se aplicável)
   */
  async removerTipoImovel(
    id: string,
    tipo: string,
  ): Promise<{ id: string; tiposImovel: string[] }> {
    const ambiente = await this.ambienteRepository.findOne({
      where: { id },
      select: ['id', 'tiposImovel', 'grupoId'],
    });

    if (!ambiente) {
      throw new NotFoundException('Ambiente não encontrado');
    }

    // Validar se o tipo é válido
    const tiposValidos = Object.values(TipoImovel);
    if (!tiposValidos.includes(tipo as TipoImovel)) {
      throw new BadRequestException(`Tipo de imóvel inválido: ${tipo}`);
    }

    const tipoEnum = tipo as TipoImovel;

    // Remover tipo se existir
    if (ambiente.tiposImovel.includes(tipoEnum)) {
      ambiente.tiposImovel = ambiente.tiposImovel.filter((t) => t !== tipoEnum);

      if (ambiente.grupoId) {
        // UPDATE em todos do grupo
        await this.ambienteRepository
          .createQueryBuilder()
          .update()
          .set({ tiposImovel: () => `array_remove(tipos_imovel, '${tipo}')` })
          .where('grupo_id = :grupoId', { grupoId: ambiente.grupoId })
          .execute();
      } else {
        await this.ambienteRepository.save(ambiente);
      }
    }

    return { id: ambiente.id, tiposImovel: ambiente.tiposImovel };
  }

  async agruparCom(ambienteId: string, nomeAmbiente: string): Promise<Ambiente> {
    // 1. Buscar ambiente original
    const ambienteOriginal = await this.ambienteRepository.findOne({
      where: { id: ambienteId },
      relations: ['itens'],
    });

    if (!ambienteOriginal) {
      throw new NotFoundException('Ambiente não encontrado');
    }

    // 2. Verificar se ambiente com esse nome já existe (incluindo em grupos)
    let ambienteAlvo = await this.ambienteRepository.findOne({
      where: { nome: nomeAmbiente, ativo: true },
    });

    if (ambienteAlvo) {
      // 2.1 Verificar se estão no mesmo grupo
      if (ambienteOriginal.grupoId && ambienteOriginal.grupoId === ambienteAlvo.grupoId) {
        throw new BadRequestException(
          `"${nomeAmbiente}" já está neste grupo! Escolha outro ambiente ou crie um novo.`,
        );
      }

      // 2.2 Se o ambiente alvo já está em outro grupo, não permitir
      if (ambienteAlvo.grupoId && ambienteAlvo.grupoId !== ambienteOriginal.grupoId) {
        throw new BadRequestException(
          `"${nomeAmbiente}" já faz parte de outro grupo. Para agrupar, primeiro remova-o do grupo atual.`,
        );
      }
    }

    if (!ambienteAlvo) {
      // 3. Não existe → Criar novo ambiente com mesmas configurações
      const maxOrdem = await this.ambienteRepository
        .createQueryBuilder('ambiente')
        .select('MAX(ambiente.ordem)', 'max')
        .getRawOne();

      const proximaOrdem = (maxOrdem?.max || 0) + 1;

      ambienteAlvo = this.ambienteRepository.create({
        nome: nomeAmbiente,
        tiposUso: ambienteOriginal.tiposUso,
        tiposImovel: ambienteOriginal.tiposImovel,
        ativo: true,
        descricao: `Agrupado com ${ambienteOriginal.nome}`,
        ordem: proximaOrdem,
      });

      ambienteAlvo = await this.ambienteRepository.save(ambienteAlvo);

      // 4. Copiar todos os itens do ambiente original para o novo
      if (ambienteOriginal.itens && ambienteOriginal.itens.length > 0) {
        for (const itemOriginal of ambienteOriginal.itens) {
          await this.itensAmbienteService.create(ambienteAlvo.id, {
            nome: itemOriginal.nome,
            prompt: itemOriginal.prompt,
            ativo: itemOriginal.ativo,
            parentId: itemOriginal.parentId,
          });
        }
      }
    }

    // 5. Agrupar ambos (criar ou usar grupo_id existente)
    const grupoId = ambienteOriginal.grupoId || this.gerarUUID();

    // 6. Sincronizar tipos de uso/imóvel entre TODOS os ambientes do grupo
    // Se o ambiente original já está em um grupo, pegar tipos de todos do grupo
    let tiposUsoComuns = ambienteOriginal.tiposUso || [];
    let tiposImovelComuns = ambienteOriginal.tiposImovel || [];

    if (ambienteOriginal.grupoId) {
      // Buscar todos do grupo existente e unir os tipos
      const ambientesDoGrupo = await this.ambienteRepository.find({
        where: { grupoId: ambienteOriginal.grupoId },
      });

      const todosOsTiposUso = new Set<string>();
      const todosOsTiposImovel = new Set<string>();

      ambientesDoGrupo.forEach((amb) => {
        amb.tiposUso?.forEach((tipo) => todosOsTiposUso.add(tipo));
        amb.tiposImovel?.forEach((tipo) => todosOsTiposImovel.add(tipo));
      });

      tiposUsoComuns = Array.from(todosOsTiposUso) as any[];
      tiposImovelComuns = Array.from(todosOsTiposImovel) as any[];
    }

    // Atualizar TODOS os ambientes do grupo com os mesmos tipos
    await this.ambienteRepository.update(ambienteOriginal.id, {
      grupoId: grupoId,
      tiposUso: tiposUsoComuns,
      tiposImovel: tiposImovelComuns,
    });
    await this.ambienteRepository.update(ambienteAlvo.id, {
      grupoId: grupoId,
      tiposUso: tiposUsoComuns,
      tiposImovel: tiposImovelComuns,
    });

    // 7. Retornar ambiente atualizado
    return await this.findOne(ambienteAlvo.id);
  }

  private gerarUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0,
        v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private async trocarOrdem(
    ambienteId: string,
    ordemAtual: number,
    novaOrdem: number,
  ): Promise<void> {
    const ambienteNaPosicao = await this.ambienteRepository.findOne({
      where: { ordem: novaOrdem },
    });

    if (ambienteNaPosicao && ambienteNaPosicao.id !== ambienteId) {
      ambienteNaPosicao.ordem = ordemAtual;
      await this.ambienteRepository.save(ambienteNaPosicao);
    }
  }
}
