import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class RequestPdfGenerationDto {
  @IsOptional()
  @IsString()
  @IsIn(['detalhado', 'compacto'])
  modoPreviewPdf?: 'detalhado' | 'compacto';

  // Overrides de layout vindos do preview. Quando presentes, o PDF é
  // gerado com EXATAMENTE os mesmos valores que o usuário está vendo no
  // preview (que usa a config em memória, possivelmente ainda não salva no
  // DB). Sem isso, o backend usaria a config persistida do usuário e o
  // tamanho das imagens divergiria do preview.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  margemPagina?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  espacamentoHorizontal?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  espacamentoVertical?: number;
}
