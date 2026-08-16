# Contrato da API

Base: `/api`. Corpo e resposta em JSON. Rastreabilidade aos diagramas de sequência em [`05-diagramas-sequencia.md`](./05-diagramas-sequencia.md).

## Erros

Todo erro sai no mesmo formato:

```json
{ "erro": { "codigo": "BAD_REQUEST", "mensagem": "…", "detalhes": [] } }
```

| Status | Código | Quando |
|--------|--------|--------|
| 400 | `BAD_REQUEST` | corpo inválido, senha fora da RN02, avatar/instituição inexistente, link de redefinição inválido |
| 401 | `UNAUTHORIZED` | credenciais erradas, sem token, token inválido ou sessão expirada |
| 404 | `NOT_FOUND` | rota inexistente |
| 409 | `CONFLICT` | e-mail já cadastrado (RN01) |
| 500 | `INTERNAL_ERROR` | falha não prevista |

## Sessão

Rotas protegidas exigem `Authorization: Bearer <token>`. O token vem do login e é um valor opaco de 256 bits — o banco guarda apenas o SHA-256 dele.

**RNF09**: a sessão expira com 30 minutos de inatividade, e cada requisição autenticada reinicia a contagem. O logout invalida o token na hora (RN03).

---

## Saúde

### `GET /api/saude`
Verifica a API, a conexão com o banco e **qual versão está no ar**.

→ `200 { "status": "ok", "banco": "ok", "ambiente": "production", "commit": "7299eb9", "ramo": "main" }`

`commit` e `ramo` vêm de `RENDER_GIT_COMMIT`/`RENDER_GIT_BRANCH`, injetadas pelo provedor; fora de um deploy vêm `null`, que é "não sei" e não "sem commit".

Serve para responder por fora "o deploy já subiu?". É a **única rota pública**: todas as outras exigem sessão, e mesmo uma rota inexistente sob um módulo devolve `401`, porque `autenticar` roda antes do roteamento. Sem o commit aqui, uma chamada que falha por rota ausente é indistinguível de uma que falha por serviço de terceiro fora do ar.

```bash
curl -s https://xepa.onrender.com/api/saude | jq .commit   # compare com `git log --oneline -1`
```

---

## Módulo 1 — Conta / Autenticação

O objeto `usuario` devolvido por estas rotas é sempre a projeção pública — nunca inclui hash, salt ou tokens:

```json
{
  "id": 1,
  "nome": "Ana",
  "email": "ana@exemplo.com",
  "avatar": { "id": 3, "descricao": "Sacola", "url": "avatares/sacola.png" },
  "instituicao": { "id": 1, "nome": "Instituto Federal de São Paulo (IFSP)" },
  "criadoEm": "2026-08-10T12:00:00.000Z"
}
```

### `POST /api/conta/cadastro` — SD01 (RF001, RN01, RN02, RNF06)

Corpo: `{ "nome": string, "email": string, "senha": string }`

A senha precisa cumprir a RN02: mínimo 8 caracteres, com maiúscula, número e caractere especial. O e-mail é normalizado para minúsculas.

- `201` → `{ "usuario": … }`
- `400` senha fora da RN02 — `detalhes.requisitos` lista o que falta
- `409` e-mail já cadastrado (RN01)

A conta nasce com as categorias financeiras padrão (Mercado, Moradia, Transporte, Lazer, Saúde, Educação, Outros). "Mercado" é obrigatória pela RN18.

### `POST /api/conta/login` — SD02 (RF002, RNF09)

Corpo: `{ "email": string, "senha": string }`

- `200` → `{ "token": string, "expiraEm": ISO8601, "usuario": … }`
- `401` e-mail ou senha incorretos

A resposta é idêntica para e-mail inexistente e senha errada, de propósito: não dá para descobrir quais e-mails têm conta.

### `POST /api/conta/logout` — SD03 (RF003, RN03) 🔒

- `200` → `{ "mensagem": "Sessão encerrada." }`
- `401` token ausente, inválido ou já expirado

### `POST /api/conta/recuperar-senha` — SD04 (RF005)

Corpo: `{ "email": string }`

Sempre `200`, com a mesma mensagem genérica, exista o e-mail ou não. Se existir, um link com token de validade limitada é enviado por e-mail.

### `POST /api/conta/redefinir-senha` — SD04

Corpo: `{ "token": string, "senha": string }`

