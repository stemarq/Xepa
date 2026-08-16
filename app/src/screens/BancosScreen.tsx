/**
 * Open Finance — conectar, sincronizar e revogar (SD25–SD27, RF034–RF037).
 *
 * O fluxo tem três passos porque o consentimento tem três passos de verdade:
 * abrir, o usuário autorizar no ambiente da instituição, e confirmar. O passo
 * do meio não acontece aqui — no mundo real é o app do banco (RNF18). Com o
 * provedor simulado ele vira um botão, e a tela diz isso em voz alta em vez de
 * fingir que o Xepa autenticou alguém.
 *
 * RF037 — escopo e validade ficam à vista antes e depois do aceite; é o que
 * sustenta o consentimento informado (RNF17).
 */

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as openFinanceApi from '@/services/api/openFinance';
import type { ConexaoOpenFinance, StatusConsentimento } from '@/types/api';
import { useRequisicao } from '@/hooks/useRequisicao';
import { useAcao } from '@/hooks/useAcao';
import { TelaModulo } from '@/components/common/TelaModulo';
import { Secao } from '@/components/common/Secao';
import { Aviso } from '@/components/ui/Aviso';
import { Botao } from '@/components/ui/Botao';
import { Cartao } from '@/components/ui/Cartao';
import { EstadoVazio } from '@/components/ui/Estados';
import { Selo } from '@/components/ui/Selo';
import { Texto } from '@/components/ui/Texto';
import { cores, espaco, raio } from '@/theme';
import { dataCurta } from '@/utils/formato';

const ACENTO = cores.modulo.grana;

export function BancosScreen() {
  const painel = useRequisicao(async () => {
    const [instituicoes, conexoes] = await Promise.all([
      openFinanceApi.listarInstituicoes(),
      openFinanceApi.listarConexoes(),
    ]);
    return { instituicoes, conexoes };
  }, []);

  const acao = useAcao();
  const [conectando, setConectando] = useState<string | null>(null);

  const conexoes = painel.dados?.conexoes.conexoes ?? [];
  const instituicoes = painel.dados?.instituicoes.instituicoes ?? [];
  const jaConectadas = new Set(
    conexoes.filter((c) => c.status === 'ativo').map((c) => c.instituicao),
  );

  /**
   * Os três passos, um atrás do outro. O do meio só existe porque o provedor é
   * o simulado — com um agregador real, aqui abriria a `urlDeAutorizacao`.
   */
  async function conectar(instituicaoId: string) {
    setConectando(instituicaoId);
    const resultado = await acao.executar(async () => {
      const { consentimento } = await openFinanceApi.criarConsentimento(instituicaoId);
      await openFinanceApi.simularAutorizacao(consentimento.id);
      await openFinanceApi.autorizarConsentimento(consentimento.id);
      return openFinanceApi.sincronizar(consentimento.id);
    }, (r) => mensagemDaSincronizacao(r.resumo));
    setConectando(null);
    if (resultado) await painel.recarregar();
  }

  async function sincronizar(conexao: ConexaoOpenFinance) {
    const resultado = await acao.executar(
      () => openFinanceApi.sincronizar(conexao.id),
      (r) => mensagemDaSincronizacao(r.resumo),
    );
    if (resultado) await painel.recarregar();
  }

  async function revogar(conexao: ConexaoOpenFinance) {
    const resultado = await acao.executar(() =>
      openFinanceApi.revogarConsentimento(conexao.id),
    );
    if (resultado !== null) await painel.recarregar();
  }

  return (
    <TelaModulo
      titulo="Bancos"
      chamada="conexões via Open Finance"
      modulo="grana"
      carregando={painel.carregando && painel.dados === null}
      erro={painel.erro}
      aoRecarregar={painel.recarregar}
      dentroDasAbas={false}
    >

      <Aviso
        tom="neutro"
        mensagem="O Xepa não guarda a senha do seu banco. A autorização acontece na instituição, e você pode revogar quando quiser."
      />

      <Secao titulo="Conectadas">
        {conexoes.length === 0 ? (
          <EstadoVazio
            titulo="nenhum banco conectado"
            descricao="Conectar traz o extrato sozinho, sem digitar lançamento a lançamento."
          />
        ) : null}

        {conexoes.map((conexao) => (
          <Cartao key={conexao.id} acento={conexao.status === 'ativo' ? ACENTO : cores.linhaForte}>
            <View style={estilos.linha}>
              <Texto variante="cartaoNome">{conexao.instituicao}</Texto>
              <Selo texto={ROTULO_STATUS[conexao.status]} cor={COR_STATUS[conexao.status]} />
            </View>

            {/* RF037 — escopo e validade à vista. */}
            <Texto variante="legenda" cor={cores.tintaMedia}>
              Consentido: {conexao.escopo.split(',').join(', ')}
            </Texto>
            <Texto variante="legenda" cor={cores.tintaFraca}>
              {conexao.status === 'revogado'
                ? `Revogado em ${dataCurta(conexao.revogadoEm ?? '')}`
                : `Vale até ${dataCurta(conexao.expiraEm)}`}
            </Texto>

            {conexao.contas.length > 0 ? (
              <View style={estilos.contas}>
                {conexao.contas.map((c) => (
                  <Texto key={c.id} variante="legenda" cor={cores.tintaMedia}>
                    {c.nome_banco} · {c.tipo}
                  </Texto>
                ))}
              </View>
            ) : null}

            <View style={estilos.acoes}>
              {conexao.status === 'ativo' ? (
                <Botao
                  titulo="Sincronizar"
                  aparencia="texto"
                  compacto
                  carregando={acao.executando}
                  aoTocar={() => void sincronizar(conexao)}
                />
              ) : null}
              {conexao.status !== 'revogado' ? (
                <Botao
                  titulo="Revogar"
                  aparencia="texto"
                  compacto
                  aoTocar={() => void revogar(conexao)}
                />
              ) : null}
            </View>
          </Cartao>
        ))}
      </Secao>

      <Secao titulo="Conectar">
        <View style={estilos.grade}>
          {instituicoes.map((instituicao) => {
            const conectada = jaConectadas.has(instituicao.nome);
            return (
              <Pressable
                key={instituicao.id}
                disabled={conectada || acao.executando}
                onPress={() => void conectar(instituicao.id)}
                accessibilityRole="button"
                accessibilityState={{ disabled: conectada }}
                style={({ pressed }) => [
                  estilos.instituicao,
                  conectada && estilos.instituicaoConectada,
                  pressed && estilos.pressionada,
                ]}
              >
                <Texto variante="corpoForte" cor={conectada ? cores.tintaFraca : cores.tinta}>
                  {instituicao.nome}
                </Texto>
                <Texto variante="legenda" cor={cores.tintaFraca}>
                  {conectada
                    ? 'já conectado'
                    : conectando === instituicao.id
                      ? 'conectando…'
                      : 'toque para conectar'}
                </Texto>
              </Pressable>
            );
          })}
        </View>

        <Texto variante="legenda" cor={cores.tintaFraca}>
          Provedor simulado: a autorização que normalmente acontece no app do banco está embutida
          no toque. Com um agregador autorizado, este passo abre o ambiente da instituição.
        </Texto>
      </Secao>
    </TelaModulo>
  );
}

