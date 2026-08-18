import type { Request, Response } from 'express';
import { z } from 'zod';
import * as roupaService from '../services/roupaService.js';
import { usuarioAutenticado } from '../middlewares/autenticar.js';
import { badRequest } from '../utils/errors.js';

/** Entrada HTTP do Módulo 5 — Roupa. */

const idPositivo = z.coerce.number().int().positive();

function param(req: Request, rotulo: string): number {
  const resultado = idPositivo.safeParse(req.params.id);
  if (!resultado.success) throw badRequest(`Identificador de ${rotulo} inválido.`);
  return resultado.data;
}

const pecaSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome da peça.').max(120),
  tipo: z.string().trim().max(60).nullable().optional(),
  // RN14 — o usuário define de quantos em quantos usos aquela peça vai à lavagem.
  limiteUsos: z
    .number()
    .int('O limite de usos deve ser inteiro.')
    .min(1, 'O limite de usos precisa ser pelo menos 1.')
    .max(365),
});

const edicaoPecaSchema = z
  .object({
    nome: z.string().trim().min(1, 'O nome não pode ficar em branco.').max(120).optional(),
    tipo: z.string().trim().max(60).nullable().optional(),
    limiteUsos: z.number().int().min(1).max(365).optional(),
  })
  .refine((dados) => Object.keys(dados).length > 0, {
    message: 'Envie ao menos um campo para atualizar.',
  });

const lavagemSchema = z.object({
  dataAgendada: z
    .string()
    .refine((valor) => !Number.isNaN(Date.parse(valor)), 'Data e hora inválidas.'),
  pecaIds: z.array(z.number().int().positive()).default([]),
  lembreteAtivo: z.boolean().default(true),
});

/** GET /api/roupa/pecas */
export async function listarPecas(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  res.status(200).json({ pecas: await roupaService.listarPecas(id) });
}

/** SD21 — POST /api/roupa/pecas */
export async function cadastrarPeca(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  const dados = pecaSchema.parse(req.body);
  res.status(201).json({ peca: await roupaService.cadastrarPeca(id, dados) });
}

/** PUT /api/roupa/pecas/:id */
export async function editarPeca(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  const dados = edicaoPecaSchema.parse(req.body);
  res.status(200).json({ peca: await roupaService.editarPeca(id, param(req, 'peça'), dados) });
}

/** DELETE /api/roupa/pecas/:id */
export async function removerPeca(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  await roupaService.removerPeca(id, param(req, 'peça'));
  res.status(204).send();
}

/** SD22 — POST /api/roupa/pecas/:id/uso */
export async function registrarUso(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  res.status(200).json(await roupaService.registrarUso(id, param(req, 'peça')));
}

/**
 * A foto chega em base64 dentro do JSON, e não como multipart.
 *
 * Multipart exigiria um middleware de upload só para este endpoint; base64
 * custa um terço a mais de bytes em cima de uma miniatura de ~40 KB, o que é
 * barato perto de somar dependência e um caminho de parsing diferente do resto
 * da API.
 */
const fotoSchema = z.object({
  base64: z.string().min(1, 'Envie a imagem.'),
  tipo: z.string().trim().min(1, 'Informe o tipo da imagem.'),
});

/** RF038 — PUT /api/roupa/pecas/:id/foto */
export async function definirFoto(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  const imagem = fotoSchema.parse(req.body);
  await roupaService.definirFoto(id, param(req, 'peça'), imagem);
  res.status(204).end();
}

/** RF038 — DELETE /api/roupa/pecas/:id/foto */
export async function removerFoto(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  await roupaService.removerFoto(id, param(req, 'peça'));
  res.status(204).end();
}

/**
 * RF038 — GET /api/roupa/pecas/:id/foto
 *
 * Devolve a imagem crua, não JSON: é o que faz um `<Image source={{uri}}>`
 * funcionar direto, sem o app ter de decodificar nada.
 */
export async function obterFoto(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  const foto = await roupaService.obterFoto(id, param(req, 'peça'));

  res.setHeader('Content-Type', foto.foto_tipo);
  // `private` porque a foto é de uma pessoa e a rota exige sessão: nenhum
  // intermediário pode guardar isto para servir a outro.
  res.setHeader('Cache-Control', 'private, max-age=86400');
  // `Buffer.from` não é redundante: o `pg` devolve BYTEA como Buffer, mas o
  // PGlite devolve Uint8Array, e o `send` do Express só trata Buffer como
  // binário — o resto ele serializa em JSON. Sem isto, a mesma rota devolveria
  // uma imagem em produção e `{"0":137,"1":80,…}` no modo sem Postgres.
  res.status(200).send(Buffer.from(foto.foto));
}

/** RN14 — GET /api/roupa/lavar */
export async function listarParaLavar(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  res.status(200).json({ pecas: await roupaService.listarParaLavar(id) });
}

/** SD23 — POST /api/roupa/lavagens */
export async function agendarLavagem(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  const { dataAgendada, pecaIds, lembreteAtivo } = lavagemSchema.parse(req.body);
  const lavagem = await roupaService.agendarLavagem(id, dataAgendada, pecaIds, lembreteAtivo);
  res.status(201).json({ lavagem });
}

/** GET /api/roupa/lavagens */
export async function listarLavagens(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  const { status } = z
    .object({ status: z.enum(['agendada', 'concluida', 'cancelada']).optional() })
    .parse(req.query);
  res.status(200).json({ lavagens: await roupaService.listarLavagens(id, status) });
}

/** POST /api/roupa/lavagens/:id/concluir */
export async function concluirLavagem(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  res.status(200).json(await roupaService.concluirLavagem(id, param(req, 'lavagem')));
}

/** POST /api/roupa/lavagens/:id/cancelar */
export async function cancelarLavagem(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  const lavagem = await roupaService.cancelarLavagem(id, param(req, 'lavagem'));
  res.status(200).json({ lavagem });
}

/** SD24 — GET /api/roupa/alertas */
export async function obterAlertas(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  const { emDias } = z
    .object({ emDias: z.coerce.number().int().min(0).max(30).optional() })
    .parse(req.query);
  res.status(200).json(await roupaService.obterAlertas(id, emDias ?? 2));
}
