import { ApiProperty } from '@nestjs/swagger';
import { DriveViewerDto } from '../../laudos/dto/drive-viewer.dto';

/**
 * Resposta **read-only** de
 * `GET /uploads/laudo/:laudoId/ambiente/:ambiente/imagens`.
 *
 * Whitelist explícita: id, ambiente, ordem, URL de leitura
 * (`url` — presigned GetObject), legenda, categoria. **Não**
 * inclui `s3Key` (sensível — dá acesso direto fora do presign),
 * `damageMarker`, coordenadas ou URLs presigned de escrita.
 *
 * O nome do campo é `url` (mesmo do modo pleno) para o frontend
 * conseguir renderizar a galeria sem ramificar entre os dois shapes.
 */
export class ReadOnlyImagemByAmbienteItemDto {
  @ApiProperty({ description: 'UUID da imagem no banco.' })
  id: string;

  @ApiProperty({ description: 'URL presigned de leitura (GetObject), validade padrão de 1h.' })
  url: string;

  @ApiProperty({ description: 'Ambiente ao qual a imagem pertence.' })
  ambiente: string;

  @ApiProperty({ description: 'Legenda atual da imagem (pode ser vazia).' })
  legenda?: string;

  @ApiProperty({ description: 'Categoria da imagem (AVARIA, NORMAL, etc.).' })
  categoria?: string;

  @ApiProperty({ description: 'Ordem da imagem no ambiente.' })
  ordem: number;
}

export class ReadOnlyImagensByAmbienteResponseDto {
  @ApiProperty({ type: [ReadOnlyImagemByAmbienteItemDto] })
  data: ReadOnlyImagemByAmbienteItemDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 4 })
  lastPage: number;

  @ApiProperty({ type: DriveViewerDto })
  viewer: DriveViewerDto;
}
