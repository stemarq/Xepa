/** Entidade USUARIO como está no banco. Nunca sai da camada de Repository/Service. */
export interface Usuario {
  id: number;
  nome: string;
  email: string;
  senha_hash: string;
  salt: string;
  avatar_id: number | null;
  instituicao_id: number | null;
  criado_em: Date;
  atualizado_em: Date;
  token_sessao_hash: string | null;
  token_sessao_expira_em: Date | null;
  token_recuperacao_hash: string | null;
  token_recuperacao_expira_em: Date | null;
  /** RF039 — "continuar conectado"; independente do token de sessão. */
  token_renovacao_hash: string | null;
  token_renovacao_expira_em: Date | null;
}

export interface Avatar {
  id: number;
  descricao: string;
  url: string;
}

export interface Instituicao {
  id: number;
  nome: string;
}

/** Projeção segura do usuário — é o que trafega para o cliente. */
export interface PerfilPublico {
  id: number;
  nome: string;
  email: string;
  avatar: Avatar | null;
  instituicao: Instituicao | null;
  criadoEm: Date;
}

export interface UsuarioComRelacionamentos extends Usuario {
  avatar_descricao: string | null;
  avatar_url: string | null;
  instituicao_nome: string | null;
}

export function toPerfilPublico(usuario: UsuarioComRelacionamentos): PerfilPublico {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    avatar:
      usuario.avatar_id !== null
        ? {
            id: usuario.avatar_id,
            descricao: usuario.avatar_descricao ?? '',
            url: usuario.avatar_url ?? '',
          }
        : null,
    instituicao:
      usuario.instituicao_id !== null
        ? { id: usuario.instituicao_id, nome: usuario.instituicao_nome ?? '' }
        : null,
    criadoEm: usuario.criado_em,
  };
}
