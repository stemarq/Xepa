/** Módulo 5 — Roupa (SD21–SD24). */

import type { AlertaLavanderia, Lavagem, Peca, ResultadoUso, StatusLavagem } from '@/types/api';
import { comFiltros, imagemDaApi, requisitar } from './cliente';

export function listarPecas() {
  return requisitar<{ pecas: Peca[] }>('/roupa/pecas');
}

/** RN14 — o usuário define de quantos em quantos usos a peça vai à lavagem. */
export function cadastrarPeca(dados: { nome: string; tipo?: string | null; limiteUsos: number }) {
  return requisitar<{ peca: Peca }>('/roupa/pecas', { metodo: 'POST', corpo: dados });
}

export function removerPeca(pecaId: number) {
  return requisitar<void>(`/roupa/pecas/${pecaId}`, { metodo: 'DELETE' });
}

/** RF038 — grava a miniatura já reduzida pelo aparelho. */
export function definirFotoDaPeca(pecaId: number, imagem: { base64: string; tipo: string }) {
  return requisitar<void>(`/roupa/pecas/${pecaId}/foto`, { metodo: 'PUT', corpo: imagem });
}

export function removerFotoDaPeca(pecaId: number) {
  return requisitar<void>(`/roupa/pecas/${pecaId}/foto`, { metodo: 'DELETE' });
}

/**
 * RF038 — o que o `<Image>` precisa para carregar a foto.
 *
 * `fotoEm` entra na URL como parâmetro só para variar o endereço quando a foto
 * muda: sem isso o cache do RN continuaria mostrando a imagem antiga depois de
 * trocar a foto, porque o endereço seria o mesmo.
 */
export function fonteDaFoto(peca: { id: number; fotoEm: string | null }) {
  const versao = peca.fotoEm ? `?v=${encodeURIComponent(peca.fotoEm)}` : '';
  return imagemDaApi(`/roupa/pecas/${peca.id}/foto${versao}`);
}

/** SD22 — RF031: a resposta traz o aviso quando a peça atinge o limite. */
export function registrarUso(pecaId: number) {
  return requisitar<ResultadoUso>(`/roupa/pecas/${pecaId}/uso`, { metodo: 'POST' });
}

/** RN14 — a lista de "lavar". */
export function listarParaLavar() {
  return requisitar<{ pecas: Peca[] }>('/roupa/lavar');
}

export function listarLavagens(status?: StatusLavagem) {
  return requisitar<{ lavagens: Lavagem[] }>(comFiltros('/roupa/lavagens', { status }));
}

export function agendarLavagem(dataAgendada: string, pecaIds: number[], lembreteAtivo = true) {
  return requisitar<{ lavagem: Lavagem }>('/roupa/lavagens', {
    metodo: 'POST',
    corpo: { dataAgendada, pecaIds, lembreteAtivo },
  });
}

/** Concluir zera o contador das peças — reinicia a contagem da RN14. */
export function concluirLavagem(lavagemId: number) {
  return requisitar<{ lavagem: Lavagem; pecasZeradas: string[] }>(
    `/roupa/lavagens/${lavagemId}/concluir`,
    { metodo: 'POST' },
  );
}

export function cancelarLavagem(lavagemId: number) {
  return requisitar<{ lavagem: Lavagem }>(`/roupa/lavagens/${lavagemId}/cancelar`, {
    metodo: 'POST',
  });
}

/** SD24 — RF033/RN13: sabão e amaciante saem do estoque da Despensa. */
export function obterAlertas(emDias?: number) {
  return requisitar<AlertaLavanderia>(comFiltros('/roupa/alertas', { emDias }));
}
