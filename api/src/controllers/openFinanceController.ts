import type { Request, Response } from 'express';
import { z } from 'zod';
import * as openFinanceService from '../services/openFinanceService.js';
import { ProvedorSimulado } from '../services/openFinance/provedorSimulado.js';
import { usuarioAutenticado } from '../middlewares/autenticar.js';
import { badRequest } from '../utils/errors.js';

/** Entrada HTTP do Open Finance (SD25–SD27). */

const idParam = z.coerce.number().int().positive();

function paramId(req: Request): number {
  const resultado = idParam.safeParse(req.params.id);
  if (!resultado.success) throw badRequest('Identificador de consentimento inválido.');
  return resultado.data;
}

const conexaoSchema = z.object({
  instituicaoId: z.string().trim().min(1, 'Escolha uma instituição.').max(60),
});

/**
 * O id do vínculo no provedor, quando quem o recebe primeiro é o app (widget).
 * Opcional porque o provedor simulado cria o id na abertura e não precisa dele.
 */
const autorizacaoSchema = z.object({
  idExterno: z.string().trim().min(1).max(200).optional(),
});

export async function listarInstituicoes(_req: Request, res: Response) {
  res.json({
    instituicoes: await openFinanceService.listarInstituicoes(),
    // A tela precisa disso para não anunciar o que não é: quem decide o
    // provedor é o ambiente do servidor, e o app não tem como descobrir.
    simulado: openFinanceService.provedor.simulado,
  });
}

export async function listarConexoes(req: Request, res: Response) {
  const usuario = usuarioAutenticado(req);
  res.json({ conexoes: await openFinanceService.listarConexoes(usuario.id) });
}

/** RF034 — abre o consentimento. */
export async function criarConsentimento(req: Request, res: Response) {
  const usuario = usuarioAutenticado(req);
  const dados = conexaoSchema.parse(req.body);
  const resultado = await openFinanceService.criarConsentimento(usuario.id, dados.instituicaoId);
  res.status(201).json(resultado);
}

/** RF034 — confirma que o usuário autorizou e traz as contas. */
export async function autorizarConsentimento(req: Request, res: Response) {
  const usuario = usuarioAutenticado(req);
  const { idExterno } = autorizacaoSchema.parse(req.body ?? {});
  const contas = await openFinanceService.autorizarConsentimento(
    usuario.id,
    paramId(req),
    idExterno,
  );
  res.json({ contas });
}

/** RF035 — importa o extrato (RN19, RN20). */
export async function sincronizar(req: Request, res: Response) {
  const usuario = usuarioAutenticado(req);
  const resumo = await openFinanceService.sincronizar(usuario.id, paramId(req));
  res.json({ resumo });
}

/** RF036 — revoga. */
export async function revogarConsentimento(req: Request, res: Response) {
  const usuario = usuarioAutenticado(req);
  await openFinanceService.revogarConsentimento(usuario.id, paramId(req));
  res.status(204).send();
}

/**
 * Faz o papel da tela da instituição, que no mundo real é onde o usuário
 * digita a senha do banco — fora do Xepa (RNF18).
 *
 * Só existe porque o provedor é o simulado: com um agregador de verdade o app
 * abriria a `urlDeAutorizacao` no navegador e esta rota deixaria de fazer
 * sentido. Por isso ela responde 404 se o provedor não for o simulador, em vez
 * de virar um jeito de pular o consentimento.
 */
export async function simularAutorizacao(req: Request, res: Response) {
  const usuario = usuarioAutenticado(req);
  const provedor = openFinanceService.provedor;
  if (!(provedor instanceof ProvedorSimulado)) {
    throw badRequest('Autorização simulada só existe com o provedor simulado.');
  }

  const conexoes = await openFinanceService.listarConexoes(usuario.id);
  const id = paramId(req);
  if (!conexoes.some((c) => c.id === id)) {
    throw badRequest('Consentimento não encontrado.');
  }

  await provedor.simularAutorizacaoDoUsuario(await idExternoDe(usuario.id, id));
  res.status(204).send();
}

async function idExternoDe(usuarioId: number, id: number): Promise<string> {
  const consentimento = await openFinanceService.buscarIdExterno(usuarioId, id);
  return consentimento;
}
