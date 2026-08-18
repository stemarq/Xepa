/**
 * Contratos da API (`docs/07-api.md`), do lado do cliente.
 *
 * São os mesmos formatos que os Services do backend devolvem — mantidos aqui
 * à mão, e não gerados, porque o app é o único consumidor e a duplicação é
 * pequena. Se divergir, a fonte da verdade é `api/src/models/`.
 */

// ---------- Conta ----------

export interface Avatar {
  id: number;
  descricao: string;
  url: string;
}

export interface Instituicao {
  id: number;
  nome: string;
}

export interface Perfil {
  id: number;
  nome: string;
  email: string;
  avatar: Avatar | null;
  instituicao: Instituicao | null;
  criadoEm: string;
}

export interface Sessao {
  token: string;
  expiraEm: string;
  usuario: Perfil;
}

// ---------- Despensa ----------

export interface Produto {
  id: number;
  nome: string;
  categoria: string | null;
  unidade: string;
  quantidadeAtual: number;
  monitorado: boolean;
  quantidadeMinima: number | null;
  /** RN08 — item monitorado que atingiu a mínima. */
  emAlerta: boolean;
  criadoEm: string;
}

export interface ResultadoConsumo {
  produto: Produto;
  /** RN08 — presente quando a baixa levou o item ao limite. */
  alertaReposicao: { mensagem: string } | null;
}

export interface ResultadoEntrada {
  produto: Produto;
  /** RN08 — a reposição tirou o item do alerta. */
  alertaResolvido: boolean;
}

// ---------- Grana ----------

export type TipoTransacao = 'entrada' | 'saida';
export type OrigemTransacao = 'automatica' | 'manual' | 'nota' | 'open_finance';

export interface Conta {
  id: number;
  nomeBanco: string;
  saldoInicial: number;
  entradas: number;
  saidas: number;
  /** RN10 — inicial + entradas − saídas. */
  saldo: number;
}

export interface Categoria {
  id: number;
  nome: string;
}

export interface Transacao {
  id: number;
  tipo: TipoTransacao;
  valor: number;
  data: string;
  origem: OrigemTransacao;
  descricao: string | null;
  categoria: Categoria | null;
  conta: { id: number; nomeBanco: string } | null;
  notaFiscalId: number | null;
}

export interface Orcamento {
  id: number;
  categoria: Categoria;
  mesReferencia: string;
  valorLimite: number;
  gasto: number;
  restante: number;
  percentual: number;
  /** RN12 — a partir de 80% do limite. */
  emAlerta: boolean;
  estourado: boolean;
}

export interface AlertaOrcamento {
  categoria: string;
  mesReferencia: string;
  valorLimite: number;
  gasto: number;
  percentual: number;
  estourado: boolean;
  mensagem: string;
}

export interface ResultadoLancamento {
  transacao: Transacao;
  alertaOrcamento: AlertaOrcamento | null;
  saldoConta: Conta | null;
}

export interface Resumo {
  periodo: { de: string; ate: string };
  entradas: number;
  /** RN11 — despesas do período, só a partir de TRANSACAO. */
  saidas: number;
  resultado: number;
  gastosPorCategoria: Array<{
    categoria: Categoria | null;
    total: number;
    percentual: number;
  }>;
  contas: Conta[];
  saldoTotal: number;
}

// ---------- Cabeça ----------

export type MetodoMedia = 'simples' | 'ponderada';

export interface Materia {
  id: number;
  nome: string;
  metodoMedia: MetodoMedia;
  /** RN15 — `null` enquanto não houver avaliação. */
  media: number | null;
  totalAvaliacoes: number;
  totalMinutosEstudo: number;
}

export interface Avaliacao {
  id: number;
  descricao: string;
  valor: number;
  peso: number;
  data: string;
  origem: 'manual' | 'importada';
}

export interface EstatisticasEstudo {
  totalSessoes: number;
  totalMinutos: number;
  mediaMinutosPorSessao: number;
  maiorSessaoMin: number;
  ultimaSessao: string | null;
  porMes: Array<{ mes: string; minutos: number; sessoes: number }>;
}

export interface Panorama {
  materias: Materia[];
  mediaGeral: number | null;
  estudo: EstatisticasEstudo;
  estudoPorMateria: Array<{ materia: string; minutos: number; sessoes: number }>;
}

export type Tendencia = 'subindo' | 'caindo' | 'estavel' | 'indefinida';

