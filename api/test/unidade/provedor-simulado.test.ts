/**
 * Provedor simulado do Open Finance (RF034, RNF18).
 *
 * O que se defende aqui é a identidade do consentimento. O resto do módulo é
 * coberto por `integracao/openFinance.test.ts`, que roda com um provedor e um
 * banco criados juntos — e por isso não enxerga o que acontece quando o
 * processo reinicia e o banco continua de pé.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ProvedorSimulado } from '../../src/services/openFinance/provedorSimulado.js';

describe('RF034 — id do consentimento', () => {
  it('não se repete entre instâncias do provedor', async () => {
    // Duas instâncias representam dois ciclos de vida do processo: o Render
    // hiberna e sobe de novo, enquanto o Postgres guarda os consentimentos de
    // antes. Um id que reinicia com o processo colide com a linha antiga em
    // `consentimento_externo_unico` e derruba a conexão com erro de servidor.
    const antes = new ProvedorSimulado();
    const depois = new ProvedorSimulado();

    const primeiro = await antes.iniciarConsentimento('nubank', 'contas extrato');
    const segundo = await depois.iniciarConsentimento('nubank', 'contas extrato');

    assert.notEqual(primeiro.idExterno, segundo.idExterno);
  });

  it('não se repete dentro da mesma instância', async () => {
    const provedor = new ProvedorSimulado();

    const um = await provedor.iniciarConsentimento('itau', 'contas');
    const dois = await provedor.iniciarConsentimento('itau', 'contas');

    assert.notEqual(um.idExterno, dois.idExterno);
  });
});
