import { Controller, Get, Post, Body, Param, Delete, Put, HttpCode, HttpStatus, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { BeneficiosService } from './beneficios.service';
import { CreateBeneficioDto } from './dto/create-beneficio.dto';
import { UpdateBeneficioDto } from './dto/update-beneficio.dto';
import { PlanoBeneficio } from './entities/plano-beneficio.entity';
import { DateTransformInterceptor } from '../common/interceptors/date-transform.interceptor';

@ApiTags('beneficios')
@Controller('planos/:planoId/beneficios')
@UseInterceptors(DateTransformInterceptor)
export class BeneficiosController {
  constructor(private readonly beneficiosService: BeneficiosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Adicionar benefício a um plano (ordem automática)' })
  @ApiParam({ name: 'planoId', description: 'ID do plano' })
  @ApiResponse({ status: 201, description: 'Benefício criado com sucesso' })
  async create(
    @Param('planoId') planoId: string,
    @Body() createBeneficioDto: CreateBeneficioDto,
  ): Promise<PlanoBeneficio> {
    return await this.beneficiosService.create(planoId, createBeneficioDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos os benefícios de um plano' })
  @ApiParam({ name: 'planoId', description: 'ID do plano' })
  @ApiResponse({ status: 200, description: 'Lista de benefícios retornada com sucesso' })
  async findAll(@Param('planoId') planoId: string): Promise<PlanoBeneficio[]> {
    return await this.beneficiosService.findAllByPlano(planoId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar benefício (com troca inteligente de ordem)' })
  @ApiParam({ name: 'planoId', description: 'ID do plano' })
  @ApiParam({ name: 'id', description: 'ID do benefício' })
  @ApiResponse({ status: 200, description: 'Benefício atualizado com sucesso' })
  @ApiResponse({ status: 404, description: 'Benefício não encontrado' })
  async update(
    @Param('id') id: string,
    @Body() updateBeneficioDto: UpdateBeneficioDto,
  ): Promise<PlanoBeneficio> {
    return await this.beneficiosService.update(id, updateBeneficioDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deletar benefício' })
  @ApiParam({ name: 'planoId', description: 'ID do plano' })
  @ApiParam({ name: 'id', description: 'ID do benefício' })
  @ApiResponse({ status: 204, description: 'Benefício deletado com sucesso' })
  @ApiResponse({ status: 404, description: 'Benefício não encontrado' })
  async remove(@Param('id') id: string): Promise<void> {
    return await this.beneficiosService.remove(id);
  }
}
