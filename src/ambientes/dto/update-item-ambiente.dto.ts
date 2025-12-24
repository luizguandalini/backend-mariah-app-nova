import { PartialType } from '@nestjs/swagger';
import { CreateItemAmbienteDto } from './create-item-ambiente.dto';
import { IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateItemAmbienteDto extends PartialType(CreateItemAmbienteDto) {
  @ApiProperty({
    description: 'Posição do item na listagem (usado para ordenação dentro do mesmo nível)',
    example: 1,
    minimum: 0,
    required: false,
  })
  @IsOptional()
  @IsInt({ message: 'A ordem deve ser um número inteiro' })
  @Min(0, { message: 'A ordem deve ser maior ou igual a 0' })
  ordem?: number;
}
