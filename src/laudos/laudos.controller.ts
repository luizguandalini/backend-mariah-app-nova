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
import { LaudosService } from './laudos.service';
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
  async create(@Body() createLaudoDto: CreateLaudoDto): Promise<Laudo> {
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
  @ApiResponse({ status: 200, description: 'Lista de laudos retornada com sucesso' })
  async findMyLaudos(@CurrentUser() user: any): Promise<Partial<Laudo>[]> {
    return await this.laudosService.findByUsuario(user.id);
  }

  @Get()
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar todos os laudos (DEV/ADMIN)' })
  @ApiResponse({ status: 200, description: 'Lista retornada com sucesso' })
  async findAll(): Promise<Partial<Laudo>[]> {
    return await this.laudosService.findAll();
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
}
