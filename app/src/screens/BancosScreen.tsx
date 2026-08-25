/**
 * Open Finance — conectar, sincronizar e revogar (SD25–SD27, RF034–RF037).
 *
 * O fluxo tem três passos porque o consentimento tem três passos de verdade:
 * abrir, o usuário autorizar no ambiente da instituição, e confirmar. O passo
 * do meio não acontece aqui (RNF18), e a tela suporta as duas formas dele sem
 * saber qual provedor o backend escolheu:
 *
 *   * veio `tokenDoCliente` → abre o widget do agregador, onde a senha é
 *     digitada no domínio dele;
 *   * não veio → provedor simulado, e o passo vira uma chamada de simulação.
 *
 * Quem decide é a resposta da abertura, não uma configuração do app. Assim
 * ligar a integração real é preencher variáveis no servidor, sem build novo do
 * cliente.
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
import { WidgetDoBanco } from '@/components/common/WidgetDoBanco';
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
  /**
   * Consentimento aberto, à espera de o usuário terminar no widget. Guarda o
   * id do nosso consentimento junto do token porque a confirmação precisa dos
   * dois: o nosso, para saber qual linha atualizar, e o do vínculo, que só
   * existe quando o widget termina.
   */
  const [emAutorizacao, setEmAutorizacao] = useState<
    { consentimentoId: number; token: string } | null
  >(null);

  const conexoes = painel.dados?.conexoes.conexoes ?? [];
  const instituicoes = painel.dados?.instituicoes.instituicoes ?? [];
  // Enquanto não se sabe, assume simulado: prometer conexão real e entregar
  // dados fictícios é o erro pior dos dois.
  const simulado = painel.dados?.instituicoes.simulado ?? true;
  /**
   * Com agregador real a escolha do banco é do widget, que tem busca, marca e
   * o catálogo inteiro. Desenhar a nossa lista aqui seria um segundo seletor
   * para a mesma escolha — e o pior dos dois, porque a nossa não filtra nada e
   * o catálogo real tem centenas de instituições.
   */
  const escolhaNoWidget = painel.dados?.instituicoes.escolhaNoWidget ?? false;
  const sandbox = painel.dados?.instituicoes.sandbox ?? false;
  const jaConectadas = new Set(
    conexoes.filter((c) => c.status === 'ativo').map((c) => c.instituicao),
  );

  /**
   * Abre o consentimento e escolhe o caminho do passo do meio pela resposta:
   * com `tokenDoCliente`, o widget do agregador; sem ele, o simulador.
   */
  async function conectar(instituicaoId?: string) {
    setConectando(instituicaoId ?? 'widget');
    const aberto = await acao.executar(() =>
      openFinanceApi.criarConsentimento(instituicaoId),
    );

    if (!aberto) {
      setConectando(null);
      return;
    }

    // Provedor real: o resto do fluxo depende de o usuário concluir no widget,
    // então a tela para aqui e volta em `concluirAutorizacao`.
    if (aberto.tokenDoCliente) {
      setEmAutorizacao({
        consentimentoId: aberto.consentimento.id,
        token: aberto.tokenDoCliente,
      });
      return;
    }

    // Provedor simulado: o passo do meio é uma chamada, não uma tela.
    await openFinanceApi.simularAutorizacao(aberto.consentimento.id).catch(() => undefined);
    await concluirAutorizacao(aberto.consentimento.id);
  }

  /**
   * Confirma o consentimento e já sincroniza.
   *
   * `idExterno` só existe no caminho do widget — é o vínculo que o agregador
   * acabou de criar, e é ele que substitui o id provisório no backend.
   */
  async function concluirAutorizacao(
    consentimentoId: number,
    idExterno?: string,
    instituicao?: string,
  ) {
    setEmAutorizacao(null);
    const resultado = await acao.executar(async () => {
      await openFinanceApi.autorizarConsentimento(consentimentoId, idExterno, instituicao);
      return openFinanceApi.sincronizar(consentimentoId);
    }, (r) => mensagemDaSincronizacao(r.resumo));
    setConectando(null);
    // Recarrega mesmo em falha: a autorização pode ter passado e a
    // sincronização não, e nesse caso a conexão já existe e precisa aparecer.
    await painel.recarregar();
    return resultado;
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
      {/*
        Fora do fluxo da tela, por cima de tudo: enquanto o widget está aberto
        quem conduz é o agregador. Desmontar ao terminar é o que garante que o
        token de 30 min não fica vivo numa tela que ninguém está olhando.
      */}
      {emAutorizacao ? (
        <WidgetDoBanco
          connectToken={emAutorizacao.token}
          sandbox={sandbox}
          aoConcluir={(idExterno, instituicao) => {
            void concluirAutorizacao(emAutorizacao.consentimentoId, idExterno, instituicao);
          }}
          aoCancelar={() => {
            // Desistir não deixa lixo: o consentimento fica pendente e a tela
            // volta ao estado de antes, sem conexão meio-feita na lista.
            setEmAutorizacao(null);
            setConectando(null);
            void painel.recarregar();
          }}
        />
      ) : null}

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
        {escolhaNoWidget ? (
          /*
            Um botão, não uma lista. Escolher o banco é papel do widget, que
            faz isso melhor: tem busca, marca e o catálogo inteiro do
            agregador. A lista daqui repetia a mesma escolha sem filtro nenhum,
            e com o catálogo real vira um paredão de centenas de linhas.
          */
          <Botao
            titulo="Conectar um banco"
            carregando={acao.executando}
            aoTocar={() => void conectar()}
          />
        ) : null}

        <View style={estilos.grade}>
          {(escolhaNoWidget ? [] : instituicoes).map((instituicao) => {
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

        {/*
          A legenda muda com o provedor porque a afirmação muda. Dizer
          "simulado" com a integração ligada seria tão errado quanto o
          contrário — e é o tipo de texto que envelhece calado.
        */}
        <Texto variante="legenda" cor={cores.tintaFraca}>
          {simulado
            ? 'Provedor simulado: a autorização que normalmente acontece no app do banco está ' +
              'embutida no toque, e os dados são fictícios. Com um agregador autorizado, este ' +
              'passo abre o ambiente da instituição.'
            : sandbox
              ? 'Modo de teste: você escolhe o banco e digita a senha no ambiente do provedor, ' +
                'mas as instituições são de demonstração e os dados são fictícios.'
              : 'Você escolhe o banco e digita a senha no ambiente da instituição, fora do ' +
                'Xepa. Sua senha não passa por nós, e você pode revogar quando quiser.'}
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