- `200` → senha trocada; o token é consumido e a sessão ativa é derrubada
- `400` token inválido/expirado, ou senha fora da RN02

### `GET /api/conta/perfil` 🔒

- `200` → `{ "usuario": … }`

### `PUT /api/conta/perfil` — SD05 (RF004, RF006, RF007, RN04, RN05) 🔒

Corpo (ao menos um campo): `{ "nome"?: string, "avatarId"?: number|null, "instituicaoId"?: number|null }`

Campo ausente não é alterado; `null` desfaz o vínculo.

- `200` → `{ "usuario": … }`
- `400` corpo vazio, nome em branco, avatar fora da lista (RN04) ou instituição inexistente (RN05)

### `GET /api/conta/avatares` — RF007 / RN04

- `200` → `{ "avatares": [{ "id", "descricao", "url" }] }`

### `GET /api/conta/instituicoes` — RF006 / RN05

- `200` → `{ "instituicoes": [{ "id", "nome" }] }`

---

## Módulo 2 — Despensa

Todas as rotas exigem sessão e são escopadas pelo usuário: produto de outro usuário responde `404`, nunca `403` — não dá para sondar o que existe na despensa alheia.

O objeto `produto`:

```json
{
  "id": 7,
  "nome": "Arroz",
  "categoria": "Grãos",
  "unidade": "kg",
  "quantidadeAtual": 3,
  "monitorado": true,
  "quantidadeMinima": 2,
  "emAlerta": false,
  "criadoEm": "2026-08-10T12:00:00.000Z"
}
```

`emAlerta` é a RN08 avaliada: item monitorado cuja quantidade atingiu ou ficou abaixo da mínima.

### `GET /api/despensa/produtos` — SD09 (RF011)

- `200` → `{ "produtos": [ … ] }`, em ordem alfabética

### `GET /api/despensa/produtos/:id` — SD09 (RF013)

Detalhe com histórico de compras e últimas movimentações.

- `200` → `{ "produto": { …, "historicoCompras": [ { "data", "localCompra", "descricaoNota", "quantidade", "valorUnitario", "valorTotal" } ], "movimentacoes": [ { "tipo", "quantidade", "data" } ] } }`
- `404` produto inexistente ou de outro usuário

### `POST /api/despensa/produtos` — SD07 (RF009)

Corpo: `{ "nome": string, "categoria"?: string|null, "unidade"?: string, "quantidadeInicial"?: number, "monitorado"?: boolean, "quantidadeMinima"?: number|null }`

`quantidadeInicial` entra como movimentação de entrada, não como valor solto — a coluna desnormalizada nasce coerente com o histórico.

- `201` → `{ "produto": … }`
- `400` nome em branco, quantidade negativa, ou `monitorado: true` sem mínima (RN08)
- `409` já existe item com esse nome na despensa

### `PUT /api/despensa/produtos/:id` — SD07 (RF009)

Corpo (ao menos um campo): `nome`, `categoria`, `unidade`, `monitorado`, `quantidadeMinima`.

`quantidadeAtual` **não** é editável aqui de propósito: estoque só muda por movimentação (consumo ou nota).

- `200` / `400` / `404` / `409` — mesma semântica da criação

### `POST /api/despensa/produtos/:id/consumo` — SD08 (RF010, RN07, RN08)

Corpo: `{ "quantidade": number }` (maior que zero)

- `200` → `{ "produto": …, "alertaReposicao": { "mensagem": string } | null }`
- `404` produto inexistente ou de outro usuário
- `422` estoque insuficiente (RN07) — zerar é permitido, ficar negativo não

`alertaReposicao` vem preenchido quando a baixa fez um item monitorado atingir a mínima (RN08).

### `PUT /api/despensa/produtos/:id/monitoramento` — SD10 (RF012)

Corpo: `{ "monitorado": boolean, "quantidadeMinima"?: number|null }`

Desligar o monitoramento limpa a mínima — ela não significa nada sozinha.

- `200` → `{ "produto": … }`
- `400` ligar o monitoramento sem informar a mínima (RN08)

### `GET /api/despensa/alertas` — RF012 / RN08

O que precisa de reposição agora. É também o que o alerta de lavanderia (RF033) vai consultar, já que sabão e amaciante são produtos como os demais (RN13).

- `200` → `{ "produtos": [ … ] }`

### `POST /api/despensa/notas/consultar` — SD06 (RF008, RN22)

