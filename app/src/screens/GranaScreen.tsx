/**
 * Módulo 3 — Grana (SD13–SD15).
 *
 * O registro manual (RF017) é a ação principal da tela porque, no lançamento
 * iOS, a leitura automática de notificação bancária (RF015) não funciona
 * (RNF13) — o financeiro se apoia no que o usuário digita.
 *
 * O alerta de orçamento (RN12) não é calculado aqui: vem na resposta do
 * lançamento, junto do saldo atualizado da conta (RN10).
 */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as granaApi from '@/services/api/grana';
import type { Categoria, TipoTransacao } from '@/types/api';
import { useRequisicao } from '@/hooks/useRequisicao';
import { useAcao } from '@/hooks/useAcao';
import { TelaModulo } from '@/components/common/TelaModulo';
import { Secao } from '@/components/common/Secao';
import { Aviso } from '@/components/ui/Aviso';
import { Barra } from '@/components/ui/Barra';
import { Botao } from '@/components/ui/Botao';
import { Campo } from '@/components/ui/Campo';
import { BarrasCategoria } from '@/components/ui/BarrasCategoria';
import { Cartao } from '@/components/ui/Cartao';
import { EstadoVazio } from '@/components/ui/Estados';
import { Selo } from '@/components/ui/Selo';
import { Texto } from '@/components/ui/Texto';
import { cores, espaco, raio } from '@/theme';
import { dataCurta, dinheiro, hoje, mesAtual, mesPorExtenso } from '@/utils/formato';

const ACENTO = cores.modulo.grana;

export function GranaScreen() {
  const mes = mesAtual();
  const painel = useRequisicao(async () => {
    const [resumo, orcamentos, transacoes, categorias] = await Promise.all([
      granaApi.obterResumo(mes),
      granaApi.listarOrcamentos(mes),
      granaApi.listarTransacoes({ mes, limite: 10 }),
      granaApi.listarCategorias(),
    ]);
    return { resumo, orcamentos, transacoes, categorias };
  }, [mes]);

  const acao = useAcao();
  const router = useRouter();
  const [lancamentoAberto, setLancamentoAberto] = useState(false);

  return (
    <TelaModulo
      titulo="Grana"
      chamada={`a sacola de ${mesPorExtenso(mes)}`}
      modulo="grana"
      carregando={painel.carregando && painel.dados === null}
      erro={painel.erro}
      aoRecarregar={painel.recarregar}
    >

      {painel.dados ? (
        <>
          <Cartao acento={ACENTO}>
            <Texto variante="corpo" cor={cores.tintaMedia}>
              Gasto no mês
            </Texto>
            <Texto variante="numeroGrande">{dinheiro(painel.dados.resumo.saidas)}</Texto>
            <View style={estilos.colunas}>
              <View>
                <Texto variante="legenda" cor={cores.tintaFraca}>
                  Entrou
                </Texto>
                <Texto variante="corpoForte">{dinheiro(painel.dados.resumo.entradas)}</Texto>
              </View>
              <View>
                <Texto variante="legenda" cor={cores.tintaFraca}>
                  Saldo das contas
                </Texto>
                <Texto variante="corpoForte">{dinheiro(painel.dados.resumo.saldoTotal)}</Texto>
              </View>
            </View>
          </Cartao>

          {/*
            RF018 — para onde o dinheiro foi. O `gastosPorCategoria` já vinha na
            resposta do resumo e estava sendo descartado pelo cliente.
          */}
          {painel.dados.resumo.gastosPorCategoria.length > 0 ? (
            <Secao titulo="Para onde foi">
              <Cartao>
                <BarrasCategoria
                  dados={painel.dados.resumo.gastosPorCategoria.map((linha) => ({
                    rotulo: linha.categoria?.nome ?? 'Sem categoria',
                    valor: linha.total,
                  }))}
                  formatar={dinheiro}
                  cor={ACENTO}
                />
              </Cartao>
            </Secao>
          ) : null}

          {/*
            RF034 — Open Finance. Fica antes do lançamento manual de propósito:
            conectar o banco é o que evita digitar lançamento a lançamento.
          */}
          <Secao
            titulo="Bancos"
            aoVerTudo={() => router.push('/bancos')}
            rotuloVerTudo="Conectar"
          >
            <Cartao aoTocar={() => router.push('/bancos')}>
              <Texto variante="cartaoNome">Conectar pelo Open Finance</Texto>
              <Texto variante="corpo" cor={cores.tintaMedia}>
                Traz o extrato sozinho. O Xepa não guarda a senha do banco, e você revoga quando
                quiser.
              </Texto>
            </Cartao>
          </Secao>

          <Secao
            titulo="Lançar"
            acao={
              <Botao
                titulo={lancamentoAberto ? 'Fechar' : 'Novo lançamento'}
                aparencia="contorno"
                compacto
                aoTocar={() => setLancamentoAberto((aberto) => !aberto)}
              />
            }
          >
            {lancamentoAberto ? (
              <FormularioLancamento
                categorias={painel.dados.categorias.categorias}
                executando={acao.executando}
                aoSalvar={async (dados) => {
                  const resultado = await acao.executar(
                    () => granaApi.registrarLancamento(dados),
                    // RN12 — o alerta de 80% vem do backend, já com o texto pronto.
                    (r) => r.alertaOrcamento?.mensagem ?? null,
                  );
                  if (resultado) {
                    setLancamentoAberto(false);
                    await painel.recarregar();
                  }
                }}
              />
            ) : null}
          </Secao>

          <Secao titulo="Orçamentos do mês">
            {painel.dados.orcamentos.orcamentos.length === 0 ? (
              <EstadoVazio
                titulo="sem orçamento definido"
                descricao="Um limite por categoria ajuda a ver o estouro chegando."
              />
            ) : null}

            {painel.dados.orcamentos.orcamentos.map((orcamento) => (
              <Cartao
                key={orcamento.id}
                acento={orcamento.estourado ? cores.erro : orcamento.emAlerta ? cores.atencao : ACENTO}
              >
                <View style={estilos.linha}>
                  <Texto variante="corpoForte">{orcamento.categoria.nome}</Texto>
                  <Texto variante="corpo" cor={cores.tintaMedia}>
                    {dinheiro(orcamento.gasto)} de {dinheiro(orcamento.valorLimite)}
                  </Texto>
                </View>
                <Barra proporcao={orcamento.percentual / 100} cor={ACENTO} />
                <View style={estilos.linha}>
                  {orcamento.estourado ? (
                    <Selo texto="estourou" cor={cores.erro} preenchido />
                  ) : orcamento.emAlerta ? (
                    <Selo texto="no limite" cor={cores.atencao} preenchido />
                  ) : (
                    <Selo texto={`sobra ${dinheiro(orcamento.restante)}`} />
                  )}
                  <Texto variante="legenda" cor={cores.tintaFraca}>
                    {orcamento.percentual}%
                  </Texto>
                </View>
              </Cartao>
            ))}
          </Secao>

          <Secao titulo="Últimos lançamentos">
            {painel.dados.transacoes.transacoes.length === 0 ? (
              <EstadoVazio titulo="nada lançado ainda" />
            ) : null}

            {painel.dados.transacoes.transacoes.map((transacao) => (
              <View key={transacao.id} style={estilos.transacao}>
                <View style={estilos.identificacao}>
                  <Texto variante="corpo">
                    {transacao.descricao ?? transacao.categoria?.nome ?? 'Lançamento'}
                  </Texto>
                  <Texto variante="legenda" cor={cores.tintaFraca}>
                    {dataCurta(transacao.data)}
                    {transacao.categoria ? ` · ${transacao.categoria.nome}` : ''}
                    {transacao.origem === 'nota' ? ' · nota' : ''}
                  </Texto>
                </View>
                <Texto
                  variante="corpoForte"
                  cor={transacao.tipo === 'entrada' ? cores.sucesso : cores.tinta}
                >
                  {transacao.tipo === 'entrada' ? '+' : '−'} {dinheiro(transacao.valor)}
                </Texto>
              </View>
            ))}
          </Secao>
        </>
      ) : null}
    </TelaModulo>
  );
}

