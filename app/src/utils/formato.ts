/** Formatação para leitura humana — pt-BR em todo o app. */

const moedaBRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function dinheiro(valor: number): string {
  return moedaBRL.format(valor);
}

/** "2026-08-11" -> "11/08". O ano só aparece quando não é o corrente. */
export function dataCurta(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  if (!ano || !mes || !dia) return iso;
  const anoAtual = String(new Date().getFullYear());
  return ano === anoAtual ? `${dia}/${mes}` : `${dia}/${mes}/${ano}`;
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** "2026-08" -> "agosto de 2026". */
export function mesPorExtenso(mesReferencia: string): string {
  const [ano, mes] = mesReferencia.split('-');
  const nome = MESES[Number(mes) - 1];
  return nome ? `${nome} de ${ano}` : mesReferencia;
}

/** Mês corrente no formato que a API espera (AAAA-MM). */
export function mesAtual(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Hoje no formato que a API espera (AAAA-MM-DD). */
export function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 135 -> "2h15". */
export function duracao(minutos: number): string {
  if (minutos < 60) return `${minutos}min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, '0')}`;
}

/**
 * Quantidade de estoque sem casas decimais inúteis: 2.000 -> "2".
 *
 * Vírgula, não ponto: o campo em que a pessoa digita usa vírgula, e mostrar
 * "0.23" onde ela escreveu "0,23" faz o app parecer que entendeu outro número.
 * Três casas é o limite da coluna (`NUMERIC(12,3)`) — mais dígitos aqui
 * mostrariam precisão que o banco não guarda.
 */
export function quantidade(valor: number, unidade?: string): string {
  const numero = Number.isInteger(valor) ? String(valor) : String(Number(valor.toFixed(3)));
  const comVirgula = numero.replace('.', ',');
  return unidade ? `${comVirgula} ${unidade}` : comVirgula;
}

/** Primeiro nome, para a saudação da banca. */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}
