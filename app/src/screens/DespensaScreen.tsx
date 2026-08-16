/**
 * Módulo 2 — Despensa (SD07–SD10).
 *
 * A tela é a lista do estoque com duas ações no lugar onde o usuário já está
 * olhando: dar baixa no que consumiu (SD08) e cadastrar item novo (SD07). O
 * alerta de reposição (RN08) chega junto da resposta da baixa, não numa
 * consulta separada.
 *
 * Layout na forma da tela de categoria do template: busca no topo e grade de
 * dois cartões por linha. O botão redondo do cartão dá baixa de uma unidade;
 * tocar o cartão abre o painel de baixa com quantidade livre, porque o cartão
 * do template não tem espaço para um formulário dentro.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as despensaApi from '@/services/api/despensa';
import type { Produto } from '@/types/api';
import { useRequisicao } from '@/hooks/useRequisicao';
import { useAcao } from '@/hooks/useAcao';
import { TelaModulo } from '@/components/common/TelaModulo';
import { Secao } from '@/components/common/Secao';
import { Aviso } from '@/components/ui/Aviso';
import { Botao } from '@/components/ui/Botao';
import { Busca } from '@/components/ui/Busca';
import { Campo } from '@/components/ui/Campo';
import { Cartao } from '@/components/ui/Cartao';
import { CartaoItem } from '@/components/ui/CartaoItem';
import { EstadoVazio } from '@/components/ui/Estados';
import { Texto } from '@/components/ui/Texto';
import { cores, espaco, medida, raio } from '@/theme';
import { quantidade } from '@/utils/formato';
import { desenhoDoItem } from '@/utils/categoriaVisual';

const ACENTO = cores.modulo.despensa;

export function DespensaScreen() {
  const estoque = useRequisicao(() => despensaApi.listarEstoque(), []);
  const acao = useAcao();
  const router = useRouter();
  const [novoAberto, setNovoAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [emBaixa, setEmBaixa] = useState<Produto | null>(null);
  const [categoriaFiltrada, setCategoriaFiltrada] = useState<string | null>(null);

  const produtos = estoque.dados?.produtos ?? [];
  const emAlerta = produtos.filter((produto) => produto.emAlerta);

  /**
   * As categorias que existem nesta despensa, na ordem em que aparecem.
   *
   * Só as presentes: uma fileira com as dez categorias possíveis obrigaria a
   * ler dez rótulos para descobrir que oito não têm nada. Some quando há uma
   * só — filtrar por uma categoria que já é o estoque inteiro não filtra nada.
   */
  const categorias = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const produto of produtos) {
      const { rotulo, cor } = desenhoDoItem(produto.nome, produto.categoria);
      if (!vistas.has(rotulo)) vistas.set(rotulo, cor);
    }
    return [...vistas].map(([rotulo, cor]) => ({ rotulo, cor }));
  }, [produtos]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter((produto) => {
      if (
        categoriaFiltrada &&
        desenhoDoItem(produto.nome, produto.categoria).rotulo !== categoriaFiltrada
      ) {
        return false;
      }
      if (termo === '') return true;
      return (
        produto.nome.toLowerCase().includes(termo) ||
        (produto.categoria ?? '').toLowerCase().includes(termo)
      );
    });
  }, [produtos, busca, categoriaFiltrada]);

  /** RF010 — entrada sem nota; não passa por preço nem vira gasto. */
  async function repor(produto: Produto, valor: number) {
    const resultado = await acao.executar(
      () => despensaApi.registrarEntrada(produto.id, valor),
      (r) =>
        r.alertaResolvido ? `"${r.produto.nome}" saiu do alerta de reposição.` : null,
    );
    if (resultado) await estoque.recarregar();
  }

  async function consumir(produto: Produto, valor: number) {
    const resultado = await acao.executar(
      () => despensaApi.registrarConsumo(produto.id, valor),
      // RN08 — o pedido de reposição vem na própria resposta da baixa.
      (r) => r.alertaReposicao?.mensagem ?? null,
    );
    if (resultado) await estoque.recarregar();
  }

  return (
    <TelaModulo
      titulo="Despensa"
      chamada="o que tem em casa"
      modulo="despensa"
      carregando={estoque.carregando && estoque.dados === null}
      erro={estoque.erro}
      aoRecarregar={estoque.recarregar}
    >
      <Busca valor={busca} aoMudar={setBusca} dica="Buscar na despensa" />

      {categorias.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={estilos.filtros}
          // A fileira sangra até a borda: cortar o último chip na margem é o
          // que diz que ela rola.
          style={estilos.filtrosRolagem}
        >
          <ChipDeFiltro
            rotulo="Tudo"
            cor={ACENTO}
            escolhido={categoriaFiltrada === null}
            aoTocar={() => setCategoriaFiltrada(null)}
          />
          {categorias.map(({ rotulo, cor }) => (
            <ChipDeFiltro
              key={rotulo}
              rotulo={rotulo}
              cor={cor}
              escolhido={categoriaFiltrada === rotulo}
              // Tocar no que já está escolhido desfaz: sem isso, sair do
              // filtro exigiria achar o "Tudo" no começo da fileira rolada.
              aoTocar={() =>
                setCategoriaFiltrada((atual) => (atual === rotulo ? null : rotulo))
              }
            />
          ))}
        </ScrollView>
      ) : null}

      {acao.erro ? <Aviso mensagem={acao.erro} tom="erro" /> : null}
      {acao.aviso ? <Aviso mensagem={acao.aviso} tom="atencao" /> : null}

      {emAlerta.length > 0 ? (
        <Aviso
          tom="atencao"
          mensagem={
            emAlerta.length === 1
              ? `${emAlerta[0]!.nome} está no limite que você definiu.`
              : `${emAlerta.length} itens no limite que você definiu.`
          }
        />
      ) : null}

      {/* RF008 — a leitura da nota é o caminho rápido de encher a despensa. */}
      <Secao titulo="Nota fiscal" aoVerTudo={() => router.push('/nota')} rotuloVerTudo="Ler nota">
        <Cartao aoTocar={() => router.push('/nota')}>
          <Texto variante="cartaoNome">Ler o QR Code da nota</Texto>
          <Texto variante="corpo" cor={cores.tintaMedia}>
            Os itens entram no estoque e o total vira gasto em “Mercado”.
          </Texto>
        </Cartao>
      </Secao>

      <Secao
        titulo="Estoque"
        acao={
          <Botao
            titulo={novoAberto ? 'Fechar' : 'Novo item'}
            aparencia="texto"
            compacto
            aoTocar={() => setNovoAberto((aberto) => !aberto)}
          />
        }
      >
        {novoAberto ? (
          <FormularioNovoProduto
            executando={acao.executando}
            aoSalvar={async (dados) => {
              const criado = await acao.executar(() => despensaApi.criarProduto(dados));
              if (criado) {
                setNovoAberto(false);
                await estoque.recarregar();
              }
            }}
          />
        ) : null}

        {produtos.length === 0 && !estoque.carregando ? (
          <EstadoVazio
            titulo="despensa vazia"
            descricao="Cadastre o que você tem em casa ou leia o QR Code de uma nota."
          />
        ) : null}

        {/* O vazio precisa dizer qual das duas peneiras esvaziou a lista. */}
        {produtos.length > 0 && filtrados.length === 0 && categoriaFiltrada && busca.trim() === '' ? (
          <EstadoVazio
            titulo={`nada em ${categoriaFiltrada.toLowerCase()}`}
            descricao="Toque na categoria de novo para ver tudo."
          />
        ) : null}

        {produtos.length > 0 && filtrados.length === 0 && busca.trim() !== '' ? (
          <EstadoVazio
            titulo="nada com esse nome"
            descricao="Tente outro termo ou limpe a busca."
          />
        ) : null}

        <View style={estilos.grade}>
          {filtrados.map((produto) => (
            <CartaoItem
              key={produto.id}
              nome={produto.nome}
              // Sem categoria digitada, a linha de apoio mostra a inferida —
              // é a mesma leitura que decidiu o ícone, dita por extenso.
              apoio={produto.categoria ?? desenhoDoItem(produto.nome).rotulo}
              destaque={`${quantidade(produto.quantidadeAtual)} ${produto.unidade}`}
              // Em alerta, o cartão fala do estado; fora dele, da categoria.
              {...(produto.emAlerta
                ? { icone: 'alert-circle' as const, acento: cores.atencao }
                : { desenho: desenhoDoItem(produto.nome, produto.categoria) })}
              aoTocar={() =>
                setEmBaixa((atual) => (atual?.id === produto.id ? null : produto))
              }
              aoAgir={
                produto.quantidadeAtual > 0 && !acao.executando
                  ? () => void consumir(produto, 1)
                  : undefined
              }
              iconeAcao="minus"
              rotuloAcao={`Dar baixa de 1 ${produto.unidade} de ${produto.nome}`}
            />
          ))}
        </View>

        {emBaixa ? (
          <PainelDeBaixa
            produto={emBaixa}
            ocupado={acao.executando}
            aoFechar={() => setEmBaixa(null)}
            aoConsumir={(valor) => {
              void consumir(emBaixa, valor);
              setEmBaixa(null);
            }}
            aoRepor={(valor) => {
              void repor(emBaixa, valor);
              setEmBaixa(null);
            }}
          />
        ) : null}
      </Secao>
    </TelaModulo>
  );
}

