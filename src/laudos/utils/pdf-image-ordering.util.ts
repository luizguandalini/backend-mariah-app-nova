export type AmbienteWebOrdenacao = {
  nomeAmbiente?: string | null;
  tipoAmbiente?: string | null;
  ordem?: number | null;
};

export type ImagemOrdenavelPdf = {
  id?: string | null;
  ambiente?: string | null;
  ordem?: number | null;
  createdAt?: Date | string | null;
};

export type ImagemNumeradaPdf<T extends ImagemOrdenavelPdf> = T & {
  numeroAmbiente: number;
  numeroImagemNoAmbiente: number;
};

const ORDEM_FALLBACK = Number.MAX_SAFE_INTEGER;

function normalizarNomeAmbiente(nome?: string | null): string {
  return (nome || '').trim();
}

function ordemNumerica(valor: unknown, fallback: number): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : fallback;
}

function compararCreatedAt(
  a?: Date | string | null,
  b?: Date | string | null,
): number {
  const valorA = a ? new Date(a).getTime() : 0;
  const valorB = b ? new Date(b).getTime() : 0;

  if (Number.isFinite(valorA) && Number.isFinite(valorB) && valorA !== valorB) {
    return valorA - valorB;
  }

  return 0;
}

export function normalizarAmbientesWebOrdenados(
  ambientesWeb: AmbienteWebOrdenacao[] = [],
): AmbienteWebOrdenacao[] {
  return [...(ambientesWeb || [])]
    .map((ambiente, index) => ({
      ...ambiente,
      nomeAmbiente: normalizarNomeAmbiente(ambiente.nomeAmbiente),
      ordem: ordemNumerica(ambiente.ordem, index),
    }))
    .filter((ambiente) => !!ambiente.nomeAmbiente)
    .sort((a, b) => {
      const ordemA = ordemNumerica(a.ordem, ORDEM_FALLBACK);
      const ordemB = ordemNumerica(b.ordem, ORDEM_FALLBACK);
      if (ordemA !== ordemB) return ordemA - ordemB;

      return normalizarNomeAmbiente(a.nomeAmbiente).localeCompare(
        normalizarNomeAmbiente(b.nomeAmbiente),
        'pt-BR',
        { numeric: true, sensitivity: 'base' },
      );
    });
}

export function ordenarImagensPorGaleria<T extends ImagemOrdenavelPdf>(
  imagens: T[] = [],
  ambientesWeb: AmbienteWebOrdenacao[] = [],
): T[] {
  const ambientesOrdenados = normalizarAmbientesWebOrdenados(ambientesWeb);
  const ordemPorAmbiente = new Map<string, number>();

  ambientesOrdenados.forEach((ambiente, index) => {
    const nome = normalizarNomeAmbiente(ambiente.nomeAmbiente);
    if (nome && !ordemPorAmbiente.has(nome)) {
      ordemPorAmbiente.set(nome, index);
    }
  });

  const temOrdemGaleria = ordemPorAmbiente.size > 0;

  return imagens
    .map((imagem, index) => ({
      imagem,
      index,
      nomeAmbiente: normalizarNomeAmbiente(imagem.ambiente),
    }))
    .filter((item) => {
      if (!temOrdemGaleria) return true;
      return ordemPorAmbiente.has(item.nomeAmbiente);
    })
    .sort((a, b) => {
      const ordemAmbienteA = temOrdemGaleria
        ? ordemPorAmbiente.get(a.nomeAmbiente) ?? ORDEM_FALLBACK
        : ORDEM_FALLBACK;
      const ordemAmbienteB = temOrdemGaleria
        ? ordemPorAmbiente.get(b.nomeAmbiente) ?? ORDEM_FALLBACK
        : ORDEM_FALLBACK;

      if (ordemAmbienteA !== ordemAmbienteB) {
        return ordemAmbienteA - ordemAmbienteB;
      }

      if (!temOrdemGaleria && a.nomeAmbiente !== b.nomeAmbiente) {
        return a.nomeAmbiente.localeCompare(b.nomeAmbiente, 'pt-BR', {
          numeric: true,
          sensitivity: 'base',
        });
      }

      const ordemImagemA = ordemNumerica(a.imagem.ordem, ORDEM_FALLBACK);
      const ordemImagemB = ordemNumerica(b.imagem.ordem, ORDEM_FALLBACK);
      if (ordemImagemA !== ordemImagemB) {
        return ordemImagemA - ordemImagemB;
      }

      const createdAtDiff = compararCreatedAt(
        a.imagem.createdAt,
        b.imagem.createdAt,
      );
      if (createdAtDiff !== 0) return createdAtDiff;

      const idA = a.imagem.id || '';
      const idB = b.imagem.id || '';
      if (idA !== idB) return idA.localeCompare(idB);

      return a.index - b.index;
    })
    .map((item) => item.imagem);
}

export function numerarImagensPorAmbiente<T extends ImagemOrdenavelPdf>(
  imagensOrdenadas: T[] = [],
): ImagemNumeradaPdf<T>[] {
  const numeroPorAmbiente = new Map<string, number>();
  const contadorPorAmbiente = new Map<string, number>();
  let proximoNumeroAmbiente = 1;

  return imagensOrdenadas.map((imagem) => {
    const nomeAmbiente = normalizarNomeAmbiente(imagem.ambiente) || 'AMBIENTE';

    if (!numeroPorAmbiente.has(nomeAmbiente)) {
      numeroPorAmbiente.set(nomeAmbiente, proximoNumeroAmbiente);
      contadorPorAmbiente.set(nomeAmbiente, 0);
      proximoNumeroAmbiente += 1;
    }

    const novoContador = (contadorPorAmbiente.get(nomeAmbiente) || 0) + 1;
    contadorPorAmbiente.set(nomeAmbiente, novoContador);

    return {
      ...imagem,
      numeroAmbiente: numeroPorAmbiente.get(nomeAmbiente) || 0,
      numeroImagemNoAmbiente: novoContador,
    };
  });
}

export function prepararImagensPdf<T extends ImagemOrdenavelPdf>(
  imagens: T[] = [],
  ambientesWeb: AmbienteWebOrdenacao[] = [],
): ImagemNumeradaPdf<T>[] {
  return numerarImagensPorAmbiente(
    ordenarImagensPorGaleria(imagens, ambientesWeb),
  );
}

export function listarAmbientesPdf(
  ambientesWeb: AmbienteWebOrdenacao[] = [],
  imagensOrdenadas: ImagemOrdenavelPdf[] = [],
): { nome: string; originalIndex: number }[] {
  const ambientesOrdenados = normalizarAmbientesWebOrdenados(ambientesWeb);

  if (ambientesOrdenados.length > 0) {
    return ambientesOrdenados.map((ambiente, index) => ({
      nome: normalizarNomeAmbiente(ambiente.nomeAmbiente),
      originalIndex: index + 1,
    }));
  }

  const nomes = new Set<string>();
  imagensOrdenadas.forEach((imagem) => {
    const nome = normalizarNomeAmbiente(imagem.ambiente);
    if (nome) nomes.add(nome);
  });

  return Array.from(nomes).map((nome, index) => ({
    nome,
    originalIndex: index + 1,
  }));
}