Busca os itens da nota na consulta pública da SEFAZ, para adiantar o preenchimento. Não grava nada.

Corpo:

```json
{
  "conteudoQr": "https://www.nfce.fazenda.sp.gov.br/qrcode?p=3526…|2|1|1|<hash>",
  "chaveAcesso": "44 dígitos"
}
```

`conteudoQr` é o conteúdo **cru** do QR Code, não a chave: é o hash dentro da URL que destrava a consulta sem captcha. Chave digitada à mão não tem hash, e para essa nota a resposta vem sempre com `consultada: false`.

- `200` → `{ "consultada": true, "chaveAcesso", "nota": { "localCompra", "dataCompra", "valorTotal", "itens": [ { "descricao", "quantidade", "unidade", "valorUnitario", "sugestao": { "produtoId", "nome", "confianca" } } ] }, "motivo": null }`
- `200` → `{ "consultada": false, "nota": null, "motivo": "texto para o usuário" }` — portal fora do ar, layout mudado, hash recusado ou UF sem provedor
- `400` chave fora do formato

**Falha do portal responde `200`, não `5xx`**: não conseguir consultar é caso previsto, não erro do pedido. O cliente cai no preenchimento manual, que nunca sai de cena. O provedor é escolhido pela UF (dois primeiros dígitos da chave) em `services/notaFiscalService.ts`; hoje só **35 (SP)** tem implementação, em `services/notaFiscal/sefazSp.ts`. Somar um estado é somar um arquivo e uma linha na lista.

O domínio consultado é sempre o da SEFAZ: só a query do QR é aproveitada, nunca o host lido — seguir o endereço do código faria um QR forjado apontar a consulta do servidor para onde quisesse.

Cada item vem com `sugestao`: o produto da despensa que a descrição truncada do PDV provavelmente é (`MAION HELLMANNS 500G TRA` → `maionese`), ou `null`. Sem isso a mesma compra semanal criaria um produto novo a cada nota, porque a conciliação do estoque é por nome exato. O casamento está em `services/notaFiscal/similaridade.ts` e é **palpite**: `null` significa "não sei", nunca "é novo", e nada entra no estoque sem o usuário confirmar.

### `POST /api/despensa/notas` — SD06 (RF008, RF016, RN06, RN18)

Corpo:

```json
{
  "chaveAcesso": "44 dígitos",
  "localCompra": "Mercado do Zé",
  "dataCompra": "2026-08-01",
  "valorTotal": 68.5,
  "itens": [{ "descricao": "Arroz", "quantidade": 5, "valorUnitario": 6.5 }]
}
```

Tudo acontece numa transação só: grava a nota e os itens, concilia cada item com a despensa (item desconhecido vira produto novo), registra as entradas de estoque, gera **uma** transação financeira e marca a nota como processada.

`valorTotal` é opcional; sem ele, vale a soma dos itens.

- `201` → `{ "notaFiscalId", "transacaoId", "gasto", "itens": [ { "descricao", "quantidade", "produto" } ], "alertasResolvidos": [ "nome do item que saiu do alerta" ] }`
- `400` chave fora do formato, data fora de `AAAA-MM-DD`, nota sem itens
- `409` nota já lida (RN06) — vale globalmente, não por usuário

A transação nasce com `origem: "nota"` e categoria **Mercado** (RN18), e a relação nota↔transação é 1:1 — é o que impede a compra de ser contada duas vezes no gasto do mês (RN11).

### `GET /api/despensa/notas`

- `200` → `{ "notas": [ { "id", "chaveAcesso", "localCompra", "dataCompra", "valorTotal", "processada" } ] }`

---

## Módulo 3 — Grana

Todas as rotas exigem sessão e são escopadas pelo usuário.

**Período**: as rotas de consulta aceitam `?mes=AAAA-MM` (atalho para o mês inteiro) ou `?de=AAAA-MM-DD&ate=AAAA-MM-DD`. Sem nenhum dos dois, vale o mês corrente — a "sacola" do mês.

### `GET /api/grana/contas` — RF019 / RN10

- `200` → `{ "contas": [ { "id", "nomeBanco", "saldoInicial", "entradas", "saidas", "saldo" } ] }`

`saldo` é a RN10 aplicada: saldo inicial somado às entradas e subtraído das saídas daquela conta.

### `POST /api/grana/contas` — SD11 (RF014)

