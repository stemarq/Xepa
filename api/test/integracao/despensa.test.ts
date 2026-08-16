/**
 * Módulo 2 — Despensa (SD06–SD10).
 *
 * Cobre RF008–RF013 e RF016 e as regras RN06 (nota lida uma vez só), RN07
 * (baixa não deixa o estoque negativo), RN08 (alerta configurável por item) e
 * RN18 (nota de mercado vira transação na categoria "Mercado").
 */

import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { prepararBanco } from '../apoio/banco.js';
import { subirApi } from '../apoio/http.js';
import { criarConta, reiniciarContador } from '../apoio/conta.js';
import type { ContaDeTeste } from '../apoio/conta.js';

const banco = await prepararBanco();
const api = await subirApi();

after(() => api.encerrar());

let conta: ContaDeTeste;

beforeEach(async () => {
  await banco.limpar();
  reiniciarContador();
  conta = await criarConta(api.cliente);
});

async function criarProduto(dados: Record<string, unknown>) {
  const resposta = await conta.cliente.post('/despensa/produtos', dados);
  assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
  return resposta.corpo.produto;
}

/** Nota fiscal mínima, com chave de 44 dígitos como a NFC-e exige. */
function nota(campos: Record<string, unknown> = {}) {
  return {
    chaveAcesso: '3'.repeat(44),
    localCompra: 'Mercado do Zé',
    dataCompra: '2026-08-10',
    itens: [{ descricao: 'Arroz', quantidade: 2, valorUnitario: 25.5 }],
    ...campos,
  };
}

describe('SD07 — cadastro e edição manual (RF009)', () => {
  it('cria o item com a quantidade inicial já lançada como movimentação', async () => {
    const produto = await criarProduto({
      nome: 'Arroz',
      categoria: 'Mantimentos',
      unidade: 'kg',
      quantidadeInicial: 5,
    });

    assert.equal(produto.quantidadeAtual, 5);
    assert.equal(produto.emAlerta, false);

    const { rows } = await banco.query<{ tipo: string; quantidade: number }>(
      'SELECT tipo, quantidade FROM movimentacao_estoque WHERE produto_id = $1',
      [produto.id],
    );
    assert.deepEqual(rows, [{ tipo: 'entrada', quantidade: 5 }]);
  });

  it('item sem quantidade inicial nasce zerado e sem movimentação', async () => {
    const produto = await criarProduto({ nome: 'Feijão' });

    assert.equal(produto.quantidadeAtual, 0);
    const { rowCount } = await banco.query(
      'SELECT 1 FROM movimentacao_estoque WHERE produto_id = $1',
      [produto.id],
    );
    assert.equal(rowCount, 0);
  });

  it('recusa item repetido, ignorando caixa e espaços', async () => {
    await criarProduto({ nome: 'Arroz' });

    const repetido = await conta.cliente.post('/despensa/produtos', { nome: '  arroz  ' });

    assert.equal(repetido.status, 409);
  });

  it('RN08 — monitorar sem informar a quantidade mínima é recusado', async () => {
    const resposta = await conta.cliente.post('/despensa/produtos', {
      nome: 'Café',
      monitorado: true,
    });

    assert.equal(resposta.status, 400);
    assert.match(resposta.corpo.erro.mensagem, /quantidade mínima/i);
  });

  it('a edição não mexe no estoque — quantidade só muda por movimentação', async () => {
    const produto = await criarProduto({ nome: 'Arroz', quantidadeInicial: 5 });

    const resposta = await conta.cliente.put(`/despensa/produtos/${produto.id}`, {
      nome: 'Arroz integral',
      categoria: 'Mantimentos',
    });

    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.produto.nome, 'Arroz integral');
    assert.equal(resposta.corpo.produto.quantidadeAtual, 5);
  });

  it('a edição recusa nome que já é de outro item', async () => {
    await criarProduto({ nome: 'Arroz' });
    const feijao = await criarProduto({ nome: 'Feijão' });

    const resposta = await conta.cliente.put(`/despensa/produtos/${feijao.id}`, {
      nome: 'Arroz',
    });

    assert.equal(resposta.status, 409);
  });

  it('renomear para o próprio nome continua valendo', async () => {
    const arroz = await criarProduto({ nome: 'Arroz' });

    const resposta = await conta.cliente.put(`/despensa/produtos/${arroz.id}`, {
      nome: 'Arroz',
      categoria: 'Mantimentos',
    });

    assert.equal(resposta.status, 200);
  });
});

