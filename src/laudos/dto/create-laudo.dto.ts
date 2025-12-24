import { IsString, IsOptional, IsEnum, IsInt, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusLaudo } from '../entities/laudo.entity';

export class CreateLaudoDto {
  @ApiProperty({ description: 'ID do usuário' })
  @IsUUID()
  usuarioId: string;

  @ApiProperty({ description: 'Endereço do imóvel' })
  @IsString()
  endereco: string;

  @ApiPropertyOptional({ description: 'Tipo do imóvel (Casa, Apartamento, etc)' })
  @IsString()
  @IsOptional()
  tipo?: string;

  @ApiPropertyOptional({ description: 'Unidade/Número' })
  @IsString()
  @IsOptional()
  unidade?: string;

  @ApiPropertyOptional({ description: 'Tamanho do imóvel' })
  @IsString()
  @IsOptional()
  tamanho?: string;

  @ApiPropertyOptional({ description: 'Status do laudo', enum: StatusLaudo })
  @IsEnum(StatusLaudo)
  @IsOptional()
  status?: StatusLaudo;

  @ApiPropertyOptional({ description: 'Total de ambientes' })
  @IsInt()
  @IsOptional()
  totalAmbientes?: number;

  @ApiPropertyOptional({ description: 'Total de fotos' })
  @IsInt()
  @IsOptional()
  totalFotos?: number;
}
