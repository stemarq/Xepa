/**
 * Recado flutuante — o retorno das ações que mudam algo no servidor.
 *
 * Antes, esse retorno era uma faixa no começo do conteúdo da tela. O problema
 * é que o conteúdo **rola**: quem tocou "dar baixa" num cartão lá embaixo
 * recebia a resposta a três telas de distância, fora do campo de visão. A ação
 * parecia não ter acontecido.
 *
 * Aqui o recado é irmão da tela, não filho da rolagem: fica preso à janela e
 * aparece onde quer que a pessoa esteja olhando.
 *
 * **O que não vem para cá**: aviso que descreve um estado permanente — "3
 * itens no limite que você definiu", "nenhum banco conectado". Esses não são
 * resposta a um toque, são condição da tela, e some-los depois de alguns
 * segundos apagaria informação que precisa continuar à vista. Aviso continua
 * existindo para eles.
 *
 * Também não é caixa de diálogo: confirmação de rotina não deve exigir um
 * toque para sumir. Modal se justifica quando há uma decisão a tomar, e aqui
 * não há.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cores, espaco, medida, raio, sombra } from '@/theme';
import { Texto } from './Texto';

export type TomDoRecado = 'erro' | 'atencao' | 'sucesso' | 'neutro';

/**
 * Quanto tempo cada tom fica na tela.
 *
 * Erro dura quase o dobro: costuma ser a mensagem mais longa, e é a que a
 * pessoa precisa ler inteira para saber o que fazer em seguida. Sumir rápido
 * transformaria o erro em "piscou alguma coisa vermelha".
 */
const DURACAO: Record<TomDoRecado, number> = {
  erro: 6000,
  atencao: 5000,
  sucesso: 4000,
  neutro: 4000,
};

interface Recado {
  /** Muda a cada mostrar(), para reiniciar a animação em mensagens repetidas. */
  chave: number;
  mensagem: string;
  tom: TomDoRecado;
}

interface ContextoDeToast {
  mostrar(mensagem: string, tom?: TomDoRecado): void;
}

const Contexto = createContext<ContextoDeToast | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [recado, setRecado] = useState<Recado | null>(null);
  const contador = useRef(0);

  const mostrar = useCallback((mensagem: string, tom: TomDoRecado = 'neutro') => {
    const texto = mensagem.trim();
    if (texto === '') return;
    contador.current += 1;
    // Um recado por vez, e o novo substitui o anterior: empilhar respostas de
    // ações que a pessoa já esqueceu só atrapalharia a leitura da última.
    setRecado({ chave: contador.current, mensagem: texto, tom });
  }, []);

  const valor = useMemo(() => ({ mostrar }), [mostrar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {recado ? (
        <RecadoFlutuante
          key={recado.chave}
          recado={recado}
          aoSumir={() => setRecado((atual) => (atual?.chave === recado.chave ? null : atual))}
        />
      ) : null}
    </Contexto.Provider>
  );
}

export function useToast(): ContextoDeToast {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error('useToast precisa de <ToastProvider> acima na árvore.');
  }
  return contexto;
}

function RecadoFlutuante({ recado, aoSumir }: { recado: Recado; aoSumir(): void }) {
  const insets = useSafeAreaInsets();
  const entrada = useRef(new Animated.Value(0)).current;
  const cor = COR[recado.tom];

  useEffect(() => {
    // Leitor de tela não vê o recado aparecer: precisa ouvir.
    AccessibilityInfo.announceForAccessibility(recado.mensagem);

    let saindo = false;
    Animated.spring(entrada, {
      toValue: 1,
      useNativeDriver: true,
      damping: 18,
      stiffness: 180,
    }).start();

    const relogio = setTimeout(() => {
      saindo = true;
      Animated.timing(entrada, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(aoSumir);
    }, DURACAO[recado.tom]);

    return () => {
      clearTimeout(relogio);
      if (!saindo) entrada.stopAnimation();
    };
  }, [recado, entrada, aoSumir]);

  return (
    <Animated.View
      // `box-none` deixa o toque atravessar a área vazia ao redor: o recado
      // não pode bloquear o botão que está atrás dele.
      pointerEvents="box-none"
      style={[
        estilos.ancora,
        { top: insets.top + espaco.sm },
        {
          opacity: entrada,
          transform: [
            { translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) },
          ],
        },
      ]}
    >
      <Pressable
        onPress={aoSumir}
        accessibilityRole="alert"
        accessibilityLabel={recado.mensagem}
        accessibilityHint="Toque para dispensar"
        style={({ pressed }) => [
          estilos.recado,
          { backgroundColor: cor },
          pressed && estilos.pressionado,
        ]}
      >
        <Feather name={ICONE[recado.tom]} size={18} color={cores.branco} style={estilos.icone} />
        <Texto variante="corpoForte" cor={cores.branco} estilo={estilos.texto}>
          {recado.mensagem}
        </Texto>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Cor cheia, e não a versão tingida do `Aviso`.
 *
 * O recado flutua sobre conteúdo qualquer: um fundo a 12% de opacidade
 * deixaria a lista aparecer por baixo e o texto ficaria ilegível justamente
 * sobre o cartão que a pessoa acabou de tocar.
 */
const COR: Record<TomDoRecado, string> = {
  erro: cores.erro,
  atencao: '#B4801F',
  sucesso: '#2E8C72',
  neutro: cores.tinta,
};

const ICONE: Record<TomDoRecado, keyof typeof Feather.glyphMap> = {
  erro: 'alert-circle',
  atencao: 'alert-triangle',
  sucesso: 'check-circle',
  neutro: 'info',
};

const estilos = StyleSheet.create({
  ancora: {
    position: 'absolute',
    left: medida.margem,
    right: medida.margem,
    // Acima de tudo, inclusive da barra de abas, que também é absoluta.
    zIndex: 100,
    elevation: 100,
  },
  recado: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaco.md,
    borderRadius: raio.md,
    paddingHorizontal: espaco.lg,
    paddingVertical: espaco.lg,
    ...sombra.alta,
  },
  pressionado: {
    opacity: 0.9,
  },
  icone: {
    marginTop: 1,
  },
  texto: {
    flex: 1,
  },
});
