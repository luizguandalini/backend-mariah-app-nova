import { Controller, Get, Put, Body, Param, Delete, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { Usuario } from './entities/usuario.entity';
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
    return await this.usersService.getMe(user.id);
  }

  @Get()
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar todos os usuários (DEV/ADMIN)' })
  @ApiResponse({ status: 200, description: 'Lista retornada com sucesso' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  async findAll(): Promise<Usuario[]> {
    return await this.usersService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Buscar usuário por ID (DEV/ADMIN)' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ status: 200, description: 'Usuário encontrado' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  async findOne(@Param('id') id: string): Promise<Usuario> {
    return await this.usersService.findOne(id);
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

  @Put(':id/creditos/set/:quantidade')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Definir quantidade de imagens (DEV/ADMIN)' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiParam({ name: 'quantidade', description: 'Nova quantidade de imagens' })
  @ApiResponse({ status: 200, description: 'Créditos definidos com sucesso' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  async setCreditos(
    @Param('id') id: string,
    @Param('quantidade') quantidade: number,
    @CurrentUser() user: any,
  ): Promise<Usuario> {
    return await this.usersService.updateQuantidadeImagens(id, +quantidade, user);
  }

  @Put(':id/creditos/add/:quantidade')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @ApiOperation({ summary: 'Adicionar créditos de imagens (DEV/ADMIN)' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiParam({ name: 'quantidade', description: 'Quantidade a adicionar' })
  @ApiResponse({ status: 200, description: 'Créditos adicionados com sucesso' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  async addCreditos(
    @Param('id') id: string,
    @Param('quantidade') quantidade: number,
    @CurrentUser() user: any,
  ): Promise<Usuario> {
    return await this.usersService.addQuantidadeImagens(id, +quantidade, user);
  }

  @Delete(':id')
  @Roles(UserRole.DEV, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deletar usuário (DEV/ADMIN)' })
  @ApiParam({ name: 'id', description: 'ID do usuário' })
  @ApiResponse({ status: 204, description: 'Usuário deletado' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  async remove(@Param('id') id: string): Promise<void> {
    return await this.usersService.remove(id);
  }
}
