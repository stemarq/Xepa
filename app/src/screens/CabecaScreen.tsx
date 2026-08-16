/**
 * Módulo 4 — Cabeça (SD16–SD20).
 *
 * Cada matéria carrega a média já calculada pelo método que o usuário escolheu
 * para ela (RN15) — o app não recalcula nada. A entrada manual de nota (RF024)
 * é o caminho principal: a importação da instituição (RF023) depende de
 * vínculo e de a instituição expor integração, o que a maioria não faz.
 */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as cabecaApi from '@/services/api/cabeca';
import type { Materia, MetodoMedia } from '@/types/api';
import { useRequisicao } from '@/hooks/useRequisicao';
import { useAcao } from '@/hooks/useAcao';
import { TelaModulo } from '@/components/common/TelaModulo';
import { Secao } from '@/components/common/Secao';
import { Aviso } from '@/components/ui/Aviso';
import { Botao } from '@/components/ui/Botao';
import { Campo } from '@/components/ui/Campo';
import { BarrasCategoria } from '@/components/ui/BarrasCategoria';
import { Cartao } from '@/components/ui/Cartao';
import { EstadoVazio } from '@/components/ui/Estados';
import { Selo } from '@/components/ui/Selo';
import { Texto } from '@/components/ui/Texto';
import { cores, espaco } from '@/theme';
import { duracao, hoje } from '@/utils/formato';

const ACENTO = cores.modulo.cabeca;

export function CabecaScreen() {
  const panorama = useRequisicao(() => cabecaApi.obterPanorama(), []);
  const acao = useAcao();
  const [novaAberta, setNovaAberta] = useState(false);

  const materias = panorama.dados?.materias ?? [];

  return (
    <TelaModulo
      titulo="Cabeça"
      chamada="como anda a faculdade"
      modulo="cabeca"
      carregando={panorama.carregando && panorama.dados === null}
      erro={panorama.erro}
      aoRecarregar={panorama.recarregar}
    >

      {panorama.dados ? (
        <Cartao acento={ACENTO}>
          <View style={estilos.colunas}>
            <View>
              <Texto variante="legenda" cor={cores.tintaFraca}>
                Média geral
              </Texto>
              <Texto variante="numeroGrande">
                {panorama.dados.mediaGeral === null ? '—' : panorama.dados.mediaGeral.toFixed(2)}
              </Texto>
            </View>
            <View>
              <Texto variante="legenda" cor={cores.tintaFraca}>
                Estudo no total
              </Texto>
              <Texto variante="tituloMenor">{duracao(panorama.dados.estudo.totalMinutos)}</Texto>
              <Texto variante="legenda" cor={cores.tintaFraca}>
                {panorama.dados.estudo.totalSessoes} sessões
              </Texto>
            </View>
          </View>
        </Cartao>
      ) : null}

      {/*
        RF028 — onde o tempo foi. O `estudoPorMateria` já vinha no panorama e
        estava sendo descartado pelo cliente.
      */}
      {panorama.dados && panorama.dados.estudoPorMateria.length > 0 ? (
        <Secao titulo="Tempo por matéria">
          <Cartao>
            <BarrasCategoria
              dados={panorama.dados.estudoPorMateria.map((linha) => ({
                rotulo: linha.materia,
                valor: linha.minutos,
              }))}
              formatar={duracao}
              cor={ACENTO}
            />
          </Cartao>
        </Secao>
      ) : null}

      <Secao
        titulo="Matérias"
        acao={
          <Botao
            titulo={novaAberta ? 'Fechar' : 'Nova matéria'}
            aparencia="contorno"
            compacto
            aoTocar={() => setNovaAberta((aberta) => !aberta)}
          />
        }
      >
        {novaAberta ? (
          <FormularioMateria
            executando={acao.executando}
            aoSalvar={async (nome, metodo) => {
              const criada = await acao.executar(() => cabecaApi.cadastrarMateria(nome, metodo));
              if (criada) {
                setNovaAberta(false);
                await panorama.recarregar();
              }
            }}
          />
        ) : null}

        {materias.length === 0 && !panorama.carregando ? (
          <EstadoVazio
            titulo="nenhuma matéria ainda"
            descricao="Cadastre as do semestre para acompanhar média e tempo de estudo."
          />
        ) : null}

        {materias.map((materia) => (
          <CartaoMateria
            key={materia.id}
            materia={materia}
            ocupado={acao.executando}
            aoRegistrarNota={async (dados) => {
              const salva = await acao.executar(() =>
                cabecaApi.registrarAvaliacao(materia.id, dados),
              );
              if (salva) await panorama.recarregar();
            }}
            aoRegistrarSessao={async (minutos) => {
              const salva = await acao.executar(() =>
                cabecaApi.registrarSessao(materia.id, hoje(), minutos),
              );
              if (salva) await panorama.recarregar();
            }}
          />
        ))}
      </Secao>
    </TelaModulo>
  );
}

