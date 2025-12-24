import { PartialType } from '@nestjs/mapped-types';
import { CreateUsuarioDto } from './create-usuario.dto';
import { IsOptional, IsInt, Min } from 'class-validator';

export class UpdateUsuarioDto extends PartialType(CreateUsuarioDto) {
  @IsOptional()
  @IsInt({ message: 'A quantidade de imagens deve ser um número inteiro' })
  @Min(0, { message: 'A quantidade de imagens deve ser maior ou igual a 0' })
  quantidadeImagens?: number;
}
