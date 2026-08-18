/**
 * Módulo 5 — Roupa (SD21–SD24).
 *
 * Cobre RF029–RF033 e as regras RN14 (a peça vai para a lista de "lavar" ao
 * atingir o limite de usos) e RN13 (sabão e amaciante são produtos da despensa,
 * então o alerta de lavanderia consulta o estoque).
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

async function criarPeca(nome = 'Calça jeans', limiteUsos = 3) {
  const resposta = await conta.cliente.post('/roupa/pecas', { nome, tipo: 'calça', limiteUsos });
  assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
  return resposta.corpo.peca;
}

async function usar(pecaId: number, vezes: number) {
  let ultima;
  for (let i = 0; i < vezes; i += 1) {
    ultima = await conta.cliente.post(`/roupa/pecas/${pecaId}/uso`);
    assert.equal(ultima.status, 200, JSON.stringify(ultima.corpo));
  }
  return ultima!;
}

/** Cria um item na despensa — é de lá que sai o sabão (RN13). */
async function criarProduto(dados: Record<string, unknown>) {
  const resposta = await conta.cliente.post('/despensa/produtos', dados);
  assert.equal(resposta.status, 201, JSON.stringify(resposta.corpo));
  return resposta.corpo.produto;
}

describe('SD21 — cadastro de peças (RF029, RN14)', () => {
  it('cadastra a peça zerada, com o limite de usos escolhido', async () => {
    const peca = await criarPeca('Calça jeans', 3);

    assert.equal(peca.limiteUsos, 3);
    assert.equal(peca.usosAtuais, 0);
    assert.equal(peca.usosRestantes, 3);
    assert.equal(peca.precisaLavar, false);
  });

  it('recusa peça repetida', async () => {
    await criarPeca('Calça jeans');

    const repetida = await conta.cliente.post('/roupa/pecas', {
      nome: 'Calça jeans',
      limiteUsos: 2,
    });

    assert.equal(repetida.status, 409);
  });

  it('RN14 — o limite de usos precisa ser pelo menos 1', async () => {
    const resposta = await conta.cliente.post('/roupa/pecas', {
      nome: 'Camiseta',
      limiteUsos: 0,
    });

    assert.equal(resposta.status, 400);
  });

  it('edita a peça e remove quando não serve mais', async () => {
    const peca = await criarPeca();

    const editada = await conta.cliente.put(`/roupa/pecas/${peca.id}`, { limiteUsos: 5 });
    assert.equal(editada.corpo.peca.limiteUsos, 5);

    assert.equal((await conta.cliente.delete(`/roupa/pecas/${peca.id}`)).status, 204);
    assert.equal((await conta.cliente.delete(`/roupa/pecas/${peca.id}`)).status, 404);
  });
});

describe('SD22 — registrar uso (RF030, RF031, RN14)', () => {
  it('conta o uso e guarda o histórico', async () => {
    const peca = await criarPeca('Calça jeans', 3);

    const resposta = await usar(peca.id, 1);

    assert.equal(resposta.corpo.peca.usosAtuais, 1);
    assert.equal(resposta.corpo.peca.usosRestantes, 2);
    assert.equal(resposta.corpo.alertaLavagem, null);

    const { rowCount } = await banco.query('SELECT 1 FROM uso_peca WHERE peca_id = $1', [peca.id]);
    assert.equal(rowCount, 1);
  });

  it('RN14 — ao atingir o limite, avisa que é hora de lavar', async () => {
    const peca = await criarPeca('Calça jeans', 3);

    const resposta = await usar(peca.id, 3);

    assert.equal(resposta.corpo.peca.precisaLavar, true);
    assert.equal(resposta.corpo.peca.usosRestantes, 0);
    assert.match(resposta.corpo.alertaLavagem.mensagem, /Calça jeans/);
    assert.match(resposta.corpo.alertaLavagem.mensagem, /lavar/i);
  });

  it('RN14 — só entra na lista de "lavar" quem chegou ao limite', async () => {
    const jeans = await criarPeca('Calça jeans', 2);
    await criarPeca('Camiseta', 2);
    await usar(jeans.id, 2);

    const { corpo } = await conta.cliente.get('/roupa/lavar');

    assert.deepEqual(
      corpo.pecas.map((peca: { nome: string }) => peca.nome),
      ['Calça jeans'],
    );
  });

  it('não deixa registrar uso em peça de outra conta', async () => {
    const peca = await criarPeca();
    const outra = await criarConta(api.cliente, 'Bruno');

    const resposta = await outra.cliente.post(`/roupa/pecas/${peca.id}/uso`);

    assert.equal(resposta.status, 404);
  });
});

