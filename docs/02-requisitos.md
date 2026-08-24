# Requisitos Funcionais e Regras de Negócio

## Contexto

Aplicação voltada a estudantes universitários que estão lidando pela primeira vez com a rotina de morar sozinhos e com a pressão da faculdade. O sistema unifica, em um único hub, o controle de estoque doméstico, a gestão financeira, o acompanhamento dos estudos e a gestão da lavanderia.

**Ator do sistema:** Usuário (o estudante).

---

## Requisitos Funcionais

### Módulo 1 — Autenticação e Conta

| ID | Descrição |
|----|-----------|
| RF001 | O sistema deve permitir que o usuário crie uma conta informando nome, e-mail e senha. |
| RF002 | O sistema deve permitir que o usuário faça login com e-mail e senha. |
| RF003 | O sistema deve permitir que o usuário encerre a sessão (logout). |
| RF004 | O sistema deve permitir que o usuário edite os dados do seu perfil. |
| RF005 | O sistema deve permitir que o usuário recupere/redefina a senha. |
| RF006 | O sistema deve permitir que o usuário vincule uma instituição de ensino, habilitando a importação automática de notas. |
| RF007 | O sistema deve permitir que o usuário escolha uma foto de perfil dentre os avatares disponíveis. |

### Módulo 2 — Controle de Estoque (Despensa)

| ID | Descrição |
|----|-----------|
| RF008 | O sistema deve permitir que o usuário adicione itens ao estoque por leitura do QR Code da nota fiscal. O QR identifica a nota (chave de acesso de 44 dígitos) e destrava a busca dos itens na consulta pública da SEFAZ; os itens são conferidos pelo usuário antes de entrar no estoque, e informados por ele quando a consulta não estiver disponível — ver RN22. |
| RF009 | O sistema deve permitir que o usuário adicione e edite itens manualmente. |
| RF010 | O sistema deve permitir que o usuário registre o consumo (baixa) de itens. |
| RF011 | O sistema deve exibir a lista de itens em estoque com suas quantidades. |
| RF012 | O sistema deve permitir que o usuário escolha quais itens deseja monitorar e defina a quantidade mínima de cada um, alertando quando o item atingir esse limite. |
| RF013 | O sistema deve exibir o histórico de valor pago e o local de compra por item. |

### Módulo 3 — Gestão Financeira

| ID | Descrição |
|----|-----------|
| RF014 | O sistema deve permitir que o usuário cadastre contas bancárias. |
| RF015 | O sistema deve registrar automaticamente entradas e saídas de valor a partir das notificações bancárias. **Depreciado**: continua válido no Android, mas deixa de ser o caminho da automação financeira — quem assume é o Open Finance (RF034–RF037), que não depende de permissão de notificação e por isso funciona também no iOS (RNF13). |
| RF034 | O sistema deve permitir que o usuário conecte uma instituição financeira via Open Finance, registrando o consentimento correspondente. |
| RF035 | O sistema deve importar contas e extrato das instituições conectadas, gerando transações a partir da movimentação. |
| RF036 | O sistema deve permitir que o usuário revogue, a qualquer momento, o consentimento de uma instituição conectada. |
| RF037 | O sistema deve exibir, para cada conexão, o escopo consentido e a data de expiração do consentimento. |
| RF016 | O sistema deve calcular os gastos a partir dos valores das notas fiscais lidas. |
| RF017 | O sistema deve permitir o registro manual de despesas (valor, categoria, data). |
| RF018 | O sistema deve exibir um resumo de gastos por período e por categoria. |
| RF019 | O sistema deve exibir o saldo categorizado por conta bancária. |
| RF020 | O sistema deve permitir que o usuário defina orçamentos mensais por categoria (ex.: R$ 300 em mercado, R$ 200 em lazer). |
| RF021 | O sistema deve alertar quando os gastos de uma categoria se aproximarem ou ultrapassarem o orçamento definido para ela. |

### Módulo 4 — Acompanhamento de Estudos

| ID | Descrição |
|----|-----------|
| RF022 | O sistema deve permitir que o usuário cadastre matérias/disciplinas. |
| RF023 | O sistema deve importar notas automaticamente da instituição vinculada. |
| RF024 | O sistema deve permitir o registro manual de notas por matéria. |
| RF025 | O sistema deve permitir o registro do tempo de estudo (sessões). |
| RF026 | O sistema deve calcular a média das notas por matéria. |
| RF027 | O sistema deve exibir métricas de progressão de notas por matéria (evolução ao longo do tempo). |
| RF028 | O sistema deve exibir estatísticas de tempo de estudo. |

### Módulo 5 — Gestão de Lavanderia