Corpo: `{ "nomeBanco": string, "saldoInicial"?: number }` (padrão `0`)

- `201` → `{ "conta": … }`
- `400` nome em branco
- `409` já existe conta com esse nome

### `GET /api/grana/categorias` · `POST /api/grana/categorias`

Categorias financeiras (entidade `CATEGORIA` — não confundir com `produto.categoria`, texto livre). A conta nasce com sete: Mercado, Moradia, Transporte, Lazer, Saúde, Educação e Outros.

- `GET` `200` → `{ "categorias": [ { "id", "nome" } ] }`
- `POST` corpo `{ "nome": string }` → `201` / `409` se já existir

### `POST /api/grana/transacoes` — SD13 (RF017)

Registro manual. Corpo:

```json
{ "tipo": "saida", "valor": 40, "data": "2026-08-06", "categoriaId": 4, "contaId": null, "descricao": "Cinema" }
```

`contaId` é opcional — despesa em dinheiro vivo não tem conta.

- `201` → `{ "transacao": …, "alertaOrcamento": … | null, "saldoConta": … | null }`
- `400` valor não positivo, tipo fora de `entrada`/`saida`, data fora de `AAAA-MM-DD`, categoria ou conta inválida

### `POST /api/grana/transacoes/auto` — SD12 (RF015, RN09)

Mesmo corpo, mas `contaId` é **obrigatório**: todo lançamento automático fica vinculado a uma conta cadastrada (RN09).

- `201` → mesma forma da manual, com `origem: "automatica"`
- `422` sem conta, ou conta inexistente/de outro usuário

> **RNF13** — a leitura de notificações bancárias é restrita no iOS. Na prática este caminho só é alimentado no Android; no iOS o financeiro se apoia no registro manual.

### `alertaOrcamento` — RN12

Vem preenchido quando a despesa fez o gasto acumulado da categoria atingir **80%** do orçamento daquele mês:

```json
{
  "categoria": "Lazer", "mesReferencia": "2026-08",
  "valorLimite": 100, "gasto": 80, "percentual": 80,
  "estourado": false,
  "mensagem": "Você já usou 80% do orçamento de Lazer em 2026-08: R$ 80.00 de R$ 100.00."
}
```

É `null` quando não há orçamento para a categoria no mês, quando o gasto ainda não chegou a 80%, ou quando a transação é de entrada.

### `GET /api/grana/transacoes`

Filtros: período, `categoriaId`, `contaId`, `tipo`, `limite` (padrão 200, máximo 500). Sem período, lista as mais recentes sem recorte de data.

- `200` → `{ "transacoes": [ … ] }`, da mais recente para a mais antiga

### `GET /api/grana/resumo` — SD14 (RF018, RF019, RN10, RN11)

```json
{
  "periodo": { "de": "2026-08-01", "ate": "2026-08-31" },
  "entradas": 2500, "saidas": 270, "resultado": 2230,
  "gastosPorCategoria": [{ "categoria": { "id": 3, "nome": "Transporte" }, "total": 150, "percentual": 55.6 }],
  "contas": [ … ],
  "saldoTotal": 2850
}
```

`saidas` é a RN11: soma das despesas do período, calculada só a partir de `TRANSACAO`. Como a nota fiscal gera exatamente uma transação, a compra não é contada duas vezes.

`contas` e `saldoTotal` refletem o saldo atual, não o período.

- `400` `de` posterior a `ate`

### `POST /api/grana/orcamentos` — SD15 (RF020, RN17)

Corpo: `{ "categoriaId": number, "mesReferencia": "AAAA-MM", "valorLimite": number }`

Cada categoria tem no máximo um orçamento por mês (RN17): reenviar para a mesma categoria e mês **atualiza** o limite.

- `201` orçamento novo · `200` orçamento atualizado
- `400` categoria inválida, mês fora de `AAAA-MM`, limite não positivo

### `GET /api/grana/orcamentos` — RF021

Aceita `?mes=AAAA-MM` (padrão: mês corrente).

- `200` → `{ "mesReferencia", "orcamentos": [ { "id", "categoria", "mesReferencia", "valorLimite", "gasto", "restante", "percentual", "emAlerta", "estourado" } ] }`

`emAlerta` é a RN12 avaliada sobre o acumulado do mês.

### `DELETE /api/grana/orcamentos/:id`

- `204` removido · `404` inexistente ou de outro usuário

