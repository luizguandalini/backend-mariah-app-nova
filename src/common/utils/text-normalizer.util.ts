/**
 * Utilitários para normalização de texto
 * Usado para comparação insensível a acentos, maiúsculas/minúsculas, espaços, etc.
 */

/**
 * Normaliza texto para comparação insensível
 * Remove acentos, converte para minúsculas, normaliza espaços e hífens
 * 
 * Exemplos válidos de match:
 * - "ar-condicionado" == "AR CONDICIONADO" == "Ar Condicionado" == "arcondicionado"
 * - "Porta" == "PORTA" == "porta"
 * - "Sala de Jantar" == "SALA DE JANTAR" == "saladejanta" (sem 'r' final seria diferente)
 */
export function normalizeForMatch(text: string): string {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[-_]/g, ' ')           // Hífens e underscores viram espaços
    .replace(/\s+/g, '')             // Remove todos os espaços para match mais flexível
    .trim();
}

/**
 * Compara dois textos de forma insensível
 * Retorna true se os textos são equivalentes após normalização
 */
export function textMatches(text1: string, text2: string): boolean {
  return normalizeForMatch(text1) === normalizeForMatch(text2);
}

/**
 * Encontra a melhor correspondência em uma lista de opções
 * Retorna o item original (não normalizado) se encontrar match
 */
export function findBestMatch(needle: string, haystack: string[]): string | null {
  const normalizedNeedle = normalizeForMatch(needle);
  
  for (const item of haystack) {
    if (normalizeForMatch(item) === normalizedNeedle) {
      return item;
    }
  }
  
  return null;
}

/**
 * Extrai palavras-chave da resposta da IA para matching
 * Remove pontuação e palavras comuns
 */
export function extractKeywords(text: string): string[] {
  if (!text) return [];
  
  const stopWords = new Set([
    'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
    'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos',
    'e', 'ou', 'que', 'para', 'com', 'por', 'se', 'é', 'são',
    'este', 'esta', 'esse', 'essa', 'isso', 'isto',
    'sim', 'não', 'nao', 'the', 'is', 'it', 'this', 'that',
  ]);
  
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,!?;:()[\]{}'"]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}
