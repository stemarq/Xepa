# Xepa

## Visão geral
Xepa é um app mobile que unifica, num único hub, a rotina de estudantes universitários morando sozinhos pela primeira vez: controle de despensa, gestão financeira, acompanhamento dos estudos e gestão de lavanderia. O nome vem da gíria de feira ("xepa" = sobras baratas do fim da feira); a identidade gira em torno de aproveitar bem recursos limitados. Ator único: o **Usuário (estudante)**.

## Stack
- **Cliente**: React Native + Expo — iOS primeiro, Android depois
- **Backend**: Node + TypeScript, API REST em camadas
- **Banco**: PostgreSQL
- **Integrações externas**: Sistema Bancário (notificações), Instituição de Ensino (importação de notas), Serviço de E-mail

## Arquitetura
API REST em camadas: **Cliente → Controller → Service → Repository → Banco de Dados**. O leitor de QR Code e as notificações locais rodam no próprio app. Detalhe em `docs/06-arquitetura.md`.

## Módulos (linguagem do produto)
- **Conta / Autenticação**
- **Despensa** — controle de estoque
- **Grana** — financeiro
- **Cabeça** — estudos
- **Roupa** — lavanderia

Home = "a banca"; resumo mensal = "a sacola". Identidade visual: lilás (`#9B7EDE`) como primária e azul (`#6C8BE0`) como secundária, superfície branca sobre fundo quase-branco, cantos redondos e botão pílula, tipografia Poppins em peso único de família. Tokens em `app/src/theme/`.

> O brand kit antigo descrito em `docs/01-visao-geral.md` (olive profundo; Anton + Permanent Marker + Instrument Sans) **não vale mais para o cliente** — o front foi migrado para a estética do template "Online Groceries App UI". O doc ainda não foi reescrito.

## Decisões e restrições-chave
- **iOS primeiro + notificações bancárias**: a leitura automática de movimentação (RF015) é restrita no iOS (RNF13). No lançamento iOS a automação bancária não funciona — o financeiro se apoia no **registro manual (RF017)**; a automação entra com o Android.
- **QR Code só para notas de mercado (RN18)**: toda transação gerada por nota nasce categorizada como "Mercado". Simplifica a categorização.
- **Os itens da nota vêm da SEFAZ, não do QR (RN22)**: o QR carrega chave + hash; os produtos estão na consulta pública, e é o hash que a destrava sem captcha — por isso o app guarda a **URL inteira** lida, não só os 44 dígitos. A consulta é tentativa: `consultada: false` cai no preenchimento manual, que nunca sai de cena. Provedor por UF em `api/src/services/notaFiscal/`; só SP (35) implementado.
- **Descrição de nota casa com produto por prefixo de token, não por distância de edição** (`notaFiscal/similaridade.ts`): o PDV trunca (`MAION HELLMANNS 500G TRA` = `maionese`), e truncamento preserva o começo da palavra. Duas regras não óbvias sustentam o resto: o truncamento só vale **do lado da nota** (senão `chá` casa com `chantilly`), e a cabeça do produto precisa cair nas duas primeiras palavras da descrição (senão `MARG.QUALY C/SAL` vira reposição de `sal`). Ambas com teste.
- **Orçamento por categoria, não teto único (RF020, RN17)**: o usuário define um limite por categoria/mês (ex.: R$ 300 mercado, R$ 200 lazer); no máximo um orçamento por categoria por mês.
- **Alerta de estoque configurável por item (RF012, RN08)**: o usuário escolhe quais itens monitorar e a quantidade mínima de cada.
- **Nota → 1 transação (evita dupla contagem)**: uma nota processada gera exatamente uma `TRANSACAO` (origem="nota"); a relação `NOTA_FISCAL`–`TRANSACAO` é 1:1. O gasto do mês (RN11) sai só de `TRANSACAO`.
- **Desnormalização intencional**: `PRODUTO.quantidade_atual` e `PECA_ROUPA.usos_atuais` são deriváveis (de `MOVIMENTACAO_ESTOQUE` e `USO_PECA`), mas mantidos como coluna para leitura rápida — precisam ser atualizados a cada movimentação.
- **Duas "categorias" distintas**: `PRODUTO.categoria` é texto livre (despensa); `CATEGORIA` é entidade (financeira). Não confundir.
- **Sabão e amaciante são `PRODUTO`** como os demais (RN13); o alerta de lavanderia (RF033) consulta o estoque.
- **Importação de notas**: depende de vínculo institucional ativo (RN05) e de a instituição expor integração (a maioria não expõe) — a **entrada manual (RF024) é o caminho principal**.
- **Escopo completo modelado** — o passo de MVP foi pulado de propósito.
- **Valores definidos**: senha ≥ 8 com maiúscula, número e especial (RN02); sessão expira em 30 min (RNF09); QR ≤ 5 s (RNF04); disponibilidade 99% (RNF10); Android 10+ / iOS 15+ (RNF12); alerta de orçamento em 80% (RN12).

