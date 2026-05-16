import { IsIn, IsOptional, IsString } from 'class-validator';

export class RequestPdfGenerationDto {
  @IsOptional()
  @IsString()
  @IsIn(['detalhado', 'compacto'])
  modoPreviewPdf?: 'detalhado' | 'compacto';
}
