/**
 * Módulo 5 — Roupa (SD21–SD24).
 *
 * A peça só entra na lista de "lavar" ao atingir o limite de usos que o
 * usuário definiu para ela (RN14) — quem conta é o backend, e o aviso vem na
 * resposta do uso (RF031). O alerta de sabão e amaciante (RF033) é uma
 * consulta ao estoque da Despensa, porque eles são produtos como os outros
 * (RN13).
 */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as roupaApi from '@/services/api/roupa';
import type { Peca } from '@/types/api';
import { useRequisicao } from '@/hooks/useRequisicao';
import { useAcao } from '@/hooks/useAcao';
import { TelaModulo } from '@/components/common/TelaModulo';
import { Secao } from '@/components/common/Secao';
import { Aviso } from '@/components/ui/Aviso';
import { Barra } from '@/components/ui/Barra';
import { Botao } from '@/components/ui/Botao';
import { Campo } from '@/components/ui/Campo';
import { Cartao } from '@/components/ui/Cartao';
import { EstadoVazio } from '@/components/ui/Estados';
import { Selo } from '@/components/ui/Selo';
import { Texto } from '@/components/ui/Texto';
import { cores, espaco } from '@/theme';
import { dataCurta } from '@/utils/formato';

const ACENTO = cores.modulo.roupa;

export function RoupaScreen() {
  const painel = useRequisicao(async () => {
    const [pecas, lavagens, alertas] = await Promise.all([
      roupaApi.listarPecas(),
      roupaApi.listarLavagens('agendada'),
      roupaApi.obterAlertas(),
    ]);
    return { pecas, lavagens, alertas };
  }, []);

  const acao = useAcao();
  const [novaAberta, setNovaAberta] = useState(false);

  const pecas = painel.dados?.pecas.pecas ?? [];
  const paraLavar = pecas.filter((peca) => peca.precisaLavar);

  async function registrarUso(peca: Peca) {
    const resultado = await acao.executar(
      () => roupaApi.registrarUso(peca.id),
      // RF031/RN14 — o aviso de "hora de lavar" vem do backend.
      (r) => r.alertaLavagem?.mensagem ?? null,
    );
    if (resultado) await painel.recarregar();
  }

  return (
    <TelaModulo
      titulo="Roupa"
      chamada="o que já rodou demais"
      modulo="roupa"
      carregando={painel.carregando && painel.dados === null}
      erro={painel.erro}
      aoRecarregar={painel.recarregar}
    >

      {painel.dados?.alertas.mensagem ? (
        <Aviso tom="atencao" mensagem={painel.dados.alertas.mensagem} />
      ) : null}

      {paraLavar.length > 0 ? (
        <Cartao acento={ACENTO}>
          <Texto variante="corpo" cor={cores.tintaMedia}>
            Na pilha de lavar
          </Texto>
          <Texto variante="corpo">{paraLavar.map((peca) => peca.nome).join(', ')}</Texto>
          {painel.dados && painel.dados.lavagens.lavagens.length === 0 ? (
            <Botao
              titulo="Agendar lavagem para amanhã"
              aparencia="contorno"
              compacto
              carregando={acao.executando}
              aoTocar={() => {
                void (async () => {
                  const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                  const agendada = await acao.executar(() =>
                    roupaApi.agendarLavagem(
                      amanha,
                      paraLavar.map((peca) => peca.id),
                    ),
                  );
                  if (agendada) await painel.recarregar();
                })();
              }}
            />
          ) : null}
        </Cartao>
      ) : null}

      {painel.dados && painel.dados.lavagens.lavagens.length > 0 ? (
        <Secao titulo="Lavagens agendadas">
          {painel.dados.lavagens.lavagens.map((lavagem) => (
            <Cartao key={lavagem.id} acento={ACENTO}>
              <View style={estilos.linha}>
                <View style={estilos.identificacao}>
                  <Texto variante="corpoForte">{dataCurta(lavagem.dataAgendada)}</Texto>
                  <Texto variante="legenda" cor={cores.tintaFraca}>
                    {lavagem.pecas.length === 0
                      ? 'sem peças vinculadas'
                      : lavagem.pecas.map((peca) => peca.nome).join(', ')}
                  </Texto>
                </View>
                {lavagem.lembreteAtivo ? <Selo texto="lembrete" cor={ACENTO} /> : null}
              </View>
              <View style={estilos.acoes}>
                <Botao
                  titulo="Lavei"
                  compacto
                  carregando={acao.executando}
                  aoTocar={() => {
                    void (async () => {
                      // Concluir zera o contador das peças e reinicia a RN14.
                      const concluida = await acao.executar(
                        () => roupaApi.concluirLavagem(lavagem.id),
                        (r) =>
                          r.pecasZeradas.length > 0
                            ? `Contador zerado: ${r.pecasZeradas.join(', ')}.`
                            : null,
                      );
                      if (concluida) await painel.recarregar();
                    })();
                  }}
                />
                <Botao
                  titulo="Cancelar"
                  aparencia="texto"
                  compacto
                  aoTocar={() => {
                    void (async () => {
                      const cancelada = await acao.executar(() =>
                        roupaApi.cancelarLavagem(lavagem.id),
                      );
                      if (cancelada) await painel.recarregar();
                    })();
                  }}
                />
              </View>
            </Cartao>
          ))}
        </Secao>
      ) : null}

      <Secao
        titulo="Peças"
        acao={
          <Botao
            titulo={novaAberta ? 'Fechar' : 'Nova peça'}
            aparencia="contorno"
            compacto
            aoTocar={() => setNovaAberta((aberta) => !aberta)}
          />
        }
      >
        {novaAberta ? (
          <FormularioPeca
            executando={acao.executando}
            aoSalvar={async (dados) => {
              const criada = await acao.executar(() => roupaApi.cadastrarPeca(dados));
              if (criada) {
                setNovaAberta(false);
                await painel.recarregar();
              }
            }}
          />
        ) : null}

        {pecas.length === 0 && !painel.carregando ? (
          <EstadoVazio
            titulo="nenhuma peça cadastrada"
            descricao="Cadastre o que você usa direto e diga de quantos usos vai à lavagem."
          />
        ) : null}

        {pecas.map((peca) => (
          <Cartao key={peca.id} acento={peca.precisaLavar ? cores.atencao : ACENTO}>
            <View style={estilos.linha}>
              <View style={estilos.identificacao}>
                <Texto variante="corpoForte">{peca.nome}</Texto>
                <Texto variante="legenda" cor={cores.tintaFraca}>
                  {peca.usosAtuais} de {peca.limiteUsos} uso(s)
                  {peca.precisaLavar ? '' : ` · faltam ${peca.usosRestantes}`}
                </Texto>
              </View>
              {peca.precisaLavar ? <Selo texto="lavar" cor={cores.atencao} preenchido /> : null}
            </View>

            <Barra proporcao={peca.usosAtuais / peca.limiteUsos} cor={ACENTO} corDeEstouro={cores.atencao} />

            <Botao
              titulo="Usei hoje"
              aparencia="texto"
              compacto
              carregando={acao.executando}
              aoTocar={() => void registrarUso(peca)}
            />
          </Cartao>
        ))}
      </Secao>

      {painel.dados ? (
        <Secao titulo="Sabão e amaciante">
          {painel.dados.alertas.insumos.map((insumo) => (
            <View key={insumo.nome} style={estilos.insumo}>
              <Texto variante="corpo">{insumo.nome}</Texto>
              {insumo.naoCadastrado ? (
                <Selo texto="não cadastrado" />
              ) : insumo.emFalta ? (
                <Selo texto="acabando" cor={cores.atencao} preenchido />
              ) : (
                <Texto variante="corpo" cor={cores.tintaMedia}>
                  {insumo.quantidadeAtual} {insumo.unidade}
                </Texto>
              )}
            </View>
          ))}
          <Texto variante="legenda" cor={cores.tintaFraca}>
            Sabão e amaciante são itens da Despensa (RN13) — o estoque é o mesmo.
          </Texto>
        </Secao>
      ) : null}
    </TelaModulo>
  );
}

