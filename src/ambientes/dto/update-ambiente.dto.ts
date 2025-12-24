import { PartialType } from '@nestjs/swagger';
import { CreateAmbienteDto } from './create-ambiente.dto';
import { IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAmbienteDto extends PartialType(CreateAmbienteDto) {
  @ApiProperty({
    description: 'Posição do ambiente na listagem (usado para ordenação)',
    example: 1,
    minimum: 0,
    required: false,
  })
  @IsOptional()
  @IsInt({ message: 'A ordem deve ser um número inteiro' })
  @Min(0, { message: 'A ordem deve ser maior ou igual a 0' })
  ordem?: number;
}
