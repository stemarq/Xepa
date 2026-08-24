import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'sim', 'on'].includes(raw)) return true;
  if (['0', 'false', 'nao', 'não', 'off'].includes(raw)) return false;
  throw new Error(`Variável de ambiente ${name} deve ser true ou false`);
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Variável de ambiente ${name} deve ser numérica`);
  }
  return parsed;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: num('PORT', 3333),
  databaseUrl: required('DATABASE_URL'),
  /** Conexões simultâneas no pool. */
  dbPoolMax: num('DB_POOL_MAX', 10),

  /**
   * Conexão TLS com o banco.
   *
   * Postgres gerenciado (Neon, Supabase, Railway, Aiven…) **exige** TLS, e é
   * comum apontar para um deles ainda em desenvolvimento. Por isso o SSL é uma
   * variável própria: sem ela, ligar TLS obrigaria a mentir o `NODE_ENV`.
   * Vazio mantém o padrão antigo — ligado em produção, desligado fora dela.
   */
  dbSsl: bool('DB_SSL', process.env.NODE_ENV === 'production'),

  /** RNF09 — a sessão expira após 30 minutos de inatividade. */
  sessionTtlMinutes: num('SESSION_TTL_MINUTES', 30),

  /**
   * RF039 — validade do token de renovação ("continuar conectado").
   *
   * Não confundir com `sessionTtlMinutes`: a sessão continua morrendo em 30
   * minutos de inatividade (RNF09). Este é o prazo do segredo de vida longa
   * que o app guarda no Keychain e troca por uma sessão nova depois do
   * desbloqueio biométrico. Trinta dias é o intervalo depois do qual voltar a
   * digitar a senha deixa de ser incômodo e vira conferência.
   */
  refreshTokenTtlDays: num('REFRESH_TOKEN_TTL_DAYS', 30),

  /** RF005 — validade do token de redefinição de senha. */
  resetTokenTtlMinutes: num('RESET_TOKEN_TTL_MINUTES', 30),

  /**
   * Integração de notas com a instituição (RF023). Vazio = indisponível, que
   * é o normal; "stub" liga um conjunto fixo de notas fora de produção.
   */
  instituicaoIntegracao: process.env.INSTITUICAO_INTEGRACAO ?? '',

  /**
   * Qual commit está no ar.
   *
   * Existe para responder por fora "a API já subiu?", pergunta que aparece a
   * cada deploy: sem isto, `/saude` diz que o serviço responde mas não diz
   * qual versão, e todas as demais rotas exigem sessão — até as inexistentes,
   * porque o `autenticar` roda antes do roteamento e devolve 401 no lugar de
   * 404. Não havia como distinguir "rota nova ainda não subiu" de "portal
   * fora do ar" olhando de fora.
   *
   * `RENDER_GIT_COMMIT` é injetada pelo Render; as outras cobrem outros
   * provedores e o build local. Vazio não é erro: rodar sem saber o commit é
   * o caso normal em desenvolvimento.
   */
  commit:
    process.env.RENDER_GIT_COMMIT ??
    process.env.GIT_COMMIT ??
    process.env.SOURCE_VERSION ??
    '',
  ramo: process.env.RENDER_GIT_BRANCH ?? process.env.GIT_BRANCH ?? '',

  /**
   * Credenciais do agregador de Open Finance (RNF18).
   *
   * Vazias é o normal: sem elas o sistema usa o provedor simulado, e é assim
   * que a suíte, o `dev:memoria` e qualquer clone do repositório rodam sem
   * cadastro em lugar nenhum. Preenchidas, o Xepa passa a falar com a Pluggy
   * de verdade — ver `openFinanceService.ts`.
   */
  pluggy: {
    clientId: process.env.PLUGGY_CLIENT_ID ?? '',
    clientSecret: process.env.PLUGGY_CLIENT_SECRET ?? '',
    /**
     * Inclui os conectores de teste ("Pluggy Bank", "Sandbox Open Finance") na
     * lista de instituições.
     *
     * A Pluggy os esconde por padrão, e com razão: são bancos que não existem,
     * e oferecê-los a um usuário de verdade seria oferecer uma conexão que não
     * leva a lugar nenhum. Ligado só em desenvolvimento e demonstração.
     */
    sandbox: bool('PLUGGY_SANDBOX', false),
  },

  mail: {
    host: process.env.SMTP_HOST ?? '',
    port: num('SMTP_PORT', 587),
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from: process.env.MAIL_FROM ?? 'nao-responda@xepa.app',
    resetUrl: process.env.APP_RESET_URL ?? 'xepa://redefinir-senha',
  },
} as const;

export const isProduction = env.nodeEnv === 'production';
