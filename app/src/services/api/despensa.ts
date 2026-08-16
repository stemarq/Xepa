/** Módulo 2 — Despensa (SD06–SD10). */

import type {
  NotaLida,
  Produto,
  ResultadoConsumo,
  ResultadoEntrada,
  ResultadoDaConsulta,
  ResultadoDaNota,
} from '@/types/api';
import { requisitar } from './cliente';

export function listarEstoque() {
  return requisitar<{ produtos: Produto[] }>('/despensa/produtos');
}

/** RF012 — o que precisa de reposição agora (RN08). */
export function listarAlertas() {
  return requisitar<{ produtos: Produto[] }>('/despensa/alertas');
}

export function criarProduto(dados: {
  nome: string;
  categoria?: string | null;
  unidade?: string;
  quantidadeInicial?: number;
  monitorado?: boolean;
  quantidadeMinima?: number | null;
}) {
  return requisitar<{ produto: Produto }>('/despensa/produtos', { metodo: 'POST', corpo: dados });
}

/** SD08 — baixa de consumo. O backend recusa o que deixaria negativo (RN07). */
export function registrarConsumo(produtoId: number, quantidade: number) {
  return requisitar<ResultadoConsumo>(`/despensa/produtos/${produtoId}/consumo`, {
    metodo: 'POST',
    corpo: { quantidade },
  });
}

/** SD10 — RN08: monitorar exige uma quantidade mínima. */
export function configurarAlerta(
  produtoId: number,
  monitorado: boolean,
  quantidadeMinima: number | null,
) {
  return requisitar<{ produto: Produto }>(`/despensa/produtos/${produtoId}/monitoramento`, {
    metodo: 'PUT',
    corpo: { monitorado, quantidadeMinima },
  });
}

/**
 * RF010 — entrada de estoque sem nota e sem preço.
 *
 * Para o que entrou na despensa sem ter sido comprado: presente, sobra,
 * rateio. Não vira gasto — o que não custou não é despesa.
 */
export function registrarEntrada(produtoId: number, quantidade: number) {
  return requisitar<ResultadoEntrada>(`/despensa/produtos/${produtoId}/entrada`, {
    metodo: 'POST',
    corpo: { quantidade },
  });
}

/**
 * SD06 — busca os itens da nota na consulta pública da SEFAZ (RN22).
 *
 * Manda o conteúdo cru do QR Code, não só a chave: é o hash dentro da URL que
 * destrava a consulta sem captcha. Nunca falha por causa do portal — quando
 * não dá, volta `consultada: false` e os itens são digitados.
 */
export function consultarNota(conteudoQr: string, chaveAcesso: string) {
  return requisitar<ResultadoDaConsulta>('/despensa/notas/consultar', {
    metodo: 'POST',
    corpo: { conteudoQr, chaveAcesso },
  });
}

/**
 * SD06 — leitura de nota fiscal (RF008, RN06, RN18).
 *
 * A chave vem do QR Code; os itens vêm da consulta ou do usuário (RN22). O
 * servidor recusa nota repetida pela chave e categoriza o gasto como "Mercado".
 */
export function processarNota(nota: NotaLida) {
  return requisitar<ResultadoDaNota>('/despensa/notas', { metodo: 'POST', corpo: nota });
}
