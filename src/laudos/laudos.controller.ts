import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
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
}