describe('RF010 — quantidade fracionada', () => {
  it('baixa fracionada não perde precisão', async () => {
    // Item pesado na balança: a nota traz 0,26 kg, e o consumo é em fração.
    const produto = await criarProduto({ nome: 'Caqui', unidade: 'kg', quantidadeInicial: 0.26 });

    const resposta = await conta.cliente.post(`/despensa/produtos/${produto.id}/consumo`, {
      quantidade: 0.23,
    });

    assert.equal(resposta.status, 200);
    // Exato, não 0.030000000000000002: NUMERIC é decimal, não binário.
    assert.equal(resposta.corpo.produto.quantidadeAtual, 0.03);
  });

  it('a mensagem de estoque insuficiente fala em vírgula, não em ponto', async () => {
    // O campo pede "0,23"; um erro dizendo "0.03" parece falar de outro número.
    const produto = await criarProduto({ nome: 'Caqui', unidade: 'kg', quantidadeInicial: 0.03 });

    const resposta = await conta.cliente.post(`/despensa/produtos/${produto.id}/consumo`, {
      quantidade: 1,
    });

    assert.equal(resposta.status, 422);
    assert.match(resposta.corpo.erro.mensagem, /0,03 kg/);
  });

  it('consumir o resto exato zera o item', async () => {
    const produto = await criarProduto({ nome: 'Caqui', unidade: 'kg', quantidadeInicial: 0.23 });

    const resposta = await conta.cliente.post(`/despensa/produtos/${produto.id}/consumo`, {
      quantidade: 0.23,
    });

    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.produto.quantidadeAtual, 0);
  });
});

describe('RF010 — entrada sem nota e sem preço', () => {
  it('repõe o estoque de um item que já existe', async () => {
    // O caso que motivou a rota: ganhar um produto. Sem ela, a única forma de
    // aumentar a quantidade era lançar uma nota, que exige valor unitário.
    const produto = await criarProduto({ nome: 'Arroz', quantidadeInicial: 1 });

    const resposta = await conta.cliente.post(`/despensa/produtos/${produto.id}/entrada`, {
      quantidade: 2,
    });

    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.produto.quantidadeAtual, 3);

    const { rows } = await banco.query<{ tipo: string }>(
      'SELECT tipo FROM movimentacao_estoque WHERE produto_id = $1 ORDER BY id',
      [produto.id],
    );
    assert.deepEqual(rows.map((linha) => linha.tipo), ['entrada', 'entrada']);
  });

  it('o que foi ganho não vira gasto do mês', async () => {
    // A regra que justifica a rota existir no módulo Despensa e não na Grana:
    // estoque e dinheiro são coisas separadas, e o que não custou não é
    // despesa. Se isto quebrar, o gasto do mês (RN11) passa a mentir.
    const produto = await criarProduto({ nome: 'Café', quantidadeInicial: 0 });

    await conta.cliente.post(`/despensa/produtos/${produto.id}/entrada`, { quantidade: 1 });

    const { rows } = await banco.query('SELECT id FROM transacao');
    assert.deepEqual(rows, []);
  });

  it('RN08 — repor tira o item do alerta de reposição', async () => {
    const produto = await criarProduto({
      nome: 'Feijão',
      quantidadeInicial: 1,
      monitorado: true,
      quantidadeMinima: 2,
    });

    const resposta = await conta.cliente.post(`/despensa/produtos/${produto.id}/entrada`, {
      quantidade: 3,
    });

    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.alertaResolvido, true);
    assert.equal(resposta.corpo.produto.emAlerta, false);
  });

  it('recusa quantidade zero ou negativa', async () => {
    const produto = await criarProduto({ nome: 'Arroz', quantidadeInicial: 1 });

    const zero = await conta.cliente.post(`/despensa/produtos/${produto.id}/entrada`, {
      quantidade: 0,
    });
    const negativa = await conta.cliente.post(`/despensa/produtos/${produto.id}/entrada`, {
      quantidade: -1,
    });

    assert.equal(zero.status, 400);
    assert.equal(negativa.status, 400);
  });

  it('não repõe item de outra pessoa', async () => {
    const produto = await criarProduto({ nome: 'Arroz', quantidadeInicial: 1 });
    const outra = await criarConta(api.cliente);

    const resposta = await outra.cliente.post(`/despensa/produtos/${produto.id}/entrada`, {
      quantidade: 1,
    });

    assert.equal(resposta.status, 404);
  });
});

