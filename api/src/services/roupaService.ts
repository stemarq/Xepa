import { withTransaction } from '../db/pool.js';
import type {
  AlertaLavanderia,
  InsumoLavanderia,
  Lavagem,
  LavagemView,
  PecaView,
  StatusLavagem,
} from '../models/roupa.js';
import { precisaLavar, toPecaView } from '../models/roupa.js';
import * as roupaRepository from '../repositories/roupaRepository.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';

/**
 * Módulo 5 — Roupa (lavanderia).
 * Implementa SD21 a SD24.
 */

// ---------------------------------------------------------------------
// SD21 — Cadastrar peça (RF029, RN14)
// ---------------------------------------------------------------------

export async function cadastrarPeca(
  usuarioId: number,
  dados: { nome: string; tipo?: string | null | undefined; limiteUsos: number },
): Promise<PecaView> {
  const existente = await roupaRepository.buscarPecaPorNome(usuarioId, dados.nome);
  if (existente) {
    throw conflict(`Você já cadastrou "${existente.nome}".`);
  }

  const peca = await roupaRepository.inserirPeca(usuarioId, {
    nome: dados.nome.trim(),
    tipo: dados.tipo ?? null,
    limiteUsos: dados.limiteUsos,
  });
  return toPecaView(peca);
}

export async function listarPecas(usuarioId: number): Promise<PecaView[]> {
  const pecas = await roupaRepository.listarPecas(usuarioId);
  return pecas.map(toPecaView);
}

/** RN14 — a lista de "lavar". */
export async function listarParaLavar(usuarioId: number): Promise<PecaView[]> {
  const pecas = await roupaRepository.listarPecasParaLavar(usuarioId);
  return pecas.map(toPecaView);
}

export async function editarPeca(
  usuarioId: number,
  pecaId: number,
  dados: {
    nome?: string | undefined;
    tipo?: string | null | undefined;
    limiteUsos?: number | undefined;
  },
): Promise<PecaView> {
  await exigirPeca(usuarioId, pecaId);

  if (dados.nome !== undefined) {
    const homonima = await roupaRepository.buscarPecaPorNome(usuarioId, dados.nome);
    if (homonima && homonima.id !== pecaId) {
      throw conflict(`Você já cadastrou "${homonima.nome}".`);
    }
  }

  const atualizada = await roupaRepository.atualizarPeca(usuarioId, pecaId, dados);
  if (!atualizada) throw notFound('Peça não encontrada.');
  return toPecaView(atualizada);
}

export async function removerPeca(usuarioId: number, pecaId: number): Promise<void> {
  const removida = await roupaRepository.removerPeca(usuarioId, pecaId);
  if (!removida) throw notFound('Peça não encontrada.');
}

async function exigirPeca(usuarioId: number, pecaId: number) {
  const peca = await roupaRepository.buscarPeca(usuarioId, pecaId);
  // Peça de outro usuário se comporta como inexistente.
  if (!peca) throw notFound('Peça não encontrada.');
  return peca;
}

// ---------------------------------------------------------------------
// SD22 — Registrar uso + notificação de limite (RF030, RF031, RN14)
// ---------------------------------------------------------------------

export interface ResultadoUso {
  peca: PecaView;
  /** RF031 — avisa quando a peça atingiu o limite de usos (RN14). */
  alertaLavagem: { mensagem: string } | null;
}

/**
 * RF038 — foto da peça.
 *
 * Quinze peças cadastradas por nome viram uma lista que não se lê; a foto é o
 * que faz a tela parecer o armário. A imagem chega como miniatura já reduzida
 * pelo app — o servidor confere formato e tamanho, mas não redimensiona:
 * processar imagem exigiria dependência nativa, e o aparelho já tem a original
 * em mãos para fazer isso melhor.
 */
const TIPOS_DE_IMAGEM = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Teto da imagem aceita: 600 KB.
 *
 * Menor que o CHECK de 2 MB da coluna de propósito. O corpo JSON da API para
 * em 1 MB (`express.json`), e base64 engorda a imagem em um terço — um limite
 * de 2 MB aqui nunca seria alcançado: o Express recusaria antes, com um erro
 * genérico de "payload too large" no lugar de uma frase que explica o que
 * fazer. A constraint continua sendo a garantia; isto é a mensagem.
 *
 * O app manda ~40 KB, então a folga é enorme para o uso normal.
 */
const TAMANHO_MAXIMO = 600 * 1024;

