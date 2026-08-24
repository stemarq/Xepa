# Diagramas de Sequência — sintaxe Eraser

Cada bloco abaixo é um diagrama independente. No Eraser: menu de inserção (+) → Diagram-as-code → **Sequence diagram** → cole o conteúdo do bloco correspondente.

Convenções: `>` chamada · `-->` retorno · `alt/else/opt/loop { }` controle de fluxo · `autoNumber on` numera os passos.

---

## Módulo 1 — Autenticação e Conta

### SD01 — Cadastro de usuário (RF001, RN01, RN02, RNF06)

```sequence-diagram
// SD01 — Cadastro de usuário
autoNumber on

Cliente > Controller: POST /cadastro (nome, email, senha)
Controller > Service: cadastrar(dados)
Service > Service: validar senha (RN02)
alt [label: senha fora do padrão] {
  Service --> Controller: erro 400 (senha inválida)
  Controller --> Cliente: 400 Bad Request
}
else [label: senha válida] {
  Service > Repository: buscarPorEmail(email)
  Repository > DB [label: "Banco de Dados"]: SELECT usuario WHERE email
  DB --> Repository: usuario / null
  Repository --> Service: usuario / null
  alt [label: e-mail já cadastrado (RN01)] {
    Service --> Controller: erro 409 (e-mail em uso)
    Controller --> Cliente: 409 Conflict
  }
  else [label: e-mail disponível] {
    Service > Service: gerar hash + salt (RNF06)
    Service > Repository: salvar(usuario)
    Repository > DB: INSERT usuario
    DB --> Repository: id
    Repository --> Service: usuario criado
    Service --> Controller: sucesso
    Controller --> Cliente: 201 Created
  }
}
```

### SD02 — Login (RF002, RN02, RNF09)

```sequence-diagram
// SD02 — Login
autoNumber on

Cliente > Controller: POST /login (email, senha)
Controller > Service: autenticar(email, senha)
Service > Repository: buscarPorEmail(email)
Repository > DB [label: "Banco de Dados"]: SELECT usuario WHERE email
DB --> Repository: usuario / null
Repository --> Service: usuario / null
alt [label: usuário não encontrado ou senha incorreta] {
  Service --> Controller: erro 401
  Controller --> Cliente: 401 Unauthorized
}
else [label: credenciais válidas] {
  Service > Service: verificar hash da senha
  Service > Service: gerar token de sessão
  Service > Repository: registrarToken(usuario_id, token)
  Repository > DB: UPDATE usuario SET token
  DB --> Repository: ok
  Service --> Controller: token
  Controller --> Cliente: 200 OK (token)
}
```

### SD03 — Logout (RF003, RN03)

```sequence-diagram
// SD03 — Logout
autoNumber on

Cliente > Controller: POST /logout (token)
Controller > Service: encerrarSessao(token)
Service > Repository: buscarPorToken(token)
Repository > DB [label: "Banco de Dados"]: SELECT usuario WHERE token
DB --> Repository: usuario / null
Repository --> Service: usuario / null
alt [label: token inválido ou expirado] {
  Service --> Controller: erro 401
  Controller --> Cliente: 401 Unauthorized
}
else [label: token válido] {
  Service > Repository: invalidarToken(usuario_id)
  Repository > DB: UPDATE usuario SET token = null (RN03)
  DB --> Repository: ok
  Service --> Controller: sucesso
  Controller --> Cliente: 200 OK (sessão encerrada)
}
```

### SD04 — Recuperação de senha (RF005)

```sequence-diagram
// SD04 — Recuperação de senha
autoNumber on

Cliente > Controller: POST /recuperar-senha (email)
Controller > Service: solicitarRecuperacao(email)
Service > Repository: buscarPorEmail(email)
Repository > DB [label: "Banco de Dados"]: SELECT usuario WHERE email
DB --> Repository: usuario / null
Repository --> Service: usuario / null
opt [label: e-mail encontrado] {
  Service > Service: gerar token de redefinição
  Service > Repository: salvarTokenRecuperacao(usuario_id, token)
  Repository > DB: UPDATE usuario SET token_recuperacao
  DB --> Repository: ok
  Service > Email [label: "Serviço de E-mail"]: enviar link de redefinição
  Email --> Service: enviado
}
// resposta genérica p/ não revelar se o e-mail existe
Service --> Controller: resposta genérica
Controller --> Cliente: 200 OK
```

