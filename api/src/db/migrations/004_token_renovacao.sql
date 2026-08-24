-- Continuar conectado (RF039)
--
-- A sessão continua morrendo com 30 minutos de inatividade (RNF09). O que
-- passa a sobreviver ao fechamento do app é um **token de renovação** de vida
-- longa, que o cliente troca por uma sessão nova depois de desbloqueio
-- biométrico (RNF19). São dois segredos com propósitos diferentes:
--
--   * token de sessão   — curto, acompanha cada requisição
--   * token de renovação — longo, só serve para abrir uma sessão nova
--
-- Igual ao token de sessão, o banco guarda apenas o SHA-256 (RNF07), e vale
-- um por conta — o modelo já era de uma sessão ativa por usuário.
ALTER TABLE usuario
  ADD COLUMN token_renovacao_hash       TEXT,
  -- RN23 — o token de renovação tem prazo próprio e é rotacionado a cada uso
  ADD COLUMN token_renovacao_expira_em  TIMESTAMPTZ;

CREATE INDEX idx_usuario_token_renovacao ON usuario (token_renovacao_hash)
  WHERE token_renovacao_hash IS NOT NULL;
