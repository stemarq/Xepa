import { query, withTransaction } from '../db/pool.js';
import type {
  Avatar,
  Instituicao,
  Usuario,
  UsuarioComRelacionamentos,
} from '../models/usuario.js';

/**
 * Acesso a dados do Módulo 1. Só aqui existe SQL — o ContaService trabalha
 * exclusivamente contra estas funções.
 */

const COLUNAS_COM_RELACIONAMENTOS = `
  u.*,
  a.descricao AS avatar_descricao,
  a.url       AS avatar_url,
  i.nome      AS instituicao_nome
`;

const JOINS = `
  FROM usuario u
  LEFT JOIN avatar a      ON a.id = u.avatar_id
  LEFT JOIN instituicao i ON i.id = u.instituicao_id
`;

export async function buscarPorEmail(email: string): Promise<UsuarioComRelacionamentos | null> {
  const { rows } = await query<UsuarioComRelacionamentos>(
    `SELECT ${COLUNAS_COM_RELACIONAMENTOS} ${JOINS} WHERE u.email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function buscarPorId(id: number): Promise<UsuarioComRelacionamentos | null> {
  const { rows } = await query<UsuarioComRelacionamentos>(
    `SELECT ${COLUNAS_COM_RELACIONAMENTOS} ${JOINS} WHERE u.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * SD03/autenticação — busca pelo hash do token. A expiração (RNF09) é
 * decidida no Service, que precisa distinguir "token inexistente" de
 * "sessão expirada".
 */
export async function buscarPorTokenSessao(
  tokenHash: string,
): Promise<UsuarioComRelacionamentos | null> {
  const { rows } = await query<UsuarioComRelacionamentos>(
    `SELECT ${COLUNAS_COM_RELACIONAMENTOS} ${JOINS} WHERE u.token_sessao_hash = $1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

/**
 * RF039 — busca pelo hash do token de renovação. Como no token de sessão, a
 * expiração é decidida no Service.
 */
export async function buscarPorTokenRenovacao(
  tokenHash: string,
): Promise<UsuarioComRelacionamentos | null> {
  const { rows } = await query<UsuarioComRelacionamentos>(
    `SELECT ${COLUNAS_COM_RELACIONAMENTOS} ${JOINS} WHERE u.token_renovacao_hash = $1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function buscarPorTokenRecuperacao(
  tokenHash: string,
): Promise<UsuarioComRelacionamentos | null> {
  const { rows } = await query<UsuarioComRelacionamentos>(
    `SELECT ${COLUNAS_COM_RELACIONAMENTOS} ${JOINS} WHERE u.token_recuperacao_hash = $1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export interface NovoUsuario {
  nome: string;
  email: string;
  senhaHash: string;
  salt: string;
}

/**
 * Cria a conta e suas categorias financeiras iniciais na mesma transação —
 * uma conta sem a categoria "Mercado" não conseguiria receber transações de
 * nota fiscal (RN18).
 */
export async function salvar(dados: NovoUsuario): Promise<Usuario> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<Usuario>(
      `INSERT INTO usuario (nome, email, senha_hash, salt)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [dados.nome, dados.email, dados.senhaHash, dados.salt],
    );
    // O RETURNING sempre traz uma linha; o INSERT teria lançado antes.
    const usuario = rows[0] as Usuario;

    await client.query(
      `INSERT INTO categoria (usuario_id, nome)
       SELECT $1, nome FROM unnest($2::text[]) AS nome`,
      [usuario.id, CATEGORIAS_PADRAO],
    );

    return usuario;
  });
}

export interface AtualizacaoPerfil {
  nome?: string;
  avatarId?: number | null;
  instituicaoId?: number | null;
}

/**
 * Atualiza só os campos presentes em `dados` — `undefined` significa "não
 * mexer", enquanto `null` desfaz o vínculo (remove avatar ou instituição).
 */
export async function atualizarPerfil(
  usuarioId: number,
  dados: AtualizacaoPerfil,
): Promise<UsuarioComRelacionamentos | null> {
  const atribuicoes: string[] = [];
  const valores: unknown[] = [];

  if (dados.nome !== undefined) {
    valores.push(dados.nome);
    atribuicoes.push(`nome = $${valores.length}`);
  }
  if (dados.avatarId !== undefined) {
    valores.push(dados.avatarId);
    atribuicoes.push(`avatar_id = $${valores.length}`);
  }
  if (dados.instituicaoId !== undefined) {
    valores.push(dados.instituicaoId);
    atribuicoes.push(`instituicao_id = $${valores.length}`);
  }

  if (atribuicoes.length === 0) return buscarPorId(usuarioId);

  atribuicoes.push('atualizado_em = now()');
  valores.push(usuarioId);

  await query(
    `UPDATE usuario SET ${atribuicoes.join(', ')} WHERE id = $${valores.length}`,
    valores,
  );
  return buscarPorId(usuarioId);
}

/** SD02 — registra o token da sessão recém-criada. */
export async function registrarTokenSessao(
  usuarioId: number,
  tokenHash: string,
  expiraEm: Date,
): Promise<void> {
  await query(
    `UPDATE usuario
        SET token_sessao_hash = $1, token_sessao_expira_em = $2, atualizado_em = now()
      WHERE id = $3`,
    [tokenHash, expiraEm, usuarioId],
  );
}

/** RNF09 — a cada requisição autenticada a janela de inatividade recomeça. */
export async function renovarSessao(usuarioId: number, expiraEm: Date): Promise<void> {
  await query(`UPDATE usuario SET token_sessao_expira_em = $1 WHERE id = $2`, [
    expiraEm,
    usuarioId,
  ]);
}

/**
 * RF039 — grava o token de renovação recém-emitido.
 *
 * Chamada tanto no login quanto a cada renovação: o token é rotacionado a
 * cada uso (RN23), então esta função sempre sobrescreve o anterior.
 */
export async function registrarTokenRenovacao(
  usuarioId: number,
  tokenHash: string,
  expiraEm: Date,
): Promise<void> {
  await query(
    `UPDATE usuario
        SET token_renovacao_hash = $1, token_renovacao_expira_em = $2, atualizado_em = now()
      WHERE id = $3`,
    [tokenHash, expiraEm, usuarioId],
  );
}

/**
 * RF039 — descarta o "continuar conectado".
 *
 * Separada de `invalidarTokenSessao` de propósito: a sessão morre sozinha por
 * inatividade (RNF09) e nesse caso o token de renovação **precisa** sobreviver
 * — é ele que evita o login manual. Só o logout, a troca de senha e um token
 * de renovação vencido derrubam os dois.
 */
export async function invalidarTokenRenovacao(usuarioId: number): Promise<void> {
  await query(
    `UPDATE usuario
        SET token_renovacao_hash = NULL, token_renovacao_expira_em = NULL, atualizado_em = now()
      WHERE id = $1`,
    [usuarioId],
  );
}

/** SD03/RN03 — no logout o token é invalidado. */
export async function invalidarTokenSessao(usuarioId: number): Promise<void> {
  await query(
    `UPDATE usuario
        SET token_sessao_hash = NULL, token_sessao_expira_em = NULL, atualizado_em = now()
      WHERE id = $1`,
    [usuarioId],
  );
}

/** SD04 — guarda o token de redefinição de senha. */
export async function salvarTokenRecuperacao(
  usuarioId: number,
  tokenHash: string,
  expiraEm: Date,
): Promise<void> {
  await query(
    `UPDATE usuario
        SET token_recuperacao_hash = $1, token_recuperacao_expira_em = $2, atualizado_em = now()
      WHERE id = $3`,
    [tokenHash, expiraEm, usuarioId],
  );
}

/**
 * Redefine a senha, consome o token de recuperação e derruba a sessão ativa:
 * quem trocou a senha por esquecimento não deve continuar logado em outro
 * aparelho. O token de renovação cai junto (RF039) — deixá-lo de pé faria a
 * troca de senha não expulsar ninguém, já que o aparelho antigo abriria uma
 * sessão nova sem precisar da senha.
 */
export async function redefinirSenha(
  usuarioId: number,
  senhaHash: string,
  salt: string,
): Promise<void> {
  await query(
    `UPDATE usuario
        SET senha_hash = $1,
            salt = $2,
            token_recuperacao_hash = NULL,
            token_recuperacao_expira_em = NULL,
            token_sessao_hash = NULL,
            token_sessao_expira_em = NULL,
            token_renovacao_hash = NULL,
            token_renovacao_expira_em = NULL,
            atualizado_em = now()
      WHERE id = $3`,
    [senhaHash, salt, usuarioId],
  );
}

// ----- Tabelas de apoio -----

export async function listarAvatares(): Promise<Avatar[]> {
  const { rows } = await query<Avatar>('SELECT id, descricao, url FROM avatar ORDER BY id');
  return rows;
}

/** RN04 — a foto de perfil precisa existir na lista de avatares. */
export async function avatarExiste(avatarId: number): Promise<boolean> {
  const { rowCount } = await query('SELECT 1 FROM avatar WHERE id = $1', [avatarId]);
  return rowCount === 1;
}

export async function listarInstituicoes(): Promise<Instituicao[]> {
  const { rows } = await query<Instituicao>('SELECT id, nome FROM instituicao ORDER BY nome');
  return rows;
}

/** RN05 — o vínculo institucional precisa apontar para uma instituição real. */
export async function instituicaoExiste(instituicaoId: number): Promise<boolean> {
  const { rowCount } = await query('SELECT 1 FROM instituicao WHERE id = $1', [instituicaoId]);
  return rowCount === 1;
}

/**
 * Categorias financeiras iniciais da conta, criadas junto com o usuário em
 * `salvar`. "Mercado" é obrigatória: toda transação vinda de nota fiscal
 * nasce nela (RN18).
 */
const CATEGORIAS_PADRAO = [
  'Mercado',
  'Moradia',
  'Transporte',
  'Lazer',
  'Saúde',
  'Educação',
  'Outros',
];