interface DadosLancamento {
  tipo: TipoTransacao;
  valor: number;
  data: string;
  categoriaId: number | null;
  descricao: string | null;
}

function FormularioLancamento({
  categorias,
  executando,
  aoSalvar,
}: {
  categorias: Categoria[];
  executando: boolean;
  aoSalvar(dados: DadosLancamento): Promise<void>;
}) {
  const [tipo, setTipo] = useState<TipoTransacao>('saida');
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [categoriaId, setCategoriaId] = useState<number | null>(null);

  const valorNumerico = Number(valor.replace(',', '.'));

  return (
    <Cartao acento={ACENTO}>
      <View style={estilos.alternador}>
        {(['saida', 'entrada'] as const).map((opcao) => (
          <Botao
            key={opcao}
            titulo={opcao === 'saida' ? 'Gasto' : 'Entrada'}
            aparencia={tipo === opcao ? 'principal' : 'contorno'}
            compacto
            estilo={estilos.opcao}
            aoTocar={() => setTipo(opcao)}
          />
        ))}
      </View>

      <Campo
        rotulo="Valor"
        value={valor}
        onChangeText={setValor}
        keyboardType="decimal-pad"
        placeholder="0,00"
      />
      <Campo
        rotulo="Descrição"
        value={descricao}
        onChangeText={setDescricao}
        placeholder="Feira da semana"
      />

      <View style={estilos.categorias}>
        <Texto variante="rotulo" cor={cores.tintaMedia}>
          Categoria
        </Texto>
        <View style={estilos.chips}>
          {categorias.map((categoria) => {
            const escolhida = categoria.id === categoriaId;
            return (
              <Texto
                key={categoria.id}
                variante="legenda"
                cor={escolhida ? cores.fundo : cores.tintaMedia}
                onPress={() => setCategoriaId(escolhida ? null : categoria.id)}
                estilo={[
                  estilos.chip,
                  escolhida ? { backgroundColor: ACENTO, borderColor: ACENTO } : null,
                ]}
              >
                {categoria.nome}
              </Texto>
            );
          })}
        </View>
      </View>

      <Botao
        titulo="Lançar"
        carregando={executando}
        desabilitado={!(valorNumerico > 0)}
        aoTocar={() =>
          void aoSalvar({
            tipo,
            valor: valorNumerico,
            data: hoje(),
            categoriaId,
            descricao: descricao.trim() === '' ? null : descricao.trim(),
          })
        }
      />
    </Cartao>
  );
}

const estilos = StyleSheet.create({
  colunas: {
    flexDirection: 'row',
    gap: espaco.xl,
    borderTopWidth: 1,
    borderTopColor: cores.linha,
    paddingTop: espaco.md,
    marginTop: espaco.xs,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaco.md,
  },
  transacao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaco.md,
    paddingBottom: espaco.md,
    borderBottomWidth: 1,
    borderBottomColor: cores.linha,
  },
  identificacao: {
    flex: 1,
    gap: 2,
  },
  alternador: {
    flexDirection: 'row',
    gap: espaco.sm,
  },
  opcao: {
    flex: 1,
  },
  categorias: {
    gap: espaco.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: cores.linhaForte,
    borderRadius: raio.pilula,
    paddingHorizontal: espaco.md,
    paddingVertical: espaco.xs,
    overflow: 'hidden',
  },
});