function CartaoMateria({
  materia,
  ocupado,
  aoRegistrarNota,
  aoRegistrarSessao,
}: {
  materia: Materia;
  ocupado: boolean;
  aoRegistrarNota(dados: { descricao: string; valor: number; peso?: number; data: string }): Promise<void>;
  aoRegistrarSessao(minutos: number): Promise<void>;
}) {
  const router = useRouter();
  const [painel, setPainel] = useState<'nota' | 'sessao' | null>(null);
  const [descricao, setDescricao] = useState('');
  const [nota, setNota] = useState('');
  const [peso, setPeso] = useState('1');
  const [minutos, setMinutos] = useState('60');

  function fechar() {
    setPainel(null);
    setDescricao('');
    setNota('');
    setPeso('1');
  }

  return (
    <Cartao acento={ACENTO}>
      <View style={estilos.linha}>
        <View style={estilos.identificacao}>
          <Texto variante="corpoForte">{materia.nome}</Texto>
          <View style={estilos.selos}>
            <Selo texto={materia.metodoMedia} />
            <Selo texto={`${materia.totalAvaliacoes} nota(s)`} />
            {materia.totalMinutosEstudo > 0 ? (
              <Selo texto={duracao(materia.totalMinutosEstudo)} />
            ) : null}
          </View>
        </View>

        <View style={estilos.numeros}>
          <Texto variante="tituloMenor" cor={ACENTO}>
            {materia.media === null ? '—' : materia.media.toFixed(2)}
          </Texto>
          <Texto variante="legenda" cor={cores.tintaFraca}>
            média
          </Texto>
        </View>
      </View>

      <View style={estilos.acoes}>
        <Botao
          titulo="Nova nota"
          aparencia="texto"
          compacto
          aoTocar={() => setPainel((atual) => (atual === 'nota' ? null : 'nota'))}
        />
        <Botao
          titulo="Estudei hoje"
          aparencia="texto"
          compacto
          aoTocar={() => setPainel((atual) => (atual === 'sessao' ? null : 'sessao'))}
        />
        {/* SD20 — a evolução exige a rota por matéria, então mora na tela de detalhe. */}
        <Botao
          titulo="Evolução"
          aparencia="texto"
          compacto
          aoTocar={() => router.push({ pathname: '/materia/[id]', params: { id: materia.id } })}
        />
      </View>

      {painel === 'nota' ? (
        <View style={estilos.painel}>
          <Campo rotulo="Avaliação" value={descricao} onChangeText={setDescricao} placeholder="P1" />
          <View style={estilos.duasColunas}>
            <View style={estilos.metade}>
              <Campo rotulo="Nota" value={nota} onChangeText={setNota} keyboardType="decimal-pad" />
            </View>
            <View style={estilos.metade}>
              <Campo
                rotulo="Peso"
                value={peso}
                onChangeText={setPeso}
                keyboardType="decimal-pad"
                dica={materia.metodoMedia === 'simples' ? 'ignorado na média simples' : undefined}
              />
            </View>
          </View>
          <Botao
            titulo="Registrar nota"
            compacto
            carregando={ocupado}
            desabilitado={descricao.trim() === '' || nota.trim() === ''}
            aoTocar={() => {
              void aoRegistrarNota({
                descricao: descricao.trim(),
                valor: Number(nota.replace(',', '.')),
                peso: Number(peso.replace(',', '.')) || 1,
                data: hoje(),
              });
              fechar();
            }}
          />
        </View>
      ) : null}

      {painel === 'sessao' ? (
        <View style={estilos.painel}>
          <Campo
            rotulo="Minutos estudados"
            value={minutos}
            onChangeText={setMinutos}
            keyboardType="number-pad"
          />
          <Botao
            titulo="Registrar sessão"
            compacto
            carregando={ocupado}
            desabilitado={!(Number(minutos) > 0)}
            aoTocar={() => {
              void aoRegistrarSessao(Number(minutos));
              fechar();
            }}
          />
        </View>
      ) : null}
    </Cartao>
  );
}

function FormularioMateria({
  executando,
  aoSalvar,
}: {
  executando: boolean;
  aoSalvar(nome: string, metodo: MetodoMedia): Promise<void>;
}) {
  const [nome, setNome] = useState('');
  const [metodo, setMetodo] = useState<MetodoMedia>('simples');

  return (
    <Cartao acento={ACENTO}>
      <Campo rotulo="Matéria" value={nome} onChangeText={setNome} placeholder="Cálculo I" />

      <Texto variante="rotulo" cor={cores.tintaMedia}>
        Como calcular a média (RN15)
      </Texto>
      <View style={estilos.alternador}>
        {(['simples', 'ponderada'] as const).map((opcao) => (
          <Botao
            key={opcao}
            titulo={opcao === 'simples' ? 'Simples' : 'Ponderada'}
            aparencia={metodo === opcao ? 'principal' : 'contorno'}
            compacto
            estilo={estilos.opcao}
            aoTocar={() => setMetodo(opcao)}
          />
        ))}
      </View>

      <Botao
        titulo="Cadastrar"
        carregando={executando}
        desabilitado={nome.trim() === ''}
        aoTocar={() => void aoSalvar(nome.trim(), metodo)}
      />
    </Cartao>
  );
}

const estilos = StyleSheet.create({
  colunas: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: espaco.xl,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: espaco.md,
  },
  identificacao: {
    flex: 1,
    gap: espaco.sm,
  },
  numeros: {
    alignItems: 'flex-end',
  },
  selos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm,
  },
  acoes: {
    flexDirection: 'row',
    gap: espaco.md,
    borderTopWidth: 1,
    borderTopColor: cores.linha,
    paddingTop: espaco.sm,
  },
  painel: {
    gap: espaco.md,
    borderTopWidth: 1,
    borderTopColor: cores.linha,
    paddingTop: espaco.md,
  },
  duasColunas: {
    flexDirection: 'row',
    gap: espaco.md,
  },
  metade: {
    flex: 1,
  },
  alternador: {
    flexDirection: 'row',
    gap: espaco.sm,
  },
  opcao: {
    flex: 1,
  },
});