/** RN19/RN20 — dizer o que a sincronização fez, inclusive o que ela evitou. */
function mensagemDaSincronizacao(resumo: {
  importadas: number;
  conciliadas: number;
  ignoradas: number;
}): string | null {
  const partes: string[] = [];
  if (resumo.importadas > 0) partes.push(`${resumo.importadas} lançamento(s) novo(s)`);
  if (resumo.conciliadas > 0) {
    partes.push(`${resumo.conciliadas} já tinha(m) vindo por nota fiscal`);
  }
  if (partes.length === 0) return 'Nada novo no extrato.';
  return `${partes.join(' · ')}.`;
}

const ROTULO_STATUS: Record<StatusConsentimento, string> = {
  pendente: 'aguardando',
  ativo: 'ativo',
  expirado: 'expirado',
  revogado: 'revogado',
};

const COR_STATUS: Record<StatusConsentimento, string> = {
  pendente: cores.atencao,
  ativo: cores.sucesso,
  expirado: cores.atencao,
  revogado: cores.tintaMedia,
};

const estilos = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaco.md,
  },
  contas: {
    gap: 2,
    borderTopWidth: 1,
    borderTopColor: cores.linha,
    paddingTop: espaco.sm,
  },
  acoes: {
    flexDirection: 'row',
    gap: espaco.lg,
  },
  grade: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.md,
  },
  instituicao: {
    flexGrow: 1,
    minWidth: '46%',
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.linha,
    borderRadius: raio.lg,
    padding: espaco.lg,
    gap: 2,
  },
  instituicaoConectada: {
    backgroundColor: cores.fundoMudo,
    borderColor: cores.fundoMudo,
  },
  pressionada: {
    opacity: 0.7,
  },
});
