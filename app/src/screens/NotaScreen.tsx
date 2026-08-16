/**
 * SD06 — leitura de nota fiscal (RF008, RN06, RN18, RN22).
 *
 * A tela tem dois passos porque a nota tem dois passos:
 *
 * 1. **Identificar a nota** — o QR Code dá a chave de acesso e o hash de
 *    validação. Quem não consegue apontar a câmera (nota amassada, pouca luz,
 *    aparelho sem foco) digita os 44 dígitos.
 * 2. **Conferir os itens** — RN22: os produtos não estão dentro do QR Code,
 *    mas estão na consulta pública da SEFAZ, que o servidor tenta ler com o
 *    hash da URL. Deu certo, os itens já vêm preenchidos e o usuário confere;
 *    não deu (portal fora do ar, UF sem suporte, chave digitada sem hash), ele
 *    preenche. A conferência existe nos dois casos — o que o portal devolve é
 *    o que o mercado registrou, e nem sempre é o que se quer na despensa.
 *
 * O gasto nasce categorizado como "Mercado" (RN18) e a nota repetida é recusada
 * pela chave (RN06) — as duas regras são do servidor; aqui só se mostra o erro.
 */

import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import * as despensaApi from '@/services/api/despensa';
import { useAcao } from '@/hooks/useAcao';
import { useToast } from '@/components/ui/Toast';
import { TelaModulo } from '@/components/common/TelaModulo';
import { Secao } from '@/components/common/Secao';
import { Aviso } from '@/components/ui/Aviso';
import { Botao } from '@/components/ui/Botao';
import { Campo } from '@/components/ui/Campo';
import { Cartao } from '@/components/ui/Cartao';
import { Texto } from '@/components/ui/Texto';
import { extrairChaveDeAcesso, type LeituraDeChave } from '@/utils/chaveDeAcesso';
import { hoje } from '@/utils/formato';
import { cores, espaco, raio } from '@/theme';

const ACENTO = cores.modulo.despensa;

interface ItemDaNota {
  descricao: string;
  quantidade: string;
  valorUnitario: string;
  /**
   * A descrição como o mercado imprimiu, quando o campo foi trocado pelo nome
   * de um produto que já existe na despensa.
   *
   * Guardada para poder ser mostrada e devolvida: o casamento é palpite, e o
   * usuário precisa ver o que foi trocado para discordar.
   */
  descricaoOriginal?: string | undefined;
}

const ITEM_VAZIO: ItemDaNota = { descricao: '', quantidade: '1', valorUnitario: '' };

