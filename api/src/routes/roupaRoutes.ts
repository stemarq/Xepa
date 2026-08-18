import { Router } from 'express';
import * as roupaController from '../controllers/roupaController.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { autenticar } from '../middlewares/autenticar.js';

/** Módulo 5 — Roupa (UC18–UC19). Tudo exige sessão. */
export const roupaRoutes = Router();

roupaRoutes.use(autenticar);

roupaRoutes.get('/pecas', asyncHandler(roupaController.listarPecas));
roupaRoutes.post('/pecas', asyncHandler(roupaController.cadastrarPeca));
roupaRoutes.put('/pecas/:id', asyncHandler(roupaController.editarPeca));
roupaRoutes.delete('/pecas/:id', asyncHandler(roupaController.removerPeca));
roupaRoutes.post('/pecas/:id/uso', asyncHandler(roupaController.registrarUso));

// RF038 — foto da peça. A imagem tem rota própria para não pesar a listagem.
roupaRoutes.get('/pecas/:id/foto', asyncHandler(roupaController.obterFoto));
roupaRoutes.put('/pecas/:id/foto', asyncHandler(roupaController.definirFoto));
roupaRoutes.delete('/pecas/:id/foto', asyncHandler(roupaController.removerFoto));

roupaRoutes.get('/lavar', asyncHandler(roupaController.listarParaLavar));

roupaRoutes.get('/lavagens', asyncHandler(roupaController.listarLavagens));
roupaRoutes.post('/lavagens', asyncHandler(roupaController.agendarLavagem));
roupaRoutes.post('/lavagens/:id/concluir', asyncHandler(roupaController.concluirLavagem));
roupaRoutes.post('/lavagens/:id/cancelar', asyncHandler(roupaController.cancelarLavagem));

roupaRoutes.get('/alertas', asyncHandler(roupaController.obterAlertas));
