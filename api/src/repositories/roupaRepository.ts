import { pool, type Executor } from '../db/pool.js';
import type { Lavagem, PecaRoupa, StatusLavagem } from '../models/roupa.js';

/** Acesso a dados do Módulo 5 (SD21–SD24). */

/**
 * As colunas de peça que trafegam nas consultas comuns.
 *
 * Escritas uma a uma, e não `SELECT *`, para deixar a foto de fora: são
 * dezenas de KB por peça que nenhuma listagem usa e que passariam a viajar do
 * banco para a API a cada abertura da tela. A foto tem rota própria, servida
 * por `buscarFoto`; aqui vai só o fato de existir.
 */
const COLUNAS_DA_PECA = `
  id, usuario_id, nome, tipo, limite_usos, usos_atuais, criado_em,
  (foto IS NOT NULL) AS tem_foto, foto_em
`;

// ----- Peças -----

export async function listarPecas(
  usuarioId: number,
  db: Executor = pool,
): Promise<PecaRoupa[]> {
  const { rows } = await db.query<PecaRoupa>(
    `SELECT ${COLUNAS_DA_PECA} FROM peca_roupa WHERE usuario_id = $1 ORDER BY nome`,
    [usuarioId],
  );
  return rows;
}

/** RN14 — peças que atingiram o limite de usos e entram na lista de lavar. */
export async function listarPecasParaLavar(
  usuarioId: number,
  db: Executor = pool,
): Promise<PecaRoupa[]> {
  const { rows } = await db.query<PecaRoupa>(
    `SELECT ${COLUNAS_DA_PECA} FROM peca_roupa
      WHERE usuario_id = $1 AND usos_atuais >= limite_usos
      ORDER BY (usos_atuais - limite_usos) DESC, nome`,
    [usuarioId],
  );
  return rows;
}

export async function buscarPeca(
  usuarioId: number,
  pecaId: number,
  db: Executor = pool,
): Promise<PecaRoupa | null> {
  const { rows } = await db.query<PecaRoupa>(
    `SELECT ${COLUNAS_DA_PECA} FROM peca_roupa WHERE id = $1 AND usuario_id = $2`,
    [pecaId, usuarioId],
  );
  return rows[0] ?? null;
}

export async function buscarPecaPorNome(
  usuarioId: number,
  nome: string,
  db: Executor = pool,
): Promise<PecaRoupa | null> {
  const { rows } = await db.query<PecaRoupa>(
    `SELECT ${COLUNAS_DA_PECA} FROM peca_roupa
      WHERE usuario_id = $1 AND lower(btrim(nome)) = lower(btrim($2)) LIMIT 1`,
    [usuarioId, nome],
  );
  return rows[0] ?? null;
}

export interface FotoDaPeca {
  foto: Buffer;
  foto_tipo: string;
  foto_em: Date;
}

/**
 * RF038 — os bytes da foto, só quando alguém realmente pede a imagem.
 *
 * Separada das demais leituras de propósito: é a única consulta que carrega a
 * coluna pesada, e quem a chama é a rota que devolve a imagem.
 */
export async function buscarFoto(
  usuarioId: number,
  pecaId: number,
  db: Executor = pool,
): Promise<FotoDaPeca | null> {
  const { rows } = await db.query<FotoDaPeca>(
    `SELECT foto, foto_tipo, foto_em FROM peca_roupa
      WHERE id = $1 AND usuario_id = $2 AND foto IS NOT NULL`,
    [pecaId, usuarioId],
  );
  return rows[0] ?? null;
}

