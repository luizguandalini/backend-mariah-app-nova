export interface ImagemPdfDto {
  id: string;
  s3Key: string;
  ambiente: string;
  numeroAmbiente: number;
  numeroImagemNoAmbiente: number;
  legenda: string;
  ordem: number;
  categoria: string;
  tipo: string;
  // Flag per-imagem: indica se esta foto foi enviada com a opção
  // "Usar nome do arquivo como legenda" ativa. Quando true, o PDF e o
  // preview suprimem o prefixo "Nº amb (Nº foto)" e mostram apenas a legenda.
  usarNomeArquivoComoLegenda?: boolean;
}

export interface ImagensPdfResponseDto {
  data: ImagemPdfDto[];
  meta: {
    currentPage: number;
    totalPages: number;
    totalImages: number;
    imagesPerPage: number;
  };
}
