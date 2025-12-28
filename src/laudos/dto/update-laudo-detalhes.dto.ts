import { IsString, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class QuestionResponseDto {
  @ApiPropertyOptional({ description: 'Valor da resposta (deve corresponder a uma opção válida)' })
  @IsString()
  @IsOptional()
  value?: string;
}

class AnalisesHidraulicasDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  fluxo_agua?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  vazamentos?: string;
}

class AnalisesEletricasDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  funcionamento?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  disjuntores?: string;
}

class SistemaArDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  ar_condicionado?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  aquecimento?: string;
}

class MecanismosAberturaDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  portas?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  macanetas?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  janelas?: string;
}

class RevestimentosDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  tetos?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  pisos?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  bancadas?: string;
}

class MobiliasDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  fixa?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  nao_fixa?: string;
}

export class UpdateLaudoDetalhesDto {
  @ApiPropertyOptional({ description: 'Texto do atestado (se aplicável)' })
  @IsString()
  @IsOptional()
  atestado?: string;

  @ApiPropertyOptional({ description: 'Análises hidráulicas' })
  @IsObject()
  @ValidateNested()
  @Type(() => AnalisesHidraulicasDto)
  @IsOptional()
  analisesHidraulicas?: AnalisesHidraulicasDto;

  @ApiPropertyOptional({ description: 'Análises elétricas' })
  @IsObject()
  @ValidateNested()
  @Type(() => AnalisesEletricasDto)
  @IsOptional()
  analisesEletricas?: AnalisesEletricasDto;

  @ApiPropertyOptional({ description: 'Sistema de ar condicionado' })
  @IsObject()
  @ValidateNested()
  @Type(() => SistemaArDto)
  @IsOptional()
  sistemaAr?: SistemaArDto;

  @ApiPropertyOptional({ description: 'Mecanismos de abertura' })
  @IsObject()
  @ValidateNested()
  @Type(() => MecanismosAberturaDto)
  @IsOptional()
  mecanismosAbertura?: MecanismosAberturaDto;

  @ApiPropertyOptional({ description: 'Revestimentos' })
  @IsObject()
  @ValidateNested()
  @Type(() => RevestimentosDto)
  @IsOptional()
  revestimentos?: RevestimentosDto;

  @ApiPropertyOptional({ description: 'Mobílias' })
  @IsObject()
  @ValidateNested()
  @Type(() => MobiliasDto)
  @IsOptional()
  mobilias?: MobiliasDto;
}
