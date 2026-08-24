/**
 * Tokens de sessão e de recuperação (RNF07, RNF09).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  expiraEm,
  expiraEmDias,
  gerarToken,
  hashToken,
  hashesIguais,
} from '../../src/utils/token.js';

describe('gerarToken', () => {
  it('gera 256 bits em base64url, seguro para URL', () => {
    const token = gerarToken();

    assert.match(token, /^[A-Za-z0-9_-]+$/);
    assert.equal(Buffer.from(token, 'base64url').length, 32);
  });

  it('não repete', () => {
    const tokens = new Set(Array.from({ length: 100 }, gerarToken));

    assert.equal(tokens.size, 100);
  });
});

describe('RNF07 — hashToken', () => {
  it('devolve SHA-256 em hexadecimal, determinístico', () => {
    const token = gerarToken();

    assert.match(hashToken(token), /^[0-9a-f]{64}$/);
    assert.equal(hashToken(token), hashToken(token));
  });

  it('não devolve o próprio token', () => {
    const token = gerarToken();

    assert.notEqual(hashToken(token), token);
  });

  it('tokens diferentes dão hashes diferentes', () => {
    assert.notEqual(hashToken(gerarToken()), hashToken(gerarToken()));
  });
});

describe('hashesIguais', () => {
  it('reconhece hashes iguais', () => {
    const hash = hashToken('qualquer');

    assert.equal(hashesIguais(hash, hash), true);
  });

  it('rejeita hashes diferentes', () => {
    assert.equal(hashesIguais(hashToken('a'), hashToken('b')), false);
  });

  it('rejeita comprimentos diferentes sem estourar', () => {
    assert.equal(hashesIguais(hashToken('a'), 'ab'), false);
  });
});

describe('RNF09 — expiraEm', () => {
  it('projeta o instante à frente pelos minutos pedidos', () => {
    const antes = Date.now();

    const prazo = expiraEm(30);

    const decorrido = prazo.getTime() - antes;
    assert.ok(decorrido >= 30 * 60_000);
    assert.ok(decorrido < 30 * 60_000 + 5_000);
  });
});

describe('RF039 — expiraEmDias', () => {
  it('converte dias em minutos', () => {
    const antes = Date.now();

    const prazo = expiraEmDias(30);

    const decorrido = prazo.getTime() - antes;
    assert.ok(decorrido >= 30 * 24 * 60 * 60_000);
    assert.ok(decorrido < 30 * 24 * 60 * 60_000 + 5_000);
  });
});