describe('SD08 — consumo e baixa (RF010, RN07, RN08)', () => {
  it('dá baixa e registra a movimentação', async () => {
    const produto = await criarProduto({ nome: 'Arroz', quantidadeInicial: 5 });

    const resposta = await conta.cliente.post(`/despensa/produtos/${produto.id}/consumo`, {
      quantidade: 2,
    });

    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.produto.quantidadeAtual, 3);
    assert.equal(resposta.corpo.alertaReposicao, null);

    const { rows } = await banco.query<{ tipo: string }>(
      'SELECT tipo FROM movimentacao_estoque WHERE produto_id = $1 ORDER BY id',
      [produto.id],
    );
    assert.deepEqual(rows.map((linha) => linha.tipo), ['entrada', 'baixa']);
  });

  it('RN07 — recusa baixa maior que o estoque, sem alterar nada', async () => {
    const produto = await criarProduto({ nome: 'Arroz', quantidadeInicial: 2 });

    const resposta = await conta.cliente.post(`/despensa/produtos/${produto.id}/consumo`, {
      quantidade: 3,
    });

    assert.equal(resposta.status, 422);
    assert.match(resposta.corpo.erro.mensagem, /insuficiente/i);

    const atual = await conta.cliente.get(`/despensa/produtos/${produto.id}`);
    assert.equal(atual.corpo.produto.quantidadeAtual, 2);
  });

  it('RN07 — zerar o estoque é permitido; ficar negativo não', async () => {
    const produto = await criarProduto({ nome: 'Arroz', quantidadeInicial: 2 });

    const zerando = await conta.cliente.post(`/despensa/produtos/${produto.id}/consumo`, {
      quantidade: 2,
    });

    assert.equal(zerando.status, 200);
    assert.equal(zerando.corpo.produto.quantidadeAtual, 0);
  });

  it('RN08 — a baixa que atinge a mínima devolve o pedido de reposição', async () => {
    const produto = await criarProduto({
      nome: 'Café',
      quantidadeInicial: 3,
      monitorado: true,
      quantidadeMinima: 1,
    });

    const resposta = await conta.cliente.post(`/despensa/produtos/${produto.id}/consumo`, {
      quantidade: 2,
    });

    assert.equal(resposta.corpo.produto.emAlerta, true);
    assert.match(resposta.corpo.alertaReposicao.mensagem, /Café/);
    assert.match(resposta.corpo.alertaReposicao.mensagem, /repor/i);
  });

  it('RN08 — item não monitorado não gera alerta nem zerado', async () => {
    const produto = await criarProduto({ nome: 'Sal', quantidadeInicial: 1 });

    const resposta = await conta.cliente.post(`/despensa/produtos/${produto.id}/consumo`, {
      quantidade: 1,
    });

    assert.equal(resposta.corpo.alertaReposicao, null);
    assert.equal(resposta.corpo.produto.emAlerta, false);
  });

  it('recusa quantidade zero ou negativa', async () => {
    const produto = await criarProduto({ nome: 'Arroz', quantidadeInicial: 5 });

    for (const quantidade of [0, -1]) {
      const resposta = await conta.cliente.post(`/despensa/produtos/${produto.id}/consumo`, {
        quantidade,
      });
      assert.equal(resposta.status, 400);
    }
  });
});

