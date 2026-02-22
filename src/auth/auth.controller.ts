import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CreateUsuarioDto } from '../users/dto/create-usuario.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { CreateWebLoginTicketDto, ExchangeWebLoginTicketDto } from './dto/web-login-ticket.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Usuario } from '../users/entities/usuario.entity';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fazer login' })
  @ApiResponse({ status: 200, description: 'Login realizado com sucesso' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
  async login(@Body() loginDto: LoginDto) {
    return await this.authService.login(loginDto);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar novo usuário' })
  @ApiResponse({ status: 201, description: 'Usuário criado com sucesso' })
  @ApiResponse({ status: 401, description: 'Email já cadastrado' })
  async register(@Body() createUsuarioDto: CreateUsuarioDto) {
    return await this.authService.register(createUsuarioDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar tokens usando refresh token' })
  @ApiResponse({ status: 200, description: 'Tokens renovados com sucesso' })
  @ApiResponse({ status: 401, description: 'Refresh token inválido ou expirado' })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return await this.authService.refreshTokens(refreshTokenDto.refresh_token);
  }

  @Post('revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revogar refresh token (logout)' })
  @ApiResponse({ status: 200, description: 'Token revogado com sucesso' })
  async revoke(@Body() refreshTokenDto: RefreshTokenDto) {
    await this.authService.revokeRefreshToken(refreshTokenDto.refresh_token);
    return { message: 'Token revogado com sucesso' };
  }

  @Post('web-login-ticket')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Gerar ticket temporário para login web' })
  @ApiResponse({ status: 200, description: 'Ticket gerado com sucesso' })
  async createWebLoginTicket(
    @CurrentUser() user: Usuario,
    @Body() body: CreateWebLoginTicketDto,
  ) {
    return await this.authService.createWebLoginTicket(user, body.laudoId);
  }

  @Post('web-login-ticket/exchange')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trocar ticket por tokens de autenticação' })
  @ApiResponse({ status: 200, description: 'Tokens retornados com sucesso' })
  async exchangeWebLoginTicket(@Body() body: ExchangeWebLoginTicketDto) {
    return await this.authService.exchangeWebLoginTicket(body.ticket);
  }
}
