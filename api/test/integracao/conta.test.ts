/**
 * Módulo 1 — Conta / Autenticação (SD01–SD05).
 *
 * Cobre RF001–RF007 e as regras RN01 (e-mail único), RN02 (força da senha),
 * RN03 (logout invalida o token), RN04 (avatar da lista), RN05 (instituição
 * existente) e RNF06/RNF07/RNF09 (hash da senha, hash do token, sessão de 30
 * minutos).
 */

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { TTL_SESSAO_MINUTOS, prepararBanco } from '../apoio/banco.js';
import { subirApi } from '../apoio/http.js';

const banco = await prepararBanco();
const api = await subirApi();

after(() => api.encerrar());
beforeEach(() => banco.limpar());

const SENHA = 'Xepa#2026';

async function cadastrar(email: string, senha = SENHA, nome = 'Ana') {
  return api.cliente.post('/conta/cadastro', { nome, email, senha });
}

async function logar(email: string, senha = SENHA) {
  return api.cliente.post<{ token: string; expiraEm: string }>('/conta/login', { email, senha });
}

describe('SD01 — cadastro', () => {
  it('cria a conta e devolve o perfil público, sem nada de senha', async () => {
    const resposta = await cadastrar('ana@xepa.app');

    assert.equal(resposta.status, 201);
    assert.equal(resposta.corpo.usuario.email, 'ana@xepa.app');
    assert.equal(resposta.corpo.usuario.nome, 'Ana');
    assert.equal(resposta.corpo.usuario.avatar, null);
    assert.ok(!JSON.stringify(resposta.corpo).includes('senha'));
  });

  it('RNF06 — grava hash e salt, nunca a senha em texto puro', async () => {
    await cadastrar('ana@xepa.app');

    const { rows } = await banco.query<{ senha_hash: string; salt: string }>(
      'SELECT senha_hash, salt FROM usuario WHERE email = $1',
      ['ana@xepa.app'],
    );
    assert.ok(rows[0]!.senha_hash.startsWith('$2b$12$'));
    assert.notEqual(rows[0]!.senha_hash, SENHA);
    assert.ok(rows[0]!.salt.length > 0);
  });

  it('RN18 — a conta já nasce com a categoria "Mercado", que recebe as notas', async () => {
    await cadastrar('ana@xepa.app');

    const { rows } = await banco.query<{ nome: string }>(
      'SELECT nome FROM categoria ORDER BY nome',
    );
    assert.ok(rows.some((linha) => linha.nome === 'Mercado'));
    assert.equal(rows.length, 7);
  });

  it('RN01 — normaliza o e-mail para minúsculas', async () => {
    const resposta = await cadastrar('Ana@Xepa.App');

    assert.equal(resposta.status, 201);
    assert.equal(resposta.corpo.usuario.email, 'ana@xepa.app');
  });

  it('RN01 — recusa e-mail já cadastrado, mesmo com outra caixa', async () => {
    await cadastrar('ana@xepa.app');
    const repetido = await cadastrar('ANA@XEPA.APP');

    assert.equal(repetido.status, 409);
    assert.equal(repetido.corpo.erro.codigo, 'CONFLICT');
  });

  it('RN02 — recusa senha fraca e diz o que falta', async () => {
    const resposta = await cadastrar('ana@xepa.app', 'senha');

    assert.equal(resposta.status, 400);
    assert.deepEqual(resposta.corpo.erro.detalhes.requisitos, [
      'ter no mínimo 8 caracteres',
      'conter ao menos uma letra maiúscula',
      'conter ao menos um número',
      'conter ao menos um caractere especial',
    ]);
  });

  it('recusa e-mail sem formato válido, antes de qualquer regra de negócio', async () => {
    const resposta = await cadastrar('ana-arroba-xepa');

    assert.equal(resposta.status, 400);
    assert.equal(resposta.corpo.erro.codigo, 'BAD_REQUEST');
    assert.equal(resposta.corpo.erro.detalhes[0].campo, 'email');
  });
});

describe('SD02 — login', () => {
  beforeEach(async () => {
    await banco.limpar();
    await cadastrar('ana@xepa.app');
  });

  it('abre a sessão e devolve token com prazo de expiração', async () => {
    const resposta = await logar('ana@xepa.app');

    assert.equal(resposta.status, 200);
    assert.ok(resposta.corpo.token.length > 20);
    assert.ok(new Date(resposta.corpo.expiraEm).getTime() > Date.now());
  });

  it('RNF07 — o banco guarda só o hash do token, nunca o token', async () => {
    const { corpo } = await logar('ana@xepa.app');

    const { rows } = await banco.query<{ token_sessao_hash: string }>(
      'SELECT token_sessao_hash FROM usuario WHERE email = $1',
      ['ana@xepa.app'],
    );
    assert.notEqual(rows[0]!.token_sessao_hash, corpo.token);
    assert.match(rows[0]!.token_sessao_hash, /^[0-9a-f]{64}$/);
  });

  it('responde igual para senha errada e para e-mail inexistente', async () => {
    const senhaErrada = await logar('ana@xepa.app', 'Outra#2026');
    const inexistente = await logar('ninguem@xepa.app');

    assert.equal(senhaErrada.status, 401);
    assert.equal(inexistente.status, 401);
    assert.deepEqual(senhaErrada.corpo, inexistente.corpo);
  });
});