## Convenções
- Backend em camadas: Controller (entrada HTTP) → Service (regras de negócio) → Repository (acesso a dados).
- Diagramas: ER e sequência na **DSL do Eraser**; casos de uso em **Mermaid**.
- Documentação no padrão **WAD** (Web Application Document).

## Estrutura do repositório
```
xepa/
├── CLAUDE.md
├── README.md
├── docs/                     # modelagem completa (ver seção Documentação)
├── app/                      # React Native + Expo (cliente) — ainda não scaffoldado
│   └── src/
│       ├── app/              # rotas do expo-router
│       ├── screens/          # banca, despensa, grana, cabeca, roupa
│       ├── components/
│       ├── services/api/     # chamadas à API
│       ├── theme/            # brand kit
│       ├── contexts/  hooks/  store/  types/  utils/  constants/  localization/
└── api/                      # Node + TypeScript (backend em camadas)
    └── src/
        ├── controllers/      # entrada HTTP + validação de formato (Zod)
        ├── services/         # regras de negócio (as RNs)
        ├── repositories/     # único lugar com SQL
        ├── models/           # tipos das entidades do ER
        ├── routes/
        ├── middlewares/      # autenticar, errorHandler, asyncHandler
        ├── config/           # env tipado
        ├── utils/            # errors, senha, token
        ├── db/               # pool, migrations (DDL), seeds, runners
        └── ../test/          # unidade/, integracao/, apoio/
```

O cliente usa **expo-router**: as rotas ficam em `app/src/app/` e a UI das telas em `app/src/screens/`.

## Documentação
- Visão geral: `docs/01-visao-geral.md`
- Requisitos (RF/RN/RNF): `docs/02-requisitos.md`
- Casos de uso: `docs/03-casos-de-uso.md`
- Modelo de dados (ER): `docs/04-modelo-de-dados.md`
- Diagramas de sequência (24): `docs/05-diagramas-sequencia.md`
- Arquitetura: `docs/06-arquitetura.md`
- Contrato da API (rotas implementadas): `docs/07-api.md`
- Documento consolidado: `docs/documentacao-completa.md`

## Convenções da API

- Controller nunca chama Repository direto; Service nunca escreve SQL.
- Validação de **formato** fica no Controller (schemas Zod); validação de **regra de negócio** fica no Service.
- Erros de domínio: o Service lança `AppError` (`api/src/utils/errors.ts`) e o `errorHandler` traduz para HTTP. Os Services não importam Express.
- Todo handler assíncrono de rota vai embrulhado em `asyncHandler` (o Express 4 não encaminha rejeição de Promise).
- Toda constraint de banco criada por causa de uma regra cita a RN no comentário do DDL.

## Rodar sem Postgres

`cd api && npm run dev:memoria` sobe a API inteira sobre PGlite (Postgres em WASM), e `npm run demo:semear` popula a conta `demo@xepa.app` / `Xepa#2026` já nas condições que disparam RN08, RN12, RN13 e RN14. `scripts/gancho-banco.mjs` troca `src/db/pool.ts` por um gancho de resolução de módulos — nada em `src/` sabe disso.

