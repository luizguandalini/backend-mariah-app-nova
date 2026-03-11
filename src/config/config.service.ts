import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SystemConfig } from './entities/system-config.entity';

export interface TipoImovelOpcao {
  id: string;
  nome: string;
  tipoUso: string;
  ordem: number;
  ativo: boolean;
}

const TIPOS_IMOVEL_KEY = 'tipos_imovel_por_uso';
const TIPOS_USO_VALIDOS = ['Residencial', 'Comercial', 'Industrial'];

@Injectable()
export class SystemConfigService implements OnModuleInit {
  private readonly logger = new Logger(SystemConfigService.name);

  constructor(
    @InjectRepository(SystemConfig)
    private readonly configRepository: Repository<SystemConfig>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Inicialização: garantir que o registro default_prompt exista
   */
  async onModuleInit() {
    await this.ensureDefaultPromptExists();
    await this.ensureTiposImovelExists();
  }

  /**
   * Cria o registro default_prompt se não existir
   * Isso garante que o sistema funcione em qualquer servidor novo
   */
  private async ensureDefaultPromptExists(): Promise<void> {
    const existing = await this.configRepository.findOne({
      where: { key: 'default_prompt' },
    });

    if (!existing) {
      await this.configRepository.save({
        key: 'default_prompt',
        value: '',
        description: 'Prompt padrão que é adicionado antes dos prompts de itens na análise de imagens. Máximo 1000 caracteres.',
      });
      this.logger.log('✅ Configuração default_prompt criada automaticamente');
    }
  }

  private async ensureTiposImovelExists(): Promise<void> {
    const existing = await this.configRepository.findOne({
      where: { key: TIPOS_IMOVEL_KEY },
    });

    if (existing) {
      return;
    }

    const defaults: TipoImovelOpcao[] = [
      { id: '1', nome: 'Galpão', tipoUso: 'Industrial', ordem: 1, ativo: true },
      { id: '2', nome: 'Studio', tipoUso: 'Residencial', ordem: 2, ativo: true },
      { id: '3', nome: 'Flat', tipoUso: 'Residencial', ordem: 3, ativo: true },
      { id: '4', nome: 'Salão', tipoUso: 'Comercial', ordem: 4, ativo: true },
      { id: '5', nome: 'Loja', tipoUso: 'Comercial', ordem: 5, ativo: true },
      { id: '6', nome: 'Casa Comercial', tipoUso: 'Comercial', ordem: 6, ativo: true },
      { id: '7', nome: 'Sala Comercial', tipoUso: 'Comercial', ordem: 7, ativo: true },
      { id: '8', nome: 'Conjunto Comercial', tipoUso: 'Comercial', ordem: 8, ativo: true },
    ];

    await this.configRepository.save({
      key: TIPOS_IMOVEL_KEY,
      value: JSON.stringify(defaults),
      description: 'Tipos de imóvel dinâmicos por tipo de uso',
    });
  }

  /**
   * Obtém o prompt padrão armazenado
   */
  async getDefaultPrompt(): Promise<string> {
    const config = await this.configRepository.findOne({
      where: { key: 'default_prompt' },
    });
    return config?.value || '';
  }

  /**
   * Atualiza o prompt padrão
   * @param value Novo valor do prompt (máx 1000 caracteres)
   * @param userId ID do usuário que está atualizando
   */
  async setDefaultPrompt(value: string, userId: string): Promise<void> {
    // Garantir limite de 1000 caracteres
    const trimmedValue = value.substring(0, 1000);

    await this.configRepository.upsert(
      {
        key: 'default_prompt',
        value: trimmedValue,
        updatedById: userId,
        description: 'Prompt padrão que é adicionado antes dos prompts de itens na análise de imagens. Máximo 1000 caracteres.',
      },
      ['key'],
    );

    this.logger.log(`Prompt padrão atualizado (${trimmedValue.length} caracteres)`);
  }

  private validarTipoUso(tipoUso: string): string {
    const tipoUsoNormalizado = tipoUso?.trim();
    if (!TIPOS_USO_VALIDOS.includes(tipoUsoNormalizado)) {
      throw new BadRequestException(`Tipo de uso inválido: ${tipoUso}`);
    }
    return tipoUsoNormalizado;
  }

  private async getTiposImovelRaw(): Promise<TipoImovelOpcao[]> {
    const config = await this.configRepository.findOne({
      where: { key: TIPOS_IMOVEL_KEY },
    });
    if (!config?.value) {
      return [];
    }
    try {
      return JSON.parse(config.value) as TipoImovelOpcao[];
    } catch {
      return [];
    }
  }

  async getTiposImovelPaginado(limit: number, offset: number, tipoUso?: string) {
    const sanitizedLimit = Math.max(1, Math.min(100, limit || 10));
    const sanitizedOffset = Math.max(0, offset || 0);
    const all = (await this.getTiposImovelRaw()).filter((item) => item.ativo);
    const filtered = tipoUso
      ? all.filter((item) => item.tipoUso === tipoUso)
      : all;
    const sorted = filtered.sort((a, b) => a.ordem - b.ordem);
    const data = sorted.slice(sanitizedOffset, sanitizedOffset + sanitizedLimit);
    return {
      data,
      total: sorted.length,
      hasMore: sanitizedOffset + sanitizedLimit < sorted.length,
    };
  }

  async getTiposImovelPorUso() {
    const ativos = (await this.getTiposImovelRaw())
      .filter((item) => item.ativo)
      .sort((a, b) => a.ordem - b.ordem);

    return ativos.reduce<Record<string, string[]>>((acc, item) => {
      if (!acc[item.tipoUso]) {
        acc[item.tipoUso] = [];
      }
      acc[item.tipoUso].push(item.nome);
      return acc;
    }, {});
  }

  async createTipoImovel(nome: string, tipoUso: string, userId: string) {
    const nomeNormalizado = nome?.trim();
    if (!nomeNormalizado) {
      throw new BadRequestException('Nome do tipo de imóvel é obrigatório');
    }
    if (nomeNormalizado.length > 100) {
      throw new BadRequestException('Nome do tipo de imóvel deve ter no máximo 100 caracteres');
    }
    const tipoUsoNormalizado = this.validarTipoUso(tipoUso);
    const list = await this.getTiposImovelRaw();
    const exists = list.some(
      (item) =>
        item.ativo &&
        item.tipoUso === tipoUsoNormalizado &&
        item.nome.toLowerCase() === nomeNormalizado.toLowerCase(),
    );
    if (exists) {
      throw new BadRequestException(
        'Já existe este tipo de imóvel para o tipo de uso informado',
      );
    }

    const maxOrdem = list.reduce((max, item) => Math.max(max, item.ordem || 0), 0);
    const novo: TipoImovelOpcao = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      nome: nomeNormalizado,
      tipoUso: tipoUsoNormalizado,
      ordem: maxOrdem + 1,
      ativo: true,
    };

    await this.configRepository.upsert(
      {
        key: TIPOS_IMOVEL_KEY,
        value: JSON.stringify([...list, novo]),
        updatedById: userId,
        description: 'Tipos de imóvel dinâmicos por tipo de uso',
      },
      ['key'],
    );

    return novo;
  }