### SD05 — Editar perfil, avatar e vínculo institucional (RF004, RF006, RF007, RN04, RN05)

```sequence-diagram
// SD05 — Editar perfil, avatar e vínculo
autoNumber on

Cliente > Controller: PUT /perfil (nome, avatar_id, instituicao_id)
Controller > Service: atualizarPerfil(usuario_id, dados)
opt [label: avatar informado] {
  Service > Repository: validarAvatar(avatar_id)
  Repository > DB [label: "Banco de Dados"]: SELECT avatar WHERE id (RN04)
  DB --> Repository: avatar / null
}
opt [label: instituição informada] {
  Service > Repository: validarInstituicao(instituicao_id)
  Repository > DB: SELECT instituicao WHERE id (RN05)
  DB --> Repository: instituicao / null
}
alt [label: dados inválidos] {
  Service --> Controller: erro 400
  Controller --> Cliente: 400 Bad Request
}
else [label: válido] {
  Service > Repository: atualizar(usuario)
  Repository > DB: UPDATE usuario
  DB --> Repository: ok
  Service --> Controller: sucesso
  Controller --> Cliente: 200 OK
}
```

---

## Módulo 2 — Controle de Estoque

### SD06 — Leitura de nota fiscal via QR Code (RF008, RN06, RN18)

```sequence-diagram
// SD06 — Leitura de nota fiscal via QR Code
autoNumber on

// O QR da NFC-e carrega uma URL do portal da SEFAZ com a chave de acesso e
// parâmetros de validação — e **nada além disso**. Descrição, quantidade e
// valor dos produtos não estão no código: só na página do portal.
Cliente > Cliente: ler QR Code e extrair a chave de acesso (44 dígitos)
// Por isso os itens são conferidos pelo usuário antes de enviar. Puxá-los
// sozinho exigiria raspar o portal da SEFAZ, que é por estado — fica fora
// deste fluxo.
Cliente > Usuario [label: "Usuário"]: conferir/informar os itens da nota
Usuario --> Cliente: itens
Cliente > Controller: POST /notas (chave_acesso, itens)
Controller > Service: processarNota(usuario_id, chave_acesso, itens)
Service > Repository: buscarPorChave(chave_acesso)
Repository > DB [label: "Banco de Dados"]: SELECT nota_fiscal WHERE chave_acesso
DB --> Repository: nota / null
Repository --> Service: nota / null
alt [label: nota já processada (RN06)] {
  Service --> Controller: erro 409 (nota duplicada)
  Controller --> Cliente: 409 Conflict
}
else [label: nota nova] {
  Service > Repository: salvarNota + itens
  Repository > DB: INSERT nota_fiscal, INSERT item_nota
  DB --> Repository: ok
  loop [label: para cada item] {
    Service > Repository: registrarEntradaEstoque(produto)
    Repository > DB: INSERT movimentacao_estoque (entrada)
    Repository > DB: UPDATE produto SET quantidade_atual
  }
  Service > Repository: gerarTransacao (origem=nota, categoria=Mercado)
  Repository > DB: INSERT transacao (RN18)
  Service > Repository: marcarProcessada
  Repository > DB: UPDATE nota_fiscal SET processada = true
  DB --> Repository: ok
  Service --> Controller: sucesso (itens + gasto)
  Controller --> Cliente: 201 Created
}
```

### SD07 — Cadastro/edição manual de item (RF009)

