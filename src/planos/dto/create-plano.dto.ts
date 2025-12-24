import { IsNotEmpty, IsString, MaxLength, IsOptional, IsNumber, IsBoolean, Min, IsInt } from 'class-validator';

export class CreatePlanoDto {
  @IsNotEmpty({ message: 'O nome do plano é obrigatório' })
  @IsString({ message: 'O nome deve ser um texto' })
  @MaxLength(255, { message: 'O nome pode ter no máximo 255 caracteres' })
  nome: string;

  @IsOptional()
  @IsString({ message: 'O subtítulo deve ser um texto' })
  @MaxLength(500, { message: 'O subtítulo pode ter no máximo 500 caracteres' })
  subtitulo?: string;

  @IsOptional()
  @IsNumber({}, { message: 'O preço deve ser um número' })
  @Min(0, { message: 'O preço deve ser maior ou igual a 0' })
  preco?: number;

  @IsNotEmpty({ message: 'A quantidade de imagens é obrigatória' })
  @IsInt({ message: 'A quantidade de imagens deve ser um número inteiro' })
  @Min(1, { message: 'A quantidade de imagens deve ser maior ou igual a 1' })
  quantidadeImagens: number;

  @IsOptional()
  @IsBoolean({ message: 'Ativo deve ser verdadeiro ou falso' })
  ativo?: boolean;
}
