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
import { AmbientesService } from './ambientes.service';
import { CreateAmbienteDto } from './dto/create-ambiente.dto';
import { UpdateAmbienteDto } from './dto/update-ambiente.dto';
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

  @Delete(':id')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Deletar ambiente (apenas DEV e ADMIN)' })
  remove(@Param('id') id: string) {
    return this.ambientesService.remove(id);
  }
}
