/**
 * Provedor real: Pluggy, agregador autorizado pelo Banco Central.
 *
 * O Xepa não é instituição participante (RNF18) — quem tem registro no
 * Diretório de Participantes, certificado e mTLS é a Pluggy. Esta classe é a
 * única parte do sistema que sabe que ela existe.
 *
 * **A senha do banco nunca passa por aqui.** A Pluggy tem uma rota que aceita
 * credenciais direto (`POST /items`), e ela está deliberadamente fora deste
 * arquivo: usá-la faria a senha do usuário atravessar o servidor do Xepa, que
 * é exatamente o que a RNF18 proíbe. O caminho usado é o widget: o backend
 * emite um *connect token* de curta duração, o app abre o widget com ele, e a
 * autenticação acontece no domínio da Pluggy.
 *
 * Consequência disso: o vínculo (`item`) só existe depois que o usuário
 * termina, e quem recebe o id primeiro é o cliente. Daí `idNasceNoCliente`.
 *
 * Autenticação com a Pluggy são dois níveis, e não se confundem:
 *   * **API key** — 2 h, backend, lê os dados do usuário. Fica só aqui.
 *   * **connect token** — 30 min, vai para o app, serve só para abrir o widget.
 */

import { env } from '../../config/env.js';
import { conflict, notFound } from '../../utils/errors.js';
import type {
  ConsentimentoExterno,
  ContaExterna,
  InstituicaoFinanceira,
  MovimentacaoExterna,
  ProvedorOpenFinance,
} from './provedor.js';

const BASE = 'https://api.pluggy.ai';

/** A API key vale 2 h; renovamos com folga para não cair no meio de uma chamada. */
const VALIDADE_DA_CHAVE_MS = 100 * 60 * 1000;

/** Prazo do consentimento que o Xepa registra. A RN21 limita o teto a 12 meses. */
const MESES_DE_VALIDADE = 12;

interface RespostaConnector {
  id: number;
  name: string;
}

interface RespostaConta {
  id: string;
  type: string;
  subtype?: string;
  name?: string;
  balance: number;
}

interface RespostaTransacao {
  id: string;
  accountId: string;
  amount: number;
  date: string;
  description: string;
}

export class ProvedorPluggy implements ProvedorOpenFinance {
  /** O `item` da Pluggy nasce no widget, não aqui. */
  readonly idNasceNoCliente = true;

  private chave: { valor: string; expiraEm: number } | null = null;

  // ---------------------------------------------------------------
  // Autenticação
  // ---------------------------------------------------------------

  /**
   * API key do backend, renovada sob demanda.
   *
   * Guardada em memória de propósito: é credencial de curta duração e derivada
   * — perder no restart custa uma chamada, enquanto gravá-la seria mais um
   * segredo a proteger sem ganho nenhum.
   */
  private async apiKey(): Promise<string> {
    if (this.chave && this.chave.expiraEm > Date.now()) return this.chave.valor;

    const { apiKey } = await this.chamar<{ apiKey: string }>('/auth', {
      metodo: 'POST',
      corpo: {
        clientId: env.pluggy.clientId,
        clientSecret: env.pluggy.clientSecret,
      },
      semChave: true,
    });

    this.chave = { valor: apiKey, expiraEm: Date.now() + VALIDADE_DA_CHAVE_MS };
    return apiKey;
  }

  private async chamar<T>(
    caminho: string,
    opcoes: {
      metodo?: 'GET' | 'POST' | 'DELETE';
      corpo?: unknown;
      semChave?: boolean;
    } = {},
  ): Promise<T> {
    const { metodo = 'GET', corpo, semChave = false } = opcoes;

    let resposta: Response;
    try {
      resposta = await fetch(`${BASE}${caminho}`, {
        method: metodo,
        headers: {
          ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(semChave ? {} : { 'X-API-KEY': await this.apiKey() }),
        },
        ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
      });
    } catch {
      // Provedor fora do ar não é erro do usuário, e a mensagem precisa dizer
      // isso — senão vira "erro interno" e parece defeito do Xepa.
      throw conflict('Não consegui falar com o provedor de Open Finance. Tente mais tarde.');
    }

    if (resposta.status === 401 || resposta.status === 403) {
      // Chave vencida ou revogada: descarta para a próxima chamada renovar.
      this.chave = null;
      throw conflict('O provedor de Open Finance recusou nossas credenciais.');
    }
    if (resposta.status === 404) {
      throw notFound('Vínculo não encontrado no provedor de Open Finance.');
    }
    if (!resposta.ok) {
      const texto = await resposta.text().catch(() => '');
      // O detalhe da Pluggy vai para o log, não para o usuário: costuma citar
      // campo e conector, que não dizem nada a quem está com o app na mão.
      console.error('[open-finance] Pluggy respondeu', resposta.status, texto.slice(0, 500));
      throw conflict('O provedor de Open Finance recusou a operação.');
    }

    if (resposta.status === 204) return undefined as T;
    return (await resposta.json()) as T;
  }

  // ---------------------------------------------------------------
  // Contrato
  // ---------------------------------------------------------------

