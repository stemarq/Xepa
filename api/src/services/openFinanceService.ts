/**
 * Módulo 3 — Open Finance (SD25–SD27, RF034–RF037).
 *
 * Aqui moram as três regras que sustentam o resto:
 *
 * - **RN19** — sincronizar duas vezes não muda o gasto do mês. A movimentação
 *   traz um id da instituição; se ele já existe na conta, é ignorada.
 * - **RN20** — a mesma compra que chegou pela nota fiscal e pelo extrato é um
 *   gasto só. A movimentação que casa com uma nota concilia com ela em vez de
 *   virar transação nova. Sem isso a RN11 conta o dinheiro duas vezes.
 * - **RN21** — consentimento expirado ou revogado não sincroniza, e revogar
 *   não apaga o que já entrou.
 *
 * O provedor é injetado (RNF18): o Service não sabe se do outro lado tem um
 * agregador autorizado ou o simulador.
 */

import * as consentimentoRepository from '../repositories/consentimentoRepository.js';
import * as transacaoRepository from '../repositories/transacaoRepository.js';
import {
  DIAS_DE_TOLERANCIA_NA_CONCILIACAO,
  podeSincronizar,
  statusEfetivo,
  type Consentimento,
  type ResumoDaSincronizacao,
} from '../models/openFinance.js';
import { randomUUID } from 'node:crypto';
import { conflict, notFound } from '../utils/errors.js';
import { withTransaction } from '../db/pool.js';
import type { ProvedorOpenFinance } from './openFinance/provedor.js';
import { ProvedorPluggy } from './openFinance/provedorPluggy.js';
import { ProvedorSimulado } from './openFinance/provedorSimulado.js';
import { env } from '../config/env.js';

/**
 * O provedor em uso.
 *
 * Quem decide é a presença das credenciais, não uma linha editada à mão: com
 * `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` no ambiente, o Xepa fala com a
 * Pluggy; sem elas, com o simulador. Assim a suíte, o `dev:memoria` e um clone
 * recém-baixado continuam rodando sem cadastro em provedor nenhum, e publicar
 * com integração real é preencher duas variáveis — sem build diferente e sem
 * alguém lembrar de trocar um import antes do deploy.
 *
 * Nada abaixo desta linha sabe qual dos dois está em uso.
 */
export const provedor: ProvedorOpenFinance =
  env.pluggy.clientId && env.pluggy.clientSecret
    ? new ProvedorPluggy()
    : new ProvedorSimulado();

/** O escopo que o Xepa pede. Fica visível para o usuário antes do aceite (RF037). */
const ESCOPO_PADRAO = 'contas,extrato';

/** De quantos dias para trás a primeira sincronização puxa extrato. */
const JANELA_INICIAL_EM_DIAS = 90;

export function listarInstituicoes() {
  return provedor.listarInstituicoes();
}

/** SD25 — abre o consentimento e devolve para onde mandar o usuário. */
export async function criarConsentimento(
  usuarioId: number,
  instituicaoId: string,
): Promise<{
  consentimento: Consentimento;
  urlDeAutorizacao: string;
  tokenDoCliente?: string;
}> {
  const instituicoes = await provedor.listarInstituicoes();
  const instituicao = instituicoes.find((i) => i.id === instituicaoId);
  if (!instituicao) throw notFound(`Instituição desconhecida: ${instituicaoId}`);

  const externo = await provedor.iniciarConsentimento(instituicaoId, ESCOPO_PADRAO);

  const consentimento = await consentimentoRepository.inserir(usuarioId, {
    instituicaoFinanceira: instituicao.nome,
    // Provisório quando o provedor só cria o vínculo no fim do fluxo. A coluna
    // é NOT NULL e única por usuário, então precisa de um valor desde já — e
    // um id nosso, opaco, serve até a autorização trazer o definitivo.
    idExterno: externo.idExterno ?? `pendente-${randomUUID()}`,
    escopo: ESCOPO_PADRAO,
    expiraEm: externo.expiraEm,
  });

  return {
    consentimento,
    urlDeAutorizacao: externo.urlDeAutorizacao,
    ...(externo.tokenDoCliente ? { tokenDoCliente: externo.tokenDoCliente } : {}),
  };
}

/** SD25 — o usuário autorizou; traz as contas e ativa o consentimento. */
export async function autorizarConsentimento(
  usuarioId: number,
  id: number,
  /**
   * Id do vínculo no provedor, quando é o cliente quem o recebe primeiro
   * (widget). Ignorado pelos provedores que criam o id no início.
   */
  idExternoDoCliente?: string,
) {
  const consentimento = await exigirConsentimento(usuarioId, id);

  if (consentimento.status === 'revogado') {
    throw conflict('Este consentimento foi revogado. Conecte a instituição de novo.');
  }

  // Nos provedores de widget o id definitivo chega agora, e substitui o
  // provisório gravado na abertura. Sem ele não há o que consultar.
  let idExterno = consentimento.id_externo;
  if (provedor.idNasceNoCliente) {
    if (!idExternoDoCliente) {
      throw conflict('Conclua a conexão no aplicativo da instituição antes de continuar.');
    }
    if (idExternoDoCliente !== idExterno) {
      await consentimentoRepository.atualizarIdExterno(consentimento.id, idExternoDoCliente);
      idExterno = idExternoDoCliente;
    }
  }

  // Lança 409 se o usuário ainda não passou pela url de autorização.
  const contasExternas = await provedor.confirmarAutorizacao(idExterno);

  await consentimentoRepository.atualizarStatus(consentimento.id, 'ativo');

  for (const conta of contasExternas) {
    await consentimentoRepository.inserirContaConectada(usuarioId, {
      consentimentoId: consentimento.id,
      idExterno: conta.idExterno,
      nomeBanco: conta.nomeBanco,
      tipo: conta.tipo,
      saldoInicial: conta.saldo,
    });
  }

  return consentimentoRepository.listarContasDoConsentimento(consentimento.id);
}