---

## Módulo 4 — Cabeça

Todas as rotas exigem sessão e são escopadas pelo usuário.

O objeto `materia`:

```json
{ "id": 2, "nome": "Cálculo I", "metodoMedia": "ponderada", "media": 8.25, "totalAvaliacoes": 2, "totalMinutosEstudo": 240 }
```

`media` é `null` enquanto não houver avaliação — não zero, que seria lido como "tirou zero".

### `GET /api/cabeca/materias` · `POST /api/cabeca/materias` — SD16 (RF022, RN15)

Corpo: `{ "nome": string, "metodoMedia"?: "simples" | "ponderada" }` (padrão `simples`)

O método escolhido define como a média daquela matéria é calculada (RN15): na ponderada cada nota pesa o que o usuário definiu; na simples todas pesam igual e o campo `peso` fica registrado mas não influencia.

- `201` → `{ "materia": … }` · `400` nome em branco ou método inválido · `409` matéria já cadastrada

### `PUT /api/cabeca/materias/:id`

Corpo (ao menos um campo): `nome`, `metodoMedia`. Trocar o método recalcula a média na resposta.

### `POST /api/cabeca/materias/:id/avaliacoes` — SD18 (RF024)

Corpo: `{ "descricao": string, "valor": number, "peso"?: number, "data": "AAAA-MM-DD" }` (peso padrão `1`)

- `201` → `{ "avaliacao": { …, "origem": "manual" } }`
- `400` nota negativa, peso não positivo, data fora do formato
- `404` matéria inexistente ou de outro usuário

### `GET /api/cabeca/materias/:id/avaliacoes` · `DELETE /api/cabeca/avaliacoes/:id`

Listagem em ordem cronológica; remoção devolve `204` ou `404`.

### `POST /api/cabeca/materias/:id/sessoes` — SD19 (RF025)

Corpo: `{ "data": "AAAA-MM-DD", "duracaoMin": number }` — inteiro positivo, no máximo 1440.

- `201` → `{ "sessao": … }` · `400` duração inválida · `404` matéria não encontrada

### `GET /api/cabeca/materias/:id/desempenho` — SD20 (RF026, RF027, RF028)

```json
{
  "materia": { "id": 2, "nome": "Cálculo I", "metodoMedia": "ponderada" },
  "media": 8.25,
  "avaliacoes": [ … ],
  "progressao": {
    "pontos": [{ "data": "2026-03-10", "descricao": "P1", "valor": 6, "mediaAcumulada": 6 }],
    "primeira": 6, "ultima": 9, "variacao": 3, "tendencia": "subindo"
  },
  "estudo": {
    "totalSessoes": 3, "totalMinutos": 240, "mediaMinutosPorSessao": 80,
    "maiorSessaoMin": 120, "ultimaSessao": "2026-04-02",
    "porMes": [{ "mes": "2026-03", "minutos": 120, "sessoes": 2 }]
  }
}
```

`progressao` é a RN16: cada avaliação em ordem cronológica com a média até aquele ponto. A `tendencia` compara a média da primeira metade das avaliações com a da segunda — `subindo`, `caindo`, `estavel` (diferença menor que 0,25) ou `indefinida` (menos de duas avaliações).

### `GET /api/cabeca/desempenho` — RF028

Panorama de todas as matérias: lista com médias, `mediaGeral` (média das médias, só de matérias que já têm nota), estatísticas de estudo somadas e ranking de tempo por matéria.

### `POST /api/cabeca/importar` — SD17 (RF023, RN05)

Importa as notas da instituição vinculada. Sem corpo.

- `200` → `{ "instituicao", "importadas", "ignoradas", "materiasCriadas": [], "avaliacoes": [] }`
- `422` sem vínculo institucional ativo (RN05)
- `503` `INTEGRACAO_INDISPONIVEL` — o vínculo está certo, mas a instituição não expõe importação

> Na prática o `503` é o caso normal: a maioria das instituições não oferece integração, e o caminho principal para as notas é o registro manual (RF024). O adaptador vive em `services/instituicaoService.ts` — quando alguma instituição publicar uma API, ela entra ali sem mexer no resto do módulo. Fora de produção, `INSTITUICAO_INTEGRACAO=stub` devolve notas fixas para exercitar o fluxo.

