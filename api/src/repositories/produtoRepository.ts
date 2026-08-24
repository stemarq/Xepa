import { pool, type Executor } from '../db/pool.js';
import type {
  CompraHistorico,
  MovimentacaoView,
  Produto,
} from '../models/despensa.js';

/**
 * Acesso a dados da Despensa. Toda função aceita um `Executor` opcional para
 * poder participar de uma transação (SD06, SD08).
 *
 * Todas as consultas são escopadas por `usuario_id`: um produto de outro
 * usuário se comporta como inexistente.
 */

export async function listarPorUsuario(usuarioId: number, db: Executor = pool): Promise<Produto[]> {
  const { rows } = await db.query<Produto>(
    `SELECT * FROM produto WHERE usuario_id = $1 ORDER BY nome`,
    [usuarioId],
  );
  return rows;
}

export async function buscarPorId(
  usuarioId: number,
  produtoId: number,
  db: Executor = pool,
): Promise<Produto | null> {
  const { rows } = await db.query<Produto>(
    `SELECT * FROM produto WHERE id = $1 AND usuario_id = $2`,
    [produtoId, usuarioId],
  );
  return rows[0] ?? null;
}

/**
 * Busca um produto do usuário pelo nome, ignorando caixa e espaços em volta.
 * É como o SD06 concilia o item da nota com o que já existe na despensa.
 */
export async function buscarPorNome(
  usuarioId: number,
  nome: string,
  db: Executor = pool,
): Promise<Produto | null> {
  const { rows } = await db.query<Produto>(
    `SELECT * FROM produto
      WHERE usuario_id = $1 AND lower(btrim(nome)) = lower(btrim($2))
      LIMIT 1`,
    [usuarioId, nome],
  );
  return rows[0] ?? null;
}

/** RN08 — itens monitorados que atingiram ou passaram da quantidade mínima. */
export async function listarEmAlerta(
  usuarioId: number,
  db: Executor = pool,
): Promise<Produto[]> {
  const { rows } = await db.query<Produto>(
    `SELECT * FROM produto
      WHERE usuario_id = $1
        AND monitorado
        AND quantidade_minima IS NOT NULL
        AND quantidade_atual <= quantidade_minima
      ORDER BY nome`,
    [usuarioId],
  );
  return rows;
}

export interface NovoProduto {
  nome: string;
  categoria?: string | null;
  unidade?: string;
  quantidadeAtual?: number;
  monitorado?: boolean;
  quantidadeMinima?: number | null;
}

export async function inserir(
  usuarioId: number,
  dados: NovoProduto,
  db: Executor = pool,
): Promise<Produto> {
  const { rows } = await db.query<Produto>(
    `INSERT INTO produto
       (usuario_id, nome, categoria, unidade, quantidade_atual, monitorado, quantidade_minima)
     VALUES ($1, $2, $3, COALESCE($4, 'un'), COALESCE($5, 0), COALESCE($6, FALSE), $7)
     RETURNING *`,
    [
      usuarioId,
      dados.nome,
      dados.categoria ?? null,
      dados.unidade ?? null,
      dados.quantidadeAtual ?? null,
      dados.monitorado ?? null,
      dados.quantidadeMinima ?? null,
    ],
  );
  return rows[0] as Produto;
}

/** Campo ausente (`undefined`) significa "não mexer". */
export interface EdicaoProduto {
  nome?: string | undefined;
  categoria?: string | null | undefined;
  unidade?: string | undefined;
  monitorado?: boolean | undefined;
  quantidadeMinima?: number | null | undefined;
}

/**
 * Atualiza só os campos presentes. `quantidade_atual` de propósito não entra
 * aqui: estoque só muda por movimentação (SD06, SD08), nunca por edição
 * direta, senão a coluna desnormalizada descola do histórico.
 */
