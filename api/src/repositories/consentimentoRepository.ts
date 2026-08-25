import { pool, type Executor } from '../db/pool.js';
import type { Consentimento, StatusConsentimento } from '../models/openFinance.js';

/** Acesso a dados de CONSENTIMENTO e das contas que ele destrava (SD25–SD27). */

const SELECT = `
  SELECT id, usuario_id, instituicao_financeira, id_externo, escopo, status,
         criado_em, expira_em, revogado_em
    FROM consentimento
`;

export interface NovoConsentimento {
  instituicaoFinanceira: string;
  idExterno: string;
  escopo: string;
  expiraEm: Date;
}

export async function inserir(
  usuarioId: number,
  dados: NovoConsentimento,
  db: Executor = pool,
): Promise<Consentimento> {
  const { rows } = await db.query<Consentimento>(
    `INSERT INTO consentimento
       (usuario_id, instituicao_financeira, id_externo, escopo, status, expira_em)
     VALUES ($1, $2, $3, $4, 'pendente', $5)
     RETURNING id, usuario_id, instituicao_financeira, id_externo, escopo, status,
               criado_em, expira_em, revogado_em`,
    [usuarioId, dados.instituicaoFinanceira, dados.idExterno, dados.escopo, dados.expiraEm],
  );
  return rows[0] as Consentimento;
}

export async function listar(usuarioId: number, db: Executor = pool): Promise<Consentimento[]> {
  const { rows } = await db.query<Consentimento>(
    `${SELECT} WHERE usuario_id = $1 ORDER BY criado_em DESC`,
    [usuarioId],
  );
  return rows;
}

export async function buscarPorId(
  usuarioId: number,
  id: number,
  db: Executor = pool,
): Promise<Consentimento | null> {
  const { rows } = await db.query<Consentimento>(
    `${SELECT} WHERE usuario_id = $1 AND id = $2`,
    [usuarioId, id],
  );
  return rows[0] ?? null;
}

/**
 * Troca o id provisório pelo definitivo do provedor.
 *
 * Só acontece com provedor de widget, em que o vínculo nasce no cliente
 * (`idNasceNoCliente`). A unicidade por usuário continua valendo — dois
 * consentimentos não podem apontar para o mesmo vínculo lá fora.
 */
export async function atualizarIdExterno(
  id: number,
  idExterno: string,
  db: Executor = pool,
): Promise<void> {
  await db.query(`UPDATE consentimento SET id_externo = $1 WHERE id = $2`, [idExterno, id]);
}

/** O nome da instituição só se conhece depois do widget (RF034). */
export async function atualizarInstituicao(
  id: number,
  instituicaoFinanceira: string,
  db: Executor = pool,
): Promise<void> {
  await db.query(`UPDATE consentimento SET instituicao_financeira = $1 WHERE id = $2`, [
    instituicaoFinanceira,
    id,
  ]);
}

export async function atualizarStatus(
  id: number,
  status: StatusConsentimento,
  db: Executor = pool,
): Promise<void> {
  // RN21 — a data de revogação anda junto do status, e a constraint
  // `consentimento_revogacao_coerente` recusa um sem o outro.
  await db.query(
    `UPDATE consentimento
        SET status = $2,
            revogado_em = CASE WHEN $2 = 'revogado' THEN now() ELSE NULL END
      WHERE id = $1`,
    [id, status],
  );
}

export interface NovaContaConectada {
  consentimentoId: number;
  idExterno: string;
  nomeBanco: string;
  tipo: 'corrente' | 'poupanca' | 'pagamento';
  saldoInicial: number;
}

/**
 * Insere a conta destravada pelo consentimento, ou devolve a que já existe.
 *
 * Reautorizar a mesma instituição não pode duplicar conta — o índice
 * `idx_conta_externa_unica` garante no banco, e o `ON CONFLICT` faz a operação
 * ser repetível sem erro.
 */
export async function inserirContaConectada(
  usuarioId: number,
  dados: NovaContaConectada,
  db: Executor = pool,
): Promise<{ id: number }> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO conta_bancaria
       (usuario_id, consentimento_id, id_externo, nome_banco, tipo, saldo_inicial)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (consentimento_id, id_externo) WHERE consentimento_id IS NOT NULL
       DO UPDATE SET nome_banco = EXCLUDED.nome_banco
     RETURNING id`,
    [
      usuarioId,
      dados.consentimentoId,
      dados.idExterno,
      dados.nomeBanco,
      dados.tipo,
      dados.saldoInicial,
    ],
  );
  return rows[0] as { id: number };
}

export async function listarContasDoConsentimento(
  consentimentoId: number,
  db: Executor = pool,
): Promise<Array<{ id: number; id_externo: string; nome_banco: string; tipo: string }>> {
  const { rows } = await db.query<{
    id: number;
    id_externo: string;
    nome_banco: string;
    tipo: string;
  }>(
    `SELECT id, id_externo, nome_banco, tipo
       FROM conta_bancaria
      WHERE consentimento_id = $1
      ORDER BY id`,
    [consentimentoId],
  );
  return rows;
}