export async function definirFoto(
  usuarioId: number,
  pecaId: number,
  imagem: { base64: string; tipo: string },
): Promise<void> {
  await exigirPeca(usuarioId, pecaId);

  if (!TIPOS_DE_IMAGEM.includes(imagem.tipo)) {
    throw badRequest(`Formato de imagem não aceito. Use ${TIPOS_DE_IMAGEM.join(', ')}.`);
  }

  const bytes = Buffer.from(imagem.base64, 'base64');
  if (bytes.length === 0) {
    throw badRequest('A imagem chegou vazia.');
  }
  if (bytes.length > TAMANHO_MAXIMO) {
    throw badRequest('A foto é grande demais. Envie uma imagem menor.');
  }

  await roupaRepository.salvarFoto(usuarioId, pecaId, { bytes, tipo: imagem.tipo });
}

export async function removerFoto(usuarioId: number, pecaId: number): Promise<void> {
  await exigirPeca(usuarioId, pecaId);
  await roupaRepository.salvarFoto(usuarioId, pecaId, null);
}

export async function obterFoto(usuarioId: number, pecaId: number) {
  const foto = await roupaRepository.buscarFoto(usuarioId, pecaId);
  if (!foto) throw notFound('Esta peça não tem foto.');
  return foto;
}

export async function registrarUso(usuarioId: number, pecaId: number): Promise<ResultadoUso> {
  await exigirPeca(usuarioId, pecaId);

  const atualizada = await withTransaction((client) =>
    roupaRepository.registrarUso(pecaId, client),
  );
  if (!atualizada) throw notFound('Peça não encontrada.');

  return {
    peca: toPecaView(atualizada),
    alertaLavagem: precisaLavar(atualizada)
      ? {
          mensagem:
            `"${atualizada.nome}" chegou a ${atualizada.usos_atuais} uso(s), ` +
            `o limite de ${atualizada.limite_usos} que você definiu. Hora de lavar.`,
        }
      : null,
  };
}

// ---------------------------------------------------------------------
// SD23 — Agendar lavagem e lembrete (RF032)
// ---------------------------------------------------------------------

export async function agendarLavagem(
  usuarioId: number,
  dataAgendada: string,
  pecaIds: number[],
  lembreteAtivo: boolean,
): Promise<LavagemView> {
  // Toda peça precisa ser do próprio usuário — senão dá para descobrir ids alheios.
  for (const pecaId of pecaIds) {
    await exigirPeca(usuarioId, pecaId);
  }

  const lavagem = await withTransaction(async (client) => {
    const criada = await roupaRepository.inserirLavagem(
      usuarioId,
      dataAgendada,
      lembreteAtivo,
      client,
    );
    await roupaRepository.vincularPecas(criada.id, pecaIds, client);
    return criada;
  });

  // O lembrete em si é notificação local, agendada pelo app para a data — o
  // backend guarda a intenção (`lembrete_ativo`) e a data.
  return montarLavagemView(lavagem, await pecasDe(lavagem.id));
}

export async function listarLavagens(
  usuarioId: number,
  status?: StatusLavagem,
): Promise<LavagemView[]> {
  const lavagens = await roupaRepository.listarLavagens(usuarioId, status);
  const pecas = await roupaRepository.pecasDasLavagens(lavagens.map((l) => l.id));
  return lavagens.map((lavagem) => montarLavagemView(lavagem, pecas.get(lavagem.id) ?? []));
}

/**
 * Concluir a lavagem zera o contador das peças envolvidas: é o que tira a
 * peça da lista de "lavar" e reinicia a contagem da RN14.
 */
export async function concluirLavagem(
  usuarioId: number,
  lavagemId: number,
): Promise<{ lavagem: LavagemView; pecasZeradas: string[] }> {
  const lavagem = await roupaRepository.buscarLavagem(usuarioId, lavagemId);
  if (!lavagem) throw notFound('Lavagem não encontrada.');
  if (lavagem.status !== 'agendada') {
    throw conflict(`Esta lavagem já está ${lavagem.status}.`);
  }

  const pecas = await pecasDe(lavagemId);

  const atualizada = await withTransaction(async (client) => {
    const resultado = await roupaRepository.atualizarStatus(
      usuarioId,
      lavagemId,
      'concluida',
      client,
    );
    await roupaRepository.zerarUsos(
      pecas.map((p) => p.id),
      client,
    );
    return resultado;
  });

  if (!atualizada) throw notFound('Lavagem não encontrada.');
  return {
    lavagem: montarLavagemView(atualizada, pecas),
    pecasZeradas: pecas.map((p) => p.nome),
  };
}

