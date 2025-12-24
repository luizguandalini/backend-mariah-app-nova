import { IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateBeneficioDto {
  @IsNotEmpty({ message: 'A descrição do benefício é obrigatória' })
  @IsString({ message: 'A descrição deve ser um texto' })
  descricao: string;

  @IsOptional()
  @IsBoolean({ message: 'Ativo deve ser verdadeiro ou falso' })
  ativo?: boolean;
}