| ID | Descrição |
|----|-----------|
| RF029 | O sistema deve permitir o cadastro de peças de roupa com uma regra de lavagem (nº de usos antes de lavar). |
| RF030 | O sistema deve permitir registrar o uso de uma peça. |
| RF031 | O sistema deve notificar o usuário quando uma peça atingir o limite de usos. |
| RF032 | O sistema deve permitir agendar lavagens e emitir lembretes. |
| RF033 | O sistema deve consultar o estoque e alertar sobre a falta de sabão e amaciante. |
| RF039 | O sistema deve manter o usuário conectado entre aberturas do app, sem exigir e-mail e senha a cada vez. O login guarda no aparelho um token de renovação de vida longa, trocado por uma sessão nova quando a anterior expira (RNF09); a troca exige desbloqueio biométrico ou código do aparelho (RNF19). Sair da conta (RF003) e redefinir a senha (RF005) descartam esse token. |
| RF038 | O sistema deve permitir associar uma foto a cada peça de roupa, tirada na hora ou escolhida da galeria, e permitir trocá-la ou removê-la. A imagem é reduzida no aparelho antes de subir e guardada como miniatura; a peça continua válida sem foto. |

---

## Regras de Negócio

| ID | Descrição |
|----|-----------|
| RN01 | O e-mail de cadastro deve ser único no sistema. |
| RN02 | A senha deve ter no mínimo 8 caracteres, contendo ao menos uma letra maiúscula, um número e um caractere especial. |
| RN03 | No logout, o token da sessão deve ser invalidado. |
| RN04 | A foto de perfil deve ser escolhida apenas dentre os avatares pré-definidos (sem upload próprio). |
| RN05 | A importação automática de notas só ocorre com um vínculo institucional ativo. |
| RN06 | Uma nota fiscal já processada não pode ser lida novamente (evitar duplicidade de itens e gastos). |
| RN07 | A baixa de estoque não pode deixar a quantidade negativa. |
| RN08 | O alerta de estoque é disparado quando a quantidade de um item monitorado atingir ou ficar abaixo da quantidade mínima que o usuário definiu para aquele item. |
| RN09 | Todo lançamento automático deve estar vinculado a uma conta bancária cadastrada. |
| RN10 | O saldo de uma conta é igual ao saldo inicial somado às entradas e subtraído das saídas daquela conta. |
| RN11 | O gasto do mês é a soma de todas as despesas (notas + manuais + saídas) dentro do mês de referência. |
| RN12 | O alerta de orçamento dispara ao atingir 80% do limite definido para a categoria no mês de referência. |
| RN13 | Sabão e amaciante são tratados como itens de estoque; a falta é sinalizada antes de uma lavagem agendada. |
| RN14 | Uma peça só entra na lista de "lavar" após atingir o número de usos definido pelo usuário para aquela peça (ex.: calça jeans após 4 usos). |
| RN15 | A média de uma matéria é calculada segundo o método definido pelo usuário (simples ou ponderada). |
| RN16 | A métrica de progressão compara as notas de uma matéria ao longo das avaliações e do tempo. |
| RN17 | Cada categoria pode ter no máximo um orçamento por mês de referência (único por usuário + categoria + mês). |
| RN18 | A leitura de nota fiscal (QR Code) contempla apenas notas de mercado/supermercado; toda transação gerada por nota é automaticamente categorizada como "Mercado". |
| RN19 | A sincronização de extrato é idempotente: uma movimentação já importada, identificada pelo seu id na instituição, nunca gera uma segunda transação — sincronizar de novo não muda o gasto do mês. |
| RN20 | Uma compra que chega pela nota fiscal (RF016) e pelo extrato (RF035) é **um** gasto, não dois. Ao sincronizar, uma movimentação de saída que case com uma transação de origem "nota" ainda não conciliada — mesmo usuário, mesmo valor e data dentro de 3 dias — concilia com ela em vez de criar outra. O casamento não exige conta igual: a transação de nota nasce sem conta, porque o QR Code não informa o meio de pagamento; a conciliação é justamente o que descobre por qual conta a compra foi paga. Sem esta regra o gasto do mês (RN11) conta o mesmo dinheiro duas vezes. |
| RN21 | O consentimento tem escopo e prazo: expira no máximo em 12 meses e pode ser revogado pelo usuário a qualquer momento. Consentimento expirado ou revogado não sincroniza, e revogar não apaga as transações já importadas — elas são histórico financeiro do usuário. |
| RN23 | O token de renovação (RF039) tem prazo próprio — 30 dias — e é **rotacionado a cada uso**: renovar emite um token novo e queima o anterior, de modo que uma cópia extraída do aparelho deixa de valer assim que o dono abre o app. Vale um por conta, como a sessão. Expirar por inatividade (RNF09) **não** o derruba — é justamente o caso que ele existe para cobrir; derrubam-no o logout (RN03), a redefinição de senha e o próprio vencimento. |
| RN22 | O QR Code da NFC-e identifica a nota, não o seu conteúdo: ele carrega uma URL do portal da SEFAZ com a chave de acesso e um hash de validação, sem descrição, quantidade ou valor dos produtos. Os itens são obtidos na consulta pública da SEFAZ, que o sistema faz com o conteúdo **completo** do QR — o hash é o que dispensa o captcha; a chave avulsa cai na consulta protegida. O portal varia por estado, então a consulta é por UF (dois primeiros dígitos da chave) e existe onde houver implementação. A consulta é **tentativa, não etapa**: falha de portal, layout alterado, UF sem suporte ou chave digitada à mão levam ao preenchimento manual, que permanece sempre disponível. Em qualquer dos casos o usuário confere os itens antes de entrarem no estoque — o que o mercado registra na nota nem sempre é como ele nomeia o item na despensa. |