describe('sessão (RNF09) e logout (SD03, RN03)', () => {
  async function sessaoAberta() {
    await cadastrar('ana@xepa.app');
    const { corpo } = await logar('ana@xepa.app');
    return { token: corpo.token, cliente: api.cliente.comToken(corpo.token) };
  }

  it('rota protegida exige token', async () => {
    const resposta = await api.cliente.get('/conta/perfil');

    assert.equal(resposta.status, 401);
    assert.equal(resposta.corpo.erro.codigo, 'UNAUTHORIZED');
  });

  it('rota protegida recusa token inventado', async () => {
    const resposta = await api.cliente.comToken('token-que-nao-existe').get('/conta/perfil');

    assert.equal(resposta.status, 401);
  });

  it('token válido abre o perfil', async () => {
    const { cliente } = await sessaoAberta();

    const resposta = await cliente.get('/conta/perfil');
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.usuario.email, 'ana@xepa.app');
  });

  it('RN03 — depois do logout o mesmo token não vale mais', async () => {
    const { cliente } = await sessaoAberta();

    assert.equal((await cliente.post('/conta/logout')).status, 200);
    assert.equal((await cliente.get('/conta/perfil')).status, 401);
  });

  it('RNF09 — sessão parada há mais de 30 minutos é recusada e derrubada', async () => {
    const { cliente } = await sessaoAberta();
    await banco.query(
      "UPDATE usuario SET token_sessao_expira_em = now() - interval '1 minute'",
    );

    const resposta = await cliente.get('/conta/perfil');

    assert.equal(resposta.status, 401);
    assert.match(resposta.corpo.erro.mensagem, /expirada/i);
    const { rows } = await banco.query<{ token_sessao_hash: string | null }>(
      'SELECT token_sessao_hash FROM usuario',
    );
    assert.equal(rows[0]!.token_sessao_hash, null);
  });

  it('RNF09 — cada requisição autenticada empurra a expiração para frente', async () => {
    const { cliente } = await sessaoAberta();
    await banco.query(
      "UPDATE usuario SET token_sessao_expira_em = now() + interval '1 minute'",
    );

    await cliente.get('/conta/perfil');

    const { rows } = await banco.query<{ restante: number }>(
      "SELECT extract(epoch FROM token_sessao_expira_em - now()) AS restante FROM usuario",
    );
    // Sobrou quase a janela inteira: ela recomeçou, não continuou do 1 minuto.
    assert.ok(
      rows[0]!.restante > (TTL_SESSAO_MINUTOS - 5) * 60,
      'a janela de inatividade deveria ter recomeçado',
    );
  });
});

describe('SD04 — recuperação de senha', () => {
  /**
   * Sem SMTP, o e-mail vai para o console (modo de desenvolvimento). Capturar
   * a saída é o que dá acesso ao link — e de quebra tira o ruído do relatório
   * dos testes.
   */
  async function comEmailCapturado<T>(acao: () => Promise<T>): Promise<[T, string]> {
    const original = console.log;
    let capturado = '';
    console.log = (...args: unknown[]) => {
      capturado += args.join(' ');
    };
    try {
      return [await acao(), capturado];
    } finally {
      console.log = original;
    }
  }

  /** O token só existe dentro do link enviado por e-mail. */
  async function tokenDeRecuperacao(email: string): Promise<string | null> {
    const [, saida] = await comEmailCapturado(() =>
      api.cliente.post('/conta/recuperar-senha', { email }),
    );
    return /token=([\w-]+)/.exec(saida)?.[1] ?? null;
  }

  it('responde igual para e-mail cadastrado e não cadastrado', async () => {
    await cadastrar('ana@xepa.app');

    const [[existente, inexistente]] = await comEmailCapturado(() =>
      Promise.all([
        api.cliente.post('/conta/recuperar-senha', { email: 'ana@xepa.app' }),
        api.cliente.post('/conta/recuperar-senha', { email: 'ninguem@xepa.app' }),
      ]),
    );

    assert.equal(existente.status, 200);
    assert.equal(inexistente.status, 200);
    assert.deepEqual(existente.corpo, inexistente.corpo);
  });

  it('não gera token nenhum para e-mail que não existe', async () => {
    assert.equal(await tokenDeRecuperacao('ninguem@xepa.app'), null);
  });

  it('redefine a senha pelo link e passa a aceitar só a nova', async () => {
    await cadastrar('ana@xepa.app');
    const token = await tokenDeRecuperacao('ana@xepa.app');
    assert.ok(token);

    const redefinicao = await api.cliente.post('/conta/redefinir-senha', {
      token,
      senha: 'Nova#2026',
    });
    assert.equal(redefinicao.status, 200);

    assert.equal((await logar('ana@xepa.app', SENHA)).status, 401);
    assert.equal((await logar('ana@xepa.app', 'Nova#2026')).status, 200);
  });

  it('consome o token: o mesmo link não serve duas vezes', async () => {
    await cadastrar('ana@xepa.app');
    const token = await tokenDeRecuperacao('ana@xepa.app');

    await api.cliente.post('/conta/redefinir-senha', { token, senha: 'Nova#2026' });
    const repetida = await api.cliente.post('/conta/redefinir-senha', {
      token,
      senha: 'Outra#2026',
    });

    assert.equal(repetida.status, 400);
  });

  it('recusa token expirado', async () => {
    await cadastrar('ana@xepa.app');
    const token = await tokenDeRecuperacao('ana@xepa.app');
    await banco.query(
      "UPDATE usuario SET token_recuperacao_expira_em = now() - interval '1 minute'",
    );

    const resposta = await api.cliente.post('/conta/redefinir-senha', {
      token,
      senha: 'Nova#2026',
    });

    assert.equal(resposta.status, 400);
  });

  it('RN02 — a senha nova passa pelas mesmas exigências do cadastro', async () => {
    await cadastrar('ana@xepa.app');
    const token = await tokenDeRecuperacao('ana@xepa.app');

    const resposta = await api.cliente.post('/conta/redefinir-senha', { token, senha: 'fraca' });

    assert.equal(resposta.status, 400);
    assert.ok(resposta.corpo.erro.detalhes.requisitos.length > 0);
  });
});