/** RF027 — a série que o backend já calcula para a evolução de notas. */
export interface Progressao {
  /** Cada avaliação em ordem cronológica, com a média até aquele ponto. */
  pontos: Array<{ data: string; descricao: string; valor: number; mediaAcumulada: number }>;
  primeira: number | null;
  ultima: number | null;
  variacao: number | null;
  tendencia: Tendencia;
}

/** SD20 — desempenho de uma matéria (RF026, RF027, RF028). */
export interface DesempenhoMateria {
  materia: { id: number; nome: string; metodoMedia: MetodoMedia };
  media: number | null;
  avaliacoes: Avaliacao[];
  progressao: Progressao;
  estudo: EstatisticasEstudo;
}

// ---------- Roupa ----------

export type StatusLavagem = 'agendada' | 'concluida' | 'cancelada';

export interface Peca {
  id: number;
  nome: string;
  tipo: string | null;
  limiteUsos: number;
  usosAtuais: number;
  /** RN14 — atingiu o limite de usos. */
  precisaLavar: boolean;
  usosRestantes: number;
  /** RF038 — se há foto; a imagem vem por `/roupa/pecas/:id/foto`. */
  temFoto: boolean;
  /** Muda quando a foto é trocada — é o que invalida o cache da imagem. */
  fotoEm: string | null;
}

export interface ResultadoUso {
  peca: Peca;
  alertaLavagem: { mensagem: string } | null;
}

export interface Lavagem {
  id: number;
  dataAgendada: string;
  status: StatusLavagem;
  lembreteAtivo: boolean;
  pecas: Array<{ id: number; nome: string }>;
}

export interface AlertaLavanderia {
  lavagensProximas: Lavagem[];
  insumos: Array<{
    produtoId: number | null;
    nome: string;
    quantidadeAtual: number | null;
    unidade: string | null;
    emFalta: boolean;
    naoCadastrado: boolean;
  }>;
  faltando: string[];
  mensagem: string | null;
}

// ---------- Open Finance (RF034–RF037) ----------

export type StatusConsentimento = 'pendente' | 'ativo' | 'expirado' | 'revogado';

export interface InstituicaoOpenFinance {
  id: string;
  nome: string;
}

export interface ContaConectada {
  id: number;
  id_externo: string;
  nome_banco: string;
  tipo: string;
}

export interface ConexaoOpenFinance {
  id: number;
  instituicao: string;
  /** RF037 — o que foi consentido, visível para o usuário. */
  escopo: string;
  status: StatusConsentimento;
  expiraEm: string;
  revogadoEm: string | null;
  contas: ContaConectada[];
}

/** RN19/RN20 — o que a sincronização fez. */
export interface ResumoDaSincronizacao {
  importadas: number;
  conciliadas: number;
  ignoradas: number;
}

// ---------- Nota fiscal (RF008, RN22) ----------

export interface ItemDaNota {
  descricao: string;
  quantidade: number;
  valorUnitario: number;
}

export interface NotaLida {
  chaveAcesso: string;
  localCompra: string | null;
  dataCompra: string;
  itens: ItemDaNota[];
}

/** O produto da despensa que a descrição truncada da nota provavelmente é. */
export interface SugestaoDeProduto {
  produtoId: number;
  nome: string;
  confianca: number;
}

export interface ItemConsultado {
  descricao: string;
  quantidade: number;
  unidade: string | null;
  valorUnitario: number;
  /** `null` é "não sei", não "é novo" — quem decide é o usuário (RN22). */
  sugestao: SugestaoDeProduto | null;
}

export interface NotaConsultada {
  chaveAcesso: string;
  localCompra: string | null;
  dataCompra: string | null;
  valorTotal: number | null;
  itens: ItemConsultado[];
}

/** RN22 — a consulta é uma tentativa: `consultada: false` cai no manual. */
export interface ResultadoDaConsulta {
  consultada: boolean;
  chaveAcesso: string;
  nota: NotaConsultada | null;
  motivo: string | null;
}

export interface ResultadoDaNota {
  notaFiscalId: number;
  transacaoId: number;
  /** RN18 — o total entra como gasto na categoria "Mercado". */
  gasto: number;
  itens: Array<{ descricao: string; quantidade: number; produto: Produto }>;
  /** Itens que saíram do alerta de reposição por causa desta nota (RN08). */
  alertasResolvidos: string[];
}