  async updateTipoImovel(id: string, nome: string, tipoUso: string, userId: string) {
    const nomeNormalizado = nome?.trim();
    if (!nomeNormalizado) {
      throw new BadRequestException('Nome do tipo de imóvel é obrigatório');
    }
    if (nomeNormalizado.length > 100) {
      throw new BadRequestException('Nome do tipo de imóvel deve ter no máximo 100 caracteres');
    }
    const tipoUsoNormalizado = this.validarTipoUso(tipoUso);
    const list = await this.getTiposImovelRaw();
    const index = list.findIndex((item) => item.id === id && item.ativo);
    if (index < 0) {
      throw new NotFoundException('Tipo de imóvel não encontrado');
    }

    const conflict = list.some(
      (item, i) =>
        i !== index &&
        item.ativo &&
        item.tipoUso === tipoUsoNormalizado &&
        item.nome.toLowerCase() === nomeNormalizado.toLowerCase(),
    );
    if (conflict) {
      throw new BadRequestException(
        'Já existe este tipo de imóvel para o tipo de uso informado',
      );
    }

    const nomeAntigo = list[index].nome;
    list[index] = {
      ...list[index],
      nome: nomeNormalizado,
      tipoUso: tipoUsoNormalizado,
    };

    await this.configRepository.upsert(
      {
        key: TIPOS_IMOVEL_KEY,
        value: JSON.stringify(list),
        updatedById: userId,
        description: 'Tipos de imóvel dinâmicos por tipo de uso',
      },
      ['key'],
    );

    if (nomeAntigo !== nomeNormalizado) {
      await this.dataSource.query(
        `UPDATE ambientes
         SET tipos_imovel = array_replace(tipos_imovel, $1, $2)
         WHERE $1 = ANY(tipos_imovel)`,
        [nomeAntigo, nomeNormalizado],
      );
    }

    return list[index];
  }

  async deleteTipoImovel(id: string, userId: string): Promise<void> {
    const list = await this.getTiposImovelRaw();
    const activeItems = list.filter((item) => item.ativo);
    if (activeItems.length <= 1) {
      throw new BadRequestException('Deve existir ao menos 1 tipo de imóvel ativo');
    }

    const index = list.findIndex((item) => item.id === id && item.ativo);
    if (index < 0) {
      throw new NotFoundException('Tipo de imóvel não encontrado');
    }

    const nomeRemovido = list[index].nome;
    list[index] = { ...list[index], ativo: false };

    await this.configRepository.upsert(
      {
        key: TIPOS_IMOVEL_KEY,
        value: JSON.stringify(list),
        updatedById: userId,
        description: 'Tipos de imóvel dinâmicos por tipo de uso',
      },
      ['key'],
    );

    await this.dataSource.query(
      `UPDATE ambientes
       SET tipos_imovel = array_remove(tipos_imovel, $1)
       WHERE $1 = ANY(tipos_imovel)`,
      [nomeRemovido],
    );
  }

  async isTipoImovelValido(tipoImovel: string): Promise<boolean> {
    const tipoNormalizado = tipoImovel?.trim().toLowerCase();
    if (!tipoNormalizado) {
      return false;
    }
    const ativos = (await this.getTiposImovelRaw()).filter((item) => item.ativo);
    return ativos.some((item) => item.nome.toLowerCase() === tipoNormalizado);
  }

  /**
   * Obtém qualquer configuração pelo key
   */
  async getConfig(key: string): Promise<string | null> {
    const config = await this.configRepository.findOne({
      where: { key },
    });
    return config?.value || null;
  }
}
