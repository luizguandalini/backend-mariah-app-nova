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
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AmbientesService } from './ambientes.service';
import { CreateAmbienteDto } from './dto/create-ambiente.dto';
import { UpdateAmbienteDto } from './dto/update-ambiente.dto';
import { AgruparAmbienteDto } from './dto/agrupar-ambiente.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('Ambientes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ambientes')
export class AmbientesController {
  constructor(private readonly ambientesService: AmbientesService) {}

  @Post()
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Criar novo ambiente (apenas DEV e ADMIN)' })
  create(@Body() createAmbienteDto: CreateAmbienteDto) {
    return this.ambientesService.create(createAmbienteDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos os ambientes ativos' })
  findAll() {
    return this.ambientesService.findAll();
  }

  @Get('arvore-completa')
  @ApiOperation({ summary: 'Listar todos os ambientes com árvore completa de itens e sub-itens' })
  findAllWithTree() {
    return this.ambientesService.findAllWithTree();
  }

  @Get('listar-nomes')
  @ApiOperation({ summary: 'Listar todos os nomes de ambientes disponíveis' })
  listarNomes() {
    return this.ambientesService.listarNomes();
  }

  @Get('todos-com-itens')
  @ApiOperation({ 
    summary: 'Buscar todos os ambientes com seus itens PAI para sincronização (app mobile)',
    description: 'Retorna todos os ambientes ativos consolidados com seus itens PAI, incluindo timestamp de última atualização. Usado para cache local no app.'
  })
  getTodosComItens() {
    return this.ambientesService.getTodosComItens();
  }

  @Get('itens-por-nome/:nome')
  @ApiOperation({ summary: 'Buscar itens PAI de um ambiente por nome (para app mobile)' })
  getItensPorNome(@Param('nome') nome: string) {
    return this.ambientesService.getItensPorNome(nome);
  }

  @Get('arvore-completa/paginado')
  @ApiOperation({
    summary: 'Listar ambientes com árvore completa paginados (para scroll infinito)',
  })
  findAllWithTreePaginated(@Query('limit') limit?: number, @Query('offset') offset?: number) {
    return this.ambientesService.findAllWithTreePaginated(
      limit ? Number(limit) : 10,
      offset ? Number(offset) : 0,
    );
  }

  @Patch('reordenar')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Reordenar múltiplos ambientes (drag-and-drop)' })
  reordenar(@Body() reordenacao: { id: string; ordem: number }[]) {
    return this.ambientesService.reordenar(reordenacao);
  }

  @Patch(':id/mover/:novaOrdem')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Mover um ambiente para uma nova posição (otimizado)' })
  moverAmbiente(@Param('id') id: string, @Param('novaOrdem') novaOrdem: string) {
    return this.ambientesService.moverAmbiente(id, Number(novaOrdem));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar ambiente por ID com seus itens' })
  findOne(@Param('id') id: string) {
    return this.ambientesService.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Atualizar ambiente (apenas DEV e ADMIN)' })
  update(@Param('id') id: string, @Body() updateAmbienteDto: UpdateAmbienteDto) {
    return this.ambientesService.update(id, updateAmbienteDto);
  }

  @Patch(':id/tipos')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Atualizar apenas tipos do ambiente (otimizado)' })
  updateTipos(@Param('id') id: string, @Body() updateAmbienteDto: UpdateAmbienteDto) {
    return this.ambientesService.updateTiposOnly(id, updateAmbienteDto);
  }

  @Put(':id/agrupar-com')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Agrupar ambiente com outro (existente ou novo)',
    description:
      'Se o ambiente com o nome informado já existe, apenas agrupa. Se não existe, cria com as mesmas configurações e agrupa.',
  })
  agruparCom(@Param('id') id: string, @Body() dto: AgruparAmbienteDto) {
    return this.ambientesService.agruparCom(id, dto.nomeAmbiente);
  }

  @Post(':id/tipos-uso/:tipo')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Adicionar tipo de uso ao ambiente (REST)' })
  adicionarTipoUso(@Param('id') id: string, @Param('tipo') tipo: string) {
    return this.ambientesService.adicionarTipoUso(id, tipo);
  }

  @Delete(':id/tipos-uso/:tipo')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Remover tipo de uso do ambiente (REST)' })
  removerTipoUso(@Param('id') id: string, @Param('tipo') tipo: string) {
    return this.ambientesService.removerTipoUso(id, tipo);
  }

  @Post(':id/tipos-imovel/:tipo')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Adicionar tipo de imóvel ao ambiente (REST)' })
  adicionarTipoImovel(@Param('id') id: string, @Param('tipo') tipo: string) {
    return this.ambientesService.adicionarTipoImovel(id, tipo);
  }

  @Delete(':id/tipos-imovel/:tipo')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Remover tipo de imóvel do ambiente (REST)' })
  removerTipoImovel(@Param('id') id: string, @Param('tipo') tipo: string) {
    return this.ambientesService.removerTipoImovel(id, tipo);
  }

  @Delete(':id')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Deletar ambiente (apenas DEV e ADMIN)' })
  remove(@Param('id') id: string) {
    return this.ambientesService.remove(id);
  }
}
