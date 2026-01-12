import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfig } from './entities/system-config.entity';

@Injectable()
export class SystemConfigService implements OnModuleInit {
  private readonly logger = new Logger(SystemConfigService.name);

  constructor(
    @InjectRepository(SystemConfig)
    private readonly configRepository: Repository<SystemConfig>,
  ) {}

  /**
   * Inicialização: garantir que o registro default_prompt exista
   */
  async onModuleInit() {
    await this.ensureDefaultPromptExists();
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