export function NotaScreen() {
  const router = useRouter();
  const acao = useAcao();
  const { mostrar } = useToast();

  const [chave, setChave] = useState<string | null>(null);
  const [chaveDigitada, setChaveDigitada] = useState('');
  const [camerAberta, setCameraAberta] = useState(false);

  const [local, setLocal] = useState('');
  const [data, setData] = useState(hoje());
  const [itens, setItens] = useState<ItemDaNota[]>([{ ...ITEM_VAZIO }]);

  const [consultando, setConsultando] = useState(false);
  /** De onde vieram os itens na tela — muda o que se pede ao usuário. */
  const [origemDosItens, setOrigemDosItens] = useState<'sefaz' | 'manual'>('manual');
  const [avisoDaConsulta, setAvisoDaConsulta] = useState<string | null>(null);

  /**
   * Passo 1 → 2. A consulta é tentada aqui e não no envio: preencher depois de
   * o usuário já ter digitado tudo apagaria o trabalho dele.
   */
  async function usarLeitura(leitura: LeituraDeChave) {
    setChave(leitura.chave);
    setConsultando(true);
    setAvisoDaConsulta(null);

    try {
      const resultado = await despensaApi.consultarNota(leitura.conteudo, leitura.chave);
      const encontrados = resultado.nota?.itens ?? [];

      if (resultado.consultada && encontrados.length > 0) {
        setItens(
          encontrados.map((item) => ({
            // O nome da despensa entra no campo quando existe: é ele que faz a
            // conciliação do estoque encontrar o produto de sempre em vez de
            // criar mais um. A descrição da nota fica guardada ao lado.
            descricao: item.sugestao?.nome ?? item.descricao,
            ...(item.sugestao ? { descricaoOriginal: item.descricao } : {}),
            quantidade: String(item.quantidade).replace('.', ','),
            valorUnitario: item.valorUnitario.toFixed(2).replace('.', ','),
          })),
        );
        setOrigemDosItens('sefaz');
        if (resultado.nota?.localCompra) setLocal(resultado.nota.localCompra);
        if (resultado.nota?.dataCompra) setData(resultado.nota.dataCompra);
      } else {
        setOrigemDosItens('manual');
        setAvisoDaConsulta(resultado.motivo);
      }
    } catch {
      // A nota já está identificada; falhar a consulta não pode custar isso.
      setOrigemDosItens('manual');
      setAvisoDaConsulta('Não deu para buscar os itens agora — dá para informar abaixo.');
    } finally {
      setConsultando(false);
    }
  }

  function aoLerCodigo(conteudo: string) {
    const leitura = extrairChaveDeAcesso(conteudo);
    if (!leitura) {
      // Não fecha a câmera: quase sempre é mira, e fechar obrigaria a recomeçar.
      // Toast e não faixa: a câmera ocupa a tela, e a faixa nasceria acima
      // dela, fora de vista justamente de quem está mirando.
      mostrar('Esse código não é de uma nota fiscal. Aponte para o QR da NFC-e.', 'atencao');
      return;
    }
    setCameraAberta(false);
    void usarLeitura(leitura);
  }

  function confirmarChaveDigitada() {
    const leitura = extrairChaveDeAcesso(chaveDigitada);
    if (!leitura) {
      mostrar('A chave de acesso tem 44 dígitos.', 'atencao');
      return;
    }
    void usarLeitura(leitura);
  }

  /** Quantos itens já casaram com um produto que existe (RN22). */
  const reconhecidos = itens.filter((item) => item.descricaoOriginal).length;

  const itensValidos = itens
    .map((item) => ({
      descricao: item.descricao.trim(),
      quantidade: Number(item.quantidade.replace(',', '.')),
      valorUnitario: Number(item.valorUnitario.replace(',', '.')),
    }))
    .filter(
      (item) =>
        item.descricao !== '' && item.quantidade > 0 && Number.isFinite(item.valorUnitario),
    );

  async function enviar() {
    if (!chave) return;
    const resultado = await acao.executar(() =>
      despensaApi.processarNota({
        chaveAcesso: chave,
        localCompra: local.trim() || null,
        dataCompra: data,
        itens: itensValidos,
      }),
    );
    if (resultado) router.back();
  }

  return (
    <TelaModulo
      titulo="Ler nota"
      chamada={chave ? 'agora informe o que entrou' : 'aponte para o QR Code'}
      modulo="despensa"
      dentroDasAbas={false}
    >
      {/* Não é erro: é o motivo de a lista ter vindo vazia, e o que fazer.
          Fica na tela, e não em recado passageiro, porque explica o formulário
          em branco que a pessoa tem à frente. */}
      {avisoDaConsulta ? <Aviso mensagem={avisoDaConsulta} tom="atencao" /> : null}

      {consultando ? (
        <Cartao acento={ACENTO}>
          <Texto variante="corpoForte">Buscando os itens na nota…</Texto>
          <Texto variante="legenda" cor={cores.tintaMedia}>
            Consultando a SEFAZ com o código lido.
          </Texto>
        </Cartao>
      ) : null}

      {chave === null ? (
        <PassoDaChave
          cameraAberta={camerAberta}
          aoAbrirCamera={() => setCameraAberta(true)}
          aoFecharCamera={() => setCameraAberta(false)}
          aoLerCodigo={aoLerCodigo}
          chaveDigitada={chaveDigitada}
          aoDigitarChave={setChaveDigitada}
          aoConfirmarDigitada={confirmarChaveDigitada}
        />
      ) : consultando ? null : (
        <>
          <Cartao acento={ACENTO}>
            <Texto variante="corpo" cor={cores.tintaMedia}>
              Nota identificada
            </Texto>
            {/* Em blocos de 4, que é como a chave é impressa na nota. */}
            <Texto variante="corpoForte">{chave.replace(/(\d{4})/g, '$1 ').trim()}</Texto>
            <Botao
              titulo="Ler outra"
              aparencia="texto"
              compacto
              aoTocar={() => {
                setChave(null);
                setChaveDigitada('');
                setItens([{ ...ITEM_VAZIO }]);
                setOrigemDosItens('manual');
                setAvisoDaConsulta(null);
              }}
            />
          </Cartao>

          <Secao titulo="Itens">
            {/*
              RN22 — os itens vieram da SEFAZ ou vêm do usuário, e a frase muda
              junto: pedir "informe" para uma lista já preenchida mandaria
              refazer o que está pronto.
            */}
            <Texto variante="corpo" cor={cores.tintaMedia}>
              {origemDosItens === 'sefaz'
                ? `${itens.length} item(ns) vieram da nota${
                    reconhecidos > 0 ? `, ${reconhecidos} já reconhecido(s) da sua despensa` : ''
                  }. Confira e ajuste o que for preciso.`
                : 'O QR Code identifica a nota, mas não lista os produtos. Informe o que entrou na despensa.'}
            </Texto>

            {itens.map((item, indice) => (
              <Cartao key={indice}>
                <Campo
                  rotulo="Produto"
                  value={item.descricao}
                  onChangeText={(texto) => atualizarItem(setItens, indice, { descricao: texto })}
                  placeholder="Arroz"
                />
                {/*
                  O casamento com a despensa é palpite, então aparece: some o
                  nome que veio impresso e o caminho de volta. Trocar calado
                  faria o usuário lançar um item que ele não reconhece na nota.
                */}
                {item.descricaoOriginal ? (
                  <View style={estilos.casamento}>
                    <Feather name="corner-down-right" size={14} color={cores.tintaFraca} />
                    <Texto variante="legenda" cor={cores.tintaMedia} estilo={estilos.deQuem}>
                      na nota: {item.descricaoOriginal}
                    </Texto>
                    <Botao
                      titulo="usar este"
                      aparencia="texto"
                      compacto
                      aoTocar={() =>
                        atualizarItem(setItens, indice, {
                          descricao: item.descricaoOriginal ?? '',
                          descricaoOriginal: undefined,
                        })
                      }
                    />
                  </View>
                ) : null}
                <View style={estilos.duasColunas}>
                  <View style={estilos.metade}>
                    <Campo
                      rotulo="Quantidade"
                      value={item.quantidade}
                      onChangeText={(texto) =>
                        atualizarItem(setItens, indice, { quantidade: texto })
                      }
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={estilos.metade}>
                    <Campo
                      rotulo="Valor unitário"
                      value={item.valorUnitario}
                      onChangeText={(texto) =>
                        atualizarItem(setItens, indice, { valorUnitario: texto })
                      }
                      keyboardType="decimal-pad"
                      placeholder="0,00"
                    />
                  </View>
                </View>
                {itens.length > 1 ? (
                  <Botao
                    titulo="Remover"
                    aparencia="texto"
                    compacto
                    aoTocar={() => setItens((atuais) => atuais.filter((_, i) => i !== indice))}
                  />
                ) : null}
              </Cartao>
            ))}

            <Botao
              titulo="Mais um item"
              aparencia="contorno"
              compacto
              aoTocar={() => setItens((atuais) => [...atuais, { ...ITEM_VAZIO }])}
            />
          </Secao>

          <Secao titulo="Da nota">
            <Campo
              rotulo="Onde foi a compra"
              value={local}
              onChangeText={setLocal}
              placeholder="Mercado do Zé"
            />
            <Campo rotulo="Data da compra" value={data} onChangeText={setData} placeholder="AAAA-MM-DD" />
          </Secao>

          <Botao
            titulo={`Lançar ${itensValidos.length} item(ns)`}
            carregando={acao.executando}
            desabilitado={itensValidos.length === 0}
            aoTocar={() => void enviar()}
          />
          {/* RN18 — o gasto da nota nasce em "Mercado"; dizer isso evita surpresa. */}
          <Texto variante="legenda" cor={cores.tintaFraca}>
            O total entra como gasto na categoria “Mercado”.
          </Texto>
        </>
      )}
    </TelaModulo>
  );
}

