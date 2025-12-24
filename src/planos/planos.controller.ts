import { Controller, Get, Post, Body, Param, Delete, Put, HttpCode, HttpStatus, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PlanosService } from './planos.service';
import { CreatePlanoDto } from './dto/create-plano.dto';
import { UpdatePlanoDto } from './dto/update-plano.dto';
import { Plano } from './entities/plano.entity';
import { DateTransformInterceptor } from '../common/interceptors/date-transform.interceptor';

@ApiTags('planos')
@Controller('planos')
@UseInterceptors(DateTransformInterceptor)
export class PlanosController {
  constructor(private readonly planosService: PlanosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar novo plano' })
  @ApiResponse({ status: 201, description: 'Plano criado com sucesso' })
  async create(@Body() createPlanoDto: CreatePlanoDto): Promise<Plano> {
    return await this.planosService.create(createPlanoDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos os planos ativos com benefícios' })
  @ApiResponse({ status: 200, description: 'Lista de planos retornada com sucesso' })
  async findAll(): Promise<Plano[]> {
    return await this.planosService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar plano específico por ID' })
  @ApiParam({ name: 'id', description: 'ID do plano' })
  @ApiResponse({ status: 200, description: 'Plano encontrado com sucesso' })
  @ApiResponse({ status: 404, description: 'Plano não encontrado' })
  async findOne(@Param('id') id: string): Promise<Plano> {
    return await this.planosService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar plano (com troca inteligente de ordem)' })
  @ApiParam({ name: 'id', description: 'ID do plano' })
  @ApiResponse({ status: 200, description: 'Plano atualizado com sucesso' })
  @ApiResponse({ status: 404, description: 'Plano não encontrado' })
  async update(
    @Param('id') id: string,
    @Body() updatePlanoDto: UpdatePlanoDto,
  ): Promise<Plano> {
    return await this.planosService.update(id, updatePlanoDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deletar plano' })
  @ApiParam({ name: 'id', description: 'ID do plano' })
  @ApiResponse({ status: 204, description: 'Plano deletado com sucesso' })
  @ApiResponse({ status: 404, description: 'Plano não encontrado' })
  async remove(@Param('id') id: string): Promise<void> {
    return await this.planosService.remove(id);
  }
}