```sequence-diagram
// SD07 — Cadastro/edição manual de item
autoNumber on

Cliente > Controller: POST/PUT /produtos (dados)
Controller > Service: salvarProduto(usuario_id, dados)
alt [label: criação] {
  Service > Repository: inserir(produto)
  Repository > DB [label: "Banco de Dados"]: INSERT produto
}
else [label: edição] {
  Service > Repository: atualizar(produto)
  Repository > DB: UPDATE produto
}
DB --> Repository: ok
Repository --> Service: produto
Service --> Controller: sucesso
Controller --> Cliente: 200 / 201
```

### SD08 — Registro de consumo / baixa de estoque (RF010, RN07, RN08)

```sequence-diagram
// SD08 — Registro de consumo / baixa de estoque
autoNumber on

Cliente > Controller: POST /produtos/{id}/consumo (quantidade)
Controller > Service: registrarConsumo(produto_id, quantidade)
Service > Repository: buscarProduto(produto_id)
Repository > DB [label: "Banco de Dados"]: SELECT produto
DB --> Repository: produto
Repository --> Service: produto
alt [label: quantidade maior que o estoque (RN07)] {
  Service --> Controller: erro 422 (estoque insuficiente)
  Controller --> Cliente: 422 Unprocessable
}
else [label: baixa permitida] {
  Service > Repository: registrarBaixa
  Repository > DB: INSERT movimentacao_estoque (baixa)
  Repository > DB: UPDATE produto SET quantidade_atual
  DB --> Repository: quantidade_atual, quantidade_minima, monitorado
  opt [label: item monitorado e quantidade atingiu a mínima (RN08)] {
    Service --> Cliente: notificação de reposição
  }
  Service --> Controller: sucesso
  Controller --> Cliente: 200 OK
}
```

### SD09 — Consultar estoque e histórico (RF011, RF013)

```sequence-diagram
// SD09 — Consultar estoque e histórico
autoNumber on

Cliente > Controller: GET /produtos
Controller > Service: listarEstoque(usuario_id)
Service > Repository: buscarProdutos + histórico
Repository > DB [label: "Banco de Dados"]: SELECT produto
Repository > DB: SELECT item_nota JOIN nota_fiscal (valor pago, local)
DB --> Repository: dados
Repository --> Service: lista com quantidades e histórico
Service --> Controller: lista
Controller --> Cliente: 200 OK
```

### SD10 — Configurar alerta de item (RF012)

```sequence-diagram
// SD10 — Configurar alerta de item
autoNumber on

Cliente > Controller: PUT /produtos/{id}/monitoramento (monitorado, quantidade_minima)
Controller > Service: configurarAlerta(produto_id, dados)
Service > Repository: atualizar(produto)
Repository > DB [label: "Banco de Dados"]: UPDATE produto SET monitorado, quantidade_minima
DB --> Repository: ok
Service --> Controller: sucesso
Controller --> Cliente: 200 OK
```

---

## Módulo 3 — Gestão Financeira

### SD11 — Cadastrar conta bancária (RF014)

```sequence-diagram
// SD11 — Cadastrar conta bancária
autoNumber on

Cliente > Controller: POST /contas (nome_banco, saldo_inicial)
Controller > Service: cadastrarConta(usuario_id, dados)
Service > Repository: inserir(conta)
Repository > DB [label: "Banco de Dados"]: INSERT conta_bancaria
DB --> Repository: id
Service --> Controller: sucesso
Controller --> Cliente: 201 Created
```

### SD12 — Registro automático via notificação bancária (RF015, RN09, RN10)

```sequence-diagram
// SD12 — Registro automático via notificação bancária
autoNumber on

Banco [label: "Sistema Bancário"] > Cliente: notificação de movimentação (valor, tipo)
Cliente > Controller: POST /transacoes/auto (dados)
Controller > Service: registrarAutomatica(dados)
Service > Repository: buscarContaVinculada
Repository > DB [label: "Banco de Dados"]: SELECT conta_bancaria
DB --> Repository: conta / null
Repository --> Service: conta / null
alt [label: sem conta vinculada (RN09)] {
  Service --> Controller: erro 422 (lançamento requer conta)
  Controller --> Cliente: 422 Unprocessable
}
else [label: conta encontrada] {
  Service > Repository: inserirTransacao (origem=automatica)
  Repository > DB: INSERT transacao
  DB --> Repository: ok
  Service > Service: saldo = saldo_inicial + entradas - saídas (RN10)
  Service --> Controller: sucesso
  Controller --> Cliente: 201 Created
}
```

