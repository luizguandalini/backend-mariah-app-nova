import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Patch,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { LaudosService, PaginatedLaudosResult } from './laudos.service';
import { CreateLaudoDto } from './dto/create-laudo.dto';
import { UpdateLaudoDto } from './dto/update-laudo.dto';
import { UpdateLaudoDetalhesDto } from './dto/update-laudo-detalhes.dto';
import { UpdateLaudoEnderecoDto } from './dto/update-laudo-endereco.dto';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';
import { Laudo } from './entities/laudo.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('laudos')
@Controller('laudos')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class LaudosController {
  constructor(private readonly laudosService: LaudosService) {}

  @Post()
  @ApiOperation({ summary: 'Criar novo laudo' })
  @ApiResponse({ status: 201, description: 'Laudo criado com sucesso' })
  async create(@Body() createLaudoDto: CreateLaudoDto, @CurrentUser() user: any): Promise<Laudo> {
    createLaudoDto.usuarioId = user?.id || user?.sub;
    return await this.laudosService.create(createLaudoDto);
  }

  @Get('dashboard/stats')
  @ApiOperation({ summary: 'Obter estatísticas do dashboard do usuário logado' })
  @ApiResponse({
    status: 200,
    description: 'Estatísticas retornadas com sucesso',
    type: DashboardStatsDto,
  })
  async getDashboardStats(@CurrentUser() user: any): Promise<DashboardStatsDto> {
    return await this.laudosService.getDashboardStats(user.id);
  }

  @Get('dashboard/recent')
  @ApiOperation({ summary: 'Obter laudos recentes do usuário logado' })
  @ApiQuery({ name: 'limit', required: false, description: 'Número máximo de laudos a retornar' })
  @ApiResponse({ status: 200, description: 'Laudos recentes retornados com sucesso' })
  async getRecentLaudos(
    @CurrentUser() user: any,
    @Query('limit') limit?: number,
  ): Promise<Partial<Laudo>[]> {
    return await this.laudosService.getRecentLaudos(user.id, limit || 5);
  }

  @Get('me')
  @ApiOperation({ summary: 'Listar todos os laudos do usuário logado' })
  @ApiQuery({ name: 'page', required: false, description: 'Número da página (padrão: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Quantidade por página (padrão: 10)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filtrar por status do laudo' })
  @ApiResponse({ status: 200, description: 'Lista de laudos retornada com sucesso' })
  async findMyLaudos(
    @CurrentUser() user: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('status') status?: string,
  ): Promise<PaginatedLaudosResult> {
    return await this.laudosService.findByUsuario(
      user.id,
      Number(page),
      Number(limit),
      status,
    );
  }

  @Get()
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar todos os laudos (DEV/ADMIN)' })
  @ApiQuery({ name: 'page', required: false, description: 'Número da página (padrão: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Quantidade por página (padrão: 15)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filtrar por status do laudo' })
  @ApiResponse({ status: 200, description: 'Lista retornada com sucesso' })
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 15,
    @Query('status') status?: string,
  ): Promise<PaginatedLaudosResult> {
    return await this.laudosService.findAll(Number(page), Number(limit), status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar laudo por ID' })
  @ApiParam({ name: 'id', description: 'ID do laudo' })
  @ApiResponse({ status: 200, description: 'Laudo encontrado' })
  @ApiResponse({ status: 404, description: 'Laudo não encontrado' })
  async findOne(@Param('id') id: string): Promise<Laudo> {
    return await this.laudosService.findOne(id);
  }

  @Get(':id/detalhes')
  @ApiOperation({ summary: 'Buscar apenas os detalhes do laudo por ID' })
  @ApiParam({ name: 'id', description: 'ID do laudo' })
  async getLaudoDetalhes(@Param('id') id: string) {
    return await this.laudosService.getLaudoDetalhes(id);
  }

  @Patch(':id/detalhes')
  @ApiOperation({ summary: 'Atualizar apenas os detalhes do questionário do laudo' })
  @ApiParam({ name: 'id', description: 'ID do laudo' })
  @ApiResponse({ status: 200, description: 'Detalhes atualizados com sucesso' })
  @ApiResponse({ status: 400, description: 'Valores inválidos fornecidos' })
  @ApiResponse({ status: 401, description: 'Sem permissão para editar este laudo' })
  async updateLaudoDetalhes(
    @Param('id') id: string,
    @Body() updateDto: UpdateLaudoDetalhesDto,
    @CurrentUser() user: any,
  ): Promise<Laudo> {
    return await this.laudosService.updateLaudoDetalhes(id, updateDto, user);
  }

  @Patch(':id/endereco')
  @ApiOperation({ summary: 'Atualizar endereço do laudo' })
  @ApiParam({ name: 'id', description: 'ID do laudo' })
  @ApiResponse({ status: 200, description: 'Endereço atualizado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados de endereço inválidos' })
  @ApiResponse({ status: 401, description: 'Sem permissão para editar este laudo' })
  @ApiResponse({ status: 404, description: 'Laudo não encontrado' })
  async updateLaudoEndereco(
    @Param('id') id: string,
    @Body() updateDto: UpdateLaudoEnderecoDto,
    @CurrentUser() user: any,
  ): Promise<Laudo> {
    return await this.laudosService.updateLaudoEndereco(id, updateDto, user);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar laudo' })
  @ApiParam({ name: 'id', description: 'ID do laudo' })
  @ApiResponse({ status: 200, description: 'Laudo atualizado' })
  async update(@Param('id') id: string, @Body() updateLaudoDto: UpdateLaudoDto): Promise<Laudo> {
    return await this.laudosService.update(id, updateLaudoDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deletar laudo' })
  @ApiParam({ name: 'id', description: 'ID do laudo' })
  @ApiResponse({ status: 204, description: 'Laudo deletado' })
  @ApiResponse({ status: 403, description: 'Sem permissão para deletar este laudo' })
  async remove(@Param('id') id: string, @CurrentUser() user: any): Promise<void> {
    return await this.laudosService.remove(id, user);
  }

  @Get(':id/imagens-pdf')
  @ApiOperation({ summary: 'Buscar imagens do laudo para PDF com numeração automática' })
  @ApiParam({ name: 'id', description: 'ID do laudo' })
  @ApiQuery({ name: 'page', required: false, description: 'Número da página (padrão: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Imagens por página (padrão: 12)' })
  @ApiResponse({ status: 200, description: 'Imagens retornadas com sucesso' })
  async getImagensPdf(
    @Param('id') id: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 12,
    @CurrentUser() user: any,
  ) {
    return await this.laudosService.getImagensPdfPaginadas(
      id,
      user.id,
      user.role,
      Number(page),
      Number(limit),
    );
  }

  @Post(':id/pdf-request')
  @ApiOperation({ summary: 'Solicitar geração de PDF (Async via RabbitMQ)' })
  @ApiParam({ name: 'id', description: 'ID do laudo' })
  @ApiResponse({ status: 200, description: 'Solicitação enfileirada com sucesso' })
  @ApiResponse({ status: 400, description: 'Já existe um processamento em andamento ou erro na fila' })
  async requestPdf(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return await this.laudosService.requestPdfGeneration(id, user.id, user.role);
  }

  // ========== AMBIENTES WEB ==========

  @Get(':id/ambientes-web')
  @ApiOperation({ summary: 'Listar ambientes web do laudo com contagem de imagens' })
  @ApiParam({ name: 'id', description: 'ID do laudo' })
  async getAmbientesWeb(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return await this.laudosService.getAmbientesWeb(id, user.id, user.role);
  }

  @Post(':id/ambientes-web')
  @ApiOperation({ summary: 'Adicionar ambiente web ao laudo' })
  @ApiParam({ name: 'id', description: 'ID do laudo' })
  async addAmbienteWeb(
    @Param('id') id: string,
    @Body() body: { nomeAmbiente: string; tipoAmbiente: string },
    @CurrentUser() user: any,
  ) {
    return await this.laudosService.addAmbienteWeb(
      id,
      user.id,
      user.role,
      body.nomeAmbiente,
      body.tipoAmbiente,
    );
  }

  @Delete(':id/ambientes-web/:nomeAmbiente')
  @ApiOperation({ summary: 'Remover ambiente web do laudo' })
  @ApiParam({ name: 'id', description: 'ID do laudo' })
  @ApiParam({ name: 'nomeAmbiente', description: 'Nome do ambiente a remover' })
  async removeAmbienteWeb(
    @Param('id') id: string,
    @Param('nomeAmbiente') nomeAmbiente: string,
    @CurrentUser() user: any,
  ) {
    return await this.laudosService.removeAmbienteWeb(
      id,
      user.id,
      user.role,
      decodeURIComponent(nomeAmbiente),
    );
  }
}
