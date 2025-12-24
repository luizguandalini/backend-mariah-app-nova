import { PartialType } from '@nestjs/mapped-types';
import { CreatePlanoDto } from './create-plano.dto';
import { IsOptional, IsInt, Min } from 'class-validator';

export class UpdatePlanoDto extends PartialType(CreatePlanoDto) {
  @IsOptional()
  @IsInt({ message: 'A ordem deve ser um número inteiro' })
  @Min(1, { message: 'A ordem deve ser maior ou igual a 1' })
  ordem?: number;
}