No emulador do Android, `EXPO_PUBLIC_API_URL` precisa ser `http://10.0.2.2:3333/api`; `localhost` lá é o próprio dispositivo.

## Ambientes

A API está publicada em **https://xepa.onrender.com/api** (Render, plano free) contra o Supabase. É para onde o `app/.env` aponta, e por isso o app funciona em qualquer rede.

O plano free hiberna após ~15 min sem uso: a primeira chamada depois disso demora quase um minuto e, no app, parece travamento.

**Saber se um deploy subiu**: `curl -s https://xepa.onrender.com/api/saude | jq .commit` e comparar com `git log --oneline -1`. É a única rota pública — as outras exigem sessão, e rota inexistente sob um módulo devolve 401 (o `autenticar` roda antes do roteamento), então 401 não prova nem que a rota existe nem que não existe.

Para desenvolver contra a API local, troque `EXPO_PUBLIC_API_URL` e **reinicie o Metro** — o valor é embutido no bundle, não lido em execução.

## Conectar num Postgres de verdade

`cp api/.env.example api/.env`, preencher `DATABASE_URL`, depois `npm run db:migrate && npm run db:seed`. O banco precisa existir antes — as migrations criam tabela, não database.

**`DB_SSL=true` para Postgres gerenciado** (Neon, Supabase, Railway, Aiven): todos exigem TLS. Vazio segue o `NODE_ENV`, ou seja, TLS só em produção — sem essa variável, apontar para a nuvem em desenvolvimento falharia com um erro que não parece de TLS.

**Supabase pelo pooler**: usuário é `postgres.SEU_REF` (não `postgres`), porta 6543 é transaction e 5432 no host do pooler é session. A conexão direta (`db.SEU_REF.supabase.co`) é IPv6-only e falha em rede sem IPv6 — por isso o pooler. O driver `pg` não nomeia prepared statements, então o modo transaction serve para a API; `withTransaction` continua íntegro porque abre `BEGIN`/`COMMIT` explícito.

**`db:reset` é bloqueado em host remoto.** `DROP SCHEMA public CASCADE` derruba os grants de `anon`/`authenticated`/`service_role` do Supabase junto com as tabelas, e o `CREATE SCHEMA` seguinte não os devolve. A trava está em `exigirResetSeguro()`; para forçar, `DB_RESET_CONFIRMA_HOST=<host> npm run db:reset`.

## Testes da API

`cd api && npm test` — roda sem banco instalado e sem `.env`.

- Runner: `node --test` (nativo) + `tsx`. Sem framework externo.
- `test/integracao/` sobe o app Express numa porta efêmera e usa `fetch`; o banco é um **PGlite** (Postgres em WASM, em memória) que `test/apoio/banco.ts` põe no lugar de `src/db/pool.ts` via `mock.module`. O DDL das migrations roda inteiro, então as constraints das RNs valem no teste.
- `test/unidade/` cobre as funções puras (senha, tokens, médias, alertas) sem tocar no banco.
- O nome de cada teste cita a RN ou o RF que ele defende.
- `test/apoio/banco.js` tem que ser importado antes de qualquer módulo de `src/`; por isso o app entra por importação dinâmica.

## Estado atual e próximos passos

**Pronto**
- Modelagem: requisitos (RF001–RF037, RN01–RN21, RNF01–RNF18), casos de uso (19), modelo de dados (19 entidades), 27 diagramas de sequência, arquitetura, brand kit.
- Banco: DDL das 19 entidades com as constraints das RNs, runner de migrations e seeds (avatares, instituições).
- API: **completa** — scaffold em camadas e os cinco módulos, cobrindo os 24 diagramas de sequência. Conta/Autenticação (SD01–SD05), Despensa (SD06–SD10), Grana (SD11–SD15), Cabeça (SD16–SD20) e Roupa (SD21–SD24).
- Testes da API: 253 testes (unidade + integração ponta a ponta dos 5 módulos + Open Finance), rodando sem banco externo.
- Open Finance (RF034–RF037, SD25–SD27): consentimento, importação de extrato com deduplicação e revogação, sobre um provedor **simulado** trocável.
- Cliente: scaffold Expo SDK 57 + expo-router, tema lilás/azul, camada de API, sessão em SecureStore, telas de autenticação e as cinco telas de módulo consumindo a API.
- Gráficos: gasto por categoria (RF018) e tempo por matéria (RF028) em `BarrasCategoria`; evolução de notas (RF027) em `LinhaEvolucao`, na tela de detalhe da matéria (`app/materia/[id]`, SD20). Usam `react-native-svg`.

