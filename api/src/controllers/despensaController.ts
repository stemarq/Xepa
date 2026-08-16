import type { Request, Response } from 'express';
import { z } from 'zod';
import * as despensaService from '../services/despensaService.js';
import * as notaFiscalService from '../services/notaFiscalService.js';
import { usuarioAutenticado } from '../middlewares/autenticar.js';
import { badRequest } from '../utils/errors.js';

/** Entrada HTTP do Módulo 2 — Despensa. */

const idParam = z.coerce.number().int().positive();

function paramId(req: Request): number {
  const resultado = idParam.safeParse(req.params.id);
  if (!resultado.success) throw badRequest('Identificador de produto inválido.');
  return resultado.data;
}

const quantidade = z.number().positive('A quantidade precisa ser maior que zero.');
const quantidadeNaoNegativa = z.number().min(0, 'A quantidade não pode ser negativa.');

const novoProdutoSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do item.').max(120),
  categoria: z.string().trim().max(60).nullable().optional(),
  unidade: z.string().trim().min(1).max(20).optional(),
  quantidadeInicial: quantidadeNaoNegativa.optional(),
  monitorado: z.boolean().optional(),
  quantidadeMinima: quantidadeNaoNegativa.nullable().optional(),
});

const edicaoProdutoSchema = z
  .object({
    nome: z.string().trim().min(1, 'O nome não pode ficar em branco.').max(120).optional(),
    categoria: z.string().trim().max(60).nullable().optional(),
    unidade: z.string().trim().min(1).max(20).optional(),
    monitorado: z.boolean().optional(),
    quantidadeMinima: quantidadeNaoNegativa.nullable().optional(),
  })
  .refine((dados) => Object.keys(dados).length > 0, {
    message: 'Envie ao menos um campo para atualizar.',
  });

const consumoSchema = z.object({ quantidade });

// Sem preço, de propósito: a entrada manual existe justamente para o que não
// foi comprado (RF010).
const entradaSchema = z.object({ quantidade });

const monitoramentoSchema = z.object({
  monitorado: z.boolean(),
  quantidadeMinima: quantidadeNaoNegativa.nullable().optional(),
});

const notaSchema = z.object({
  // Chave de acesso da NFC-e: 44 dígitos.
  chaveAcesso: z
    .string()
    .trim()
    .regex(/^\d{44}$/, 'A chave de acesso deve ter 44 dígitos.'),
  localCompra: z.string().trim().max(160).nullable().optional(),
  dataCompra: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.'),
  valorTotal: z.number().positive().optional(),
  itens: z
    .array(
      z.object({
        descricao: z.string().trim().min(1, 'Item sem descrição.').max(120),
        quantidade,
        valorUnitario: z.number().min(0, 'Valor unitário não pode ser negativo.'),
      }),
    )
    .min(1, 'A nota precisa ter ao menos um item.'),
});

/** SD09 — GET /api/despensa/produtos */
export async function listarEstoque(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  res.status(200).json({ produtos: await despensaService.listarEstoque(id) });
}

/** RF013 — GET /api/despensa/produtos/:id */
export async function detalharProduto(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  res.status(200).json({ produto: await despensaService.detalharProduto(id, paramId(req)) });
}

/** RF012 — GET /api/despensa/alertas */
export async function listarAlertas(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  res.status(200).json({ produtos: await despensaService.listarAlertas(id) });
}

/** SD07 — POST /api/despensa/produtos */
export async function criarProduto(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  const dados = novoProdutoSchema.parse(req.body);
  res.status(201).json({ produto: await despensaService.criarProduto(id, dados) });
}

/** SD07 — PUT /api/despensa/produtos/:id */
export async function editarProduto(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  const dados = edicaoProdutoSchema.parse(req.body);
  res.status(200).json({ produto: await despensaService.editarProduto(id, paramId(req), dados) });
}

/** SD08 — POST /api/despensa/produtos/:id/consumo */
export async function registrarConsumo(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  const { quantidade: qtd } = consumoSchema.parse(req.body);
  const resultado = await despensaService.registrarConsumo(id, paramId(req), qtd);
  res.status(200).json(resultado);
}

/**
 * RF010 — POST /api/despensa/produtos/:id/entrada
 *
 * Repõe estoque sem nota e sem preço: presente, sobra, rateio. Não gera
 * transação — o que não custou não vira gasto.
 */
export async function registrarEntrada(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  const { quantidade: qtd } = entradaSchema.parse(req.body);
  res.status(200).json(await despensaService.registrarEntrada(id, paramId(req), qtd));
}

/** SD10 — PUT /api/despensa/produtos/:id/monitoramento */
export async function configurarAlerta(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  const { monitorado, quantidadeMinima } = monitoramentoSchema.parse(req.body);
  const produto = await despensaService.configurarAlerta(
    id,
    paramId(req),
    monitorado,
    quantidadeMinima ?? null,
  );
  res.status(200).json({ produto });
}

const consultaSchema = z.object({
  // O conteúdo cru do QR Code: é a URL inteira que o portal aceita (RN22).
  conteudoQr: z.string().trim().min(1, 'Informe o conteúdo lido do QR Code.').max(1000),
  chaveAcesso: z
    .string()
    .trim()
    .regex(/^\d{44}$/, 'A chave de acesso deve ter 44 dígitos.'),
});

/**
 * SD06 — POST /api/despensa/notas/consultar
 *
 * Tenta trazer os itens da nota antes de o usuário digitar. Responde 200 mesmo
 * quando não consegue: portal fora do ar ou UF sem suporte não são erro do
 * pedido, são o caso previsto em que o app segue no preenchimento manual.
 */
export async function consultarNota(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  const { conteudoQr, chaveAcesso } = consultaSchema.parse(req.body);
  res.status(200).json(await notaFiscalService.consultar(id, conteudoQr, chaveAcesso));
}

/** SD06 — POST /api/despensa/notas */
export async function processarNota(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  const nota = notaSchema.parse(req.body);
  res.status(201).json(await despensaService.processarNota(id, nota));
}

/** GET /api/despensa/notas */
export async function listarNotas(req: Request, res: Response) {
  const { id } = usuarioAutenticado(req);
  res.status(200).json({ notas: await despensaService.listarNotas(id) });
}
