import { Router } from 'express';
import * as contaController from '../controllers/contaController.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { autenticar } from '../middlewares/autenticar.js';

/** Módulo 1 — Conta / Autenticação (UC01–UC04). */
export const contaRoutes = Router();

// Públicas
contaRoutes.post('/cadastro', asyncHandler(contaController.cadastrar));
contaRoutes.post('/login', asyncHandler(contaController.login));
// RF039 — troca o token de renovação por uma sessão nova; sem sessão válida
// não haveria como autenticar esta chamada.
contaRoutes.post('/renovar', asyncHandler(contaController.renovar));
contaRoutes.post('/recuperar-senha', asyncHandler(contaController.recuperarSenha));
contaRoutes.post('/redefinir-senha', asyncHandler(contaController.redefinirSenha));
contaRoutes.get('/avatares', asyncHandler(contaController.listarAvatares));
contaRoutes.get('/instituicoes', asyncHandler(contaController.listarInstituicoes));

// Exigem sessão
contaRoutes.post('/logout', autenticar, asyncHandler(contaController.logout));
contaRoutes.get('/perfil', autenticar, asyncHandler(contaController.obterPerfil));
contaRoutes.put('/perfil', autenticar, asyncHandler(contaController.atualizarPerfil));
