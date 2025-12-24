import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../enums/user-role.enum';

export class CreateUsuarioDto {
  @ApiProperty({
    description: 'Nome completo do usuário',
    example: 'João Silva',
    type: String,
  })
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  @IsString({ message: 'O nome deve ser um texto' })
  nome: string;

  @ApiProperty({
    description: 'Email do usuário (deve ser único)',
    example: 'joao.silva@example.com',
    type: String,
  })
  @IsNotEmpty({ message: 'O email é obrigatório' })
  @IsEmail({}, { message: 'Email inválido' })
  email: string;

  @ApiProperty({
    description: 'Senha do usuário',
    example: 'senha123',
    minLength: 6,
    type: String,
  })
  @IsNotEmpty({ message: 'A senha é obrigatória' })
  @IsString({ message: 'A senha deve ser um texto' })
  @MinLength(6, { message: 'A senha deve ter no mínimo 6 caracteres' })
  senha: string;

  @ApiProperty({
    description: 'Nível de acesso do usuário (DEV não pode ser criado via API)',
    example: UserRole.USUARIO,
    enum: UserRole,
    required: false,
    default: UserRole.USUARIO,
  })
  @IsOptional()
  @IsEnum(UserRole, { message: 'Role inválido' })
  role?: UserRole;
}
