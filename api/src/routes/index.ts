import { Router } from 'express';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import * as openFinanceService from '../services/openFinanceService.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { contaRoutes } from './contaRoutes.js';
import { despensaRoutes } from './despensaRoutes.js';
import { granaRoutes } from './granaRoutes.js';
import { cabecaRoutes } from './cabecaRoutes.js';
import { roupaRoutes } from './roupaRoutes.js';

export const routes = Router();

/**
 * Saúde do serviço e **qual versão está no ar**.
 *
 * O commit vai junto porque é a única rota pública: todas as outras exigem
 * sessão, e mesmo uma rota inexistente devolve 401 (o `autenticar` roda antes
 * do roteamento). Sem isto, depois de um deploy não havia como saber por fora
 * se o código novo subiu — e uma chamada que falha por rota ausente é
 * indistinguível de uma que falha por serviço de terceiro fora do ar.
 *
 * O commit curto é o que se compara com `git log`; o longo não acrescenta
 * nada a olho. O repositório é público, então o SHA não revela nada que já
 * não esteja no GitHub.
 */
routes.get(
  '/saude',
  asyncHandler(async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      banco: 'ok',
      ambiente: env.nodeEnv,
      // Nulo, e não string vazia: fora de um deploy ninguém injeta o commit, e
      // "não sei" é diferente de "sem commit".
      commit: env.commit ? env.commit.slice(0, 7) : null,
      ramo: env.ramo || null,
      /**
       * Qual provedor de Open Finance está ativo (RNF18).
       *
       * Mesma razão do commit: as rotas de Open Finance exigem sessão, então
       * "as credenciais do agregador chegaram ao ambiente?" era uma pergunta
       * que só se respondia instalando o app e olhando a tela. É booleano e
       * derivado da presença das chaves — não expõe nenhuma delas, e o
       * repositório já diz em público que o provedor é trocável.
       */
      openFinance: openFinanceService.provedor.simulado ? 'simulado' : 'agregador',
    });
  }),
);

routes.use('/conta', contaRoutes);
routes.use('/despensa', despensaRoutes);
routes.use('/grana', granaRoutes);
routes.use('/cabeca', cabecaRoutes);
routes.use('/roupa', roupaRoutes);
