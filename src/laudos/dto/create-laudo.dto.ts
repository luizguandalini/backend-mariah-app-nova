import { IsString, IsOptional, IsEnum, IsInt, IsUUID, IsNumber, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusLaudo, TipoVistoria, TipoUso } from '../entities/laudo.entity';

export class CreateLaudoDto {
  @ApiProperty({ description: 'ID do usuário' })
  @IsUUID()
  usuarioId: string;

  @ApiProperty({ description: 'Endereço completo do imóvel' })
  @IsString()
  endereco: string;

  // Endereço detalhado
  @ApiPropertyOptional({ description: 'Rua' })
  @IsString()
  @IsOptional()
  rua?: string;

  @ApiPropertyOptional({ description: 'Número' })
  @IsString()
  @IsOptional()
  numero?: string;

  @ApiPropertyOptional({ description: 'Complemento' })
  @IsString()
  @IsOptional()
  complemento?: string;

  @ApiPropertyOptional({ description: 'Bairro' })
  @IsString()
  @IsOptional()
  bairro?: string;

  @ApiPropertyOptional({ description: 'Cidade' })
  @IsString()
  @IsOptional()
  cidade?: string;

  @ApiPropertyOptional({ description: 'Estado (UF)' })
  @IsString()
  @IsOptional()
  estado?: string;

  @ApiPropertyOptional({ description: 'CEP' })
  @IsString()
  @IsOptional()
  cep?: string;

  // Classificação
  @ApiPropertyOptional({ description: 'Tipo de vistoria', enum: TipoVistoria })
  @IsString()
  @IsOptional()
  tipoVistoria?: string;

  @ApiPropertyOptional({ description: 'Tipo de uso', enum: TipoUso })
  @IsString()
  @IsOptional()
  tipoUso?: string;

  @ApiPropertyOptional({ description: 'Tipo específico do imóvel' })
  @IsString()
  @IsOptional()
  tipoImovel?: string;

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

  // Geolocalização
  @ApiPropertyOptional({ description: 'Latitude GPS' })
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitude GPS' })
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Endereço completo obtido do GPS' })
  @IsString()
  @IsOptional()
  enderecoCompletoGps?: string;

  // Questionários
  @ApiPropertyOptional({ description: 'Incluir atestado (0 ou 1)' })
  @IsInt()
  @IsOptional()
  incluirAtestado?: number;

  @ApiPropertyOptional({ description: 'Texto do atestado' })
  @IsString()
  @IsOptional()
  atestado?: string;

  @ApiPropertyOptional({ description: 'Análises hidráulicas (JSON)' })
  @IsObject()
  @IsOptional()
  analisesHidraulicas?: object;

  @ApiPropertyOptional({ description: 'Análises elétricas (JSON)' })
  @IsObject()
  @IsOptional()
  analisesEletricas?: object;

  @ApiPropertyOptional({ description: 'Sistema de ar condicionado (JSON)' })
  @IsObject()
  @IsOptional()
  sistemaAr?: object;

  @ApiPropertyOptional({ description: 'Mecanismos de abertura (JSON)' })
  @IsObject()
  @IsOptional()
  mecanismosAbertura?: object;

  @ApiPropertyOptional({ description: 'Revestimentos (JSON)' })
  @IsObject()
  @IsOptional()
  revestimentos?: object;

  @ApiPropertyOptional({ description: 'Mobílias (JSON)' })
  @IsObject()
  @IsOptional()
  mobilias?: object;

  @ApiPropertyOptional({ description: 'Dados extras de seções dinâmicas (JSON)' })
  @IsObject()
  @IsOptional()
  dadosExtra?: object;
}
