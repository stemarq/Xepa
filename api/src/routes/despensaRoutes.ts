import { Router } from 'express';
import * as despensaController from '../controllers/despensaController.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { autenticar } from '../middlewares/autenticar.js';

/** Módulo 2 — Despensa (UC05–UC09). Tudo exige sessão. */
export const despensaRoutes = Router();

despensaRoutes.use(autenticar);

despensaRoutes.get('/produtos', asyncHandler(despensaController.listarEstoque));
despensaRoutes.post('/produtos', asyncHandler(despensaController.criarProduto));
despensaRoutes.get('/alertas', asyncHandler(despensaController.listarAlertas));
despensaRoutes.get('/produtos/:id', asyncHandler(despensaController.detalharProduto));
despensaRoutes.put('/produtos/:id', asyncHandler(despensaController.editarProduto));
despensaRoutes.post('/produtos/:id/consumo', asyncHandler(despensaController.registrarConsumo));
// Reposição sem nota: o que entrou sem ter sido comprado (RF010).
despensaRoutes.post('/produtos/:id/entrada', asyncHandler(despensaController.registrarEntrada));
despensaRoutes.put(
  '/produtos/:id/monitoramento',
  asyncHandler(despensaController.configurarAlerta),
);

// Antes de `/notas`: a consulta não grava nada, só adianta os itens (RN22).
despensaRoutes.post('/notas/consultar', asyncHandler(despensaController.consultarNota));
despensaRoutes.post('/notas', asyncHandler(despensaController.processarNota));
despensaRoutes.get('/notas', asyncHandler(despensaController.listarNotas));
