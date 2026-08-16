/**
 * SD05 — perfil, avatar (RF007/RN04) e vínculo institucional (RF006/RN05).
 *
 * O avatar sai da lista que a API devolve — não há upload próprio (RN04). O
 * vínculo institucional é o que destrava a importação de notas (RF023), que na
 * prática quase nunca está disponível.
 *
 * Layout na forma da tela de conta do template: medalhão redondo + nome + email
 * no topo, filete, e o "sair" como botão suave no pé. O avatar é desenhado por
 * `Avatar`, que casa cada registro do seed com um ícone — a `url` que a API
 * devolve não é servida por ninguém.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as contaApi from '@/services/api/conta';
import { useSessao } from '@/contexts/SessaoContext';
import { useRequisicao } from '@/hooks/useRequisicao';
import { useAcao } from '@/hooks/useAcao';
import { TelaModulo } from '@/components/common/TelaModulo';
import { Secao } from '@/components/common/Secao';
import { Aviso } from '@/components/ui/Aviso';
import { Avatar } from '@/components/ui/Avatar';
import { Botao } from '@/components/ui/Botao';
import { Texto } from '@/components/ui/Texto';
import type { Avatar as AvatarDaApi } from '@/types/api';
import { cores, espaco, raio } from '@/theme';

export function PerfilScreen() {
  const { perfil, definirPerfil, sair } = useSessao();
  const router = useRouter();
  const acao = useAcao();

  const apoio = useRequisicao(async () => {
    const [avatares, instituicoes] = await Promise.all([
      contaApi.listarAvatares(),
      contaApi.listarInstituicoes(),
    ]);
    return { avatares, instituicoes };
  }, []);

  const [salvandoVinculo, setSalvandoVinculo] = useState(false);

  async function atualizar(dados: { avatarId?: number | null; instituicaoId?: number | null }) {
    setSalvandoVinculo(true);
    const resultado = await acao.executar(() => contaApi.atualizarPerfil(dados));
    if (resultado) definirPerfil(resultado.usuario);
    setSalvandoVinculo(false);
  }

  return (
    <TelaModulo
      titulo="Perfil"
      modulo="banca"
      erro={apoio.erro}
      aoRecarregar={apoio.recarregar}
      dentroDasAbas={false}
      saida="fechar"
    >

      <View style={estilos.identidade}>
        <Avatar avatar={perfil?.avatar} nome={perfil?.nome} tamanho={64} />
        <View style={estilos.nome}>
          <Texto variante="tituloMenor" numberOfLines={1}>
            {perfil?.nome}
          </Texto>
          <Texto variante="chamada" cor={cores.tintaMedia} numberOfLines={1}>
            {perfil?.email}
          </Texto>
        </View>
      </View>

      <View style={estilos.filete} />

      <Secao titulo="Avatar">
        <View style={estilos.gradeAvatares}>
          {(apoio.dados?.avatares.avatares ?? []).map((avatar) => {
            const escolhido = perfil?.avatar?.id === avatar.id;
            return (
              <EscolhaDeAvatar
                key={avatar.id}
                avatar={avatar}
                escolhido={escolhido}
                aoTocar={() => void atualizar({ avatarId: escolhido ? null : avatar.id })}
              />
            );
          })}
        </View>
      </Secao>

      <Secao titulo="Instituição">
        <Texto variante="corpo" cor={cores.tintaMedia}>
          O vínculo é o que permite tentar importar notas (RF023, RN05).
        </Texto>
        <View style={estilos.grade}>
          {(apoio.dados?.instituicoes.instituicoes ?? []).map((instituicao) => {
            const escolhida = perfil?.instituicao?.id === instituicao.id;
            return (
              <Chip
                key={instituicao.id}
                rotulo={instituicao.nome}
                escolhido={escolhida}
                aoTocar={() =>
                  void atualizar({ instituicaoId: escolhida ? null : instituicao.id })
                }
              />
            );
          })}
        </View>
      </Secao>

      <Botao
        titulo="Sair da conta"
        aparencia="suave"
        desabilitado={salvandoVinculo}
        aoTocar={() => {
          void (async () => {
            // RN03 — o logout invalida o token no servidor.
            await sair();
            router.replace('/entrar');
          })();
        }}
      />
    </TelaModulo>
  );
}

/**
 * Um avatar escolhível: o desenho, o nome embaixo e o estado de escolha no
 * próprio medalhão. Tocar no que já está escolhido desfaz a escolha (RN04
 * permite não ter avatar), e é o rótulo que conta isso ao leitor de tela.
 */
function EscolhaDeAvatar({
  avatar,
  escolhido,
  aoTocar,
}: {
  avatar: AvatarDaApi;
  escolhido: boolean;
  aoTocar(): void;
}) {
  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityLabel={escolhido ? `${avatar.descricao}, escolhido` : avatar.descricao}
      accessibilityState={{ selected: escolhido }}
      style={({ pressed }) => [estilos.escolha, pressed && estilos.chipPressionado]}
    >
      <View style={[estilos.aro, escolhido && estilos.aroEscolhido]}>
        <Avatar avatar={avatar} tamanho={56} destacado={escolhido} />
      </View>
      <Texto
        variante="corpoForte"
        cor={escolhido ? cores.lilasForte : cores.tintaMedia}
        numberOfLines={1}
      >
        {avatar.descricao}
      </Texto>
    </Pressable>
  );
}

/** Chip de escolha única dentro de um grupo — o mesmo do filtro do template. */
function Chip({
  rotulo,
  escolhido,
  aoTocar,
}: {
  rotulo: string;
  escolhido: boolean;
  aoTocar(): void;
}) {
  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityState={{ selected: escolhido }}
      style={({ pressed }) => [
        estilos.chip,
        escolhido && estilos.chipEscolhido,
        pressed && estilos.chipPressionado,
      ]}
    >
      <Texto variante="corpoForte" cor={escolhido ? cores.branco : cores.tintaMedia}>
        {rotulo}
      </Texto>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  identidade: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.lg,
  },
  nome: {
    flex: 1,
    gap: 2,
  },
  filete: {
    height: 1,
    backgroundColor: cores.linha,
  },
  grade: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm,
  },
  gradeAvatares: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.lg,
  },
  escolha: {
    width: 72,
    alignItems: 'center',
    gap: espaco.xs,
  },
  aro: {
    padding: 3,
    borderRadius: raio.pilula,
    borderWidth: 2,
    // O aro existe sempre, transparente, para que escolher não mexa no layout.
    borderColor: 'transparent',
  },
  aroEscolhido: {
    borderColor: cores.lilasForte,
  },
  chip: {
    borderRadius: raio.pilula,
    backgroundColor: cores.fundoMudo,
    paddingHorizontal: espaco.lg,
    paddingVertical: espaco.md,
  },
  chipEscolhido: {
    backgroundColor: cores.lilas,
  },
  chipPressionado: {
    opacity: 0.75,
  },
});