function PassoDaChave({
  cameraAberta,
  aoAbrirCamera,
  aoFecharCamera,
  aoLerCodigo,
  chaveDigitada,
  aoDigitarChave,
  aoConfirmarDigitada,
}: {
  cameraAberta: boolean;
  aoAbrirCamera(): void;
  aoFecharCamera(): void;
  aoLerCodigo(conteudo: string): void;
  chaveDigitada: string;
  aoDigitarChave(texto: string): void;
  aoConfirmarDigitada(): void;
}) {
  const [permissao, pedirPermissao] = useCameraPermissions();

  return (
    <>
      {/*
        RN22 dito antes de escanear, não depois: o que vem do QR é a nota, e os
        itens dependem do portal responder. Prometer a lista pronta e cair no
        formulário vazio quebraria a expectativa no pior momento — depois do
        esforço de mirar a câmera.
      */}
      <Secao titulo="Escanear">
        <Texto variante="corpo" cor={cores.tintaMedia}>
          O código identifica a nota; os itens vêm da consulta da SEFAZ. Quando ela não
          responde, dá para informar os produtos à mão.
        </Texto>
        {cameraAberta && permissao?.granted ? (
          <View style={estilos.camera}>
            <CameraView
              style={estilos.visor}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => aoLerCodigo(data)}
            />
            <View style={estilos.mira} pointerEvents="none" />
            <Botao titulo="Cancelar" aparencia="texto" compacto aoTocar={aoFecharCamera} />
          </View>
        ) : (
          <Pressable
            onPress={async () => {
              // Pedir na hora do uso, não na abertura da tela: a permissão faz
              // sentido para quem acabou de dizer que quer escanear.
              if (!permissao?.granted) {
                const resposta = await pedirPermissao();
                if (!resposta.granted) return;
              }
              aoAbrirCamera();
            }}
            accessibilityRole="button"
            style={({ pressed }) => [estilos.alvo, pressed && estilos.pressionado]}
          >
            <Feather name="maximize" size={34} color={ACENTO} />
            <Texto variante="corpoForte">Abrir a câmera</Texto>
            <Texto variante="legenda" cor={cores.tintaMedia}>
              {permissao?.granted === false
                ? 'Sem permissão de câmera — dá para digitar a chave abaixo.'
                : 'Aponte para o QR Code impresso na nota.'}
            </Texto>
          </Pressable>
        )}
      </Secao>

      <Secao titulo="Ou digite a chave">
        <Campo
          rotulo="Chave de acesso"
          value={chaveDigitada}
          onChangeText={aoDigitarChave}
          keyboardType="number-pad"
          placeholder="44 dígitos impressos na nota"
        />
        <Botao
          titulo="Usar esta chave"
          aparencia="contorno"
          desabilitado={chaveDigitada.replace(/\D/g, '').length !== 44}
          aoTocar={aoConfirmarDigitada}
        />
        {Platform.OS === 'android' ? (
          <Texto variante="legenda" cor={cores.tintaFraca}>
            No emulador a câmera não lê QR de verdade: use este campo para testar o fluxo.
          </Texto>
        ) : null}
      </Secao>
    </>
  );
}

function atualizarItem(
  setItens: React.Dispatch<React.SetStateAction<ItemDaNota[]>>,
  indice: number,
  mudanca: Partial<ItemDaNota>,
) {
  setItens((atuais) =>
    atuais.map((item, i) => (i === indice ? { ...item, ...mudanca } : item)),
  );
}

const estilos = StyleSheet.create({
  camera: {
    gap: espaco.md,
  },
  visor: {
    height: 280,
    borderRadius: raio.lg,
    overflow: 'hidden',
  },
  mira: {
    position: 'absolute',
    top: 60,
    left: '18%',
    right: '18%',
    height: 160,
    borderWidth: 2,
    borderColor: cores.branco,
    borderRadius: raio.md,
    opacity: 0.9,
  },
  alvo: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaco.sm,
    paddingVertical: espaco.xxl,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.linha,
    borderStyle: 'dashed',
    borderRadius: raio.lg,
  },
  pressionado: {
    opacity: 0.7,
  },
  casamento: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.xs,
    marginTop: -espaco.xs,
  },
  deQuem: {
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
