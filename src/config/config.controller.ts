import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SystemConfigService } from './config.service';
import { UpdateDefaultPromptDto } from './dto/update-default-prompt.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('Configurações')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('config')
export class SystemConfigController {
  constructor(private readonly configService: SystemConfigService) {}

  @Get('default-prompt')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ 
    summary: 'Obter prompt padrão para análise de imagens',
    description: 'Retorna o prompt padrão que é adicionado antes dos prompts de itens na análise de imagens pela IA.'
  })
  async getDefaultPrompt(): Promise<{ value: string }> {
    const value = await this.configService.getDefaultPrompt();
    return { value };
  }

  @Put('default-prompt')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ 
    summary: 'Atualizar prompt padrão para análise de imagens',
    description: 'Define o prompt padrão que será adicionado antes dos prompts de itens. Máximo 1000 caracteres.'
  })
  async setDefaultPrompt(
    @Body() dto: UpdateDefaultPromptDto,
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    await this.configService.setDefaultPrompt(dto.value, req.user.id);
    return { 
      success: true, 
      message: 'Prompt padrão atualizado com sucesso' 
    };
  }
}
