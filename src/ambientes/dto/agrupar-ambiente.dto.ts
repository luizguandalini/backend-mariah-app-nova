import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AgruparAmbienteDto {
  @ApiProperty({
    description: 'Nome do ambiente para agrupar (pode ser existente ou novo)',
    example: 'Cozinha',
    maxLength: 255,
  })
  @IsNotEmpty({ message: 'O nome do ambiente é obrigatório' })
  @IsString({ message: 'O nome deve ser um texto' })
  @MaxLength(255, { message: 'O nome pode ter no máximo 255 caracteres' })
  nomeAmbiente: string;
}
