/**
 * Sessão do usuário.
 *
 * Dois segredos, com prazos e propósitos diferentes:
 *
 *   * **token de sessão** — acompanha cada requisição e morre com 30 minutos
 *     de inatividade (RNF09).
 *   * **token de renovação** — vive 30 dias e só serve para abrir uma sessão
 *     nova (RF039). É o que faz o app não pedir senha a cada volta.
 *
 * Os dois ficam no SecureStore (Keychain no iOS), nunca em armazenamento
 * comum: é o equivalente, no cliente, ao cuidado que o backend tem de guardar
 * só o hash (RNF07).
 *
 * Guardar um segredo de 30 dias muda o modelo de ameaça — quem pega o celular
 * destravado entraria direto no financeiro do dono. Por isso a renovação passa
 * por desbloqueio biométrico (RNF19), e o estado `bloqueado` existe: a sessão
 * está a um toque de distância, mas ainda não é sessão.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as contaApi from '@/services/api/conta';
import { desbloqueioDisponivel, pedirDesbloqueio } from '@/services/desbloqueio';
import {
  definirToken,
  definirTratamentoDeSessaoExpirada,
} from '@/services/api/cliente';
import type { Perfil, Sessao } from '@/types/api';

const CHAVE_TOKEN = 'xepa.sessao.token';
const CHAVE_PERFIL = 'xepa.sessao.perfil';
const CHAVE_RENOVACAO = 'xepa.sessao.renovacao';

interface ValorSessao {
  /** `true` enquanto a sessão guardada no aparelho ainda está sendo lida. */
  restaurando: boolean;
  perfil: Perfil | null;
  autenticado: boolean;
  /**
   * RF039 — há um "continuar conectado" guardado, mas ele ainda não foi
   * desbloqueado. Nem autenticado nem deslogado: à espera de um toque.
   */
  bloqueado: boolean;
  /** `true` enquanto o pedido de biometria está na tela. */
  desbloqueando: boolean;
  /** Nova tentativa depois de um cancelamento. */
  desbloquear(): Promise<void>;
  /** Desiste do desbloqueio e volta para o login com senha. */
  usarSenha(): Promise<void>;
  entrar(email: string, senha: string): Promise<void>;
  cadastrar(nome: string, email: string, senha: string): Promise<void>;
  sair(): Promise<void>;
  definirPerfil(perfil: Perfil): void;
}