### SD13 — Registro manual de despesa + alerta de orçamento (RF017, RN11, RN12)

```sequence-diagram
// SD13 — Registro manual de despesa + alerta de orçamento
autoNumber on

Cliente > Controller: POST /transacoes (valor, categoria, data)
Controller > Service: registrarDespesa(usuario_id, dados)
Service > Repository: inserirTransacao (origem=manual)
Repository > DB [label: "Banco de Dados"]: INSERT transacao
DB --> Repository: ok
Service > Repository: somarGastosCategoriaMes(categoria, mês)
Repository > DB: SELECT SUM(valor) transacao WHERE categoria e mês (RN11)
DB --> Repository: total
Service > Repository: buscarOrcamento(categoria, mês)
Repository > DB: SELECT orcamento
DB --> Repository: orcamento / null
opt [label: gasto atingiu 80% do limite da categoria (RN12)] {
  Service --> Cliente: alerta de orçamento
}
Service --> Controller: sucesso
Controller --> Cliente: 201 Created
```

### SD14 — Consultar gastos e saldo (RF018, RF019, RN10, RN11)

```sequence-diagram
// SD14 — Consultar gastos e saldo
autoNumber on

Cliente > Controller: GET /financeiro/resumo (período)
Controller > Service: obterResumo(usuario_id, período)
Service > Repository: gastosPorCategoria + saldoPorConta
Repository > DB [label: "Banco de Dados"]: SELECT transacao GROUP BY categoria (RF018)
Repository > DB: SELECT conta + SUM(transacao) (RF019 e RN10)
DB --> Repository: dados
Repository --> Service: resumo
Service --> Controller: resumo
Controller --> Cliente: 200 OK
```

### SD15 — Definir orçamento por categoria (RF020, RN17)

```sequence-diagram
// SD15 — Definir orçamento por categoria
autoNumber on

Cliente > Controller: POST /orcamentos (categoria, mês, valor_limite)
Controller > Service: definirOrcamento(usuario_id, dados)
Service > Repository: buscarOrcamento(categoria, mês)
Repository > DB [label: "Banco de Dados"]: SELECT orcamento WHERE usuario e categoria e mês
DB --> Repository: orcamento / null
Repository --> Service: orcamento / null
alt [label: já existe orçamento p/ a categoria no mês (RN17)] {
  Service > Repository: atualizar(orcamento)
  Repository > DB: UPDATE orcamento
}
else [label: novo] {
  Service > Repository: inserir(orcamento)
  Repository > DB: INSERT orcamento
}
DB --> Repository: ok
Service --> Controller: sucesso
Controller --> Cliente: 200 / 201
```

---

## Módulo 4 — Acompanhamento de Estudos

### SD16 — Cadastrar matéria (RF022, RN15)

```sequence-diagram
// SD16 — Cadastrar matéria
autoNumber on

Cliente > Controller: POST /materias (nome, metodo_media)
Controller > Service: cadastrarMateria(usuario_id, dados)
Service > Repository: inserir(materia)
Repository > DB [label: "Banco de Dados"]: INSERT materia (metodo_media: simples/ponderada)
DB --> Repository: id
Service --> Controller: sucesso
Controller --> Cliente: 201 Created
```

### SD17 — Importar notas da instituição (RF023, RN05)

