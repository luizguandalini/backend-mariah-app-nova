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
    /**
     * Quantidade de imagens vinculadas aos Registros Complementares
     * (contestação) deste laudo. Juntas com `contestacaoRealizada`, permitem
     * ao frontend calcular o total de páginas do preview em UMA ida ao
     * servidor, sem precisar de uma chamada extra para `/contestacao/laudos/:id`
     * apenas para descobrir se há páginas extras.
     *
     * Mesma regra do backend de PDF: 9 fotos por página (grid 3x3).
     */
    contestacaoImagesCount: number;
    /** Flag que indica se a contestação já foi enviada (travada). */
    contestacaoRealizada: boolean;
  };
}
