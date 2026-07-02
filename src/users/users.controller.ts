import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { UpdateConfiguracoesPdfDto } from './dto/update-configuracoes-pdf.dto';
import { UpdatePushTokenDto } from './dto/update-push-token.dto';
import { FotoPerfilPresignedDto, ConfirmFotoPerfilDto } from './dto/foto-perfil-presigned.dto';
import { Usuario } from './entities/usuario.entity';
import { ConfiguracaoPdfUsuario } from './entities/configuracao-pdf-usuario.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from './enums/user-role.enum';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Obter dados do usuário logado' })
  @ApiResponse({ status: 200, description: 'Dados retornados com sucesso' })
  async getMe(@CurrentUser() user: any): Promise<Usuario> {
    return await this.usersService.getMe(user.id, user);
  }

  @Post('me/foto-perfil/presigned-url')
  @ApiOperation({ summary: 'Gera URL pré-assinada para upload da foto de perfil' })
  @ApiResponse({ status: 201, description: 'URL gerada com sucesso' })
  async getFotoPerfilUploadUrl(
    @CurrentUser() user: any,
    @Body() dto: FotoPerfilPresignedDto,
  ): Promise<{ uploadUrl: string; s3Key: string }> {
    return await this.usersService.getFotoPerfilUploadUrl(
      user.id,
      dto.filename,
      dto.contentType,
      dto.fileSize,
    );
  }

  @Post('me/foto-perfil/confirm')
  @ApiOperation({ summary: 'Confirma o upload da foto de perfil' })
  @ApiResponse({ status: 201, description: 'Foto de perfil atualizada' })
  async confirmFotoPerfil(
    @CurrentUser() user: any,
    @Body() dto: ConfirmFotoPerfilDto,
  ): Promise<{ fotoPerfilUrl: string }> {
    return await this.usersService.confirmFotoPerfil(user.id, dto.s3Key);
  }

  @Delete('me/foto-perfil')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a foto de perfil do usuário' })
  @ApiResponse({ status: 204, description: 'Foto de perfil removida' })
  async removeFotoPerfil(@CurrentUser() user: any): Promise<void> {
    return await this.usersService.removeFotoPerfil(user.id);
  }

  @Get()
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar todos os usuários com paginação e filtros (DEV/ADMIN)' })
  @ApiResponse({ status: 200, description: 'Lista retornada com sucesso' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  async findAll(
    @CurrentUser() user: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Query('role') role?: UserRole,
    @Query('ativo') ativo?: string,
  ): Promise<{ data: Array<Usuario & { isSelf: boolean; canDelete: boolean }>; total: number; page: number; totalPages: number }> {
    const ativoBoolean = ativo === undefined ? undefined : ativo === 'true';
    return await this.usersService.findAll(user, +page, +limit, search, role, ativoBoolean);
  }

  @Get(':id')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Buscar usuário por ID (DEV/ADMIN)' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ status: 200, description: 'Usuário encontrado' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<Usuario & { isSelf: boolean; canDelete: boolean }> {
    return await this.usersService.findOne(id, user);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ status: 200, description: 'Usuário atualizado' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  async update(
    @Param('id') id: string,
    @Body() updateUsuarioDto: UpdateUsuarioDto,
    @CurrentUser() user: any,
  ): Promise<Usuario> {
    return await this.usersService.update(id, updateUsuarioDto, user);
  }

  @Put(':id/imagens/set/:quantidade')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Definir quantidade de imagens disponíveis (DEV/ADMIN)' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiParam({ name: 'quantidade', description: 'Nova quantidade de imagens disponíveis' })
  @ApiResponse({ status: 200, description: 'Quantidade de imagens definida com sucesso' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  async setQuantidadeImagens(
    @Param('id') id: string,
    @Param('quantidade') quantidade: number,
    @CurrentUser() user: any,
  ): Promise<Usuario> {
    return await this.usersService.updateQuantidadeImagens(id, +quantidade, user);
  }

  @Put(':id/imagens/add/:quantidade')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Adicionar quantidade de imagens disponíveis (DEV/ADMIN)' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiParam({ name: 'quantidade', description: 'Quantidade de imagens a adicionar' })
  @ApiResponse({ status: 200, description: 'Imagens adicionadas com sucesso' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  async addQuantidadeImagens(
    @Param('id') id: string,
    @Param('quantidade') quantidade: number,
    @CurrentUser() user: any,
  ): Promise<Usuario> {
    return await this.usersService.addQuantidadeImagens(id, +quantidade, user);
  }

  @Delete(':id')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Deletar (soft delete) um usuário (ADMIN/DEV)',
    description:
      'Soft-deleta o usuário alvo: a linha permanece no banco com ' +
      '`deletedAt` setado e `ativo = false`. Laudos, imagens e outras ' +
      'referências ao usuário NÃO são apagadas — o usuário pode ser ' +
      'recriado depois como um novo id, sem herdar registros antigos. ' +
      'Não é permitido deletar usuários DEV nem o próprio usuário logado.',
  })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ status: 204, description: 'Usuário soft-deletado' })
  @ApiResponse({ status: 400, description: 'Auto-deleção não permitida' })
  @ApiResponse({ status: 403, description: 'Sem permissão (DEV é protegido ou actor não é ADMIN/DEV)' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<void> {
    return await this.usersService.softDelete(id, user);
  }

  @Patch(':id/role')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Alterar o role (nível de acesso) de um usuário (DEV/ADMIN)',
    description:
      'Permite promover USUARIO -> ADMIN e reverter ADMIN -> USUARIO. ' +
      'O contador quantidadeImagens é preservado intacto em qualquer transição. ' +
      'Não permite tocar em usuários DEV nem promover ninguém a DEV.',
  })
  @ApiParam({ name: 'id', description: 'ID do usuário alvo' })
  @ApiResponse({ status: 200, description: 'Role alterado com sucesso' })
  @ApiResponse({ status: 400, description: 'Transição inválida ou no-op' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  async changeRole(
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() user: any,
  ): Promise<Usuario> {
    return await this.usersService.changeRole(id, dto, user);
  }

  @Get('configuracoes-pdf')
  @ApiOperation({ summary: 'Obter configurações de PDF do usuário' })
  @ApiResponse({ status: 200, description: 'Configurações retornadas com sucesso' })
  async getConfiguracoesPdf(@CurrentUser() user: any): Promise<ConfiguracaoPdfUsuario> {
    return await this.usersService.getConfiguracoesPdf(user.id);
  }

  @Put('push-token')
  @ApiOperation({ summary: 'Atualizar token de push do usuário' })
  @ApiResponse({ status: 200, description: 'Token atualizado com sucesso' })
  async updatePushToken(
    @CurrentUser() user: any,
    @Body() updateDto: UpdatePushTokenDto,
  ): Promise<Usuario> {
    return await this.usersService.updatePushToken(user.id, updateDto.expoPushToken);
  }

  @Put('configuracoes-pdf')
  @ApiOperation({ summary: 'Atualizar configurações de PDF do usuário' })
  @ApiResponse({ status: 200, description: 'Configurações atualizadas com sucesso' })
  async updateConfiguracoesPdf(
    @CurrentUser() user: any,
    @Body() updateDto: UpdateConfiguracoesPdfDto,
  ): Promise<ConfiguracaoPdfUsuario> {
    return await this.usersService.updateConfiguracoesPdf(user.id, updateDto);
  }
}
