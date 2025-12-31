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

    return this.buildAmbientesTree(ambientes);
  }

  async findAllWithTreePaginated(
    limit: number = 10,
    offset: number = 0,
  ): Promise<{ data: any[]; total: number; hasMore: boolean }> {
    // Buscar total de ambientes únicos (contando grupos como 1)
    const allAmbientes = await this.ambienteRepository.find({
      where: { ativo: true },
      order: { ordem: 'ASC', nome: 'ASC' },
    });

    const allTree = await this.buildAmbientesTree(allAmbientes);
    const total = allTree.length;

    // Paginar a árvore construída
    const paginatedTree = allTree.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return {
      data: paginatedTree,
      total,
      hasMore,
    };
  }

  /**
   * Listar todos os nomes de ambientes disponíveis (para app mobile)
   */
  async listarNomes(): Promise<string[]> {
    const ambientes = await this.ambienteRepository.find({
      where: { ativo: true },
      select: ['nome'],
      order: { nome: 'ASC' },
    });

    // Retornar lista de nomes únicos
    const nomes = [...new Set(ambientes.map((a) => a.nome))];
    return nomes;
  }

  /**
   * Buscar itens PAI de um ambiente por nome (para app mobile - câmera)
   * - Busca ambiente(s) pelo nome (case-insensitive)
   * - Se ambiente faz parte de grupo, consolida itens de todos do grupo
   * - Retorna apenas itens PAI (parentId = null)
   * - Ordena por campo ordem
   */
  async getItensPorNome(nome: string): Promise<any[]> {
    // Buscar ambiente(s) com o nome fornecido (case-insensitive)
    const ambientes = await this.ambienteRepository
      .createQueryBuilder('ambiente')
      .where('LOWER(ambiente.nome) = LOWER(:nome)', { nome })
      .andWhere('ambiente.ativo = :ativo', { ativo: true })
      .getMany();

    if (ambientes.length === 0) {
      throw new NotFoundException(
        `Ambiente "${nome}" não encontrado. Verifique o nome ou escolha da lista de ambientes disponíveis.`,
      );
    }

    // Se o primeiro ambiente tem grupoId, buscar todos do grupo
    const primeiroAmbiente = ambientes[0];
    let ambientesParaBuscar = ambientes;

    if (primeiroAmbiente.grupoId) {
      ambientesParaBuscar = await this.ambienteRepository.find({
        where: { grupoId: primeiroAmbiente.grupoId, ativo: true },
      });
    }

    // Buscar todos os itens PAI desses ambientes
    const itensMap = new Map<string, any>();

    for (const ambiente of ambientesParaBuscar) {
      const itens = await this.itensAmbienteService.findAllByAmbiente(ambiente.id);

      // Filtrar apenas itens PAI (parentId = null) e ativos
      const itensPai = itens.filter((item) => !item.parentId && item.ativo);

      // Consolidar itens únicos por nome
      for (const item of itensPai) {
        if (!itensMap.has(item.nome)) {
          itensMap.set(item.nome, {
            id: item.id,
            nome: item.nome,
            prompt: item.prompt,
            ordem: item.ordem,
          });
        }
      }
    }

    // Converter Map para array e ordenar por ordem
    const itensUnicos = Array.from(itensMap.values()).sort(
      (a, b) => a.ordem - b.ordem,
    );

    return itensUnicos;
  }

  /**
   * Buscar todos os ambientes com seus itens PAI para sincronização (app mobile)
   * Retorna estrutura consolidada para cache local no dispositivo
   */
  async getTodosComItens(): Promise<any> {
    // Buscar todos os ambientes ativos
    const todosAmbientes = await this.ambienteRepository.find({
      where: { ativo: true },
      order: { nome: 'ASC' },
    });

    if (todosAmbientes.length === 0) {
      return {
        ambientes: [],
        ultima_atualizacao: new Date().toISOString(),
      };
    }

    // Mapear ambientes únicos por nome (consolidando grupos)
    const ambientesMap = new Map<string, any>();

    for (const ambiente of todosAmbientes) {
      // Se já processamos este nome, pular (já consolidou itens do grupo)
      if (ambientesMap.has(ambiente.nome)) {
        continue;
      }

      // Buscar ambientes relacionados (mesmo nome ou mesmo grupo)
      let ambientesRelacionados = [ambiente];
      if (ambiente.grupoId) {
        ambientesRelacionados = todosAmbientes.filter(
          (a) => a.grupoId === ambiente.grupoId
        );
      }

      // Consolidar itens PAI de todos os ambientes relacionados
      const itensMap = new Map<string, any>();

      for (const ambRel of ambientesRelacionados) {
        const itens = await this.itensAmbienteService.findAllByAmbiente(
          ambRel.id
        );

        // Filtrar apenas itens PAI (parentId = null) e ativos
        const itensPai = itens.filter((item) => !item.parentId && item.ativo);

        // Consolidar itens únicos por nome
        for (const item of itensPai) {
          if (!itensMap.has(item.nome)) {
            itensMap.set(item.nome, {
              id: item.id,
              nome: item.nome,
              prompt: item.prompt,
              ordem: item.ordem,
            });
          }
        }
      }

      // Converter Map para array e ordenar por ordem
      const itensUnicos = Array.from(itensMap.values()).sort(
        (a, b) => a.ordem - b.ordem
      );

      // Adicionar ao mapa de ambientes
      ambientesMap.set(ambiente.nome, {
        nome: ambiente.nome,
        itens: itensUnicos,
      });
    }

    // Converter Map para array
    const ambientes = Array.from(ambientesMap.values());

    return {
      ambientes,
      ultima_atualizacao: new Date().toISOString(),
    };
  }

  private async buildAmbientesTree(ambientes: Ambiente[]): Promise<any[]> {
    // Agrupar ambientes com mesmo grupoId
    const grupos = new Map<string, any>();
    const gruposProcessados = new Set<string>();
    const resultado: any[] = [];

    for (const ambiente of ambientes) {
      const itens = await this.itensAmbienteService.findAllByAmbiente(ambiente.id);

      if (ambiente.grupoId) {
        // Se é um grupo e ainda não foi processado
        if (!gruposProcessados.has(ambiente.grupoId)) {
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
          });
          grupo.nomes.push(ambiente.nome);
          grupo.nome = grupo.nomes.join(' + ');

          // Adicionar o grupo no resultado na posição correta
          resultado.push(grupo);
          gruposProcessados.add(ambiente.grupoId);
        } else {
          // Se o grupo já foi processado, apenas adicionar o nome ao grupo existente
          const grupo = grupos.get(ambiente.grupoId);
          grupo.ambientes.push({
            id: ambiente.id,
            nome: ambiente.nome,
          });
          grupo.nomes.push(ambiente.nome);
          grupo.nome = grupo.nomes.join(' + ');
        }
      } else {
        // Ambiente sem grupo - adicionar diretamente no resultado
        resultado.push({
          ...ambiente,
          itens,
          isGrupo: false,
        });
      }
    }

    return resultado;
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

  /**
   * Reordenar múltiplos ambientes de uma vez
   */
  async reordenar(reordenacao: { id: string; ordem: number }[]): Promise<void> {
    // Atualizar ordem de cada ambiente ou grupo
    for (const item of reordenacao) {
      // Verificar se é um grupoId (pode ser que não exista um ambiente com esse id diretamente)
      const ambientePorId = await this.ambienteRepository.findOne({
        where: { id: item.id },
      });

      if (ambientePorId) {
        // É um ambiente individual, atualizar normalmente
        await this.ambienteRepository.update(item.id, { ordem: item.ordem });
      } else {
        // Pode ser um grupoId - atualizar todos os ambientes do grupo
        const ambientesDoGrupo = await this.ambienteRepository.find({
          where: { grupoId: item.id },
        });

        if (ambientesDoGrupo.length > 0) {
          // Atualizar todos os ambientes do grupo com a mesma ordem
          for (const ambiente of ambientesDoGrupo) {
            await this.ambienteRepository.update(ambiente.id, { ordem: item.ordem });
          }
        }
      }
    }
  }

  /**
   * Mover um ambiente para uma nova posição (otimizado)
   * Ajusta automaticamente as ordens dos outros ambientes
   */
  async moverAmbiente(id: string, novaOrdem: number): Promise<void> {
    // Verificar se é um ambiente individual ou um grupoId
    const ambientePorId = await this.ambienteRepository.findOne({
      where: { id },
    });

    let ordemAtual: number;
    let idsParaAtualizar: string[] = [];

    if (ambientePorId) {
      // É um ambiente individual
      ordemAtual = ambientePorId.ordem;
      idsParaAtualizar = [id];
    } else {
      // Pode ser um grupoId
      const ambientesDoGrupo = await this.ambienteRepository.find({
        where: { grupoId: id },
      });

      if (ambientesDoGrupo.length === 0) {
        throw new NotFoundException('Ambiente ou grupo não encontrado');
      }

      ordemAtual = ambientesDoGrupo[0].ordem;
      idsParaAtualizar = ambientesDoGrupo.map((a) => a.id);
    }

    // Se a ordem não mudou, não faz nada
    if (ordemAtual === novaOrdem) {
      return;
    }

    // Buscar todos os ambientes para ajustar as ordens
    const todosAmbientes = await this.ambienteRepository.find({
      where: { ativo: true },
      order: { ordem: 'ASC' },
    });

    // Ajustar ordens
    if (novaOrdem < ordemAtual) {
      // Movendo para cima - aumentar ordem dos que estão entre novaOrdem e ordemAtual
      for (const ambiente of todosAmbientes) {
        if (ambiente.ordem >= novaOrdem && ambiente.ordem < ordemAtual) {
          await this.ambienteRepository.update(ambiente.id, {
            ordem: ambiente.ordem + 1,
          });
        }
      }
    } else {
      // Movendo para baixo - diminuir ordem dos que estão entre ordemAtual e novaOrdem
      for (const ambiente of todosAmbientes) {
        if (ambiente.ordem > ordemAtual && ambiente.ordem <= novaOrdem) {
          await this.ambienteRepository.update(ambiente.id, {
            ordem: ambiente.ordem - 1,
          });
        }
      }
    }

    // Atualizar o(s) ambiente(s) movido(s)
    for (const ambienteId of idsParaAtualizar) {
      await this.ambienteRepository.update(ambienteId, { ordem: novaOrdem });
    }
  }
}