describe('RF038 — foto da peça', () => {
  // PNG 1x1 de verdade: bytes que um decodificador aceita, não texto qualquer.
  const PNG_1X1 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('guarda a foto e devolve a imagem crua, não JSON', async () => {
    const peca = await criarPeca('Camisa azul');

    const envio = await conta.cliente.put(`/roupa/pecas/${peca.id}/foto`, {
      base64: PNG_1X1,
      tipo: 'image/png',
    });
    assert.equal(envio.status, 204);

    const imagem = await conta.cliente.binario(`/roupa/pecas/${peca.id}/foto`);
    assert.equal(imagem.status, 200);
    assert.match(imagem.tipo ?? '', /image\/png/);
    // Os mesmos bytes que subiram: nada de recodificar no caminho.
    assert.deepEqual(imagem.bytes, Buffer.from(PNG_1X1, 'base64'));
  });

  it('a listagem diz que há foto sem carregar os bytes', async () => {
    // O ponto da rota separada: a lista das peças não pode engordar de KB por
    // causa de uma imagem que ela não desenha em miniatura própria.
    const peca = await criarPeca('Camisa azul');
    await conta.cliente.put(`/roupa/pecas/${peca.id}/foto`, {
      base64: PNG_1X1,
      tipo: 'image/png',
    });

    const lista = await conta.cliente.get('/roupa/pecas');
    const daLista = lista.corpo.pecas.find((p: { id: number }) => p.id === peca.id);

    assert.equal(daLista.temFoto, true);
    assert.ok(daLista.fotoEm);
    assert.equal('foto' in daLista, false);
    assert.equal(JSON.stringify(lista.corpo).includes(PNG_1X1.slice(0, 40)), false);
  });

  it('peça sem foto responde 404, e não uma imagem vazia', async () => {
    const peca = await criarPeca('Camisa azul');

    const imagem = await conta.cliente.binario(`/roupa/pecas/${peca.id}/foto`);

    assert.equal(imagem.status, 404);
  });

  it('recusa arquivo que não é imagem', async () => {
    const peca = await criarPeca('Camisa azul');

    const resposta = await conta.cliente.put(`/roupa/pecas/${peca.id}/foto`, {
      base64: Buffer.from('%PDF-1.4').toString('base64'),
      tipo: 'application/pdf',
    });

    assert.equal(resposta.status, 400);
  });

  it('apagar a foto limpa tipo e data junto', async () => {
    // A constraint do banco exige os três campos coerentes: apagar só os bytes
    // deixaria a peça com data de uma foto que não existe mais.
    const peca = await criarPeca('Camisa azul');
    await conta.cliente.put(`/roupa/pecas/${peca.id}/foto`, {
      base64: PNG_1X1,
      tipo: 'image/png',
    });

    const remocao = await conta.cliente.delete(`/roupa/pecas/${peca.id}/foto`);
    assert.equal(remocao.status, 204);

    const lista = await conta.cliente.get('/roupa/pecas');
    const daLista = lista.corpo.pecas.find((p: { id: number }) => p.id === peca.id);
    assert.equal(daLista.temFoto, false);
    assert.equal(daLista.fotoEm, null);
  });

  it('não devolve a foto de outra pessoa', async () => {
    const peca = await criarPeca('Camisa azul');
    await conta.cliente.put(`/roupa/pecas/${peca.id}/foto`, {
      base64: PNG_1X1,
      tipo: 'image/png',
    });
    const outra = await criarConta(api.cliente);

    const imagem = await outra.cliente.binario(`/roupa/pecas/${peca.id}/foto`);

    assert.equal(imagem.status, 404);
  });
});

