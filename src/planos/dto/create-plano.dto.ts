import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePlanoDto {
  @IsNotEmpty({ message: 'O nome do plano é obrigatório' })
  @IsString({ message: 'O nome deve ser um texto' })
  @MaxLength(255, { message: 'O nome pode ter no máximo 255 caracteres' })
  nome: string;
}
