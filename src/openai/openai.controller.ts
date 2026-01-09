import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OpenAIService } from './openai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { IsString, IsNotEmpty } from 'class-validator';

class UpdateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  apiKey: string;
}

@Controller('config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OpenAIController {
  constructor(private readonly openaiService: OpenAIService) {}

  /**
   * Retorna status da configuração OpenAI
   * Acessível por DEV e ADMIN
   */
  @Get('openai-status')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  async getStatus() {
    const isConfigured = this.openaiService.isConfigured();
    let testResult = null;

    if (isConfigured) {
      testResult = await this.openaiService.testConnection();
    }

    return {
      configured: isConfigured,
      connection: testResult,
    };
  }

  /**
   * Atualiza a API Key da OpenAI
   * Acessível apenas por DEV e ADMIN
   */
  @Put('openai-key')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async updateApiKey(@Body() dto: UpdateApiKeyDto, @Request() req: any) {
    if (!dto.apiKey || dto.apiKey.length < 10) {
      return {
        success: false,
        message: 'API Key inválida',
      };
    }

    await this.openaiService.updateApiKey(dto.apiKey, req.user.id);
    
    // Testar conexão após atualizar
    const testResult = await this.openaiService.testConnection();

    return {
      success: testResult.success,
      message: testResult.message,
    };
  }

  /**
   * Testa a conexão com a API OpenAI
   */
  @Get('openai-test')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  async testConnection() {
    return await this.openaiService.testConnection();
  }

  /**
   * Recarrega configurações do banco
   */
  @Put('openai-reload')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async reloadConfig() {
    await this.openaiService.loadConfig();
    return { success: true, message: 'Configurações recarregadas' };
  }
}
