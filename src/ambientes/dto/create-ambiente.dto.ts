import {
  IsNotEmpty,
  IsString,
  MaxLength,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TipoUso } from '../enums/ambiente-tipos.enum';

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
    description: 'Tipos de uso aplicáveis a este ambiente',
    example: ['Residencial'],
    enum: TipoUso,
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray({ message: 'Tipos de uso deve ser um array' })
  @IsEnum(TipoUso, { each: true, message: 'Tipo de uso inválido' })
  tiposUso?: TipoUso[];

  @ApiProperty({
    description: 'Tipos de imóvel aplicáveis a este ambiente',
    example: ['Galpão', 'Studio'],
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray({ message: 'Tipos de imóvel deve ser um array' })
  @IsString({ each: true, message: 'Cada tipo de imóvel deve ser texto' })
  @MaxLength(100, {
    each: true,
    message: 'Cada tipo de imóvel pode ter no máximo 100 caracteres',
  })
  tiposImovel?: string[];

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
