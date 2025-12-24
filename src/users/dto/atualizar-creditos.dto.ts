import { IsInt, Min } from 'class-validator';

export class AtualizarCreditosDto {
  @IsInt({ message: 'A quantidade deve ser um número inteiro' })
  @Min(0, { message: 'A quantidade deve ser maior ou igual a 0' })
  quantidade: number;
}
