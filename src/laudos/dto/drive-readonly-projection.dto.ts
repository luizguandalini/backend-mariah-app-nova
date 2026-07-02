import { ApiProperty } from '@nestjs/swagger';
import { DriveViewerDto } from './drive-viewer.dto';

/**
 * Resposta **read-only** de `GET /laudos/:id/ambientes-web`.
 *
 * Whitelist explícita: NÃO inclui `usarNomeArquivoComoLegenda`,
 * `tipoUso`, `tipoImovel`, `logoPersonalizadaUrl`, `pdfStatus`,
 * `pdfProgress`, nem qualquer identificador do dono (sem `usuarioId`,
 * `usuarioNome`, `usuarioEmail`). URLs de imagens são presigned
 * **de leitura** (GetObject), nunca PutObject.
 *
 * Esta projeção é construída literalmente (campos enumerados), não
 * via diff/remoção sobre a resposta autenticada, para evitar que
 * regressões futuras no DTO autenticado vazem dados automaticamente.
 */
export class ReadOnlyAmbienteWebItemDto {
  @ApiProperty({ example: 'Cozinha' })
  nomeAmbiente: string;

  @ApiProperty({ example: 'cozinha' })
  tipoAmbiente: string;

  @ApiProperty({ example: 0 })
  ordem: number;

  @ApiProperty({ example: 12 })
  totalImagens: number;
}

export class ReadOnlyAmbientesWebResponseDto {
  @ApiProperty({ type: [ReadOnlyAmbienteWebItemDto] })
  ambientes: ReadOnlyAmbienteWebItemDto[];

  @ApiProperty({ type: DriveViewerDto, description: 'Permissões computadas no servidor para o chamador.' })
  viewer: DriveViewerDto;
}