describe('SD23 — agendar, concluir e cancelar lavagem (RF032)', () => {
  it('agenda a lavagem com as peças e o lembrete', async () => {
    const jeans = await criarPeca('Calça jeans');
    const camiseta = await criarPeca('Camiseta');

    const resposta = await conta.cliente.post('/roupa/lavagens', {
      dataAgendada: '2026-08-15T09:00:00.000Z',
      pecaIds: [jeans.id, camiseta.id],
    });

    assert.equal(resposta.status, 201);
    assert.equal(resposta.corpo.lavagem.status, 'agendada');
    assert.equal(resposta.corpo.lavagem.lembreteAtivo, true, 'o lembrete vem ligado por padrão');
    assert.deepEqual(
      resposta.corpo.lavagem.pecas.map((peca: { nome: string }) => peca.nome).sort(),
      ['Calça jeans', 'Camiseta'],
    );
  });

  it('não agenda com peça de outra conta — e não deixa rastro', async () => {
    const outra = await criarConta(api.cliente, 'Bruno');
    const alheia = await outra.cliente.post('/roupa/pecas', { nome: 'Moletom', limiteUsos: 2 });

    const resposta = await conta.cliente.post('/roupa/lavagens', {
      dataAgendada: '2026-08-15T09:00:00.000Z',
      pecaIds: [alheia.corpo.peca.id],
    });

    assert.equal(resposta.status, 404);
    const { rowCount } = await banco.query('SELECT 1 FROM lavagem');
    assert.equal(rowCount, 0);
  });

  it('concluir zera o contador das peças e tira todas da lista de "lavar"', async () => {
    const jeans = await criarPeca('Calça jeans', 2);
    await usar(jeans.id, 2);
    const agendada = await conta.cliente.post('/roupa/lavagens', {
      dataAgendada: '2026-08-15T09:00:00.000Z',
      pecaIds: [jeans.id],
    });

    const resposta = await conta.cliente.post(
      `/roupa/lavagens/${agendada.corpo.lavagem.id}/concluir`,
    );

    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.lavagem.status, 'concluida');
    assert.deepEqual(resposta.corpo.pecasZeradas, ['Calça jeans']);

    const paraLavar = await conta.cliente.get('/roupa/lavar');
    assert.deepEqual(paraLavar.corpo.pecas, []);

    const pecas = await conta.cliente.get('/roupa/pecas');
    assert.equal(pecas.corpo.pecas[0].usosAtuais, 0);
  });

  it('lavagem já concluída não é concluída nem cancelada de novo', async () => {
    const jeans = await criarPeca();
    const agendada = await conta.cliente.post('/roupa/lavagens', {
      dataAgendada: '2026-08-15T09:00:00.000Z',
      pecaIds: [jeans.id],
    });
    const id = agendada.corpo.lavagem.id;
    await conta.cliente.post(`/roupa/lavagens/${id}/concluir`);

    assert.equal((await conta.cliente.post(`/roupa/lavagens/${id}/concluir`)).status, 409);
    assert.equal((await conta.cliente.post(`/roupa/lavagens/${id}/cancelar`)).status, 409);
  });

  it('cancelar deixa os usos como estavam — nada foi lavado', async () => {
    const jeans = await criarPeca('Calça jeans', 2);
    await usar(jeans.id, 2);
    const agendada = await conta.cliente.post('/roupa/lavagens', {
      dataAgendada: '2026-08-15T09:00:00.000Z',
      pecaIds: [jeans.id],
    });

    const resposta = await conta.cliente.post(
      `/roupa/lavagens/${agendada.corpo.lavagem.id}/cancelar`,
    );

    assert.equal(resposta.corpo.lavagem.status, 'cancelada');
    const pecas = await conta.cliente.get('/roupa/pecas');
    assert.equal(pecas.corpo.pecas[0].usosAtuais, 2);
  });

  it('filtra as lavagens por status', async () => {
    const jeans = await criarPeca();
    const primeira = await conta.cliente.post('/roupa/lavagens', {
      dataAgendada: '2026-08-15T09:00:00.000Z',
      pecaIds: [jeans.id],
    });
    await conta.cliente.post('/roupa/lavagens', {
      dataAgendada: '2026-08-22T09:00:00.000Z',
      pecaIds: [jeans.id],
    });
    await conta.cliente.post(`/roupa/lavagens/${primeira.corpo.lavagem.id}/concluir`);

    const agendadas = await conta.cliente.get('/roupa/lavagens?status=agendada');
    const concluidas = await conta.cliente.get('/roupa/lavagens?status=concluida');

    assert.equal(agendadas.corpo.lavagens.length, 1);
    assert.equal(concluidas.corpo.lavagens.length, 1);
  });

  it('recusa data e hora inválidas', async () => {
    const resposta = await conta.cliente.post('/roupa/lavagens', {
      dataAgendada: 'sexta que vem',
    });

    assert.equal(resposta.status, 400);
  });
});