/** SD26 — importa o extrato aplicando RN19 e RN20. */
export async function sincronizar(
  usuarioId: number,
  id: number,
): Promise<ResumoDaSincronizacao> {
  const consentimento = await exigirConsentimento(usuarioId, id);

  // RN21 — expirado ou revogado não sincroniza.
  if (!podeSincronizar(consentimento)) {
    throw conflict(
      `Consentimento ${statusEfetivo(consentimento)}: reconecte a instituição para sincronizar.`,
    );
  }

  const contas = await consentimentoRepository.listarContasDoConsentimento(consentimento.id);
  const porIdExterno = new Map(contas.map((c) => [c.id_externo, c.id]));

  const desde = new Date();
  desde.setDate(desde.getDate() - JANELA_INICIAL_EM_DIAS);

  const movimentacoes = await provedor.listarMovimentacoes(
    consentimento.id_externo,
    desde.toISOString().slice(0, 10),
  );

  const resumo: ResumoDaSincronizacao = { importadas: 0, conciliadas: 0, ignoradas: 0 };

  // Tudo numa transação: uma sincronização parcial deixaria o gasto do mês
  // (RN11) num estado que não corresponde a nenhum momento do extrato.
  await withTransaction(async (db) => {
    for (const movimentacao of movimentacoes) {
      const contaId = porIdExterno.get(movimentacao.contaIdExterno);
      // Movimentação de conta que o usuário não conectou: não é nossa.
      if (contaId === undefined) continue;

      // RN19 — já importada antes.
      const jaImportada = await transacaoRepository.buscarPorIdExterno(
        contaId,
        movimentacao.idExterno,
        db,
      );
      if (jaImportada) {
        resumo.ignoradas += 1;
        continue;
      }

      // RN20 — casa com uma nota fiscal ainda não conciliada?
      if (movimentacao.tipo === 'saida') {
        const nota = await transacaoRepository.buscarNotaConciliavel(
          usuarioId,
          contaId,
          movimentacao.valor,
          movimentacao.data,
          DIAS_DE_TOLERANCIA_NA_CONCILIACAO,
          db,
        );
        if (nota) {
          await transacaoRepository.conciliarComExtrato(
            nota.id,
            contaId,
            movimentacao.idExterno,
            db,
          );
          resumo.conciliadas += 1;
          continue;
        }
      }

      await transacaoRepository.inserirDoExtrato(
        usuarioId,
        {
          contaId,
          categoriaId: null,
          tipo: movimentacao.tipo,
          valor: movimentacao.valor,
          data: movimentacao.data,
          origem: 'open_finance',
          descricao: movimentacao.descricao,
          idExterno: movimentacao.idExterno,
        },
        db,
      );
      resumo.importadas += 1;
    }
  });

  return resumo;
}

/** SD27 — revoga. As transações já importadas ficam (RN21). */
export async function revogarConsentimento(usuarioId: number, id: number): Promise<void> {
  const consentimento = await exigirConsentimento(usuarioId, id);
  if (consentimento.status === 'revogado') return;

  await provedor.revogar(consentimento.id_externo);
  await consentimentoRepository.atualizarStatus(consentimento.id, 'revogado');
}

/** RF037 — o que a tela mostra: escopo, validade e status de verdade. */
export async function listarConexoes(usuarioId: number) {
  const consentimentos = await consentimentoRepository.listar(usuarioId);
  return Promise.all(
    consentimentos.map(async (consentimento) => ({
      id: consentimento.id,
      instituicao: consentimento.instituicao_financeira,
      escopo: consentimento.escopo,
      // Derivado, não lido do banco: a expiração é passagem de tempo (RN21).
      status: statusEfetivo(consentimento),
      expiraEm: consentimento.expira_em,
      revogadoEm: consentimento.revogado_em,
      contas: await consentimentoRepository.listarContasDoConsentimento(consentimento.id),
    })),
  );
}

/** Só para a rota de autorização simulada — o id no provedor. */
export async function buscarIdExterno(usuarioId: number, id: number): Promise<string> {
  return (await exigirConsentimento(usuarioId, id)).id_externo;
}

async function exigirConsentimento(usuarioId: number, id: number): Promise<Consentimento> {
  const consentimento = await consentimentoRepository.buscarPorId(usuarioId, id);
  if (!consentimento) throw notFound('Consentimento não encontrado.');
  return consentimento;
}