describe('SD10 — configurar alerta (RF012, RN08)', () => {
  it('liga o monitoramento com a mínima escolhida pelo usuário', async () => {
    const produto = await criarProduto({ nome: 'Café', quantidadeInicial: 2 });

    const resposta = await conta.cliente.put(`/despensa/produtos/${produto.id}/monitoramento`, {
      monitorado: true,
      quantidadeMinima: 2,
    });

    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.produto.monitorado, true);
    assert.equal(resposta.corpo.produto.emAlerta, true);
  });

  it('RN08 — ligar sem mínima é recusado', async () => {
    const produto = await criarProduto({ nome: 'Café' });

    const resposta = await conta.cliente.put(`/despensa/produtos/${produto.id}/monitoramento`, {
      monitorado: true,
    });

    assert.equal(resposta.status, 400);
  });

  it('desligar limpa a mínima — ela não significa nada sozinha', async () => {
    const produto = await criarProduto({
      nome: 'Café',
      quantidadeInicial: 1,
      monitorado: true,
      quantidadeMinima: 2,
    });

    const resposta = await conta.cliente.put(`/despensa/produtos/${produto.id}/monitoramento`, {
      monitorado: false,
    });

    assert.equal(resposta.corpo.produto.quantidadeMinima, null);
    assert.equal(resposta.corpo.produto.emAlerta, false);
  });

  it('RF012 — a lista de alertas traz só o que precisa de reposição', async () => {
    await criarProduto({
      nome: 'Café',
      quantidadeInicial: 1,
      monitorado: true,
      quantidadeMinima: 2,
    });
    await criarProduto({
      nome: 'Arroz',
      quantidadeInicial: 10,
      monitorado: true,
      quantidadeMinima: 2,
    });
    await criarProduto({ nome: 'Sal', quantidadeInicial: 0 });

    const resposta = await conta.cliente.get('/despensa/alertas');

    assert.equal(resposta.status, 200);
    assert.deepEqual(
      resposta.corpo.produtos.map((produto: { nome: string }) => produto.nome),
      ['Café'],
    );
  });
});

describe('SD06 — leitura de nota fiscal (RF008, RF016, RN06, RN18)', () => {
  it('repõe o estoque, guarda os itens e lança um gasto só', async () => {
    const resposta = await conta.cliente.post('/despensa/notas', nota());

    assert.equal(resposta.status, 201);
    assert.equal(resposta.corpo.gasto, 51);
    assert.equal(resposta.corpo.itens[0].produto.quantidadeAtual, 2);

    const transacoes = await banco.query<{ origem: string; valor: number; tipo: string }>(
      'SELECT origem, valor, tipo FROM transacao',
    );
    assert.deepEqual(transacoes.rows, [{ origem: 'nota', valor: 51, tipo: 'saida' }]);
  });

  it('RN18 — o gasto da nota nasce na categoria "Mercado"', async () => {
    await conta.cliente.post('/despensa/notas', nota());

    const { rows } = await banco.query<{ nome: string }>(
      `SELECT c.nome FROM transacao t JOIN categoria c ON c.id = t.categoria_id`,
    );
    assert.deepEqual(rows, [{ nome: 'Mercado' }]);
  });

  it('a nota gera exatamente uma transação — sem dupla contagem', async () => {
    await conta.cliente.post('/despensa/notas', {
      ...nota(),
      itens: [
        { descricao: 'Arroz', quantidade: 2, valorUnitario: 25.5 },
        { descricao: 'Feijão', quantidade: 1, valorUnitario: 9 },
      ],
    });

    const { rowCount } = await banco.query('SELECT 1 FROM transacao');
    assert.equal(rowCount, 1);
  });

  it('o total declarado na nota manda sobre a soma dos itens', async () => {
    const resposta = await conta.cliente.post('/despensa/notas', nota({ valorTotal: 48.9 }));

    assert.equal(resposta.corpo.gasto, 48.9);
  });

  it('concilia com o item que já existe em vez de duplicar', async () => {
    const arroz = await criarProduto({ nome: 'Arroz', quantidadeInicial: 1 });

    const resposta = await conta.cliente.post('/despensa/notas', nota());

    assert.equal(resposta.corpo.itens[0].produto.id, arroz.id);
    assert.equal(resposta.corpo.itens[0].produto.quantidadeAtual, 3);

    const estoque = await conta.cliente.get('/despensa/produtos');
    assert.equal(estoque.corpo.produtos.length, 1);
  });

  it('item novo na nota entra na despensa', async () => {
    await conta.cliente.post('/despensa/notas', nota());

    const estoque = await conta.cliente.get('/despensa/produtos');
    assert.deepEqual(
      estoque.corpo.produtos.map((produto: { nome: string }) => produto.nome),
      ['Arroz'],
    );
  });

  it('avisa quais alertas a compra resolveu', async () => {
    await criarProduto({
      nome: 'Arroz',
      quantidadeInicial: 1,
      monitorado: true,
      quantidadeMinima: 2,
    });

    const resposta = await conta.cliente.post('/despensa/notas', nota());

    assert.deepEqual(resposta.corpo.alertasResolvidos, ['Arroz']);
    assert.equal(resposta.corpo.itens[0].produto.emAlerta, false);
  });

  it('RN06 — a mesma nota não entra duas vezes', async () => {
    await conta.cliente.post('/despensa/notas', nota());

    const repetida = await conta.cliente.post('/despensa/notas', nota());

    assert.equal(repetida.status, 409);
    assert.match(repetida.corpo.erro.mensagem, /já foi lida/i);

    const { rowCount } = await banco.query('SELECT 1 FROM transacao');
    assert.equal(rowCount, 1, 'a segunda leitura não pode gerar outro gasto');
  });

  it('recusa chave de acesso fora do formato da NFC-e', async () => {
    const resposta = await conta.cliente.post('/despensa/notas', nota({ chaveAcesso: '123' }));

    assert.equal(resposta.status, 400);
  });

  it('recusa nota sem itens', async () => {
    const resposta = await conta.cliente.post('/despensa/notas', nota({ itens: [] }));

    assert.equal(resposta.status, 400);
  });

  it('nota recusada não deixa rastro — nem produto, nem gasto', async () => {
    await conta.cliente.post('/despensa/notas', nota({ chaveAcesso: '123' }));

    const { rowCount: produtos } = await banco.query('SELECT 1 FROM produto');
    const { rowCount: notas } = await banco.query('SELECT 1 FROM nota_fiscal');
    assert.equal(produtos, 0);
    assert.equal(notas, 0);
  });
});

