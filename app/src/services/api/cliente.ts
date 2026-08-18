/**
 * Cliente HTTP da API do Xepa.
 *
 * Único lugar do app que sabe montar uma requisição: os módulos de
 * `services/api/` só descrevem caminho e corpo. O token da sessão é injetado
 * aqui, a partir do que a camada de sessão registrar com `definirToken`.
 */

import type { ErroApi as FormatoErro } from '@/types/erros';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333/api';

/** RNF09 — o backend responde 401 quando a sessão expira por inatividade. */
export type AoExpirarSessao = () => void;

let token: string | null = null;
let aoExpirar: AoExpirarSessao | null = null;

export function definirToken(novo: string | null): void {
  token = novo;
}

export function definirTratamentoDeSessaoExpirada(callback: AoExpirarSessao | null): void {
  aoExpirar = callback;
}

/**
 * Endereço e cabeçalho para uma imagem servida pela API (RF038).
 *
 * O `<Image>` do React Native busca a URL sozinho, fora deste módulo, e a rota
 * da foto exige sessão — daí precisar expor a base e o token. É o único caso:
 * qualquer outra requisição passa por `requisitar`.
 */
export function imagemDaApi(caminho: string): {
  uri: string;
  headers: Record<string, string>;
} {
  return {
    uri: `${BASE}${caminho}`,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}

/**
 * Erro vindo da API, já com o código de domínio que o `errorHandler` do
 * backend produz (`CONFLICT`, `UNPROCESSABLE_ENTITY`, …). As telas mostram
 * `mensagem` direto: o backend escreve as mensagens em português, para o
 * usuário final.
 */
export class ErroDaApi extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly detalhes: unknown;

  constructor(status: number, codigo: string, mensagem: string, detalhes?: unknown) {
    super(mensagem);
    this.name = 'ErroDaApi';
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}

interface Opcoes {
  metodo?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  corpo?: unknown;
  /** Rotas públicas (login, cadastro) não mandam token. */
  semSessao?: boolean;
}

export async function requisitar<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const { metodo = 'GET', corpo, semSessao = false } = opcoes;

  let resposta: Response;
  try {
    resposta = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers: {
        ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(!semSessao && token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
    });
  } catch {
    // Falha de rede: o aparelho está sem conexão ou a API não está no ar.
    throw new ErroDaApi(
      0,
      'SEM_CONEXAO',
      'Não consegui falar com o servidor. Confira sua conexão e tente de novo.',
    );
  }

  if (resposta.status === 204) return undefined as T;

  const texto = await resposta.text();
  const dados = texto ? (JSON.parse(texto) as unknown) : null;

  if (!resposta.ok) {
    const erro = (dados as FormatoErro | null)?.erro;
    if (resposta.status === 401 && !semSessao) {
      aoExpirar?.();
    }
    throw new ErroDaApi(
      resposta.status,
      erro?.codigo ?? 'ERRO_DESCONHECIDO',
      erro?.mensagem ?? 'Algo deu errado. Tente de novo.',
      erro?.detalhes,
    );
  }

  return dados as T;
}

/** Monta `?a=1&b=2` ignorando o que estiver vazio. */
export function comFiltros(base: string, filtros: Record<string, string | number | undefined>): string {
  const partes = Object.entries(filtros)
    .filter(([, valor]) => valor !== undefined && valor !== '')
    .map(([chave, valor]) => `${chave}=${encodeURIComponent(String(valor))}`);
  return partes.length > 0 ? `${base}?${partes.join('&')}` : base;
}
