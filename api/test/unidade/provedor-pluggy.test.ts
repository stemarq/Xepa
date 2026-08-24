/**
 * Adaptador da Pluggy (RF034–RF036, RNF18).
 *
 * O `fetch` é dublado: o que se testa é a tradução entre o formato da Pluggy e
 * o contrato de `ProvedorOpenFinance` — o que só se comprova contra o serviço
 * real é a credencial, e credencial não entra em suíte.
 *
 * O teste que mais importa aqui não é de formato: é o que garante que nenhuma
 * senha de usuário atravessa o backend (RNF18).
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

process.env.PLUGGY_CLIENT_ID = 'cliente-de-teste';
process.env.PLUGGY_CLIENT_SECRET = 'segredo-de-teste';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://teste/teste';

const { ProvedorPluggy } = await import('../../src/services/openFinance/provedorPluggy.js');

interface Chamada {
  url: string;
  metodo: string;
  corpo: unknown;
  cabecalhos: Record<string, string>;
}

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

/** Dubla o `fetch` e devolve o registro do que foi chamado. */
function dublar(respostas: Record<string, unknown>): Chamada[] {
  const chamadas: Chamada[] = [];

  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const caminho = String(url).replace('https://api.pluggy.ai', '');
    chamadas.push({
      url: caminho,
      metodo: init.method ?? 'GET',
      corpo: init.body ? JSON.parse(String(init.body)) : undefined,
      cabecalhos: (init.headers ?? {}) as Record<string, string>,
    });

    const chave = Object.keys(respostas).find((rota) => caminho.startsWith(rota));
    return {
      ok: true,
      status: 200,
      json: async () => (chave ? respostas[chave] : {}),
      text: async () => '',
    } as Response;
  }) as typeof fetch;

  return chamadas;
}

const AUTH = { '/auth': { apiKey: 'chave-de-2h' } };

describe('RNF18 — a senha do banco não passa pelo Xepa', () => {
  it('abre o consentimento sem nenhuma credencial de usuário no corpo', async () => {
    const chamadas = dublar({ ...AUTH, '/connect_token': { accessToken: 'token-do-widget' } });

    await new ProvedorPluggy().iniciarConsentimento('201', 'contas,extrato');

    const enviado = JSON.stringify(chamadas.map((c) => c.corpo));
    // O que sai daqui é id de conector e escopo. Qualquer campo de senha seria
    // a fronteira da RNF18 sendo cruzada.
    assert.ok(!/password|senha|credential|parameters/i.test(enviado), enviado);
  });

  it('nunca chama POST /items, que é a rota que aceita credencial', async () => {
    const chamadas = dublar({ ...AUTH, '/connect_token': { accessToken: 'x' } });

    await new ProvedorPluggy().iniciarConsentimento('201', 'contas');

    assert.ok(
      !chamadas.some((c) => c.url.startsWith('/items') && c.metodo === 'POST'),
      'a conexão precisa nascer no widget, não por credencial enviada daqui',
    );
  });
});

describe('RF034 — abertura do consentimento', () => {
  it('não devolve id externo: o vínculo só existe depois do widget', async () => {
    dublar({ ...AUTH, '/connect_token': { accessToken: 'token-do-widget' } });

    const provedor = new ProvedorPluggy();
    const externo = await provedor.iniciarConsentimento('201', 'contas');

    assert.equal(provedor.idNasceNoCliente, true);
    assert.equal(externo.idExterno, null);
    assert.equal(externo.tokenDoCliente, 'token-do-widget');
    assert.match(externo.urlDeAutorizacao, /connect_token=token-do-widget/);
  });

  it('RN21 — o prazo cabe no teto de 12 meses', async () => {
    dublar({ ...AUTH, '/connect_token': { accessToken: 'x' } });

    const { expiraEm } = await new ProvedorPluggy().iniciarConsentimento('201', 'contas');

    const teto = new Date();
    teto.setMonth(teto.getMonth() + 12);
    assert.ok(expiraEm < teto);
    assert.ok(expiraEm > new Date());
  });

  it('pede o widget já na instituição escolhida', async () => {
    const chamadas = dublar({ ...AUTH, '/connect_token': { accessToken: 'x' } });

    await new ProvedorPluggy().iniciarConsentimento('201', 'contas');

    const corpo = chamadas.find((c) => c.url === '/connect_token')?.corpo as {
      options: { connectorIds: number[] };
    };
    assert.deepEqual(corpo.options.connectorIds, [201]);
  });
});

