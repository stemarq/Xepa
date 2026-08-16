import { withTransaction } from '../db/pool.js';
import type { ProdutoDetalhe, ProdutoView } from '../models/despensa.js';
import { estaEmAlerta, toProdutoView } from '../models/despensa.js';
import * as categoriaRepository from '../repositories/categoriaRepository.js';
import * as notaFiscalRepository from '../repositories/notaFiscalRepository.js';
import * as produtoRepository from '../repositories/produtoRepository.js';
import { badRequest, conflict, notFound, unprocessable } from '../utils/errors.js';
import { quantidadeEmTexto } from '../utils/formato.js';

/**
 * Módulo 2 — Despensa (controle de estoque).
 * Implementa SD06 a SD10.
 */

// ---------------------------------------------------------------------
// SD09 — Consultar estoque e histórico (RF011, RF013)
// ---------------------------------------------------------------------

export async function listarEstoque(usuarioId: number): Promise<ProdutoView[]> {
  const produtos = await produtoRepository.listarPorUsuario(usuarioId);
  return produtos.map(toProdutoView);
}

export async function detalharProduto(
  usuarioId: number,
  produtoId: number,
): Promise<ProdutoDetalhe> {
  const produto = await exigirProduto(usuarioId, produtoId);
  const [historicoCompras, movimentacoes] = await Promise.all([
    produtoRepository.historicoCompras(produtoId),
    produtoRepository.listarMovimentacoes(produtoId),
  ]);
  return { ...toProdutoView(produto), historicoCompras, movimentacoes };
}

/** RF012/RN08 — o que precisa de reposição agora. */
export async function listarAlertas(usuarioId: number): Promise<ProdutoView[]> {
  const produtos = await produtoRepository.listarEmAlerta(usuarioId);
  return produtos.map(toProdutoView);
}

async function exigirProduto(usuarioId: number, produtoId: number) {
  const produto = await produtoRepository.buscarPorId(usuarioId, produtoId);
  // Produto de outro usuário é indistinguível de inexistente.
  if (!produto) throw notFound('Produto não encontrado na sua despensa.');
  return produto;
}

// ---------------------------------------------------------------------
// SD07 — Cadastro e edição manual (RF009)
// ---------------------------------------------------------------------

export interface DadosNovoProduto {
  nome: string;
  categoria?: string | null | undefined;
  unidade?: string | undefined;
  quantidadeInicial?: number | undefined;
  monitorado?: boolean | undefined;
  quantidadeMinima?: number | null | undefined;
}

export async function criarProduto(
  usuarioId: number,
  dados: DadosNovoProduto,
): Promise<ProdutoView> {
  validarMonitoramento(dados.monitorado, dados.quantidadeMinima);

  const jaExiste = await produtoRepository.buscarPorNome(usuarioId, dados.nome);
  if (jaExiste) {
    throw conflict(`Já existe "${jaExiste.nome}" na sua despensa.`);
  }

  const quantidadeInicial = dados.quantidadeInicial ?? 0;

  // A quantidade inicial entra como movimentação, não como valor solto: assim
  // a coluna desnormalizada nasce coerente com o histórico.
  const produto = await withTransaction(async (client) => {
    const criado = await produtoRepository.inserir(
      usuarioId,
      {
        nome: dados.nome,
        categoria: dados.categoria ?? null,
        ...(dados.unidade !== undefined ? { unidade: dados.unidade } : {}),
        monitorado: dados.monitorado ?? false,
        quantidadeMinima: dados.quantidadeMinima ?? null,
      },
      client,
    );

    if (quantidadeInicial > 0) {
      const atualizado = await produtoRepository.movimentar(
        criado.id,
        'entrada',
        quantidadeInicial,
        client,
      );
      return atualizado ?? criado;
    }
    return criado;
  });

  return toProdutoView(produto);
}

export interface DadosEdicaoProduto {
  nome?: string | undefined;
  categoria?: string | null | undefined;
  unidade?: string | undefined;
  monitorado?: boolean | undefined;
  quantidadeMinima?: number | null | undefined;
}

export async function editarProduto(
  usuarioId: number,
  produtoId: number,
  dados: DadosEdicaoProduto,
): Promise<ProdutoView> {
  const atual = await exigirProduto(usuarioId, produtoId);

  // O monitoramento é avaliado sobre o estado final: quem já monitora pode
  // mandar só a nova mínima, e quem está ligando o alerta precisa informá-la.
  validarMonitoramento(
    dados.monitorado ?? atual.monitorado,
    dados.quantidadeMinima !== undefined ? dados.quantidadeMinima : atual.quantidade_minima,
  );

  if (dados.nome !== undefined) {
    const homonimo = await produtoRepository.buscarPorNome(usuarioId, dados.nome);
    if (homonimo && homonimo.id !== produtoId) {
      throw conflict(`Já existe "${homonimo.nome}" na sua despensa.`);
    }
  }

  const atualizado = await produtoRepository.atualizar(usuarioId, produtoId, dados);
  if (!atualizado) throw notFound('Produto não encontrado na sua despensa.');
  return toProdutoView(atualizado);
}

