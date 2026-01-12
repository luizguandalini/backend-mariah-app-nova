import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateDefaultPromptDto {
  @ApiProperty({
    description: 'Prompt padrão para análise de imagens',
    maxLength: 1000,
    example: 'Analise a imagem fornecida de forma detalhada e técnica.',
  })
  @IsString()
  @MaxLength(1000, {
    message: 'O prompt padrão deve ter no máximo 1000 caracteres',
  })
  value: string;
}