**A fazer**
- Cliente: notificações locais de lembrete (RF032), tela de detalhe por item da despensa. Testes do app: só `categoriaVisual` por enquanto.
- Personas e user stories; wireframes/UX.

## Fotos de produto: não existem, e não dá para buscar

A nota fiscal identifica o produto pelo **código interno do mercado** (`Código: 39062`), não pelo GTIN — numa nota real de 50 itens, zero códigos de barras. Sem identificador global não há base para consultar foto, e metade de uma compra de verdade (fruta, verdura, carne a granel) não tem código de barras nem para escanear.

Por isso o lugar da foto no cartão recebe **ícone de categoria** (`app/src/utils/categoriaVisual.ts`), inferido do **nome** e não do campo `categoria` — produto criado por nota nasce com `categoria: null`. O ícone é a identidade e a cor só reforça: dez categorias não cabem em dez cores separáveis sob daltonismo.

## Testes do app

`cd app && npm test` — mesmo runner da API (`node --test` + `tsx`), arquivos `src/**/*.test.ts`.

Os tipos do Node ficam **só** em `tsconfig.test.json`; o `tsconfig.json` exclui `*.test.ts`. Sem essa separação o código do app passaria a enxergar `fs` e `process`, que não existem no aparelho.

## Cor em gráfico

Categoria de gasto e matéria são **nominais**: a barra é de uma cor só, nunca uma cor por item — colorir por valor gasta o canal de identidade recodificando o que o comprimento já mostra.

O lilás e o azul do brand **não podem ser duas séries no mesmo gráfico**: ficam a ΔE 1,6 sob protanopia e 6,9 com visão normal (o piso é 15). Onde houver duas séries, use ênfase (uma cor + cinza), como em `LinhaEvolucao`. Valor e rótulo sempre em token de tinta, nunca na cor da série.

## Open Finance

O Xepa **não é instituição participante** (RNF18): sem registro no Diretório de Participantes, sem certificado, sem mTLS. Quem falaria com os bancos é um agregador autorizado pelo BCB (Pluggy, Belvo, Klavi). Hoje quem implementa é `services/openFinance/provedorSimulado.ts`.

Trocar por um agregador de verdade = escrever outra implementação de `ProvedorOpenFinance` e mudar a linha `export const provedor` em `openFinanceService.ts`. Nada abaixo dela muda. A rota `simular-autorizacao` só existe enquanto o provedor for o simulado.

Três regras sustentam o módulo, e as três têm teste:

- **RN19** — a movimentação traz id da instituição, único por conta (`idx_transacao_externa_unica`). Sincronizar duas vezes não mexe no gasto do mês.
- **RN20** — a mesma compra pela nota fiscal e pelo extrato é **um** gasto. O casamento é por usuário + valor + janela de 3 dias, e **não** por conta: a transação de nota nasce sem `conta_id`, porque o QR Code não diz o meio de pagamento. Exigir conta igual faria a conciliação nunca acontecer.
- **RN21** — consentimento expira (teto 12 meses) e é revogável; expiração é derivada na leitura (`statusEfetivo`), não há job que carimbe o vencimento. Revogar não apaga o histórico importado.

Os dois runners de PGlite (`test/apoio/banco.ts` e `scripts/banco-em-memoria.ts`) leem o diretório de migrations em ordem. Fixar arquivo neles faz a suíte e o modo sem Postgres rodarem contra um schema mais velho que o do sistema.
