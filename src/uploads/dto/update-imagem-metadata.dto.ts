import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  IsObject,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Coordenadas do marcador de avaria (círculo vermelho arrastável).
 *
 * - `x`, `y` = centro do círculo, normalizados em 0..1 em relação à
 *   largura/altura da imagem renderizada.
 * - `r` = raio, normalizado em 0..1 como fração do menor lado da imagem
 *   (min(width, height)). Garante que o círculo nunca exceda os limites
 *   da foto em qualquer tamanho de renderização (thumbnail, lightbox,
 *   página do PDF).
 *
 * Receber esses campos como um sub-objeto (e não em colunas soltas)
 * mantém o schema flexível para evoluir (ex.: adicionar cor, label) sem
 * nova migration — o jsonb da coluna já absorve.
 */
export class DamageMarkerDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  x: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  y: number;

  @IsNumber()
  @Min(0.02)
  @Max(0.5)
  r: number;
}

export class UpdateImagemMetadataDto {
  @IsOptional()
  @IsString()
  ambiente?: string;

  @IsOptional()
  @IsString()
  tipoAmbiente?: string;

  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsString()
  avariaLocal?: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  ordem?: number;

  @IsOptional()
  @IsString()
  ambienteComentario?: string;

  /**
   * Marcador de avaria. Aceita `null` explícito para apagar o
   * marcador sem precisar fazer um DELETE separado. Quando enviado,
   * o serviço valida o formato (x, y, r normalizados) antes de
   * persistir.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => DamageMarkerDto)
  damageMarker?: DamageMarkerDto | null;
}
