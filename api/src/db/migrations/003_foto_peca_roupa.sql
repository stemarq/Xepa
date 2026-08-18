-- =====================================================================
-- Foto da peça de roupa (RF038)
--
-- Reconhecer "a camisa azul" pelo nome escrito é mais difícil do que
-- parece quando se tem quinze peças cadastradas: a foto é o que faz a
-- lista virar o armário de verdade.
--
-- A imagem mora no próprio banco, e não num serviço de arquivos, porque
-- o que se guarda é uma **miniatura**: o app reduz para 400px e envia
-- JPEG, algo em torno de 40 KB. Um guarda-roupa de trinta peças cabe em
-- pouco mais de um megabyte, e a alternativa custaria bucket, política
-- de acesso, chave de serviço e URL assinada para carregar o mesmo dado.
--
-- Diferente do avatar (RN04), aqui a imagem é do usuário e não de uma
-- lista fixa — e diferente do produto da despensa, existe fonte: a
-- câmera de quem está cadastrando a peça.
-- =====================================================================

ALTER TABLE peca_roupa
  ADD COLUMN IF NOT EXISTS foto BYTEA,
  -- Guardado no upload para o `Content-Type` da resposta não ser adivinhado.
  ADD COLUMN IF NOT EXISTS foto_tipo TEXT,
  -- Serve ao cache do cliente: muda quando a foto muda, e é o que permite
  -- responder 304 sem carregar os bytes.
  ADD COLUMN IF NOT EXISTS foto_em TIMESTAMPTZ;

-- Teto de 2 MB por peça. O app manda ~40 KB; este limite existe para que um
-- cliente com bug (ou a foto original sem redimensionar) não empurre uma
-- imagem de câmera inteira para dentro do banco.
ALTER TABLE peca_roupa
  DROP CONSTRAINT IF EXISTS peca_foto_tamanho;
ALTER TABLE peca_roupa
  ADD CONSTRAINT peca_foto_tamanho
    CHECK (foto IS NULL OR length(foto) <= 2 * 1024 * 1024);

-- Os três campos andam juntos: ou há foto com tipo e data, ou não há foto.
ALTER TABLE peca_roupa
  DROP CONSTRAINT IF EXISTS peca_foto_completa;
ALTER TABLE peca_roupa
  ADD CONSTRAINT peca_foto_completa
    CHECK (
      (foto IS NULL AND foto_tipo IS NULL AND foto_em IS NULL)
      OR (foto IS NOT NULL AND foto_tipo IS NOT NULL AND foto_em IS NOT NULL)
    );