```sequence-diagram
// SD17 — Importar notas da instituição
autoNumber on

Cliente > Controller: POST /notas/importar
Controller > Service: importarNotas(usuario_id)
Service > Repository: buscarVinculo(usuario_id)
Repository > DB [label: "Banco de Dados"]: SELECT usuario.instituicao_id
DB --> Repository: instituicao_id / null
Repository --> Service: vínculo
alt [label: sem vínculo ativo (RN05)] {
  Service --> Controller: erro 422 (vínculo institucional necessário)
  Controller --> Cliente: 422 Unprocessable
}
else [label: vínculo ativo] {
  Service > Instituicao [label: "Instituição de Ensino"]: solicitar notas do aluno
  Instituicao --> Service: notas (origem=importada)
  loop [label: cada nota recebida] {
    Service > Repository: salvarAvaliacao(materia, valor, origem=importada)
    Repository > DB: INSERT avaliacao
  }
  DB --> Repository: ok
  Service --> Controller: sucesso
  Controller --> Cliente: 200 OK
}
```

### SD18 — Registrar nota manualmente (RF024)

```sequence-diagram
// SD18 — Registrar nota manualmente
autoNumber on

Cliente > Controller: POST /materias/{id}/avaliacoes (descricao, valor, peso, data)
Controller > Service: registrarNota(materia_id, dados)
Service > Repository: inserir(avaliacao origem=manual)
Repository > DB [label: "Banco de Dados"]: INSERT avaliacao
DB --> Repository: ok
Service --> Controller: sucesso
Controller --> Cliente: 201 Created
```

### SD19 — Registrar sessão de estudo (RF025)

```sequence-diagram
// SD19 — Registrar sessão de estudo
autoNumber on

Cliente > Controller: POST /materias/{id}/sessoes (data, duracao_min)
Controller > Service: registrarSessao(materia_id, dados)
Service > Repository: inserir(sessao_estudo)
Repository > DB [label: "Banco de Dados"]: INSERT sessao_estudo
DB --> Repository: ok
Service --> Controller: sucesso
Controller --> Cliente: 201 Created
```

### SD20 — Consultar desempenho (RF026, RF027, RF028, RN15, RN16)

```sequence-diagram
// SD20 — Consultar desempenho
autoNumber on

Cliente > Controller: GET /materias/{id}/desempenho
Controller > Service: obterDesempenho(materia_id)
Service > Repository: buscarAvaliacoes + sessoes + metodo_media
Repository > DB [label: "Banco de Dados"]: SELECT avaliacao e sessao_estudo e materia
DB --> Repository: dados
Repository --> Service: dados
Service > Service: calcular média simples ou ponderada (RN15)
Service > Service: calcular progressão ao longo do tempo (RN16)
Service > Service: consolidar estatísticas de tempo (RF028)
Service --> Controller: métricas
Controller --> Cliente: 200 OK
```

---

## Módulo 5 — Gestão de Lavanderia

### SD21 — Cadastrar peça de roupa (RF029, RN14)

```sequence-diagram
// SD21 — Cadastrar peça de roupa
autoNumber on

Cliente > Controller: POST /pecas (nome, tipo, limite_usos)
Controller > Service: cadastrarPeca(usuario_id, dados)
Service > Repository: inserir(peca_roupa, usos_atuais=0)
Repository > DB [label: "Banco de Dados"]: INSERT peca_roupa
DB --> Repository: id
Service --> Controller: sucesso
Controller --> Cliente: 201 Created
```

### SD22 — Registrar uso da peça + notificação de limite (RF030, RF031, RN14)

```sequence-diagram
// SD22 — Registrar uso da peça + notificação de limite
autoNumber on

Cliente > Controller: POST /pecas/{id}/uso
Controller > Service: registrarUso(peca_id)
Service > Repository: inserirUso + incrementar usos
Repository > DB [label: "Banco de Dados"]: INSERT uso_peca
Repository > DB: UPDATE peca_roupa SET usos_atuais + 1
DB --> Repository: usos_atuais e limite_usos
Repository --> Service: peça
opt [label: usos atingiram o limite (RN14)] {
  Service > Service: adicionar à lista de lavar
  Service --> Cliente: notificação de peça no limite (RF031)
}
Service --> Controller: sucesso
Controller --> Cliente: 200 OK
```

