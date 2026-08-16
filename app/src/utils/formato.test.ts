/**
 * Formatação de quantidade na tela.
 *
 * O caso que motivou os testes: item pesado na balança, como os 0,26 kg de
 * caqui que vieram de uma nota real. O campo de entrada usa vírgula, e mostrar
 * ponto na mesma tela faz parecer que o app entendeu outro número.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { quantidade } from './formato';

describe('quantidade na tela', () => {
  test('inteiro não ganha casa decimal à toa', () => {
    assert.equal(quantidade(2), '2');
    assert.equal(quantidade(2, 'un'), '2 un');
  });

  test('fração sai com vírgula, como a pessoa digitou', () => {
    assert.equal(quantidade(0.23), '0,23');
    assert.equal(quantidade(0.26, 'kg'), '0,26 kg');
  });

  test('zero à direita não aparece', () => {
    // O banco guarda NUMERIC(12,3): 1.500 é 1,5 para quem lê.
    assert.equal(quantidade(1.5), '1,5');
  });

  test('não mostra mais casas do que a coluna guarda', () => {
    // Corta em três casas, o limite de NUMERIC(12,3).
    //
    // O arredondamento aqui é o do binário — 0,2345 é 0,23449… em double, e
    // desce para 0,234, enquanto o Postgres, que é decimal exato, subiria para
    // 0,235. A divergência não aparece na prática: o que a tela formata já
    // veio do banco arredondado, e um número com quatro casas nunca chega
    // desse caminho.
    assert.equal(quantidade(0.2345), '0,234');
  });

  test('zero é zero', () => {
    assert.equal(quantidade(0, 'kg'), '0 kg');
  });
});
