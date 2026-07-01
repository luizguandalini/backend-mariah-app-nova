import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { DriveService } from './drive.service';
import { DriveYearDto } from './dto/drive-year.dto';
import { DriveMonthDto } from './dto/drive-month.dto';
import { PaginatedLaudosResult } from '../laudos/laudos.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@ApiTags('drive')
@Controller('drive')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DEV, UserRole.ADMIN)
@ApiBearerAuth()
export class DriveController {
  constructor(private readonly driveService: DriveService) {}

  @Get('laudos')
  @ApiOperation({
    summary: 'Drive: listar todos os laudos como pastas (mais recente primeiro)',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Número da página (padrão: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Quantidade por página (padrão: 20, máx: 100)' })
  @ApiResponse({ status: 200, description: 'Lista paginada de laudos' })
  @ApiResponse({ status: 401, description: 'Sem token válido' })
  @ApiResponse({ status: 403, description: 'Sem papel DEV/ADMIN' })
  async listLaudos(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ): Promise<PaginatedLaudosResult> {
    return this.driveService.listLaudos(Number(page), Number(limit));
  }

  @Get('years')
  @ApiOperation({ summary: 'Drive: anos que possuem laudos, com contagem' })
  @ApiResponse({ status: 200, description: 'Lista de anos', type: [DriveYearDto] })
  @ApiResponse({ status: 401, description: 'Sem token válido' })
  @ApiResponse({ status: 403, description: 'Sem papel DEV/ADMIN' })
  async listYears(): Promise<DriveYearDto[]> {
    return this.driveService.listYears();
  }

  @Get('years/:year/months')
  @ApiOperation({ summary: 'Drive: meses de um ano que possuem laudos, com contagem' })
  @ApiParam({ name: 'year', description: 'Ano (2000–2100)' })
  @ApiResponse({ status: 200, description: 'Lista de meses', type: [DriveMonthDto] })
  @ApiResponse({ status: 400, description: 'Ano inválido' })
  @ApiResponse({ status: 401, description: 'Sem token válido' })
  @ApiResponse({ status: 403, description: 'Sem papel DEV/ADMIN' })
  async listMonths(
    @Param('year', ParseIntPipe) year: number,
  ): Promise<DriveMonthDto[]> {
    return this.driveService.listMonths(year);
  }

  @Get('years/:year/months/:month/laudos')
  @ApiOperation({
    summary: 'Drive: laudos de um ano/mês específico, paginados (mais recente primeiro)',
  })
  @ApiParam({ name: 'year', description: 'Ano (2000–2100)' })
  @ApiParam({ name: 'month', description: 'Mês (1–12)' })
  @ApiQuery({ name: 'page', required: false, description: 'Número da página (padrão: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Quantidade por página (padrão: 20, máx: 100)' })
  @ApiResponse({ status: 200, description: 'Lista paginada de laudos do mês' })
  @ApiResponse({ status: 400, description: 'Ano ou mês inválido' })
  @ApiResponse({ status: 401, description: 'Sem token válido' })
  @ApiResponse({ status: 403, description: 'Sem papel DEV/ADMIN' })
  async listLaudosByMonth(
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ): Promise<PaginatedLaudosResult> {
    return this.driveService.listLaudosByMonth(year, month, Number(page), Number(limit));
  }
}