describe('SD09 — consulta de estoque e histórico (RF011, RF013)', () => {
  it('RF013 — o detalhe traz o histórico de compras e as movimentações', async () => {
    await conta.cliente.post('/despensa/notas', nota());
    const estoque = await conta.cliente.get('/despensa/produtos');
    const arroz = estoque.corpo.produtos[0];

    const resposta = await conta.cliente.get(`/despensa/produtos/${arroz.id}`);

    assert.equal(resposta.status, 200);
    assert.deepEqual(resposta.corpo.produto.historicoCompras, [
      {
        data: '2026-08-10',
        localCompra: 'Mercado do Zé',
        descricaoNota: 'Arroz',
        quantidade: 2,
        valorUnitario: 25.5,
        valorTotal: 51,
      },
    ]);
    assert.equal(resposta.corpo.produto.movimentacoes.length, 1);
  });

  it('lista as notas já lidas', async () => {
    await conta.cliente.post('/despensa/notas', nota());

    const resposta = await conta.cliente.get('/despensa/notas');

    assert.equal(resposta.corpo.notas.length, 1);
    assert.equal(resposta.corpo.notas[0].processada, true);
    assert.equal(resposta.corpo.notas[0].dataCompra, '2026-08-10');
  });

  it('produto inexistente devolve 404', async () => {
    const resposta = await conta.cliente.get('/despensa/produtos/9999');

    assert.equal(resposta.status, 404);
  });
});

describe('isolamento entre contas', () => {
  it('a despensa de um usuário não aparece para o outro', async () => {
    const produto = await criarProduto({ nome: 'Arroz', quantidadeInicial: 5 });
    const outra = await criarConta(api.cliente, 'Bruno');

    const estoque = await outra.cliente.get('/despensa/produtos');
    assert.deepEqual(estoque.corpo.produtos, []);

    const detalhe = await outra.cliente.get(`/despensa/produtos/${produto.id}`);
    assert.equal(detalhe.status, 404, 'produto alheio precisa ser indistinguível de inexistente');
  });

  it('não dá para dar baixa no estoque alheio', async () => {
    const produto = await criarProduto({ nome: 'Arroz', quantidadeInicial: 5 });
    const outra = await criarConta(api.cliente, 'Bruno');

    const resposta = await outra.cliente.post(`/despensa/produtos/${produto.id}/consumo`, {
      quantidade: 1,
    });

    assert.equal(resposta.status, 404);
  });

  it('exige sessão', async () => {
    const resposta = await api.cliente.get('/despensa/produtos');

    assert.equal(resposta.status, 401);
  });
});