// ---------------------------------------------------------------------
// SD10 — Configurar alerta de item (RF012, RN08)
// ---------------------------------------------------------------------

export async function configurarAlerta(
  usuarioId: number,
  produtoId: number,
  monitorado: boolean,
  quantidadeMinima: number | null,
): Promise<ProdutoView> {
  await exigirProduto(usuarioId, produtoId);
  validarMonitoramento(monitorado, quantidadeMinima);

  const atualizado = await produtoRepository.atualizar(usuarioId, produtoId, {
    monitorado,
    // Desligar o monitoramento limpa a mínima: ela não significa nada sozinha.
    quantidadeMinima: monitorado ? quantidadeMinima : null,
  });
  if (!atualizado) throw notFound('Produto não encontrado na sua despensa.');
  return toProdutoView(atualizado);
}

/** RN08 — item monitorado precisa de uma quantidade mínima. */
function validarMonitoramento(
  monitorado: boolean | undefined,
  quantidadeMinima: number | null | undefined,
): void {
  if (monitorado && (quantidadeMinima === null || quantidadeMinima === undefined)) {
    throw badRequest('Para monitorar um item, informe a quantidade mínima.');
  }
}

// ---------------------------------------------------------------------
// SD08 — Registro de consumo / baixa (RF010, RN07, RN08)
// ---------------------------------------------------------------------

export interface ResultadoConsumo {
  produto: ProdutoView;
  /** RN08 — pedido de reposição, quando o item monitorado atinge a mínima. */
  alertaReposicao: { mensagem: string } | null;
}

export async function registrarConsumo(
  usuarioId: number,
  produtoId: number,
  quantidade: number,
): Promise<ResultadoConsumo> {
  const produto = await exigirProduto(usuarioId, produtoId);

  // RN07 — a baixa não pode deixar a quantidade negativa
  if (quantidade > produto.quantidade_atual) {
    throw unprocessable(
      `Estoque insuficiente: há ${quantidadeEmTexto(produto.quantidade_atual)} ${produto.unidade} de "${produto.nome}".`,
    );
  }

  const atualizado = await withTransaction((client) =>
    produtoRepository.movimentar(produtoId, 'baixa', quantidade, client),
  );

  // A checagem acima pode ficar velha entre a leitura e a escrita; o UPDATE
  // condicional do repository é quem de fato garante a RN07.
  if (!atualizado) {
    throw unprocessable('Estoque insuficiente: a quantidade mudou, confira o estoque atual.');
  }

  return {
    produto: toProdutoView(atualizado),
    alertaReposicao: estaEmAlerta(atualizado)
      ? {
          mensagem:
            `"${atualizado.nome}" está em ${quantidadeEmTexto(atualizado.quantidade_atual)} ${atualizado.unidade}, ` +
            `no limite de ${quantidadeEmTexto(atualizado.quantidade_minima ?? 0)} que você definiu. Hora de repor.`,
        }
      : null,
  };
}

export interface ResultadoEntrada {
  produto: ProdutoView;
  /** O item saiu do alerta de reposição por causa desta entrada (RN08). */
  alertaResolvido: boolean;
}

/**
 * Entrada de estoque sem preço nem nota (RF010, RN08).
 *
 * Nem tudo que entra na despensa foi comprado: presente, sobra de casa,
 * rateio com colega, o que veio da viagem. Antes disto, a única forma de
 * aumentar a quantidade de um item existente era lançar uma nota — que exige
 * valor unitário e vira gasto (RN18). Quem ganhou um produto teria de inventar
 * um preço, e esse preço entraria no gasto do mês como se tivesse sido pago.
 *
 * Por isso a entrada é do módulo Despensa e não toca em `TRANSACAO`: estoque e
 * dinheiro são coisas separadas, e o que não custou não pode virar despesa.
 * O valor pago continua sendo registrado só quando existe nota (RF013).
 */
export async function registrarEntrada(
  usuarioId: number,
  produtoId: number,
  quantidade: number,
): Promise<ResultadoEntrada> {
  const produto = await exigirProduto(usuarioId, produtoId);
  const estavaEmAlerta = estaEmAlerta(produto);

  const atualizado = await withTransaction((client) =>
    produtoRepository.movimentar(produtoId, 'entrada', quantidade, client),
  );

  // Entrada não tem a trava condicional da baixa (RN07 só limita para baixo),
  // então só falha se o produto sumiu entre a leitura e a escrita.
  if (!atualizado) {
    throw unprocessable('O item não está mais na despensa.');
  }

  return {
    produto: toProdutoView(atualizado),
    alertaResolvido: estavaEmAlerta && !estaEmAlerta(atualizado),
  };
}

