import { IsBoolean } from 'class-validator';

export class UpdateFilenameCaptionPreferenceDto {
  @IsBoolean()
  usarNomeArquivoComoLegenda: boolean;
}
