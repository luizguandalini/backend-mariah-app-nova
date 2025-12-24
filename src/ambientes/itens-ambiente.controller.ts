import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Put, 
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ItensAmbienteService } from './itens-ambiente.service';
import { CreateItemAmbienteDto } from './dto/create-item-ambiente.dto';
import { UpdateItemAmbienteDto } from './dto/update-item-ambiente.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('Itens de Ambiente')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ambientes/:ambienteId/itens')
export class ItensAmbienteController {
  constructor(private readonly itensAmbienteService: ItensAmbienteService) {}

  @Post()
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Criar novo item em um ambiente (apenas DEV e ADMIN)' })
  create(
    @Param('ambienteId') ambienteId: string,
    @Body() createItemDto: CreateItemAmbienteDto
  ) {
    return this.itensAmbienteService.create(ambienteId, createItemDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos os itens de um ambiente em estrutura hierárquica' })
  findAll(@Param('ambienteId') ambienteId: string) {
    return this.itensAmbienteService.findAllByAmbiente(ambienteId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar item específico por ID' })
  findOne(@Param('id') id: string) {
    return this.itensAmbienteService.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Atualizar item (apenas DEV e ADMIN)' })
  update(@Param('id') id: string, @Body() updateItemDto: UpdateItemAmbienteDto) {
    return this.itensAmbienteService.update(id, updateItemDto);
  }

  @Delete(':id')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Deletar item (apenas DEV e ADMIN)' })
  remove(@Param('id') id: string) {
    return this.itensAmbienteService.remove(id);
  }
}