// ---------------------------------------------------------------------
// SD06 — Leitura de nota fiscal via QR Code (RF008, RF016, RN06, RN18)
// ---------------------------------------------------------------------

export interface ItemLido {
  descricao: string;
  quantidade: number;
  valorUnitario: number;
}

export interface NotaLida {
  chaveAcesso: string;
  localCompra?: string | null | undefined;
  dataCompra: string;
  valorTotal?: number | undefined;
  itens: ItemLido[];
}

export interface ResultadoNota {
  notaFiscalId: number;
  transacaoId: number;
  /** RF016 — o gasto que a nota lançou no financeiro. */
  gasto: number;
  itens: Array<{ descricao: string; quantidade: number; produto: ProdutoView }>;
  alertasResolvidos: string[];
}

export async function processarNota(
  usuarioId: number,
  nota: NotaLida,
): Promise<ResultadoNota> {
  if (nota.itens.length === 0) {
    throw badRequest('A nota precisa ter ao menos um item.');
  }

  // RN06 — nota já lida não entra de novo
  const existente = await notaFiscalRepository.buscarPorChave(nota.chaveAcesso);
  if (existente) {
    throw conflict('Esta nota já foi lida.');
  }

  const valorCalculado = arredondar(
    nota.itens.reduce((total, item) => total + item.quantidade * item.valorUnitario, 0),
  );
  // O total declarado na nota manda; sem ele, usamos a soma dos itens.
  const valorTotal = nota.valorTotal !== undefined ? arredondar(nota.valorTotal) : valorCalculado;

  try {
    return await withTransaction(async (client) => {
      const notaSalva = await notaFiscalRepository.salvarNota(
        usuarioId,
        {
          chaveAcesso: nota.chaveAcesso,
          localCompra: nota.localCompra ?? null,
          dataCompra: nota.dataCompra,
          valorTotal,
        },
        client,
      );

      const itens: ResultadoNota['itens'] = [];
      const alertasResolvidos: string[] = [];

      for (const item of nota.itens) {
        // Concilia com o que já existe na despensa; item novo vira produto.
        let produto = await produtoRepository.buscarPorNome(usuarioId, item.descricao, client);
        if (!produto) {
          produto = await produtoRepository.inserir(
            usuarioId,
            { nome: item.descricao.trim(), categoria: null },
            client,
          );
        }

        const estavaEmAlerta = estaEmAlerta(produto);

        await notaFiscalRepository.salvarItem(
          notaSalva.id,
          {
            produtoId: produto.id,
            descricao: item.descricao,
            quantidade: item.quantidade,
            valorUnitario: item.valorUnitario,
          },
          client,
        );

        const reposto = await produtoRepository.movimentar(
          produto.id,
          'entrada',
          item.quantidade,
          client,
        );
        const final = reposto ?? produto;

        if (estavaEmAlerta && !estaEmAlerta(final)) {
          alertasResolvidos.push(final.nome);
        }

        itens.push({
          descricao: item.descricao,
          quantidade: item.quantidade,
          produto: toProdutoView(final),
        });
      }

      // RN18 — a compra de mercado vira uma transação na categoria "Mercado"
      const categoria = await categoriaRepository.garantir(
        usuarioId,
        categoriaRepository.CATEGORIA_MERCADO,
        client,
      );

      const transacao = await notaFiscalRepository.gerarTransacao(
        {
          usuarioId,
          notaFiscalId: notaSalva.id,
          categoriaId: categoria.id,
          valor: valorTotal,
          data: nota.dataCompra,
          descricao: nota.localCompra ? `Compra em ${nota.localCompra}` : 'Compra de mercado',
        },
        client,
      );

      await notaFiscalRepository.marcarProcessada(notaSalva.id, client);

      return {
        notaFiscalId: notaSalva.id,
        transacaoId: transacao.id,
        gasto: valorTotal,
        itens,
        alertasResolvidos,
      };
    });
  } catch (error) {
    // Duas leituras simultâneas da mesma nota: quem perde a corrida bate na
    // constraint UNIQUE de chave_acesso (RN06).
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === '23505' &&
      (error as { constraint?: string }).constraint === 'nota_fiscal_chave_acesso_key'
    ) {
      throw conflict('Esta nota já foi lida.');
    }
    throw error;
  }
}

export async function listarNotas(usuarioId: number) {
  const notas = await notaFiscalRepository.listarPorUsuario(usuarioId);
  return notas.map((nota) => ({
    id: nota.id,
    chaveAcesso: nota.chave_acesso,
    localCompra: nota.local_compra,
    dataCompra: nota.data_compra,
    valorTotal: nota.valor_total,
    processada: nota.processada,
  }));
}

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}