### SD23 — Agendar lavagem e lembrete (RF032)

```sequence-diagram
// SD23 — Agendar lavagem e lembrete
autoNumber on

Cliente > Controller: POST /lavagens (data_agendada, pecas)
Controller > Service: agendarLavagem(usuario_id, dados)
Service > Repository: inserirLavagem + vincular peças
Repository > DB [label: "Banco de Dados"]: INSERT lavagem
Repository > DB: INSERT lavagem_peca (cada peça)
DB --> Repository: ok
opt [label: lembrete ativo] {
  Service > Service: agendar lembrete para a data
}
Service --> Controller: sucesso
Controller --> Cliente: 201 Created
```

### SD24 — Alerta de lavanderia consultando estoque (RF033, RN13)

```sequence-diagram
// SD24 — Alerta de lavanderia consultando estoque
autoNumber on

// rotina disparada antes de uma lavagem agendada
Service > Repository: buscarLavagensProximas
Repository > DB [label: "Banco de Dados"]: SELECT lavagem WHERE data próxima
DB --> Repository: lavagens
Repository --> Service: lavagens
Service > Repository: consultarEstoque(sabão, amaciante)
Repository > DB: SELECT produto WHERE nome IN (sabão e amaciante)
DB --> Repository: quantidades
Repository --> Service: quantidades
opt [label: sabão ou amaciante em falta (RN13)] {
  Service --> Cliente: alerta de reposição (lavanderia)
}
```

### SD25 — Conectar instituição via Open Finance (RF034, RN21, RNF18)

```sequence-diagram
// SD25 — Conectar instituição via Open Finance
autoNumber on

Cliente > Controller: POST /grana/open-finance/consentimentos (instituicao, escopo)
Controller > Service: criarConsentimento(usuario_id, dados)
// RNF18 — o Xepa não fala com o banco: fala com o provedor autorizado
Service > Provedor [label: "Provedor Open Finance"]: iniciarConsentimento(instituicao, escopo)
Provedor --> Service: consentimento_externo + url de autorização
Service > Repository: inserirConsentimento(status "pendente", expira_em)
Repository > DB [label: "Banco de Dados"]: INSERT consentimento
DB --> Repository: id
Repository --> Service: consentimento
Service --> Controller: consentimento + url
Controller --> Cliente: 201 Created (url de autorização)

// o usuário autoriza no ambiente da instituição, fora do Xepa
Cliente > Controller: POST /grana/open-finance/consentimentos/:id/autorizar
Controller > Service: autorizarConsentimento(usuario_id, id)
Service > Provedor: confirmarAutorizacao(consentimento_externo)
Provedor --> Service: autorizado + contas
Service > Repository: atualizarStatus("ativo") + inserirContas
Repository > DB: UPDATE consentimento; INSERT conta_bancaria (id_externo)
DB --> Repository: ok
Service --> Controller: contas conectadas
Controller --> Cliente: 200 OK
```

### SD26 — Sincronizar extrato com deduplicação (RF035, RN19, RN20)

```sequence-diagram
// SD26 — Sincronizar extrato com deduplicação
autoNumber on

Cliente > Controller: POST /grana/open-finance/consentimentos/:id/sincronizar
Controller > Service: sincronizar(usuario_id, consentimento_id)
Service > Repository: buscarConsentimento
Repository > DB [label: "Banco de Dados"]: SELECT consentimento
DB --> Repository: consentimento
Repository --> Service: consentimento
alt [label: "expirado ou revogado (RN21)"] {
  Service --> Controller: AppError 409
  Controller --> Cliente: 409 Conflict
}
else [label: ativo] {
  Service > Provedor [label: "Provedor Open Finance"]: listarMovimentacoes(contas, desde)
  Provedor --> Service: movimentações
  loop [label: "cada movimentação"] {
    Service > Repository: buscarPorIdExterno(conta_id, id_externo)
    Repository > DB: SELECT transacao WHERE id_externo
    DB --> Repository: existente?
    alt [label: "já importada (RN19)"] {
      Service > Service: ignora — sincronização é idempotente
    }
    else [label: "saída casa com nota não conciliada (RN20)"] {
      // mesmo valor, mesma conta, data dentro de 3 dias
      Service > Repository: conciliarComNota(transacao_id, id_externo)
      Repository > DB: UPDATE transacao SET id_externo, conciliada_em
    }
    else [label: "movimentação nova"] {
      Service > Repository: inserirTransacao(origem "open_finance")
      Repository > DB: INSERT transacao
    }
  }
  Service --> Controller: resumo (importadas, conciliadas, ignoradas)
  Controller --> Cliente: 200 OK
}
```

