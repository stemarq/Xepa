/**
 * Provedor simulado — o Open Finance sem sair da máquina.
 *
 * Implementa `ProvedorOpenFinance` inteiro em memória, nas mesmas formas que um
 * agregador devolveria. Serve para desenvolver e testar o fluxo completo
 * (consentir → autorizar → sincronizar → revogar) sem cadastro, sem chave e sem
 * rede — do mesmo jeito que `npm run dev:memoria` roda a API sem Postgres.
 *
 * O que ele simula de propósito, porque é o que quebra integração de verdade:
 *
 * - o consentimento **não nasce autorizado**: `confirmarAutorizacao` falha
 *   enquanto o usuário não passar pela `urlDeAutorizacao`;
 * - a movimentação repete entre sincronizações, com o mesmo `idExterno` — é o
 *   que põe a RN19 à prova;
 * - há uma saída de mercado desenhada para casar com a nota fiscal semeada,
 *   que é o caso da RN20.
 *
 * O que ele **não** simula: mTLS, FAPI, certificado e o fluxo OAuth real. Isso
 * mora do lado do agregador (RNF18) e não muda o contrato desta interface.
 */

import { randomUUID } from 'node:crypto';
import { conflict, notFound } from '../../utils/errors.js';
import type {
  ConsentimentoExterno,
  ContaExterna,
  InstituicaoFinanceira,
  MovimentacaoExterna,
  ProvedorOpenFinance,
} from './provedor.js';

const INSTITUICOES: InstituicaoFinanceira[] = [
  { id: 'banco-do-brasil', nome: 'Banco do Brasil' },
  { id: 'bradesco', nome: 'Bradesco' },
  { id: 'caixa', nome: 'Caixa Econômica Federal' },
  { id: 'itau', nome: 'Itaú Unibanco' },
  { id: 'nubank', nome: 'Nubank' },
  { id: 'santander', nome: 'Santander' },
];

/** Prazo que o simulador concede. A RN21 limita o teto a 12 meses. */
const MESES_DE_VALIDADE = 12;

interface Sessao {
  instituicaoId: string;
  nomeInstituicao: string;
  escopo: string;
  autorizado: boolean;
  expiraEm: Date;
  contas: ContaExterna[];
  movimentacoes: MovimentacaoExterna[];
  revogado: boolean;
}

export class ProvedorSimulado implements ProvedorOpenFinance {
  /**
   * O simulador imita o consentimento canônico do Open Finance, em que o id
   * existe antes da autorização — ao contrário de um widget de agregador.
   */
  readonly idNasceNoCliente = false;

  private readonly sessoes = new Map<string, Sessao>();

  async listarInstituicoes(): Promise<InstituicaoFinanceira[]> {
    return INSTITUICOES;
  }

  async iniciarConsentimento(
    instituicaoId: string,
    escopo: string,
  ): Promise<ConsentimentoExterno> {
    const instituicao = INSTITUICOES.find((i) => i.id === instituicaoId);
    if (!instituicao) {
      throw notFound(`Instituição desconhecida: ${instituicaoId}`);
    }

    // Aleatório, e não sequencial: o id precisa ser único no **banco**, que
    // sobrevive ao processo, e não apenas nesta instância. Um contador que
    // recomeça do zero a cada boot devolvia `consent-sim-1` de novo depois de
    // o Render hibernar, colidia com a linha guardada em
    // `consentimento_externo_unico` e a conexão morria com erro de servidor.
    // Id de agregador de verdade também é opaco e global — o contador era
    // infidelidade da simulação, não simplificação.
    const idExterno = `consent-sim-${randomUUID()}`;
    const expiraEm = new Date();
    expiraEm.setMonth(expiraEm.getMonth() + MESES_DE_VALIDADE);
    // Um dia de folga: a constraint do banco exige expira_em <= criado_em + 12
    // meses, e o arredondamento do mês pode empatar exatamente no limite.
    expiraEm.setDate(expiraEm.getDate() - 1);

    this.sessoes.set(idExterno, {
      instituicaoId,
      nomeInstituicao: instituicao.nome,
      escopo,
      autorizado: false,
      expiraEm,
      contas: contasDe(instituicao, idExterno),
      movimentacoes: movimentacoesDe(idExterno),
      revogado: false,
    });

    return {
      idExterno,
      // No agregador real esta URL leva ao ambiente da instituição.
      urlDeAutorizacao: `https://simulado.openfinance.local/autorizar/${idExterno}`,
      expiraEm,
    };
  }

