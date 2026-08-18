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
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import * as roupaApi from '@/services/api/roupa';
import type { Peca } from '@/types/api';
import { useRequisicao } from '@/hooks/useRequisicao';
import { useAcao } from '@/hooks/useAcao';
import { useToast } from '@/components/ui/Toast';
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
import { Feather } from '@expo/vector-icons';
import { cores, espaco, raio, sombra } from '@/theme';
import { dataCurta } from '@/utils/formato';
import { escolherDaGaleria, tirarFoto } from '@/utils/fotoDaPeca';

const ACENTO = cores.modulo.roupa;

/** Lado do medalhão da foto no cartão. A miniatura enviada tem 400px. */
const LADO_DA_FOTO = 56;

/**
 * A foto da peça, ou o convite para tirá-la (RF038).
 *
 * Sem foto, o quadrado é o próprio botão: um ícone de câmera pedindo para ser
 * tocado ocupa o mesmo lugar que a imagem vai ocupar, então cadastrar a foto
 * não muda o layout do cartão. Com foto, toca-se nela para trocar.
 */
function FotoDaPeca({
  peca,
  ocupada,
  aoEscolher,
  aoApagar,
}: {
  peca: Peca;
  ocupada: boolean;
  aoEscolher(origem: 'camera' | 'galeria'): void;
  aoApagar(): void;
}) {
  const [menuAberto, setMenuAberto] = useState(false);

  if (ocupada) {
    return (
      <View style={[estilos.foto, estilos.fotoVazia]}>
        <ActivityIndicator color={ACENTO} />
      </View>
    );
  }

  return (
    <View>
      <Pressable
        onPress={() => (peca.temFoto ? setMenuAberto((aberto) => !aberto) : aoEscolher('camera'))}
        accessibilityRole="button"
        accessibilityLabel={
          peca.temFoto ? `Foto de ${peca.nome}. Tocar para trocar.` : `Fotografar ${peca.nome}`
        }
        style={({ pressed }) => [pressed && estilos.pressionado]}
      >
        {peca.temFoto ? (
          <Image source={roupaApi.fonteDaFoto(peca)} style={estilos.foto} resizeMode="cover" />
        ) : (
          <View style={[estilos.foto, estilos.fotoVazia]}>
            <Feather name="camera" size={22} color={ACENTO} />
          </View>
        )}
      </Pressable>

      {/* O menu só existe para quem já tem foto: quem não tem vai direto para
          a câmera, que é o caso comum de estar com a peça na mão. */}
      {menuAberto ? (
        <View style={estilos.menuDaFoto}>
          <Botao
            titulo="Tirar outra"
            aparencia="texto"
            compacto
            aoTocar={() => {
              setMenuAberto(false);
              aoEscolher('camera');
            }}
          />
          <Botao
            titulo="Escolher da galeria"
            aparencia="texto"
            compacto
            aoTocar={() => {
              setMenuAberto(false);
              aoEscolher('galeria');
            }}
          />
          <Botao
            titulo="Remover foto"
            aparencia="texto"
            compacto
            aoTocar={() => {
              setMenuAberto(false);
              aoApagar();
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

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
  const { mostrar } = useToast();
  const [novaAberta, setNovaAberta] = useState(false);
  /** Qual peça está com foto em processamento — trava só o cartão dela. */
  const [fotografando, setFotografando] = useState<number | null>(null);

  const pecas = painel.dados?.pecas.pecas ?? [];
  const paraLavar = pecas.filter((peca) => peca.precisaLavar);

  /** RF038 — tirar ou escolher, reduzir no aparelho e gravar. */
  async function trocarFoto(peca: Peca, origem: 'camera' | 'galeria') {
    setFotografando(peca.id);
    try {
      const imagem = origem === 'camera' ? await tirarFoto() : await escolherDaGaleria();
      // `null` é desistência ou permissão negada — nos dois casos não há o que
      // dizer, e um erro aqui culparia a pessoa por ter mudado de ideia.
      if (!imagem) return;

      await roupaApi.definirFotoDaPeca(peca.id, imagem);
      await painel.recarregar();
    } catch (causa) {
      mostrar(causa instanceof Error ? causa.message : 'Não deu para salvar a foto.', 'erro');
    } finally {
      setFotografando(null);
    }
  }

  async function apagarFoto(peca: Peca) {
    const feito = await acao.executar(() => roupaApi.removerFotoDaPeca(peca.id));
    if (feito !== null) await painel.recarregar();
  }

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
              {/* RF038 — a foto vem antes do nome: quinze peças escritas viram
                  uma lista que não se lê, e é a imagem que faz reconhecer. */}
              <FotoDaPeca
                peca={peca}
                ocupada={fotografando === peca.id}
                aoEscolher={(origem) => void trocarFoto(peca, origem)}
                aoApagar={() => void apagarFoto(peca)}
              />
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
  foto: {
    width: LADO_DA_FOTO,
    height: LADO_DA_FOTO,
    borderRadius: raio.md,
    backgroundColor: cores.fundoMudo,
  },
  fotoVazia: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: cores.linha,
    borderStyle: 'dashed',
  },
  pressionado: {
    opacity: 0.7,
  },
  menuDaFoto: {
    position: 'absolute',
    top: LADO_DA_FOTO + 4,
    left: 0,
    zIndex: 10,
    minWidth: 180,
    gap: 2,
    padding: 4,
    borderRadius: raio.md,
    backgroundColor: cores.superficie,
    ...sombra.alta,
  },
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
