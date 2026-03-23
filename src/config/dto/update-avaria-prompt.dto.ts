import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAvariaPromptDto {
  @ApiProperty({
    description: 'Prompt específico para análise de fotos de avaria',
    minLength: 25,
    maxLength: 1000,
    example:
      'Analise a foto de avaria destacando tipo do dano, extensão visível, possível causa e impacto funcional, usando linguagem técnica objetiva.',
  })
  @IsString()
  @MinLength(25, {
    message: 'O prompt de avaria deve ter no mínimo 25 caracteres',
  })
  @MaxLength(1000, {
    message: 'O prompt de avaria deve ter no máximo 1000 caracteres',
  })
  value: string;
}