A importação roda numa transação e é idempotente: reimportar não duplica notas já trazidas (mesma matéria, descrição e data), apenas incrementa `ignoradas`. Matéria que ainda não existe é criada com método `simples`.

---

## Módulo 5 — Roupa

Todas as rotas exigem sessão e são escopadas pelo usuário.

O objeto `peca`:

```json
{ "id": 1, "nome": "Calça jeans", "tipo": "calça", "limiteUsos": 4, "usosAtuais": 3, "precisaLavar": false, "usosRestantes": 1 }
```

`precisaLavar` é a RN14 avaliada: a peça só entra na lista de lavar ao atingir o número de usos que o usuário definiu para ela.

### `GET /api/roupa/pecas` · `POST /api/roupa/pecas` — SD21 (RF029, RN14)

Corpo: `{ "nome": string, "tipo"?: string|null, "limiteUsos": number }` — inteiro de 1 a 365.

- `201` → `{ "peca": … }` · `400` nome em branco ou limite inválido · `409` peça já cadastrada

### `PUT /api/roupa/pecas/:id` · `DELETE /api/roupa/pecas/:id`

Edição de `nome`, `tipo`, `limiteUsos`. Subir o limite tira a peça da lista de lavar sem perder o contador. Remoção devolve `204`.

`usosAtuais` não é editável: o contador só muda por uso registrado ou por lavagem concluída.

### `POST /api/roupa/pecas/:id/uso` — SD22 (RF030, RF031, RN14)

Sem corpo. Registra o uso e incrementa o contador.

- `200` → `{ "peca": …, "alertaLavagem": { "mensagem": string } | null }`
- `404` peça inexistente ou de outro usuário

`alertaLavagem` vem preenchido a partir do uso que atinge o limite, e continua vindo nos usos seguintes enquanto a peça não for lavada.

### `GET /api/roupa/lavar` — RN14

Peças que atingiram o limite, das mais atrasadas para as menos.

### `POST /api/roupa/lavagens` — SD23 (RF032)

Corpo: `{ "dataAgendada": ISO8601, "pecaIds"?: number[], "lembreteAtivo"?: boolean }` (lembrete ligado por padrão)

- `201` → `{ "lavagem": { "id", "dataAgendada", "status", "lembreteAtivo", "pecas": [] } }`
- `400` data inválida · `404` alguma peça não é do usuário

O lembrete em si é notificação local do aparelho: o backend guarda a data e a intenção (`lembreteAtivo`), e o app agenda.

### `GET /api/roupa/lavagens`

Aceita `?status=agendada|concluida|cancelada`.

### `POST /api/roupa/lavagens/:id/concluir`

- `200` → `{ "lavagem": …, "pecasZeradas": [ "Calça jeans" ] }`
- `409` lavagem já concluída ou cancelada · `404` inexistente

Concluir **zera o contador de usos** das peças da lavagem — é o que reinicia a contagem da RN14. O histórico em `USO_PECA` é preservado; a coluna `usos_atuais` passa a valer "usos desde a última lavagem concluída".

### `POST /api/roupa/lavagens/:id/cancelar`

- `200` → `{ "lavagem": … }` · `409` já concluída ou cancelada

### `GET /api/roupa/alertas` — SD24 (RF033, RN13)

Aceita `?emDias=N` (0 a 30, padrão 2): janela para considerar uma lavagem "próxima".

```json
{
  "lavagensProximas": [ … ],
  "insumos": [
    { "produtoId": 9, "nome": "Sabão em pó", "quantidadeAtual": 1, "unidade": "kg", "emFalta": true, "naoCadastrado": false },
    { "produtoId": null, "nome": "Amaciante", "quantidadeAtual": null, "unidade": null, "emFalta": false, "naoCadastrado": true }
  ],
  "faltando": ["Sabão em pó"],
  "mensagem": "Você tem lavagem marcada e está sem Sabão em pó. Reponha antes."
}
```

Sabão e amaciante são `PRODUTO` como os demais (RN13), então o alerta é uma consulta ao estoque da despensa — o casamento é por nome e cobre a grafia com e sem acento. Um insumo conta como em falta quando acabou **ou** quando é monitorado e atingiu a mínima (RN08). Quando não existe produto correspondente, `naoCadastrado` fica `true` e o insumo não é reportado como falta — não dá para afirmar que falta o que nunca foi cadastrado.

A `mensagem` muda de tom conforme exista ou não lavagem marcada na janela, e é `null` quando não falta nada.