  /**
   * Os "connectors" da Pluggy são as instituições. O id é numérico lá e string
   * aqui — a interface não precisa saber de que tipo é o id do provedor.
   */
  async listarInstituicoes(): Promise<InstituicaoFinanceira[]> {
    // Os conectores de teste ficam fora da listagem por padrão, do lado da
    // Pluggy: são bancos que não existem, e mostrá-los a um usuário real seria
    // oferecer uma conexão que não leva a lugar nenhum.
    const filtro = env.pluggy.sandbox ? '?sandbox=true' : '';
    const { results } = await this.chamar<{ results: RespostaConnector[] }>(
      `/connectors${filtro}`,
    );
    return results.map((conector) => ({ id: String(conector.id), nome: conector.name }));
  }

  /**
   * Emite o connect token e devolve para onde mandar o usuário.
   *
   * Sem `idExterno`: o `item` só existe depois do widget. O `connectorId` vai
   * junto para o widget já abrir na instituição escolhida, em vez de pedir que
   * a pessoa procure de novo numa lista que ela acabou de usar.
   */
  async iniciarConsentimento(
    instituicaoId: string,
    escopo: string,
  ): Promise<ConsentimentoExterno> {
    // `escopo` não vai no corpo: a Pluggy não tem esse campo e ignora o que não
    // conhece. Quem registra o escopo consentido é o nosso `consentimento`
    // (RF037) — mandar para cá dava a falsa impressão de que a Pluggy o aplica.
    void escopo;
    const { accessToken } = await this.chamar<{ accessToken: string }>('/connect_token', {
      metodo: 'POST',
      corpo: { options: { connectorIds: [Number(instituicaoId)] } },
    });

    const expiraEm = new Date();
    expiraEm.setMonth(expiraEm.getMonth() + MESES_DE_VALIDADE);
    // Um dia de folga: a constraint exige expira_em <= criado_em + 12 meses, e
    // o arredondamento de mês pode empatar exatamente no limite.
    expiraEm.setDate(expiraEm.getDate() - 1);

    return {
      idExterno: null,
      urlDeAutorizacao: `https://connect.pluggy.ai/?connect_token=${accessToken}`,
      tokenDoCliente: accessToken,
      expiraEm,
    };
  }

  /**
   * Lê as contas do `item` que o widget criou.
   *
   * Vazio aqui significa vínculo que ainda não terminou de sincronizar do lado
   * da Pluggy — não é sucesso com zero contas, e virar sucesso deixaria o
   * consentimento "ativo" sem nada para sincronizar depois.
   */
  async confirmarAutorizacao(idExterno: string): Promise<ContaExterna[]> {
    const { results } = await this.chamar<{ results: RespostaConta[] }>(
      `/accounts?itemId=${encodeURIComponent(idExterno)}`,
    );

    if (results.length === 0) {
      throw conflict('A instituição ainda está liberando os dados. Tente de novo em instantes.');
    }

    return results.map((conta) => ({
      idExterno: conta.id,
      nomeBanco: conta.name ?? 'Conta',
      tipo: tipoDaConta(conta),
      saldo: conta.balance,
    }));
  }

  /**
   * Extrato das contas do vínculo, a partir de `desde`.
   *
   * A Pluggy pagina por cursor e devolve transação por **conta**, não por
   * item, então é uma varredura: contas primeiro, transações de cada uma
   * depois. O sinal do valor é o que separa entrada de saída — a Pluggy manda
   * negativo para débito.
   */
  async listarMovimentacoes(idExterno: string, desde: string): Promise<MovimentacaoExterna[]> {
    const { results: contas } = await this.chamar<{ results: RespostaConta[] }>(
      `/accounts?itemId=${encodeURIComponent(idExterno)}`,
    );

    const movimentacoes: MovimentacaoExterna[] = [];
    for (const conta of contas) {
      let pagina = 1;
      // Laço com teto: um cursor que não avança não pode virar consulta
      // infinita contra o provedor.
      for (let volta = 0; volta < 20; volta += 1) {
        const { results, totalPages } = await this.chamar<{
          results: RespostaTransacao[];
          totalPages: number;
        }>(
          `/transactions?accountId=${encodeURIComponent(conta.id)}` +
            `&from=${encodeURIComponent(desde)}&page=${pagina}&pageSize=500`,
        );

        for (const transacao of results) {
          movimentacoes.push({
            idExterno: transacao.id,
            contaIdExterno: transacao.accountId,
            tipo: transacao.amount < 0 ? 'saida' : 'entrada',
            valor: Math.abs(transacao.amount),
            data: transacao.date.slice(0, 10),
            descricao: transacao.description,
          });
        }

        if (pagina >= totalPages) break;
        pagina += 1;
      }
    }

    return movimentacoes;
  }

  /**
   * Apagar o `item` é como se revoga na Pluggy: some o vínculo e, com ele, o
   * acesso continuado aos dados. O que já importamos é nosso e fica (RN21).
   */
  async revogar(idExterno: string): Promise<void> {
    await this.chamar<void>(`/items/${encodeURIComponent(idExterno)}`, { metodo: 'DELETE' });
  }
}

/**
 * A Pluggy classifica em BANK/CREDIT com subtipo; o Xepa só distingue os três
 * tipos que a `conta_bancaria` aceita. Sem correspondência, "corrente" é o
 * padrão da coluna e o palpite mais seguro.
 */
function tipoDaConta(conta: RespostaConta): ContaExterna['tipo'] {
  const subtipo = (conta.subtype ?? '').toUpperCase();
  if (subtipo.includes('SAVING')) return 'poupanca';
  if (subtipo.includes('PAYMENT') || (conta.type ?? '').toUpperCase() === 'CREDIT') {
    return 'pagamento';
  }
  return 'corrente';
}
