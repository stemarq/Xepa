/**
 * Ações que mudam estado no servidor (registrar consumo, lançar despesa,
 * concluir lavagem). Guarda o "executando" para travar o botão e entrega o
 * retorno — o erro, e o aviso que a API manda junto do sucesso: é assim que
 * chegam o alerta de reposição (RN08), o de orçamento (RN12) e o de lavagem
 * (RN14).
 *
 * O retorno vai para um recado flutuante, e não para uma faixa na tela. O
 * motivo é que a tela rola: quem toca um botão no fim da lista recebia a
 * resposta lá em cima, fora de vista, e a ação parecia não ter surtido efeito.
 * Como o recado é empurrado daqui, nenhuma tela precisa se lembrar de mostrar
 * o erro — esquecer disso era o modo mais fácil de uma falha passar calada.
 */

import { useCallback, useState } from 'react';
import { useToast, type TomDoRecado } from '@/components/ui/Toast';
import { mensagemDe } from './useRequisicao';

export interface Acao {
  executando: boolean;
  executar<T>(acao: () => Promise<T>, extrairAviso?: (resultado: T) => string | null): Promise<T | null>;
}

interface Opcoes {
  /**
   * Tom do aviso de sucesso.
   *
   * `atencao` por padrão porque o aviso que a API devolve costuma ser um
   * alerta ("está no limite que você definiu"), não uma comemoração.
   */
  tomDoAviso?: TomDoRecado;
}

export function useAcao({ tomDoAviso = 'atencao' }: Opcoes = {}): Acao {
  const [executando, setExecutando] = useState(false);
  const { mostrar } = useToast();

  const executar = useCallback(
    async function <T>(
      acao: () => Promise<T>,
      extrairAviso?: (resultado: T) => string | null,
    ): Promise<T | null> {
      setExecutando(true);
      try {
        const resultado = await acao();
        const aviso = extrairAviso?.(resultado);
        if (aviso) mostrar(aviso, tomDoAviso);
        return resultado;
      } catch (causa) {
        mostrar(mensagemDe(causa), 'erro');
        return null;
      } finally {
        setExecutando(false);
      }
    },
    [mostrar, tomDoAviso],
  );

  return { executando, executar };
}
