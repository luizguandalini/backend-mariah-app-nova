import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfig } from '../config/entities/system-config.entity';
import {
  normalizeForMatch,
  extractKeywords,
  findBestMatch,
} from '../common/utils/text-normalizer.util';

/**
 * Status codes da API OpenAI e seus significados:
 * 
 * 200 - Sucesso
 * 400 - Bad Request (prompt inválido, imagem muito grande, etc)
 * 401 - Unauthorized (API key inválida ou expirada)
 * 403 - Forbidden (sem permissão para usar o modelo)
 * 404 - Not Found (modelo não existe)
 * 429 - Rate Limit Exceeded (muitas requisições)
 * 500 - Internal Server Error (erro no lado da OpenAI)
 * 502 - Bad Gateway
 * 503 - Service Unavailable (OpenAI sobrecarregada)
 * 504 - Gateway Timeout
 */

interface OpenAIError {
  status: number;
  message: string;
  type: string;
  retryable: boolean;
  retryAfter?: number;
  criticalError?: boolean; // true = deve pausar a fila (401/403/404)
}

interface AnalysisResult {
  success: boolean;
  content?: string;
  error?: OpenAIError;
  tokensUsed?: number;
  criticalError?: boolean; // Propagar para o caller
}

@Injectable()
export class OpenAIService implements OnModuleInit {
  private readonly logger = new Logger(OpenAIService.name);
  private apiKey: string | null = null;
  private model: string = 'gpt-4o';
  private maxTokens: number = 150;
  private rateLimitRpm: number = 20;
  private rateLimitDelayMs: number = 3000;
  private lastRequestTime: number = 0;

  constructor(
    @InjectRepository(SystemConfig)
    private readonly configRepository: Repository<SystemConfig>,
  ) {}

  async onModuleInit() {
    await this.loadConfig();
  }

  /**
   * Carrega configurações do banco de dados
   */
  async loadConfig(): Promise<void> {
    try {
      const configs = await this.configRepository.find();
      const configMap = new Map(configs.map((c) => [c.key, c.value]));

      this.apiKey = configMap.get('openai_api_key') || null;
      this.model = configMap.get('openai_model') || 'gpt-4o';
      this.maxTokens = parseInt(configMap.get('openai_max_tokens') || '70', 10);
      this.rateLimitRpm = parseInt(configMap.get('rate_limit_rpm') || '20', 10);
      this.rateLimitDelayMs = parseInt(configMap.get('rate_limit_delay_ms') || '3000', 10);

      this.logger.log(`Configurações OpenAI carregadas: model=${this.model}, rpm=${this.rateLimitRpm}`);
    } catch (error) {
      this.logger.error('Erro ao carregar configurações OpenAI', error);
    }
  }