/** RF038 — grava ou troca a foto. `null` apaga, junto do tipo e da data. */
export async function salvarFoto(
  usuarioId: number,
  pecaId: number,
  imagem: { bytes: Buffer; tipo: string } | null,
  db: Executor = pool,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE peca_roupa
        SET foto = $3, foto_tipo = $4, foto_em = CASE WHEN $3::bytea IS NULL THEN NULL ELSE now() END
      WHERE id = $1 AND usuario_id = $2`,
    [pecaId, usuarioId, imagem?.bytes ?? null, imagem?.tipo ?? null],
  );
  return (rowCount ?? 0) > 0;
}

export async function inserirPeca(
  usuarioId: number,
  dados: { nome: string; tipo: string | null; limiteUsos: number },
  db: Executor = pool,
): Promise<PecaRoupa> {
  const { rows } = await db.query<PecaRoupa>(
    `INSERT INTO peca_roupa (usuario_id, nome, tipo, limite_usos, usos_atuais)
     VALUES ($1, $2, $3, $4, 0) RETURNING ${COLUNAS_DA_PECA}`,
    [usuarioId, dados.nome, dados.tipo, dados.limiteUsos],
  );
  return rows[0] as PecaRoupa;
}

export async function atualizarPeca(
  usuarioId: number,
  pecaId: number,
  dados: { nome?: string | undefined; tipo?: string | null | undefined; limiteUsos?: number | undefined },
  db: Executor = pool,
): Promise<PecaRoupa | null> {
  const atribuicoes: string[] = [];
  const valores: unknown[] = [];

  const campos: Array<[keyof typeof dados, string]> = [
    ['nome', 'nome'],
    ['tipo', 'tipo'],
    ['limiteUsos', 'limite_usos'],
  ];
  for (const [chave, coluna] of campos) {
    if (dados[chave] !== undefined) {
      valores.push(dados[chave]);
      atribuicoes.push(`${coluna} = $${valores.length}`);
    }
  }
  if (atribuicoes.length === 0) return buscarPeca(usuarioId, pecaId, db);

  valores.push(pecaId, usuarioId);
  const { rows } = await db.query<PecaRoupa>(
    `UPDATE peca_roupa SET ${atribuicoes.join(', ')}
      WHERE id = $${valores.length - 1} AND usuario_id = $${valores.length}
      RETURNING ${COLUNAS_DA_PECA}`,
    valores,
  );
  return rows[0] ?? null;
}

/**
 * SD22 — registra o uso e incrementa o contador na mesma ida ao banco.
 * `usos_atuais` é desnormalizado (derivável de USO_PECA), então as duas
 * escritas andam sempre juntas.
 */
export async function registrarUso(
  pecaId: number,
  db: Executor = pool,
): Promise<PecaRoupa | null> {
  const { rows } = await db.query<PecaRoupa>(
    `UPDATE peca_roupa SET usos_atuais = usos_atuais + 1 WHERE id = $1 RETURNING ${COLUNAS_DA_PECA}`,
    [pecaId],
  );
  const peca = rows[0];
  if (!peca) return null;

  await db.query(`INSERT INTO uso_peca (peca_id) VALUES ($1)`, [pecaId]);
  return peca;
}

/** Zera o contador de uso — o que a lavagem concluída faz com a peça. */
export async function zerarUsos(
  pecaIds: number[],
  db: Executor = pool,
): Promise<void> {
  if (pecaIds.length === 0) return;
  await db.query(`UPDATE peca_roupa SET usos_atuais = 0 WHERE id = ANY($1::int[])`, [pecaIds]);
}

export async function removerPeca(
  usuarioId: number,
  pecaId: number,
  db: Executor = pool,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `DELETE FROM peca_roupa WHERE id = $1 AND usuario_id = $2`,
    [pecaId, usuarioId],
  );
  return rowCount === 1;
}

// ----- Lavagens -----

export async function inserirLavagem(
  usuarioId: number,
  dataAgendada: string,
  lembreteAtivo: boolean,
  db: Executor = pool,
): Promise<Lavagem> {
  const { rows } = await db.query<Lavagem>(
    `INSERT INTO lavagem (usuario_id, data_agendada, lembrete_ativo)
     VALUES ($1, $2, $3) RETURNING *`,
    [usuarioId, dataAgendada, lembreteAtivo],
  );
  return rows[0] as Lavagem;
}

export async function vincularPecas(
  lavagemId: number,
  pecaIds: number[],
  db: Executor = pool,
): Promise<void> {
  if (pecaIds.length === 0) return;
  await db.query(
    `INSERT INTO lavagem_peca (lavagem_id, peca_id)
     SELECT $1, id FROM unnest($2::int[]) AS id
     ON CONFLICT (lavagem_id, peca_id) DO NOTHING`,
    [lavagemId, pecaIds],
  );
}

export async function buscarLavagem(
  usuarioId: number,
  lavagemId: number,
  db: Executor = pool,
): Promise<Lavagem | null> {
  const { rows } = await db.query<Lavagem>(
    `SELECT * FROM lavagem WHERE id = $1 AND usuario_id = $2`,
    [lavagemId, usuarioId],
  );
  return rows[0] ?? null;
}

export async function listarLavagens(
  usuarioId: number,
  status: StatusLavagem | undefined,
  db: Executor = pool,
): Promise<Lavagem[]> {
  const condicoes = ['usuario_id = $1'];
  const valores: unknown[] = [usuarioId];
  if (status) {
    valores.push(status);
    condicoes.push(`status = $${valores.length}`);
  }
  const { rows } = await db.query<Lavagem>(
    `SELECT * FROM lavagem WHERE ${condicoes.join(' AND ')} ORDER BY data_agendada DESC`,
    valores,
  );
  return rows;
}

/** SD24 — lavagens agendadas que acontecem dentro da janela informada. */
export async function listarLavagensProximas(
  usuarioId: number,
  dias: number,
  db: Executor = pool,
): Promise<Lavagem[]> {
  const { rows } = await db.query<Lavagem>(
    `SELECT * FROM lavagem
      WHERE usuario_id = $1
        AND status = 'agendada'
        AND data_agendada <= now() + ($2 || ' days')::interval
      ORDER BY data_agendada`,
    [usuarioId, String(dias)],
  );
  return rows;
}

export async function atualizarStatus(
  usuarioId: number,
  lavagemId: number,
  status: StatusLavagem,
  db: Executor = pool,
): Promise<Lavagem | null> {
  const { rows } = await db.query<Lavagem>(
    `UPDATE lavagem SET status = $3 WHERE id = $1 AND usuario_id = $2 RETURNING *`,
    [lavagemId, usuarioId, status],
  );
  return rows[0] ?? null;
}

/** Peças de várias lavagens de uma vez, para não consultar por linha. */
export async function pecasDasLavagens(
  lavagemIds: number[],
  db: Executor = pool,
): Promise<Map<number, Array<{ id: number; nome: string }>>> {
  const mapa = new Map<number, Array<{ id: number; nome: string }>>();
  if (lavagemIds.length === 0) return mapa;

  const { rows } = await db.query<{ lavagem_id: number; id: number; nome: string }>(
    `SELECT lp.lavagem_id, p.id, p.nome
       FROM lavagem_peca lp
       JOIN peca_roupa p ON p.id = lp.peca_id
      WHERE lp.lavagem_id = ANY($1::int[])
      ORDER BY p.nome`,
    [lavagemIds],
  );
  for (const linha of rows) {
    const lista = mapa.get(linha.lavagem_id) ?? [];
    lista.push({ id: linha.id, nome: linha.nome });
    mapa.set(linha.lavagem_id, lista);
  }
  return mapa;
}

// ----- Insumos de lavanderia (RF033, RN13) -----

/**
 * RN13 — sabão e amaciante são PRODUTO como os demais, então a checagem é uma
 * consulta ao estoque da despensa. O casamento é por nome, cobrindo a grafia
 * com e sem acento.
 */
export async function consultarInsumos(
  usuarioId: number,
  padroes: string[],
  db: Executor = pool,
): Promise<
  Array<{
    id: number;
    nome: string;
    unidade: string;
    quantidade_atual: number;
    monitorado: boolean;
    quantidade_minima: number | null;
  }>
> {
  const { rows } = await db.query<{
    id: number;
    nome: string;
    unidade: string;
    quantidade_atual: number;
    monitorado: boolean;
    quantidade_minima: number | null;
  }>(
    `SELECT id, nome, unidade, quantidade_atual, monitorado, quantidade_minima
       FROM produto
      WHERE usuario_id = $1
        AND lower(nome) LIKE ANY($2::text[])
      ORDER BY nome`,
    [usuarioId, padroes],
  );
  return rows;
}
