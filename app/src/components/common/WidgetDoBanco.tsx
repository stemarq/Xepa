/**
 * O widget do agregador, onde a senha do banco é digitada (RNF18).
 *
 * Este é o passo que o Xepa **não** executa. Ele ocupa a tela inteira porque
 * quem está no comando ali é a Pluggy: o que aparece dentro é domínio dela, e
 * emoldurar isso com a nossa interface sugeriria que a senha está sendo
 * digitada num formulário nosso — exatamente a confusão que a RNF18 existe
 * para evitar.
 *
 * O `connectToken` vem do backend e vale 30 minutos. Não é sessão do Xepa e
 * não dá acesso a nada nosso: serve só para o widget se identificar.
 *
 * O widget também **é o seletor de banco**: tem busca, marca e o catálogo
 * inteiro do agregador. Por isso a tela não desenha uma lista própria quando
 * ele está em uso — seriam dois seletores para a mesma escolha, e o nosso
 * seria o pior dos dois.
 *
 * O que volta daqui é o id do vínculo (`item`) e o nome do banco escolhido.
 * Nenhuma credencial atravessa este componente — o `onSuccess` da Pluggy
 * entrega o item já criado.
 */

import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PluggyConnect } from 'react-native-pluggy-connect';
import { Botao } from '@/components/ui/Botao';
import { Texto } from '@/components/ui/Texto';
import { cores, espaco, medida } from '@/theme';

interface Props {
  connectToken: string;
  /** Inclui os bancos de teste do agregador. Vem do servidor, não do app. */
  sandbox: boolean;
  /** Chamado com o id do vínculo e o nome do banco escolhido. */
  aoConcluir(idExterno: string, instituicao: string): void;
  aoCancelar(): void;
}

export function WidgetDoBanco({ connectToken, sandbox, aoConcluir, aoCancelar }: Props) {
  const insets = useSafeAreaInsets();

  return (
    // `visible` fixo: quem monta e desmonta é a tela, pelo estado dela. Um
    // segundo controle de visibilidade aqui daria duas fontes de verdade para
    // a mesma pergunta.
    <Modal visible animationType="slide" onRequestClose={aoCancelar}>
      <View style={[estilos.fundo, { paddingTop: insets.top }]}>
        <View style={estilos.cabecalho}>
          <Texto variante="corpo" cor={cores.tintaMedia}>
            Você está no ambiente da instituição. O Xepa não vê sua senha.
          </Texto>
          <Botao titulo="Cancelar" aparencia="texto" compacto aoTocar={aoCancelar} />
        </View>

        <PluggyConnect
          connectToken={connectToken}
          // Segue o servidor. Fixo em `true`, o app mostraria bancos de teste
          // mesmo com a integração real ligada — e a lista é justamente o que
          // diz ao usuário se ele está conectando algo de verdade.
          includeSandbox={sandbox}
          onSuccess={(dados) =>
            aoConcluir(String(dados.item.id), dados.item.connector?.name ?? 'Instituição')
          }
          // Fechar pelo X do widget é desistência, e a tela precisa saber para
          // não ficar presa esperando um vínculo que não vem.
          onClose={aoCancelar}
          onError={aoCancelar}
        />
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fundo: {
    flex: 1,
    backgroundColor: cores.superficie,
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaco.md,
    paddingHorizontal: medida.margem,
    paddingVertical: espaco.sm,
  },
});
