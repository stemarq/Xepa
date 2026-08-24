/** Módulo 1 — Conta / Autenticação (SD01–SD05). */

import type { Avatar, Instituicao, Perfil, Sessao } from '@/types/api';
import { requisitar } from './cliente';

export function cadastrar(dados: { nome: string; email: string; senha: string }) {
  return requisitar<{ usuario: Perfil }>('/conta/cadastro', {
    metodo: 'POST',
    corpo: dados,
    semSessao: true,
  });
}

export function entrar(email: string, senha: string) {
  return requisitar<Sessao>('/conta/login', {
    metodo: 'POST',
    corpo: { email, senha },
    semSessao: true,
  });
}

/**
 * RF039 — troca o token de renovação por uma sessão nova.
 *
 * `semSessao` porque é justamente a chamada de quem não tem sessão válida: o
 * segredo vai no corpo, nunca no cabeçalho de autorização.
 */
export function renovar(tokenRenovacao: string) {
  return requisitar<Sessao>('/conta/renovar', {
    metodo: 'POST',
    corpo: { tokenRenovacao },
    semSessao: true,
  });
}

export function sair() {
  return requisitar<{ mensagem: string }>('/conta/logout', { metodo: 'POST' });
}

/** SD04 — a resposta é a mesma exista o e-mail ou não. */
export function pedirRecuperacao(email: string) {
  return requisitar<{ mensagem: string }>('/conta/recuperar-senha', {
    metodo: 'POST',
    corpo: { email },
    semSessao: true,
  });
}

export function redefinirSenha(token: string, senha: string) {
  return requisitar<{ mensagem: string }>('/conta/redefinir-senha', {
    metodo: 'POST',
    corpo: { token, senha },
    semSessao: true,
  });
}

export function obterPerfil() {
  return requisitar<{ usuario: Perfil }>('/conta/perfil');
}

export function atualizarPerfil(dados: {
  nome?: string;
  avatarId?: number | null;
  instituicaoId?: number | null;
}) {
  return requisitar<{ usuario: Perfil }>('/conta/perfil', { metodo: 'PUT', corpo: dados });
}

export function listarAvatares() {
  return requisitar<{ avatares: Avatar[] }>('/conta/avatares', { semSessao: true });
}

export function listarInstituicoes() {
  return requisitar<{ instituicoes: Instituicao[] }>('/conta/instituicoes', { semSessao: true });
}
