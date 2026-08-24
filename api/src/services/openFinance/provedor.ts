/**
 * A fronteira com o Open Finance (RNF18).
 *
 * O Xepa não é instituição participante: não tem registro no Diretório de
 * Participantes, nem certificado ICP-Brasil, nem mTLS. Quem fala com os bancos
 * é um provedor autorizado pelo Banco Central (um agregador como Pluggy, Belvo
 * ou Klavi).
 *
 * Esta interface é o contrato com esse provedor, e o Service só conhece ela.
 * Hoje quem a implementa é o simulador em `provedorSimulado.ts`; trocar por um
 * agregador de verdade é escrever outra implementação e mudar a linha que
 * escolhe qual usar — nada no Service muda.
 *
 * O que **nunca** atravessa esta fronteira: senha, token de banco ou qualquer
 * credencial do usuário. O usuário se autentica no ambiente da instituição; o
 * que volta para cá é o consentimento e os dados consentidos.
 */

export interface InstituicaoFinanceira {
  id: string;
  nome: string;
}

export interface ContaExterna {
  idExterno: string;
  nomeBanco: string;
  tipo: 'corrente' | 'poupanca' | 'pagamento';
  saldo: number;
}

export interface MovimentacaoExterna {
  idExterno: string;
  contaIdExterno: string;
  tipo: 'entrada' | 'saida';
  valor: number;
  /** ISO `YYYY-MM-DD`. */
  data: string;
  descricao: string;
}

export interface ConsentimentoExterno {
  /**
   * Id do consentimento no provedor, quando ele já existe neste ponto.
   *
   * `null` nos provedores que só criam o id no fim do fluxo — é o caso de um
   * widget, em que o vínculo nasce depois de o usuário autenticar e quem
   * recebe o id primeiro é o cliente. Nesse caso o Service grava um id
   * provisório e o substitui em `confirmarAutorizacao`.
   */
  idExterno: string | null;
  /** Onde o usuário autoriza, no ambiente da instituição — fora do Xepa. */
  urlDeAutorizacao: string;
  /**
   * Credencial de curta duração que o cliente usa para abrir o widget do
   * provedor. Não é sessão do Xepa e não dá acesso a nada nosso; vai para o
   * app justamente para que a senha do banco seja digitada lá, e não aqui
   * (RNF18).
   */
  tokenDoCliente?: string;
  expiraEm: Date;
}

export interface ProvedorOpenFinance {
  listarInstituicoes(): Promise<InstituicaoFinanceira[]>;

  /** SD25 — abre o consentimento e devolve para onde mandar o usuário. */
  iniciarConsentimento(
    instituicaoId: string,
    escopo: string,
  ): Promise<ConsentimentoExterno>;

  /**
   * SD25 — confirma que o usuário autorizou e devolve as contas destravadas.
   * Lança se o consentimento não tiver sido autorizado.
   *
   * `idExterno` é o id definitivo: o que `iniciarConsentimento` devolveu, ou o
   * que o cliente informou quando o provedor só cria o vínculo no fim.
   */
  confirmarAutorizacao(idExterno: string): Promise<ContaExterna[]>;

  /**
   * O provedor cria o id só no fim do fluxo, no cliente?
   *
   * Distingue os dois modelos sem que o Service precise saber qual provedor
   * está em uso: quando `true`, o `id_externo` gravado no início é provisório
   * e a autorização exige o id que o cliente traz de volta.
   */
  readonly idNasceNoCliente: boolean;

  /** SD26 — movimentação das contas consentidas a partir de uma data. */
  listarMovimentacoes(idExterno: string, desde: string): Promise<MovimentacaoExterna[]>;

  /** SD27 — revoga do lado da instituição. */
  revogar(idExterno: string): Promise<void>;
}