export async function atualizar(
  usuarioId: number,
  produtoId: number,
  dados: EdicaoProduto,
  db: Executor = pool,
): Promise<Produto | null> {
  const atribuicoes: string[] = [];
  const valores: unknown[] = [];

  const campos: Array<[keyof EdicaoProduto, string]> = [
    ['nome', 'nome'],
    ['categoria', 'categoria'],
    ['unidade', 'unidade'],
    ['monitorado', 'monitorado'],
    ['quantidadeMinima', 'quantidade_minima'],
  ];

  for (const [chave, coluna] of campos) {
    if (dados[chave] !== undefined) {
      valores.push(dados[chave]);
      atribuicoes.push(`${coluna} = $${valores.length}`);
    }
  }

  if (atribuicoes.length === 0) return buscarPorId(usuarioId, produtoId, db);

  valores.push(produtoId, usuarioId);
  const { rows } = await db.query<Produto>(
    `UPDATE produto SET ${atribuicoes.join(', ')}
      WHERE id = $${valores.length - 1} AND usuario_id = $${valores.length}
      RETURNING *`,
    valores,
  );
  return rows[0] ?? null;
}

/**
 * RF040 — apaga o produto da despensa.
 *
 * O escopo por `usuario_id` é o que faz o produto de outro usuário se
 * comportar como inexistente, aqui como em todo o resto do módulo.
 *
 * O que acontece em volta já está decidido no DDL, e é o comportamento certo:
 * `movimentacao_estoque` cai em cascata (histórico de entrada e baixa de um
 * item que não existe mais não tem leitor), enquanto `item_nota.produto_id` é
 * `ON DELETE SET NULL` — a linha da nota fica, com descrição, quantidade e
 * valor pago. Apagar um item da despensa não pode reescrever o que foi gasto:
 * o gasto do mês (RN11) sai de `TRANSACAO`, que não é tocada.
 */
export async function remover(
  usuarioId: number,
  produtoId: number,
  db: Executor = pool,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `DELETE FROM produto WHERE id = $1 AND usuario_id = $2`,
    [produtoId, usuarioId],
  );
  return rowCount === 1;
}

/**
 * Registra a movimentação e ajusta a coluna desnormalizada na mesma ida ao
 * banco. O `WHERE quantidade_atual >= $2` na baixa é a última linha de defesa
 * da RN07: mesmo com duas baixas simultâneas, o estoque não fica negativo —
 * a segunda não encontra linha e devolve `null`.
 */
export async function movimentar(
  produtoId: number,
  tipo: 'entrada' | 'baixa',
  quantidade: number,
  db: Executor = pool,
): Promise<Produto | null> {
  const condicaoEstoque = tipo === 'baixa' ? 'AND quantidade_atual >= $2' : '';
  const operador = tipo === 'baixa' ? '-' : '+';

  const { rows } = await db.query<Produto>(
    `UPDATE produto
        SET quantidade_atual = quantidade_atual ${operador} $2
      WHERE id = $1 ${condicaoEstoque}
      RETURNING *`,
    [produtoId, quantidade],
  );

  const produto = rows[0];
  if (!produto) return null;

  await db.query(
    `INSERT INTO movimentacao_estoque (produto_id, tipo, quantidade) VALUES ($1, $2, $3)`,
    [produtoId, tipo, quantidade],
  );

  return produto;
}

/** RF013 — valor pago e local de compra, por item, do mais recente ao mais antigo. */
export async function historicoCompras(
  produtoId: number,
  db: Executor = pool,
): Promise<CompraHistorico[]> {
  const { rows } = await db.query<{
    data: string;
    local_compra: string | null;
    descricao: string;
    quantidade: number;
    valor_unitario: number;
  }>(
    `SELECT nf.data_compra::text AS data,
            nf.local_compra,
            i.descricao,
            i.quantidade,
            i.valor_unitario
       FROM item_nota i
       JOIN nota_fiscal nf ON nf.id = i.nota_fiscal_id
      WHERE i.produto_id = $1
      ORDER BY nf.data_compra DESC, i.id DESC`,
    [produtoId],
  );

  return rows.map((linha) => ({
    data: linha.data,
    localCompra: linha.local_compra,
    descricaoNota: linha.descricao,
    quantidade: linha.quantidade,
    valorUnitario: linha.valor_unitario,
    valorTotal: Number((linha.quantidade * linha.valor_unitario).toFixed(2)),
  }));
}

export async function listarMovimentacoes(
  produtoId: number,
  limite = 50,
  db: Executor = pool,
): Promise<MovimentacaoView[]> {
  const { rows } = await db.query<{ tipo: 'entrada' | 'baixa'; quantidade: number; data: Date }>(
    `SELECT tipo, quantidade, data
       FROM movimentacao_estoque
      WHERE produto_id = $1
      ORDER BY data DESC, id DESC
      LIMIT $2`,
    [produtoId, limite],
  );
  return rows;
}