/**
 * Chip de filtro por categoria.
 *
 * A cor escolhida é a da própria categoria, a mesma do ícone no cartão — é o
 * que liga o filtro ao que ele filtra. Escolhido é preenchido, não só
 * contornado: contorno fino não sobrevive ao sol na tela do celular.
 */
function ChipDeFiltro({
  rotulo,
  cor,
  escolhido,
  aoTocar,
}: {
  rotulo: string;
  cor: string;
  escolhido: boolean;
  aoTocar(): void;
}) {
  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityState={{ selected: escolhido }}
      style={({ pressed }) => [
        estilos.chip,
        { backgroundColor: escolhido ? cor : `${cor}1F` },
        pressed && estilos.chipPressionado,
      ]}
    >
      <Texto variante="corpoForte" cor={escolhido ? cores.branco : cores.tinta}>
        {rotulo}
      </Texto>
    </Pressable>
  );
}

/**
 * Movimentação com quantidade livre: o que não é "consumi uma unidade".
 *
 * Os dois sentidos moram no mesmo painel porque a quantidade é a mesma
 * pergunta; o que muda é para que lado ela vai.
 */
function PainelDeBaixa({
  produto,
  ocupado,
  aoFechar,
  aoConsumir,
  aoRepor,
}: {
  produto: Produto;
  ocupado: boolean;
  aoFechar(): void;
  aoConsumir(quantidade: number): void;
  aoRepor(quantidade: number): void;
}) {
  const [valor, setValor] = useState('1');
  const numero = Number(valor.replace(',', '.'));

  return (
    <Cartao acento={cores.modulo.despensa}>
      <View style={estilos.cabecalhoPainel}>
        <Texto variante="cartaoNome">{produto.nome}</Texto>
        <Botao titulo="Fechar" aparencia="texto" compacto aoTocar={aoFechar} />
      </View>
      <View style={estilos.baixa}>
        <View style={estilos.campoBaixa}>
          <Campo
            rotulo={`Quantidade (${produto.unidade})`}
            value={valor}
            onChangeText={setValor}
            keyboardType="decimal-pad"
          />
        </View>
        <Botao
          titulo="Dar baixa"
          compacto
          carregando={ocupado}
          desabilitado={!(numero > 0)}
          aoTocar={() => aoConsumir(numero)}
        />
      </View>
      {/*
        RF010 — repor sem nota, para o que entrou sem ter sido comprado:
        presente, sobra, rateio. Não pede preço, e por isso não vira gasto: o
        único outro jeito de aumentar o estoque era lançar uma nota, que exige
        valor unitário e lançaria uma despesa que nunca existiu.
      */}
      <Botao
        titulo="Ganhei / repor sem nota"
        aparencia="contorno"
        compacto
        carregando={ocupado}
        desabilitado={!(numero > 0)}
        aoTocar={() => aoRepor(numero)}
      />
    </Cartao>
  );
}

