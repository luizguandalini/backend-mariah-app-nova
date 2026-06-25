/**
 * Body do submit final da contestação.
 *
 * O submit não precisa de parâmetros: o backend lê as imagens já confirmadas
 * (com legenda) diretamente da tabela `contestacao_imagens` daquele laudo.
 * Mantemos o DTO vazio só para manter compatibilidade com o ValidationPipe
 * do Nest e simplificar o controller.
 */
export class SubmitContestacaoDto {}