describe('SD05 — perfil, avatar e vínculo institucional', () => {
  async function sessaoAberta() {
    await cadastrar('ana@xepa.app');
    const { corpo } = await logar('ana@xepa.app');
    return api.cliente.comToken(corpo.token);
  }

  it('RF007/RN04 — lista os avatares e aceita um deles', async () => {
    const cliente = await sessaoAberta();

    const avatares = await cliente.get('/conta/avatares');
    assert.equal(avatares.status, 200);
    assert.ok(avatares.corpo.avatares.length > 0);

    const escolhido = avatares.corpo.avatares[0];
    const resposta = await cliente.put('/conta/perfil', { avatarId: escolhido.id });

    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.usuario.avatar.id, escolhido.id);
    assert.equal(resposta.corpo.usuario.avatar.url, escolhido.url);
  });

  it('RN04 — recusa avatar fora da lista', async () => {
    const cliente = await sessaoAberta();

    const resposta = await cliente.put('/conta/perfil', { avatarId: 9999 });

    assert.equal(resposta.status, 400);
    assert.match(resposta.corpo.erro.mensagem, /avatar/i);
  });

  it('RF006/RN05 — vincula e desfaz o vínculo institucional', async () => {
    const cliente = await sessaoAberta();
    const instituicoes = await cliente.get('/conta/instituicoes');
    const escolhida = instituicoes.corpo.instituicoes[0];

    const vinculada = await cliente.put('/conta/perfil', { instituicaoId: escolhida.id });
    assert.equal(vinculada.corpo.usuario.instituicao.nome, escolhida.nome);

    const desvinculada = await cliente.put('/conta/perfil', { instituicaoId: null });
    assert.equal(desvinculada.corpo.usuario.instituicao, null);
  });

  it('RN05 — recusa instituição inexistente', async () => {
    const cliente = await sessaoAberta();

    const resposta = await cliente.put('/conta/perfil', { instituicaoId: 9999 });

    assert.equal(resposta.status, 400);
    assert.match(resposta.corpo.erro.mensagem, /instituição/i);
  });

  it('exige ao menos um campo para atualizar', async () => {
    const cliente = await sessaoAberta();

    const resposta = await cliente.put('/conta/perfil', {});

    assert.equal(resposta.status, 400);
  });
});

describe('infraestrutura da API', () => {
  it('responde ao healthcheck consultando o banco', async () => {
    const resposta = await api.cliente.get('/saude');

    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo.status, 'ok');
    assert.equal(resposta.corpo.banco, 'ok');
  });

  it('o healthcheck diz qual commit está no ar', async () => {
    // É a única rota pública: as demais exigem sessão, e até a rota
    // inexistente devolve 401 sob `/despensa`, porque `autenticar` roda antes
    // do roteamento. Sem o commit aqui, não há como saber de fora se um deploy
    // subiu.
    const resposta = await api.cliente.get('/saude');

    assert.ok('commit' in resposta.corpo);
    // Sem variável de ambiente de deploy, é `null` — "não sei", que é
    // diferente de uma string vazia parecendo um commit.
    assert.equal(resposta.corpo.commit, null);
  });

  it('rota inexistente devolve 404 no formato de erro da API', async () => {
    const resposta = await api.cliente.get('/nao-existe');

    assert.equal(resposta.status, 404);
    assert.equal(resposta.corpo.erro.codigo, 'NOT_FOUND');
  });
});