const Contexto = createContext<ValorSessao | null>(null);

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [restaurando, setRestaurando] = useState(true);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [desbloqueando, setDesbloqueando] = useState(false);
  /** Evita gravar no SecureStore durante a restauração inicial. */
  const montado = useRef(true);
  /** Impede dois pedidos de biometria simultâneos (o segundo o SO recusa). */
  const emDesbloqueio = useRef(false);

  const descartarSessao = useCallback(async () => {
    definirToken(null);
    setPerfil(null);
    setBloqueado(false);
    await Promise.all([
      SecureStore.deleteItemAsync(CHAVE_TOKEN),
      SecureStore.deleteItemAsync(CHAVE_PERFIL),
      SecureStore.deleteItemAsync(CHAVE_RENOVACAO),
    ]).catch(() => undefined);
  }, []);

  const guardarSessao = useCallback(async (sessao: Sessao) => {
    definirToken(sessao.token);
    setPerfil(sessao.usuario);
    setBloqueado(false);
    await Promise.all([
      SecureStore.setItemAsync(CHAVE_TOKEN, sessao.token),
      SecureStore.setItemAsync(CHAVE_PERFIL, JSON.stringify(sessao.usuario)),
      // RN23 — o backend rotaciona o token a cada renovação; guardar o antigo
      // deixaria o app com um segredo já queimado.
      SecureStore.setItemAsync(CHAVE_RENOVACAO, sessao.tokenRenovacao),
    ]);
  }, []);

  /**
   * RF039 — pede a biometria e troca o token de renovação por uma sessão.
   *
   * Cancelar não derruba nada: a tela continua bloqueada, com o botão para
   * tentar de novo. Só o token recusado pelo servidor (vencido, rotacionado ou
   * derrubado por um logout em outro lugar) manda de volta para o login.
   */
  const desbloquear = useCallback(async () => {
    if (emDesbloqueio.current) return;
    emDesbloqueio.current = true;
    setDesbloqueando(true);

    try {
      const tokenRenovacao = await SecureStore.getItemAsync(CHAVE_RENOVACAO);
      if (!tokenRenovacao) {
        await descartarSessao();
        return;
      }

      const resultado = await pedirDesbloqueio();
      if (resultado === 'indisponivel') {
        // A biometria sumiu do aparelho depois do login: sem ela não há como
        // proteger o segredo guardado, então ele não fica.
        await descartarSessao();
        return;
      }
      if (resultado !== 'ok') return;

      await guardarSessao(await contaApi.renovar(tokenRenovacao));
    } catch {
      await descartarSessao();
    } finally {
      emDesbloqueio.current = false;
      if (montado.current) setDesbloqueando(false);
    }
  }, [descartarSessao, guardarSessao]);

  /**
   * Leva ao estado bloqueado, se houver de fato um "continuar conectado"
   * utilizável. Sem token guardado ou sem biometria no aparelho, a única saída
   * é o login com senha.
   */
  const exigirDesbloqueio = useCallback(async (): Promise<boolean> => {
    const tokenRenovacao = await SecureStore.getItemAsync(CHAVE_RENOVACAO);
    if (!tokenRenovacao || !(await desbloqueioDisponivel())) {
      await descartarSessao();
      return false;
    }

    // A sessão morreu, o "continuar conectado" não: só o token de acesso sai.
    definirToken(null);
    await SecureStore.deleteItemAsync(CHAVE_TOKEN).catch(() => undefined);
    if (montado.current) setBloqueado(true);
    return true;
  }, [descartarSessao]);

  // Restaura a sessão guardada e confirma com a API: um token que expirou
  // enquanto o app estava fechado não pode passar por sessão válida — e é
  // justamente aí que o "continuar conectado" entra, no lugar do login.
  useEffect(() => {
    montado.current = true;

    (async () => {
      try {
        const guardado = await SecureStore.getItemAsync(CHAVE_PERFIL);
        // Fica só para dar nome à tela de desbloqueio; `autenticado` não sai
        // daqui, e sim da confirmação com a API logo abaixo.
        if (guardado && montado.current) setPerfil(JSON.parse(guardado) as Perfil);

        const token = await SecureStore.getItemAsync(CHAVE_TOKEN);
        if (token) {
          definirToken(token);
          try {
            // Confirma a sessão e já renova a janela de inatividade (RNF09).
            const { usuario } = await contaApi.obterPerfil();
            if (montado.current) {
              setPerfil(usuario);
              await SecureStore.setItemAsync(CHAVE_PERFIL, JSON.stringify(usuario));
            }
            return;
          } catch {
            // Sessão vencida ou derrubada — cai no desbloqueio.
          }
        }

        if (await exigirDesbloqueio()) void desbloquear();
      } catch {
        await descartarSessao();
      } finally {
        if (montado.current) setRestaurando(false);
      }
    })();

    return () => {
      montado.current = false;
    };
    // Roda uma vez: todas as dependências são `useCallback` estáveis.
  }, [descartarSessao, desbloquear, exigirDesbloqueio]);

  // Qualquer 401 vindo da API expira a sessão local. Com "continuar conectado"
  // guardado isso vira tela de desbloqueio, não tela de login: 30 minutos de
  // app aberto e parado não deveriam custar a senha inteira.
  useEffect(() => {
    definirTratamentoDeSessaoExpirada(() => {
      void (async () => {
        if (await exigirDesbloqueio()) void desbloquear();
      })();
    });
    return () => definirTratamentoDeSessaoExpirada(null);
  }, [desbloquear, exigirDesbloqueio]);

  const valor = useMemo<ValorSessao>(
    () => ({
      restaurando,
      perfil,
      // Bloqueado é o oposto de autenticado, mesmo com o perfil em memória: o
      // perfil ali é a lembrança de quem entrou, não permissão de entrar.
      autenticado: perfil !== null && !bloqueado,
      bloqueado,
      desbloqueando,
      desbloquear,
      usarSenha: descartarSessao,

      async entrar(email, senha) {
        await guardarSessao(await contaApi.entrar(email, senha));
      },

      /** SD01 seguido de SD02: cadastrar já deixa o usuário dentro do app. */
      async cadastrar(nome, email, senha) {
        await contaApi.cadastrar({ nome, email, senha });
        await guardarSessao(await contaApi.entrar(email, senha));
      },

      async sair() {
        // RN03 — o backend invalida os dois tokens; se a chamada falhar, a
        // sessão local cai do mesmo jeito.
        await contaApi.sair().catch(() => undefined);
        await descartarSessao();
      },

      definirPerfil: setPerfil,
    }),
    [
      restaurando,
      perfil,
      bloqueado,
      desbloqueando,
      desbloquear,
      guardarSessao,
      descartarSessao,
    ],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): ValorSessao {
  const valor = useContext(Contexto);
  if (!valor) {
    throw new Error('useSessao precisa estar dentro de <SessaoProvider>.');
  }
  return valor;
}