  /**
   * Verifica se o serviço está configurado e pronto
   */
  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 10;
  }

  /**
   * Atualiza a API Key
   */
  async updateApiKey(apiKey: string, userId: string): Promise<void> {
    await this.configRepository.upsert(
      {
        key: 'openai_api_key',
        value: apiKey,
        isEncrypted: false, // TODO: implementar criptografia
        updatedById: userId,
      },
      ['key'],
    );
    this.apiKey = apiKey;
    this.logger.log('API Key OpenAI atualizada');
  }

  /**
   * Testa a conexão com a API OpenAI
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.isConfigured()) {
      return { success: false, message: 'API Key não configurada' };
    }

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (response.ok) {
        return { success: true, message: 'Conexão estabelecida com sucesso' };
      } else {
        const error = await response.json();
        return {
          success: false,
          message: error.error?.message || `Erro ${response.status}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Erro de conexão: ${error.message}`,
      };
    }
  }

  /**
   * Aguarda o rate limit antes de fazer requisição
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minDelay = this.rateLimitDelayMs;

    if (timeSinceLastRequest < minDelay) {
      const waitTime = minDelay - timeSinceLastRequest;
      this.logger.debug(`Aguardando ${waitTime}ms para rate limit`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Analisa uma imagem com um prompt específico
   * @param imageUrl URL pré-assinada do S3 ou base64
   * @param prompt Prompt para análise
   * @param retryCount Contagem de retries (interno)
   */
  async analyzeImage(
    imageUrl: string,
    prompt: string,
    retryCount: number = 0,
  ): Promise<AnalysisResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: {
          status: 401,
          message: 'API Key não configurada',
          type: 'configuration_error',
          retryable: false,
        },
      };
    }

    await this.waitForRateLimit();

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageUrl,
                    detail: 'low', // Usar 'low' para economizar tokens
                  },
                },
              ],
            },
          ],
        }),
      });

      // Tratar resposta
      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        const tokensUsed = data.usage?.total_tokens || 0;

        this.logger.debug(`Análise concluída: ${content.substring(0, 100)}...`);

        return {
          success: true,
          content: content.trim(),
          tokensUsed,
        };
      }

      // Tratar erros específicos
      const errorData = await response.json().catch(() => ({}));
      const error = this.handleApiError(response.status, errorData);

      // Retry automático para erros retryable
      if (error.retryable && retryCount < 3) {
        const waitTime = error.retryAfter || (retryCount + 1) * 5000;
        this.logger.warn(
          `Erro ${error.status} (${error.type}), aguardando ${waitTime}ms antes de retry ${retryCount + 1}/3`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return this.analyzeImage(imageUrl, prompt, retryCount + 1);
      }

      // Retornar com flag de erro crítico para pausar fila
      return { 
        success: false, 
        error,
        criticalError: error.criticalError || false,
      };
    } catch (error) {
      this.logger.error('Erro ao analisar imagem:', error);
      return {
        success: false,
        error: {
          status: 0,
          message: error.message || 'Erro de conexão',
          type: 'network_error',
          retryable: true,
        },
      };
    }
  }

  /**
   * Trata erros da API OpenAI com logs detalhados
   * 
   * AÇÕES POR STATUS CODE:
   * 
   * 400 - BAD REQUEST
   *   - Causa: Prompt inválido, imagem muito grande ou formato incorreto
   *   - Ação: NÃO faz retry, marca imagem como erro, log de erro
   *   - Impacto: Imagem não será analisada, precisa correção manual
   * 
   * 401 - UNAUTHORIZED
   *   - Causa: API Key inválida, expirada ou revogada
   *   - Ação: NÃO faz retry, PARA todo processamento da fila
   *   - Impacto: CRÍTICO - Admin precisa atualizar API Key
   * 
   * 403 - FORBIDDEN
   *   - Causa: Conta sem permissão para usar o modelo (ex: GPT-4)
   *   - Ação: NÃO faz retry, log de erro crítico
   *   - Impacto: CRÍTICO - Precisa fazer upgrade da conta OpenAI ou trocar modelo
   * 
   * 404 - NOT FOUND
   *   - Causa: Modelo especificado não existe (ex: typo no nome)
   *   - Ação: NÃO faz retry, log de erro de configuração
   *   - Impacto: Admin precisa corrigir o nome do modelo nas configurações
   * 
   * 429 - RATE LIMIT
   *   - Causa: Muitas requisições por minuto ou quota mensal excedida
   *   - Ação: FAZ retry após aguardar tempo indicado pelo header retry-after
   *   - Impacto: Temporário - processamento continua após espera
   * 
   * 500/502/503/504 - SERVER ERROR
   *   - Causa: Problema no lado da OpenAI (instabilidade, manutenção)
   *   - Ação: FAZ retry após 5 segundos (até 3 tentativas)
   *   - Impacto: Temporário - geralmente resolve sozinho
   */
  private handleApiError(status: number, data: any): OpenAIError {
    const message = data.error?.message || `Erro HTTP ${status}`;
    const type = data.error?.type || 'unknown_error';

    switch (status) {
      case 400:
        this.logger.error(
          `❌ [400 BAD_REQUEST] Requisição inválida para OpenAI\n` +
          `   📋 Motivo: ${message}\n` +
          `   🔧 Ação: Imagem será marcada como erro. Verifique formato/tamanho da imagem ou prompt.`
        );
        return {
          status,
          message,
          type: 'bad_request',
          retryable: false,
        };

      case 401:
        this.logger.error(
          `🚨 [401 UNAUTHORIZED] API Key inválida ou expirada!\n` +
          `   📋 Motivo: ${message}\n` +
          `   🔧 Ação: PROCESSAMENTO PARADO. Admin deve atualizar a API Key em Configurações IA.\n` +
          `   ⚠️  CRÍTICO: Todas as análises falharão até correção!`
        );
        return {
          status,
          message: 'API Key inválida ou expirada',
          type: 'authentication_error',
          retryable: false,
          criticalError: true, // PAUSAR FILA
        };

      case 403:
        this.logger.error(
          `🚫 [403 FORBIDDEN] Sem permissão para usar modelo ${this.model}\n` +
          `   📋 Motivo: ${message}\n` +
          `   🔧 Ação: Verificar se a conta OpenAI tem acesso ao modelo ${this.model}.\n` +
          `   💡 Dica: Pode ser necessário upgrade para GPT-4 ou escolher modelo diferente.`
        );
        return {
          status,
          message: 'Sem permissão para usar este modelo',
          type: 'permission_error',
          retryable: false,
          criticalError: true, // PAUSAR FILA
        };

      case 404:
        this.logger.error(
          `🔍 [404 NOT_FOUND] Modelo "${this.model}" não encontrado\n` +
          `   📋 Motivo: ${message}\n` +
          `   🔧 Ação: Admin deve corrigir o nome do modelo nas configurações do sistema.\n` +
          `   💡 Modelos válidos: gpt-4o, gpt-4-turbo, gpt-4-vision-preview, gpt-3.5-turbo`
        );
        return {
          status,
          message: 'Modelo não encontrado',
          type: 'not_found',
          retryable: false,
          criticalError: true, // PAUSAR FILA
        };

      case 429:
        // IMPORTANTE: Distinguir entre RATE LIMIT (muitas requisições) e QUOTA EXCEEDED (sem créditos)
        // A mensagem "exceeded your current quota" indica FALTA DE CRÉDITOS, não velocidade!
        const isQuotaExceeded = message.toLowerCase().includes('exceeded your current quota') ||
                                message.toLowerCase().includes('billing') ||
                                message.toLowerCase().includes('plan');
        
        if (isQuotaExceeded) {
          // QUOTA EXCEEDED = SEM CRÉDITOS NA CONTA OPENAI
          this.logger.error(
            `\n` +
            `╔══════════════════════════════════════════════════════════════════════╗\n` +
            `║  💳 [429 QUOTA_EXCEEDED] SEM CRÉDITOS NA CONTA OPENAI               ║\n` +
            `╠══════════════════════════════════════════════════════════════════════╣\n` +
            `║  ❌ PROBLEMA: A conta OpenAI não tem saldo/créditos suficientes.    ║\n` +
            `║                                                                      ║\n` +
            `║  🔧 COMO RESOLVER:                                                   ║\n` +
            `║     1. Acesse: https://platform.openai.com/account/billing          ║\n` +
            `║     2. Adicione créditos ou configure método de pagamento           ║\n` +
            `║     3. Verifique se há limite de gastos (Usage limits)              ║\n` +
            `║                                                                      ║\n` +
            `║  ⚠️  A FILA FOI PAUSADA. Retry NÃO vai resolver este problema.      ║\n` +
            `║     O sistema NÃO tentará novamente automaticamente.                ║\n` +
            `╚══════════════════════════════════════════════════════════════════════╝\n`
          );
          return {
            status,
            message: 'Conta OpenAI sem créditos. Adicione saldo em platform.openai.com/account/billing',
            type: 'quota_exceeded',
            retryable: false, // NÃO FAZER RETRY - não vai resolver!
            criticalError: true, // PAUSAR FILA IMEDIATAMENTE
          };
        }
        
        // RATE LIMIT REAL = Muitas requisições por segundo/minuto
        const retryAfterHeader = data.error?.retry_after;
        const retryAfter = retryAfterHeader 
          ? parseInt(retryAfterHeader, 10) * 1000 
          : 60000; // Default: 60 segundos
        
        this.logger.warn(
          `⏳ [429 RATE_LIMIT] Limite de velocidade de requisições\n` +
          `   📋 Motivo: Muitas requisições em pouco tempo\n` +
          `   🔧 Ação: Aguardando ${retryAfter / 1000}s antes de tentar novamente.\n` +
          `   💡 Dica: Isso é normal e será resolvido automaticamente.`
        );
        return {
          status,
          message: 'Limite de velocidade excedido, aguardando...',
          type: 'rate_limit_error',
          retryable: true,
          retryAfter,
        };

      case 500:
        this.logger.warn(
          `🔥 [500 INTERNAL_SERVER_ERROR] Erro interno na OpenAI\n` +
          `   📋 Motivo: ${message}\n` +
          `   🔧 Ação: Tentando novamente em 5 segundos (erro temporário).`
        );
        return {
          status,
          message: 'Erro interno no servidor OpenAI',
          type: 'server_error',
          retryable: true,
          retryAfter: 5000,
        };

      case 502:
        this.logger.warn(
          `🌐 [502 BAD_GATEWAY] Gateway inválido na OpenAI\n` +
          `   📋 Motivo: Problema de infraestrutura na OpenAI\n` +
          `   🔧 Ação: Tentando novamente em 5 segundos.`
        );
        return {
          status,
          message: 'Bad Gateway - OpenAI indisponível temporariamente',
          type: 'server_error',
          retryable: true,
          retryAfter: 5000,
        };

      case 503:
        this.logger.warn(
          `🔧 [503 SERVICE_UNAVAILABLE] OpenAI temporariamente indisponível\n` +
          `   📋 Motivo: Servidor sobrecarregado ou em manutenção\n` +
          `   🔧 Ação: Tentando novamente em 10 segundos.`
        );
        return {
          status,
          message: 'Serviço OpenAI indisponível - manutenção ou sobrecarga',
          type: 'server_error',
          retryable: true,
          retryAfter: 10000,
        };

      case 504:
        this.logger.warn(
          `⏱️ [504 GATEWAY_TIMEOUT] Timeout na OpenAI\n` +
          `   📋 Motivo: Requisição demorou muito para processar\n` +
          `   🔧 Ação: Tentando novamente em 5 segundos.`
        );
        return {
          status,
          message: 'Gateway Timeout - requisição demorou demais',
          type: 'server_error',
          retryable: true,
          retryAfter: 5000,
        };

      default:
        this.logger.error(
          `❓ [${status} UNKNOWN] Erro desconhecido da OpenAI\n` +
          `   📋 Motivo: ${message}\n` +
          `   📋 Tipo: ${type}\n` +
          `   🔧 Ação: ${status >= 500 ? 'Tentando novamente (erro de servidor)' : 'Não faz retry (erro do cliente)'}`
        );
        return {
          status,
          message,
          type,
          retryable: status >= 500,
          retryAfter: status >= 500 ? 5000 : undefined,
        };
    }
  }

  /**
   * Identifica um item filho baseado na resposta da IA
   * Retorna o nome do item filho correspondente ou null
   */
  identifyChildItem(
    aiResponse: string,
    childOptions: string[],
  ): string | null {
    const keywords = extractKeywords(aiResponse);

    // Primeiro, tentar match exato
    for (const option of childOptions) {
      if (findBestMatch(aiResponse, [option])) {
        return option;
      }
    }

    // Segundo, tentar match por keywords
    for (const keyword of keywords) {
      const match = findBestMatch(keyword, childOptions);
      if (match) {
        return match;
      }
    }

    // Terceiro, tentar match parcial (contém)
    const normalizedResponse = normalizeForMatch(aiResponse);
    for (const option of childOptions) {
      const normalizedOption = normalizeForMatch(option);
      if (
        normalizedResponse.includes(normalizedOption) ||
        normalizedOption.includes(normalizedResponse)
      ) {
        return option;
      }
    }

    return null;
  }
}