describe('autenticação', () => {
  it('reaproveita a API key entre chamadas', async () => {
    const chamadas = dublar({ ...AUTH, '/connectors': { results: [] } });

    const provedor = new ProvedorPluggy();
    await provedor.listarInstituicoes();
    await provedor.listarInstituicoes();

    assert.equal(chamadas.filter((c) => c.url === '/auth').length, 1);
  });

  it('manda a API key no cabeçalho, nunca na URL', async () => {
    const chamadas = dublar({ ...AUTH, '/connectors': { results: [] } });

    await new ProvedorPluggy().listarInstituicoes();

    const consulta = chamadas.find((c) => c.url.startsWith('/connectors'));
    assert.equal(consulta?.cabecalhos['X-API-KEY'], 'chave-de-2h');
    assert.ok(!consulta?.url.includes('chave-de-2h'));
  });
});

describe('tradução dos dados', () => {
  it('connector vira instituição com id em texto', async () => {
    dublar({ ...AUTH, '/connectors': { results: [{ id: 201, name: 'Itaú' }] } });

    const instituicoes = await new ProvedorPluggy().listarInstituicoes();

    assert.deepEqual(instituicoes, [{ id: '201', nome: 'Itaú' }]);
  });

  it('o sinal do valor separa entrada de saída', async () => {
    dublar({
      ...AUTH,
      '/accounts': { results: [{ id: 'c1', type: 'BANK', balance: 10 }] },
      '/transactions': {
        totalPages: 1,
        results: [
          { id: 't1', accountId: 'c1', amount: -52.4, date: '2026-08-10T00:00:00Z', description: 'MERCADO' },
          { id: 't2', accountId: 'c1', amount: 1200, date: '2026-08-05T00:00:00Z', description: 'SALARIO' },
        ],
      },
    });

    const movimentacoes = await new ProvedorPluggy().listarMovimentacoes('item-1', '2026-08-01');

    assert.equal(movimentacoes[0]!.tipo, 'saida');
    // O valor viaja sempre positivo: quem sabe o sentido é o campo `tipo`.
    assert.equal(movimentacoes[0]!.valor, 52.4);
    assert.equal(movimentacoes[0]!.data, '2026-08-10');
    assert.equal(movimentacoes[1]!.tipo, 'entrada');
    assert.equal(movimentacoes[1]!.valor, 1200);
  });

  it('poupança é reconhecida pelo subtipo', async () => {
    dublar({
      ...AUTH,
      '/accounts': {
        results: [{ id: 'c1', type: 'BANK', subtype: 'SAVINGS_ACCOUNT', balance: 300 }],
      },
    });

    const contas = await new ProvedorPluggy().confirmarAutorizacao('item-1');

    assert.equal(contas[0]!.tipo, 'poupanca');
  });

  it('vínculo ainda sem contas não passa por autorizado', async () => {
    // Sucesso com zero contas deixaria o consentimento ativo sem nada para
    // sincronizar — o estado real é "a instituição ainda está liberando".
    dublar({ ...AUTH, '/accounts': { results: [] } });

    await assert.rejects(
      () => new ProvedorPluggy().confirmarAutorizacao('item-1'),
      /instantes|liberando/i,
    );
  });
});

describe('RF036 — revogação', () => {
  it('apaga o vínculo no provedor', async () => {
    const chamadas = dublar({ ...AUTH, '/items': {} });

    await new ProvedorPluggy().revogar('item-1');

    const apagou = chamadas.find((c) => c.metodo === 'DELETE');
    assert.equal(apagou?.url, '/items/item-1');
  });
});

describe('falhas do provedor', () => {
  it('provedor fora do ar não vira erro interno do Xepa', async () => {
    globalThis.fetch = (async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }) as typeof fetch;

    await assert.rejects(
      () => new ProvedorPluggy().listarInstituicoes(),
      /provedor de Open Finance/i,
    );
  });
});