interface DadosNovoProduto {
  nome: string;
  unidade: string;
  quantidadeInicial: number;
  monitorado: boolean;
  quantidadeMinima: number | null;
}

function FormularioNovoProduto({
  executando,
  aoSalvar,
}: {
  executando: boolean;
  aoSalvar(dados: DadosNovoProduto): Promise<void>;
}) {
  const [nome, setNome] = useState('');
  const [unidade, setUnidade] = useState('un');
  const [quantidadeInicial, setQuantidadeInicial] = useState('0');
  const [minima, setMinima] = useState('');

  // RN08 — informar a mínima é o que liga o monitoramento do item.
  const monitorado = minima.trim() !== '';

  return (
    <Cartao acento={ACENTO}>
      <Campo rotulo="Item" value={nome} onChangeText={setNome} placeholder="Arroz" />
      <View style={estilos.duasColunas}>
        <View style={estilos.metade}>
          <Campo rotulo="Unidade" value={unidade} onChangeText={setUnidade} placeholder="kg" />
        </View>
        <View style={estilos.metade}>
          <Campo
            rotulo="Quantidade"
            value={quantidadeInicial}
            onChangeText={setQuantidadeInicial}
            keyboardType="decimal-pad"
          />
        </View>
      </View>
      <Campo
        rotulo="Avisar quando chegar em"
        value={minima}
        onChangeText={setMinima}
        keyboardType="decimal-pad"
        dica="Deixe vazio para não monitorar este item."
      />
      <Botao
        titulo="Cadastrar"
        carregando={executando}
        desabilitado={nome.trim() === ''}
        aoTocar={() =>
          void aoSalvar({
            nome: nome.trim(),
            unidade: unidade.trim() || 'un',
            quantidadeInicial: Number(quantidadeInicial.replace(',', '.')) || 0,
            monitorado,
            quantidadeMinima: monitorado ? Number(minima.replace(',', '.')) : null,
          })
        }
      />
    </Cartao>
  );
}

const estilos = StyleSheet.create({
  filtrosRolagem: {
    // Anula a margem da tela para a fileira ir até a borda, e devolve o
    // respiro por dentro, no conteúdo.
    marginHorizontal: -medida.margem,
  },
  filtros: {
    flexDirection: 'row',
    gap: espaco.sm,
    paddingHorizontal: medida.margem,
  },
  chip: {
    borderRadius: raio.pilula,
    paddingHorizontal: espaco.lg,
    paddingVertical: espaco.md,
  },
  chipPressionado: {
    opacity: 0.7,
  },
  grade: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: espaco.lg,
  },
  cabecalhoPainel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaco.md,
  },
  baixa: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: espaco.md,
  },
  campoBaixa: {
    flex: 1,
  },
  duasColunas: {
    flexDirection: 'row',
    gap: espaco.md,
  },
  metade: {
    flex: 1,
  },
});
