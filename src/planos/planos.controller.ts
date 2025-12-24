import { Controller, Get, Post, Body, Param, Delete, HttpCode, HttpStatus, UseInterceptors } from '@nestjs/common';
import { PlanosService } from './planos.service';
import { CreatePlanoDto } from './dto/create-plano.dto';
import { Plano } from './entities/plano.entity';
import { DateTransformInterceptor } from '../common/interceptors/date-transform.interceptor';

@Controller('planos')
@UseInterceptors(DateTransformInterceptor)
export class PlanosController {
  constructor(private readonly planosService: PlanosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createPlanoDto: CreatePlanoDto): Promise<Plano> {
    return await this.planosService.create(createPlanoDto);
  }

  @Get()
  async findAll(): Promise<Plano[]> {
    return await this.planosService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Plano> {
    return await this.planosService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    return await this.planosService.remove(id);
  }
}
