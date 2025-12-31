import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { LaudoDetailsService } from './laudo-details.service';
import {
  CreateLaudoSectionDto,
  UpdateLaudoSectionDto,
  CreateLaudoQuestionDto,
  UpdateLaudoQuestionDto,
  CreateLaudoOptionDto,
  UpdateLaudoOptionDto,
} from './dto/laudo-details.dto';

@Controller('laudo-details')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DEV, UserRole.ADMIN)
export class LaudoDetailsController {
  constructor(private readonly laudoDetailsService: LaudoDetailsService) {}

  /**
   * Endpoint público para sincronização de cache (app mobile)
   * Retorna todas as seções ativas com perguntas e opções
   * ATENÇÃO: Acessível a TODOS os usuários autenticados (não apenas DEV/ADMIN)
   */
  @Get('todos-com-estrutura')
  @Roles(UserRole.USUARIO, UserRole.FUNCIONARIO, UserRole.DEV, UserRole.ADMIN) // Permitir todos os types de usuário
  getTodosComEstrutura() {
    return this.laudoDetailsService.getTodosComEstrutura();
  }

  // Sections
  @Post('sections')
  createSection(@Body() dto: CreateLaudoSectionDto) {
    return this.laudoDetailsService.createSection(dto);
  }

  @Get('sections')
  findAllSections(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('includeDetails') includeDetails: string = 'false',
  ) {
    return this.laudoDetailsService.findAllSections(
      parseInt(page, 10),
      parseInt(limit, 10),
      includeDetails === 'true',
    );
  }

  @Get('sections/:id')
  findSectionById(@Param('id') id: string) {
    return this.laudoDetailsService.findSectionById(id);
  }

  @Get('sections/:id/details')
  findSectionDetails(@Param('id') id: string) {
    return this.laudoDetailsService.findSectionDetails(id);
  }

  @Put('sections/:id')
  updateSection(@Param('id') id: string, @Body() dto: UpdateLaudoSectionDto) {
    return this.laudoDetailsService.updateSection(id, dto);
  }

  @Delete('sections/:id')
  deleteSection(@Param('id') id: string) {
    return this.laudoDetailsService.deleteSection(id);
  }

  // Questions
  @Post('questions')
  createQuestion(@Body() dto: CreateLaudoQuestionDto) {
    return this.laudoDetailsService.createQuestion(dto);
  }

  @Get('questions')
  findAllQuestions(@Query('page') page: string = '1', @Query('limit') limit: string = '10') {
    return this.laudoDetailsService.findAllQuestions(parseInt(page, 10), parseInt(limit, 10));
  }

  @Get('questions/:id')
  findQuestionById(@Param('id') id: string) {
    return this.laudoDetailsService.findQuestionById(id);
  }

  @Put('questions/:id')
  updateQuestion(@Param('id') id: string, @Body() dto: UpdateLaudoQuestionDto) {
    return this.laudoDetailsService.updateQuestion(id, dto);
  }

  @Delete('questions/:id')
  deleteQuestion(@Param('id') id: string) {
    return this.laudoDetailsService.deleteQuestion(id);
  }

  // Options
  @Post('options')
  createOption(@Body() dto: CreateLaudoOptionDto) {
    return this.laudoDetailsService.createOption(dto);
  }

  @Get('options')
  findAllOptions(@Query('page') page: string = '1', @Query('limit') limit: string = '10') {
    return this.laudoDetailsService.findAllOptions(parseInt(page, 10), parseInt(limit, 10));
  }

  @Get('options/:id')
  findOptionById(@Param('id') id: string) {
    return this.laudoDetailsService.findOptionById(id);
  }

  @Put('options/:id')
  updateOption(@Param('id') id: string, @Body() dto: UpdateLaudoOptionDto) {
    return this.laudoDetailsService.updateOption(id, dto);
  }

  @Delete('options/:id')
  deleteOption(@Param('id') id: string) {
    return this.laudoDetailsService.deleteOption(id);
  }
}