### SD27 — Revogar consentimento (RF036, RN21)

```sequence-diagram
// SD27 — Revogar consentimento
autoNumber on

Cliente > Controller: DELETE /grana/open-finance/consentimentos/:id
Controller > Service: revogarConsentimento(usuario_id, id)
Service > Provedor [label: "Provedor Open Finance"]: revogar(consentimento_externo)
Provedor --> Service: revogado
Service > Repository: atualizarStatus("revogado", revogado_em)
Repository > DB [label: "Banco de Dados"]: UPDATE consentimento
// RN21 — as transações já importadas ficam: são histórico do usuário
DB --> Repository: ok
Repository --> Service: ok
Service --> Controller: sucesso
Controller --> Cliente: 204 No Content
```

### SD28 — Continuar conectado (RF039, RN23, RNF19)

O caminho que substitui o login quando o app é reaberto. A confirmação da
sessão guardada vem primeiro: quem voltou em poucos minutos não vê a biometria.

```sequence-diagram
// SD28 — Continuar conectado
autoNumber on

Cliente > Cliente [label: "App"]: ler token de sessão do Keychain
Cliente > Controller: GET /conta/perfil (token guardado)
alt [label: sessão ainda válida] {
  Controller --> Cliente: 200 OK (usuario)
  // nada mais acontece: a janela de 30 min recomeça (RNF09)
}
else [label: 401 — sessão expirada por inatividade] {
  Cliente > Cliente: ler token de renovação do Keychain
  alt [label: sem token de renovação ou sem biometria cadastrada] {
    Cliente > Cliente: descartar sessão e abrir tela de login
  }
  else [label: continuar conectado disponível] {
    Cliente > SO [label: "Sistema Operacional"]: autenticar localmente (RNF19)
    alt [label: cancelado pelo usuário] {
      SO --> Cliente: recusado
      Cliente > Cliente: manter tela bloqueada, token preservado
    }
    else [label: desbloqueado] {
      SO --> Cliente: ok
      Cliente > Controller: POST /conta/renovar (tokenRenovacao)
      Controller > Service: renovarPorToken(tokenRenovacao)
      Service > Repository: buscarPorTokenRenovacao(hash)
      Repository > DB [label: "Banco de Dados"]: SELECT usuario WHERE token_renovacao_hash
      DB --> Repository: usuario / null
      Repository --> Service: usuario / null
      alt [label: token inexistente ou vencido] {
        Service > Repository: invalidarTokenRenovacao(usuario_id)
        Service --> Controller: erro 401
        Controller --> Cliente: 401 Unauthorized
        Cliente > Cliente: descartar sessão e abrir tela de login
      }
      else [label: token válido] {
        // RN23 — rotação: o token usado é queimado e um novo é emitido
        Service > Service: gerar token de sessão e novo token de renovação
        Service > Repository: registrarTokenSessao + registrarTokenRenovacao
        Repository > DB: UPDATE usuario
        DB --> Repository: ok
        Service --> Controller: sessão + renovação
        Controller --> Cliente: 200 OK (token, tokenRenovacao, usuario)
        Cliente > Cliente: gravar os dois no Keychain e abrir a banca
      }
    }
  }
}
```
