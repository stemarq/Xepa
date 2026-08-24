/**
 * Banco de testes.
 *
 * A API fala com o Postgres por um único módulo (`src/db/pool.ts`); aqui ele é
 * trocado por um PGlite — o próprio Postgres compilado para WASM, rodando em
 * memória. É Postgres de verdade: o DDL de `migrations/` roda inteiro, então as
 * constraints que materializam as RNs (RN01, RN06, RN07, RN08, RN17…) valem
 * dentro dos testes como valem em produção, sem precisar de um servidor.
 *
 * Precisa ser importado antes de qualquer módulo de `src/` — é o que garante
 * que Repositories e Services peguem o pool trocado.
 */

// O env é lido na carga de `src/config/env.ts`; preencher antes evita que a
// checagem de variáveis obrigatórias derrube a suíte.
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://xepa:xepa@localhost:5432/xepa_test';
process.env.SMTP_HOST ??= '';

/**
 * Janela de inatividade da sessão (RNF09) durante os testes.
 *
 * É **fixada**, e não herdada do ambiente, de propósito. `resolverSessao`
 * renova a sessão usando `env.sessionTtlMinutes`: se alguém exportasse
 * `SESSION_TTL_MINUTES=1`, uma rodada lenta passaria a expirar sozinha no meio
 * de um teste e devolveria 401 onde o cenário espera 200 — falha intermitente
 * que não tem nada a ver com o código sob teste.
 *
 * Quem precisa testar a expiração de fato (em `integracao/conta.test.ts`)
 * envelhece o token direto no banco, sem depender de tempo de parede.
 */
export const TTL_SESSAO_MINUTOS = 30;
process.env.SESSION_TTL_MINUTES = String(TTL_SESSAO_MINUTOS);

/**
 * A integração roda contra o provedor **simulado**, sempre.
 *
 * `openFinanceService` escolhe o provedor pela presença das credenciais, e
 * `env.ts` faz `import 'dotenv/config'` — então, numa máquina com `api/.env`
 * preenchido, a suíte passaria a chamar a Pluggy de verdade: rede num teste
 * que deveria ser hermético, e cenários falhando por instituição que só existe
 * no simulador. Limpar aqui vale porque este módulo é importado antes de
 * qualquer coisa de `src/`.
 *
 * Quem testa o adaptador da Pluggy é `unidade/provedor-pluggy.test.ts`, que
 * define as credenciais por conta própria e dubla o `fetch`.
 */
process.env.PLUGGY_CLIENT_ID = '';
process.env.PLUGGY_CLIENT_SECRET = '';

import { readdir, readFile } from 'node:fs/promises';
import { mock } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const raizSrc = new URL('../../src/', import.meta.url);

/** Mesmas conversões que `src/db/pool.ts` instala no driver `pg`. */
const parsers = {
  1700: (valor: string) => Number(valor), // NUMERIC
  20: (valor: string) => Number(valor), // INT8
};

interface ResultadoPGlite {
  rows: unknown[];
  affectedRows?: number | undefined;
  fields?: unknown;
}

/**
 * O PGlite devolve `affectedRows`; o `pg` devolve `rowCount`, que é o que os
 * Repositories leem. Em SELECT/RETURNING vale o número de linhas; em
 * UPDATE/DELETE sem RETURNING, o de linhas afetadas.
 */
function adaptar(resultado: ResultadoPGlite) {
  return {
    rows: resultado.rows,
    rowCount: resultado.rows.length || resultado.affectedRows || 0,
    fields: resultado.fields ?? [],
  };
}

export interface BancoDeTeste {
  /** Consulta direta, para montar cenário e conferir o que ficou gravado. */
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
  /** Zera os dados dos usuários, preservando avatares e instituições. */
  limpar(): Promise<void>;
  encerrar(): Promise<void>;
}

let instancia: Promise<BancoDeTeste> | null = null;

/**
 * Sobe o banco e instala o mock do pool. Idempotente: o primeiro teste do
 * arquivo paga a inicialização, os demais reaproveitam.
 */
export function prepararBanco(): Promise<BancoDeTeste> {
  instancia ??= iniciar();
  return instancia;
}

async function iniciar(): Promise<BancoDeTeste> {
  const db = new PGlite({ parsers });

  // Todas as migrations, em ordem — igual ao runner de `db/migrate.ts`. Fixar
  // um arquivo aqui faria a suíte rodar contra um schema mais velho que o do
  // sistema, e a migration nova só falharia em produção.
  for (const arquivo of await listarMigrations()) {
    await db.exec(await ler(`db/migrations/${arquivo}`));
  }
  await db.exec(await ler('db/seeds/001_dados_de_apoio.sql'));

  const query = async (sql: string, params: unknown[] = []) =>
    adaptar((await db.query(sql, params)) as ResultadoPGlite);

  mock.module(new URL('db/pool.ts', raizSrc).href, {
    namedExports: {
      pool: { query, connect: naoUsado, end: () => db.close() },
      query,
      // O PGlite reverte a transação sozinho quando o callback rejeita, e
      // repropaga o erro — mesmo contrato do `withTransaction` real.
      withTransaction: <T>(fn: (cliente: { query: typeof query }) => Promise<T>) =>
        db.transaction(async (tx) => {
          const clienteQuery = async (sql: string, params: unknown[] = []) =>
            adaptar((await tx.query(sql, params)) as ResultadoPGlite);
          return fn({ query: clienteQuery as typeof query });
        }) as Promise<T>,
      closePool: () => db.close(),
    },
  });

  return {
    query: query as BancoDeTeste['query'],
    limpar: async () => {
      // Tudo que é do usuário cai em cascata a partir de `usuario`; avatar e
      // instituicao são dados de apoio compartilhados e ficam.
      await db.exec('TRUNCATE usuario RESTART IDENTITY CASCADE');
    },
    encerrar: () => db.close(),
  };
}

async function ler(caminho: string): Promise<string> {
  return readFile(new URL(caminho, raizSrc), 'utf8');
}

async function listarMigrations(): Promise<string[]> {
  const arquivos = await readdir(new URL('db/migrations/', raizSrc));
  return arquivos.filter((nome) => nome.endsWith('.sql')).sort();
}

function naoUsado(): never {
  throw new Error('pool.connect() não é usado pela API fora do runner de migrations.');
}