describe('SD24 — alerta de lavanderia (RF033, RN13)', () => {
  it('sem sabão cadastrado na despensa, marca como não cadastrado e não acusa falta', async () => {
    const { corpo } = await conta.cliente.get('/roupa/alertas');

    const sabao = corpo.insumos.find((insumo: { nome: string }) => insumo.nome === 'Sabão');
    assert.equal(sabao.naoCadastrado, true);
    assert.equal(sabao.emFalta, false);
    assert.equal(sabao.produtoId, null);
    assert.equal(corpo.mensagem, null);
  });

  it('RN13 — enxerga o sabão como produto da despensa, mesmo sem acento', async () => {
    await criarProduto({ nome: 'Sabao em pó', quantidadeInicial: 2 });

    const { corpo } = await conta.cliente.get('/roupa/alertas');

    const sabao = corpo.insumos.find((insumo: { naoCadastrado: boolean }) => !insumo.naoCadastrado);
    assert.equal(sabao.nome, 'Sabao em pó');
    assert.equal(sabao.quantidadeAtual, 2);
    assert.equal(sabao.emFalta, false);
  });

  it('acusa falta quando o insumo zerou', async () => {
    await criarProduto({ nome: 'Sabão em pó', quantidadeInicial: 0 });

    const { corpo } = await conta.cliente.get('/roupa/alertas');

    assert.deepEqual(corpo.faltando, ['Sabão em pó']);
    assert.match(corpo.mensagem, /acabando/i);
  });

  it('RN08 — insumo monitorado que atingiu a mínima já conta como falta', async () => {
    await criarProduto({
      nome: 'Amaciante',
      quantidadeInicial: 1,
      monitorado: true,
      quantidadeMinima: 1,
    });

    const { corpo } = await conta.cliente.get('/roupa/alertas');

    assert.deepEqual(corpo.faltando, ['Amaciante']);
  });

  it('com lavagem marcada e insumo em falta, o aviso muda de tom', async () => {
    const jeans = await criarPeca();
    await criarProduto({ nome: 'Sabão em pó', quantidadeInicial: 0 });
    await conta.cliente.post('/roupa/lavagens', {
      dataAgendada: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      pecaIds: [jeans.id],
    });

    const { corpo } = await conta.cliente.get('/roupa/alertas');

    assert.equal(corpo.lavagensProximas.length, 1);
    assert.match(corpo.mensagem, /lavagem marcada/i);
    assert.match(corpo.mensagem, /Reponha antes/i);
  });

  it('lavagem distante não entra na janela padrão de 2 dias', async () => {
    const jeans = await criarPeca();
    await conta.cliente.post('/roupa/lavagens', {
      dataAgendada: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      pecaIds: [jeans.id],
    });

    const padrao = await conta.cliente.get('/roupa/alertas');
    const janelaLarga = await conta.cliente.get('/roupa/alertas?emDias=15');

    assert.equal(padrao.corpo.lavagensProximas.length, 0);
    assert.equal(janelaLarga.corpo.lavagensProximas.length, 1);
  });

  it('lista os dois insumos faltando de uma vez', async () => {
    await criarProduto({ nome: 'Sabão em pó', quantidadeInicial: 0 });
    await criarProduto({ nome: 'Amaciante', quantidadeInicial: 0 });

    const { corpo } = await conta.cliente.get('/roupa/alertas');

    assert.equal(corpo.faltando.length, 2);
    assert.match(corpo.mensagem, / e /);
  });
});

describe('isolamento entre contas', () => {
  it('as peças de um usuário não aparecem para o outro', async () => {
    await criarPeca();
    const outra = await criarConta(api.cliente, 'Bruno');

    const { corpo } = await outra.cliente.get('/roupa/pecas');

    assert.deepEqual(corpo.pecas, []);
  });

  it('exige sessão', async () => {
    assert.equal((await api.cliente.get('/roupa/pecas')).status, 401);
  });
});
