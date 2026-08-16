/**
 * Formatação de número para texto que o usuário lê.
 *
 * A API responde em português, e algumas mensagens de domínio citam
 * quantidades — "há 0,03 kg de Caqui". Interpolar o número cru imprimiria
 * "0.03": ponto decimal, onde o app pede vírgula no campo de entrada. A pessoa
 * digita 0,23 e o erro fala de 0.03, como se fosse outra grandeza.
 *
 * Só para texto. Número em JSON continua sendo número, com ponto, porque quem
 * lê é o cliente e não uma pessoa.
 */

/** `0.03` → `"0,03"`; `2` → `"2"`. Três casas é o limite de `NUMERIC(12,3)`. */
export function quantidadeEmTexto(valor: number): string {
  const enxuto = Number.isInteger(valor) ? String(valor) : String(Number(valor.toFixed(3)));
  return enxuto.replace('.', ',');
}
