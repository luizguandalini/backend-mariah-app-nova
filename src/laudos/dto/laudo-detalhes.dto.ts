import { ApiPropertyOptional } from '@nestjs/swagger';

export class LaudoDetalhesDto {
  @ApiPropertyOptional({ type: 'string', description: 'Atestado da vistoria' })
  atestado?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Análises hidráulicas',
  })
  analisesHidraulicas?: object;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Análises elétricas',
  })
  analisesEletricas?: object;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'Sistema de ar' })
  sistemaAr?: object;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Mecanismos de abertura',
  })
  mecanismosAbertura?: object;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'Revestimentos' })
  revestimentos?: object;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'Mobílias' })
  mobilias?: object;

  @ApiPropertyOptional({ type: 'number', description: 'Flag incluir atestado' })
  incluirAtestado?: number;
}
