import { PartialType } from '@nestjs/mapped-types';
import { CreateBeneficioDto } from './create-beneficio.dto';
import { IsOptional, IsInt, Min } from 'class-validator';

export class UpdateBeneficioDto extends PartialType(CreateBeneficioDto) {
  @IsOptional()
  @IsInt({ message: 'A ordem deve ser um número inteiro' })
  @Min(1, { message: 'A ordem deve ser maior ou igual a 1' })
  ordem?: number;
}