function FormularioPeca({
  executando,
  aoSalvar,
}: {
  executando: boolean;
  aoSalvar(dados: { nome: string; tipo: string | null; limiteUsos: number }): Promise<void>;
}) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('');
  const [limite, setLimite] = useState('3');

  return (
    <Cartao acento={ACENTO}>
      <Campo rotulo="Peça" value={nome} onChangeText={setNome} placeholder="Calça jeans" />
      <Campo rotulo="Tipo" value={tipo} onChangeText={setTipo} placeholder="calça" />
      <Campo
        rotulo="Vai lavar a cada quantos usos"
        value={limite}
        onChangeText={setLimite}
        keyboardType="number-pad"
        dica="É o limite da RN14: ao atingir, a peça entra na pilha de lavar."
      />
      <Botao
        titulo="Cadastrar"
        carregando={executando}
        desabilitado={nome.trim() === '' || !(Number(limite) >= 1)}
        aoTocar={() =>
          void aoSalvar({
            nome: nome.trim(),
            tipo: tipo.trim() === '' ? null : tipo.trim(),
            limiteUsos: Number(limite),
          })
        }
      />
    </Cartao>
  );
}

const estilos = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: espaco.md,
  },
  identificacao: {
    flex: 1,
    gap: 2,
  },
  acoes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
  },
  insumo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaco.md,
    paddingBottom: espaco.sm,
    borderBottomWidth: 1,
    borderBottomColor: cores.linha,
  },
});
