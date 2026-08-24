import type { Request, Response } from 'express';
import { z } from 'zod';
import * as contaService from '../services/contaService.js';
import { extrairToken, usuarioAutenticado } from '../middlewares/autenticar.js';

/**
 * Entrada HTTP do Módulo 1. Valida o formato do corpo (Zod) e delega ao
 * ContaService; regra de negócio nenhuma mora aqui.
 */

const emailSchema = z.string().trim().min(1, 'Informe o e-mail.').email('E-mail inválido.');

// A força da senha é decidida pelo Service (RN02), com mensagem específica —
// aqui só garantimos que veio uma string não vazia.
const senhaSchema = z.string().min(1, 'Informe a senha.');

const cadastroSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome.').max(120),
  email: emailSchema,
  senha: senhaSchema,
});

const loginSchema = z.object({ email: emailSchema, senha: senhaSchema });

const renovacaoSchema = z.object({
  tokenRenovacao: z.string().min(1, 'Token de renovação ausente.'),
});

const recuperacaoSchema = z.object({ email: emailSchema });

const redefinicaoSchema = z.object({
  token: z.string().min(1, 'Token ausente.'),
  senha: senhaSchema,
});

const perfilSchema = z
  .object({
    nome: z.string().trim().min(1, 'O nome não pode ficar em branco.').max(120).optional(),
    // null desfaz o vínculo (remove avatar ou instituição)
    avatarId: z.number().int().positive().nullable().optional(),
    instituicaoId: z.number().int().positive().nullable().optional(),
  })
  .refine((dados) => Object.keys(dados).length > 0, {
    message: 'Envie ao menos um campo para atualizar.',
  });

/** SD01 — POST /api/conta/cadastro */
export async function cadastrar(req: Request, res: Response) {
  const dados = cadastroSchema.parse(req.body);
  const perfil = await contaService.cadastrar(dados);
  res.status(201).json({ usuario: perfil });
}

/** Formato da sessão na resposta — o mesmo no login e na renovação. */
function corpoDaSessao(sessao: contaService.SessaoAberta) {
  return {
    token: sessao.token,
    expiraEm: sessao.expiraEm.toISOString(),
    tokenRenovacao: sessao.tokenRenovacao,
    renovacaoExpiraEm: sessao.renovacaoExpiraEm.toISOString(),
    usuario: sessao.perfil,
  };
}

/** SD02 — POST /api/conta/login */
export async function login(req: Request, res: Response) {
  const { email, senha } = loginSchema.parse(req.body);
  res.status(200).json(corpoDaSessao(await contaService.autenticar(email, senha)));
}

/**
 * RF039 — POST /api/conta/renovar
 *
 * Pública por definição: quem chama aqui é justamente quem **não** tem sessão
 * válida. O token de renovação vai no corpo, não no `Authorization`, para não
 * ser confundido com um token de sessão pelo `autenticar`.
 */
export async function renovar(req: Request, res: Response) {
  const { tokenRenovacao } = renovacaoSchema.parse(req.body);
  res.status(200).json(corpoDaSessao(await contaService.renovarPorToken(tokenRenovacao)));
}

/** SD03 — POST /api/conta/logout */
export async function logout(req: Request, res: Response) {
  await contaService.encerrarSessao(extrairToken(req));
  res.status(200).json({ mensagem: 'Sessão encerrada.' });
}

/** SD04 — POST /api/conta/recuperar-senha */
export async function recuperarSenha(req: Request, res: Response) {
  const { email } = recuperacaoSchema.parse(req.body);
  await contaService.solicitarRecuperacao(email);
  // Resposta genérica: não revela se o e-mail está cadastrado.
  res.status(200).json({
    mensagem: 'Se existir uma conta com esse e-mail, enviamos um link de redefinição.',
  });
}

/** POST /api/conta/redefinir-senha */
export async function redefinirSenha(req: Request, res: Response) {
  const { token, senha } = redefinicaoSchema.parse(req.body);
  await contaService.redefinirSenha(token, senha);
  res.status(200).json({ mensagem: 'Senha redefinida. Entre com a nova senha.' });
}

/** GET /api/conta/perfil */
export async function obterPerfil(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  res.status(200).json({ usuario: await contaService.obterPerfil(id) });
}

/** SD05 — PUT /api/conta/perfil */
export async function atualizarPerfil(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  const dados = perfilSchema.parse(req.body);
  res.status(200).json({ usuario: await contaService.atualizarPerfil(id, dados) });
}

/** RF007/RN04 — GET /api/conta/avatares */
export async function listarAvatares(_req: Request, res: Response) {
  res.status(200).json({ avatares: await contaService.listarAvatares() });
}

/** RF006/RN05 — GET /api/conta/instituicoes */
export async function listarInstituicoes(_req: Request, res: Response) {
  res.status(200).json({ instituicoes: await contaService.listarInstituicoes() });
}
