/**
 * RF039 — tela de desbloqueio.
 *
 * Aparece no lugar do login quando o aparelho tem um "continuar conectado"
 * guardado: a conta já é conhecida, só falta provar que é a mesma pessoa
 * (RNF19). O pedido de biometria sai sozinho ao chegar aqui — esta tela é o
 * que sobra quando ele é cancelado, e existe para dar as duas saídas: tentar
 * de novo ou desistir e usar a senha.
 *
 * Não usa `Aviso`: aqui não há erro nem alerta, e sim o estado normal de uma
 * conta em espera. O primeiro nome basta para o usuário reconhecer a conta sem
 * o e-mail inteiro ficar exposto na tela de um celular bloqueado.
 */

import { StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSessao } from '@/contexts/SessaoContext';
import { TelaAuth } from '@/components/common/TelaAuth';
import { Botao } from '@/components/ui/Botao';
import { Texto } from '@/components/ui/Texto';
import { cores, espaco, raio } from '@/theme';

export function BloqueioScreen() {
  const { perfil, desbloqueando, desbloquear, usarSenha } = useSessao();
  const primeiroNome = perfil?.nome.trim().split(/\s+/)[0];

  return (
    <TelaAuth
      titulo={primeiroNome ? `Oi de novo, ${primeiroNome}` : 'Oi de novo'}
      chamada="Desbloqueie para voltar à sua banca."
    >
      <View style={estilos.selo}>
        <Feather name="lock" size={32} color={cores.lilas} />
      </View>

      <View style={estilos.acoes}>
        <Botao
          titulo="Desbloquear"
          aoTocar={() => void desbloquear()}
          carregando={desbloqueando}
        />
        <Botao
          titulo="Entrar com senha"
          aparencia="texto"
          aoTocar={() => void usarSenha()}
          desabilitado={desbloqueando}
        />
      </View>

      <Texto variante="corpo" cor={cores.tintaMedia} estilo={estilos.rodape}>
        Seus dados continuam guardados só neste aparelho.
      </Texto>
    </TelaAuth>
  );
}

const estilos = StyleSheet.create({
  selo: {
    alignSelf: 'center',
    width: 84,
    height: 84,
    borderRadius: raio.md,
    alignItems: 'center',
    justifyContent: 'center',
    // O sufixo de 2 dígitos é o alfa em hex — ~12% da própria primária.
    backgroundColor: `${cores.lilas}1F`,
  },
  acoes: {
    gap: espaco.sm,
  },
  rodape: {
    marginTop: 'auto',
    textAlign: 'center',
  },
});