---

## Requisitos Não Funcionais

### Usabilidade

| ID | Descrição |
|----|-----------|
| RNF01 | A interface deve ser intuitiva e adequada a usuários sem experiência prévia, permitindo realizar as tarefas principais sem treinamento. |
| RNF02 | O sistema deve fornecer feedback visual claro para cada ação (sucesso, erro, carregamento). |
| RNF03 | O sistema deve oferecer um fluxo de onboarding inicial apresentando os módulos. |

### Desempenho

| ID | Descrição |
|----|-----------|
| RNF04 | A leitura do QR Code da nota fiscal deve reconhecer o código e extrair a chave de acesso em até 5 segundos. O tempo de conferência dos itens (RN22) é do usuário e não entra nessa medida. |
| RNF05 | As telas principais devem carregar em até 3 segundos em conexão padrão. |

### Segurança

| ID | Descrição |
|----|-----------|
| RNF06 | As senhas devem ser armazenadas com hash e salt, nunca em texto puro. |
| RNF07 | Dados sensíveis (financeiros e pessoais) devem trafegar e ser armazenados de forma criptografada. |
| RNF08 | O sistema deve estar em conformidade com a LGPD quanto à coleta, uso e armazenamento de dados pessoais. |
| RNF09 | A sessão deve expirar após 30 minutos de inatividade. O usuário não precisa redigitar a senha por causa disso: a sessão é reaberta pelo token de renovação (RF039), atrás do desbloqueio local (RNF19). |
| RNF19 | O segredo que mantém o usuário conectado (RF039) fica no armazenamento seguro do aparelho (Keychain/Keystore) e só é usado após autenticação local — biometria ou código do aparelho. Sem nenhuma das duas cadastradas, o "continuar conectado" não é oferecido: guardar um segredo de 30 dias num aparelho que qualquer um destrava seria pior do que voltar a pedir a senha. |
| RNF17 | O acesso a dados via Open Finance depende de consentimento explícito, informado e revogável do usuário (RF034, RF036), com escopo e prazo visíveis antes do aceite — é o que sustenta a base legal exigida pela LGPD (RNF08). |
| RNF18 | O Xepa não é instituição participante do Open Finance: a integração se dá através de um provedor autorizado pelo Banco Central, isolado atrás de uma interface própria. Nenhuma credencial bancária do usuário trafega ou é armazenada pelo sistema. |

### Confiabilidade e Disponibilidade

| ID | Descrição |
|----|-----------|
| RNF10 | O sistema deve ter disponibilidade mínima de 99%. |
| RNF11 | Os dados do usuário devem ter rotina de backup periódico. |

### Compatibilidade e Portabilidade

| ID | Descrição |
|----|-----------|
| RNF12 | O aplicativo deve funcionar em dispositivos móveis Android 10 ou superior e iOS 15 ou superior. |
| RNF13 | A leitura automática de notificações bancárias (RF015) depende de permissões do sistema operacional e pode não estar disponível no iOS; nesses casos, o registro manual de despesas (RF017) deve suprir a função. |

### Manutenibilidade

| ID | Descrição |
|----|-----------|
| RNF14 | O sistema deve seguir a arquitetura em camadas (Cliente, Controller, Service, Repository e Banco de Dados). |
| RNF15 | O código deve ser versionado e documentado. |

### Escalabilidade

| ID | Descrição |
|----|-----------|
| RNF16 | A arquitetura deve suportar o crescimento no número de usuários e no volume de dados sem degradação significativa de desempenho. |