  /**
   * O que a `urlDeAutorizacao` faria no mundo real. Existe só no simulador —
   * não faz parte da interface, e é por aqui que o teste (e a tela, via rota de
   * simulação) diz "o usuário autorizou".
   */
  async simularAutorizacaoDoUsuario(idExterno: string): Promise<void> {
    this.exigirSessao(idExterno).autorizado = true;
  }

  async confirmarAutorizacao(idExterno: string): Promise<ContaExterna[]> {
    const sessao = this.exigirSessao(idExterno);
    if (!sessao.autorizado) {
      throw conflict('O consentimento ainda não foi autorizado no ambiente da instituição.');
    }
    return sessao.contas;
  }

  async listarMovimentacoes(idExterno: string, desde: string): Promise<MovimentacaoExterna[]> {
    const sessao = this.exigirSessao(idExterno);
    if (sessao.revogado) {
      throw conflict('Consentimento revogado.');
    }
    // Devolve sempre o mesmo conjunto: sincronizar de novo tem que ser inócuo
    // (RN19), e é aqui que o teste comprova isso.
    return sessao.movimentacoes.filter((m) => m.data >= desde);
  }

  async revogar(idExterno: string): Promise<void> {
    this.exigirSessao(idExterno).revogado = true;
  }

  /**
   * O provedor só conhece o que está na memória desta instância.
   *
   * Num agregador de verdade o consentimento vive do lado dele e atravessa
   * qualquer reinício nosso. Aqui não: o processo cai, o `Map` esvazia, e os
   * consentimentos que o nosso banco ainda lista deixam de existir para o
   * provedor. Isso é artefato do simulador, e some quando entrar um agregador
   * real (RNF18).
   *
   * Por isso 409 e não 404: para o usuário o banco *está* conectado — a linha
   * está lá, a tela mostra. O que ele precisa é reconectar, e a mensagem tem
   * que dizer isso em vez de afirmar que não existe.
   */
  private exigirSessao(idExterno: string): Sessao {
    const sessao = this.sessoes.get(idExterno);
    if (!sessao) {
      throw conflict(
        'A conexão com a instituição se perdeu no provedor. Conecte a instituição de novo.',
      );
    }
    return sessao;
  }
}

function contasDe(instituicao: InstituicaoFinanceira, semente: string): ContaExterna[] {
  return [
    {
      idExterno: `${semente}-conta-corrente`,
      nomeBanco: instituicao.nome,
      tipo: 'corrente',
      saldo: 1200,
    },
    {
      idExterno: `${semente}-conta-poupanca`,
      nomeBanco: instituicao.nome,
      tipo: 'poupanca',
      saldo: 3500,
    },
  ];
}

function movimentacoesDe(semente: string): MovimentacaoExterna[] {
  const corrente = `${semente}-conta-corrente`;
  return [
    {
      idExterno: `${semente}-mov-1`,
      contaIdExterno: corrente,
      tipo: 'entrada',
      valor: 1800,
      data: diasAtras(20),
      descricao: 'Estágio',
    },
    {
      idExterno: `${semente}-mov-2`,
      contaIdExterno: corrente,
      tipo: 'saida',
      valor: 89.9,
      data: diasAtras(12),
      descricao: 'Farmácia',
    },
    {
      idExterno: `${semente}-mov-3`,
      contaIdExterno: corrente,
      tipo: 'saida',
      valor: 45.5,
      data: diasAtras(4),
      descricao: 'Transporte',
    },
  ];
}

function diasAtras(dias: number): string {
  const data = new Date();
  data.setDate(data.getDate() - dias);
  return data.toISOString().slice(0, 10);
}
