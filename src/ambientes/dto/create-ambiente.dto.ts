import { IsNotEmpty, IsString, MaxLength, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAmbienteDto {
  @ApiProperty({
    description: 'Nome do ambiente',
    example: 'Quarto',
    maxLength: 255,
  })
  @IsNotEmpty({ message: 'O nome do ambiente é obrigatório' })
  @IsString({ message: 'O nome deve ser um texto' })
  @MaxLength(255, { message: 'O nome pode ter no máximo 255 caracteres' })
  nome: string;

  @ApiProperty({
    description: 'Descrição detalhada do ambiente',
    example: 'Ambiente destinado para dormitório principal',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'A descrição deve ser um texto' })
  descricao?: string;

  @ApiProperty({
    description: 'Define se o ambiente está ativo',
    example: true,
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'Ativo deve ser verdadeiro ou falso' })
  ativo?: boolean;
}
