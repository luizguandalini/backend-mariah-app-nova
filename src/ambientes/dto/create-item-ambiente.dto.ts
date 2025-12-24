import { IsNotEmpty, IsString, MaxLength, IsOptional, IsBoolean, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateItemAmbienteDto {
  @ApiProperty({
    description: 'Nome do item',
    example: 'Porta',
    maxLength: 255,
  })
  @IsNotEmpty({ message: 'O nome do item é obrigatório' })
  @IsString({ message: 'O nome deve ser um texto' })
  @MaxLength(255, { message: 'O nome pode ter no máximo 255 caracteres' })
  nome: string;

  @ApiProperty({
    description: 'Prompt de IA associado a este item',
    example: 'Analise o estado da porta, verificando dobradiças, fechadura e acabamento',
    type: String,
  })
  @IsNotEmpty({ message: 'O prompt é obrigatório' })
  @IsString({ message: 'O prompt deve ser um texto' })
  prompt: string;

  @ApiProperty({
    description: 'ID do item pai (para criar hierarquia)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
    type: String,
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Parent ID deve ser um UUID válido' })
  parentId?: string;

  @ApiProperty({
    description: 'Define se o item está ativo',
    example: true,
    default: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'Ativo deve ser verdadeiro ou falso' })
  ativo?: boolean;
}