export async function cancelarLavagem(
  usuarioId: number,
  lavagemId: number,
): Promise<LavagemView> {
  const lavagem = await roupaRepository.buscarLavagem(usuarioId, lavagemId);
  if (!lavagem) throw notFound('Lavagem não encontrada.');
  if (lavagem.status !== 'agendada') {
    throw conflict(`Esta lavagem já está ${lavagem.status}.`);
  }

  const atualizada = await roupaRepository.atualizarStatus(usuarioId, lavagemId, 'cancelada');
  if (!atualizada) throw notFound('Lavagem não encontrada.');
  return montarLavagemView(atualizada, await pecasDe(lavagemId));
}

async function pecasDe(lavagemId: number): Promise<Array<{ id: number; nome: string }>> {
  return (await roupaRepository.pecasDasLavagens([lavagemId])).get(lavagemId) ?? [];
}

function montarLavagemView(
  lavagem: Lavagem,
  pecas: Array<{ id: number; nome: string }>,
): LavagemView {
  return {
    id: lavagem.id,
    dataAgendada: lavagem.data_agendada,
    status: lavagem.status,
    lembreteAtivo: lavagem.lembrete_ativo,
    pecas,
  };
}

// ---------------------------------------------------------------------
// SD24 — Alerta de lavanderia consultando o estoque (RF033, RN13)
// ---------------------------------------------------------------------

/**
 * RN13 — sabão e amaciante são itens de estoque comuns, então o alerta é uma
 * consulta à despensa. O casamento é por nome e cobre a grafia com e sem
 * acento, já que `PRODUTO.nome` é texto livre digitado pelo usuário (ou lido
 * de uma nota fiscal).
 */
const INSUMOS = [
  { rotulo: 'Sabão', padroes: ['%sabão%', '%sabao%'] },
  { rotulo: 'Amaciante', padroes: ['%amaciante%'] },
] as const;

export async function obterAlertas(
  usuarioId: number,
  emDias = 2,
): Promise<AlertaLavanderia> {
  const lavagens = await roupaRepository.listarLavagensProximas(usuarioId, emDias);
  const pecas = await roupaRepository.pecasDasLavagens(lavagens.map((l) => l.id));

  const encontrados = await roupaRepository.consultarInsumos(
    usuarioId,
    INSUMOS.flatMap((insumo) => [...insumo.padroes]),
  );

  const insumos: InsumoLavanderia[] = INSUMOS.map(({ rotulo, padroes }) => {
    const produto = encontrados.find((p) =>
      padroes.some((padrao) => p.nome.toLowerCase().includes(padrao.replaceAll('%', ''))),
    );

    if (!produto) {
      return {
        produtoId: null,
        nome: rotulo,
        quantidadeAtual: null,
        unidade: null,
        // Sem produto cadastrado não dá para afirmar que falta — mas também
        // não dá para garantir que tem. Sinalizamos como não cadastrado.
        emFalta: false,
        naoCadastrado: true,
      };
    }

    const acabou = produto.quantidade_atual <= 0;
    // RN08 — item monitorado que atingiu a mínima já conta como falta
    const noLimite =
      produto.monitorado &&
      produto.quantidade_minima !== null &&
      produto.quantidade_atual <= produto.quantidade_minima;

    return {
      produtoId: produto.id,
      nome: produto.nome,
      quantidadeAtual: produto.quantidade_atual,
      unidade: produto.unidade,
      emFalta: acabou || noLimite,
      naoCadastrado: false,
    };
  });

  const faltando = insumos.filter((i) => i.emFalta).map((i) => i.nome);
  const temLavagem = lavagens.length > 0;

  return {
    lavagensProximas: lavagens.map((lavagem) =>
      montarLavagemView(lavagem, pecas.get(lavagem.id) ?? []),
    ),
    insumos,
    faltando,
    mensagem:
      faltando.length === 0
        ? null
        : temLavagem
          ? `Você tem lavagem marcada e está sem ${listar(faltando)}. Reponha antes.`
          : `Está acabando ${listar(faltando)} na despensa.`,
  };
}

function listar(nomes: string[]): string {
  if (nomes.length === 1) return nomes[0] as string;
  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
}
