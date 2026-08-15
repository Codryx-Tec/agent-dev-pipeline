# Project Scope — agent-dev-pipeline 0.6.0

**Scope status:** Approved
**Gathering date:** 2026-08-05
**Approved date:** 2026-08-10
**Scope owner:** Tiago Tardelli

> Gate G0 está verde: as doze questões da seção 10 estão respondidas, as duas
> pontas da §12.7 — o mapeamento código → gate → severidade e a política de
> convivência 0.5 × 0.6 — estão resolvidas em §12.7/§12.8, e o dono do escopo
> assinou. Nada aqui impede começar o M1.

> **Convenção.** A prosa é português; **todo token do motor é inglês** — statuses,
> labels de campo, finding codes e famílias de código. Isso é o D-016 da 0.5.0 e
> não é reaberto aqui.

---

## 1. Identificação

- **Nome do projeto:** agent-dev-pipeline 0.6.0
- **Objetivo em uma frase:** transformar a ferramenta de *auditor de um projeto
  novo* em *auditor de qualquer projeto*, incluindo o próprio, e colocar um
  número defensável de esforço antes da primeira linha de código.
- **Problema que resolve:** hoje a 0.5.0 tem três buracos que se reforçam.
  Um projeto que já existe não tem como entrar (o `init` assume terreno limpo, e
  um repositório legado produz centenas de `FILE_ORPHAN` no primeiro `audit`).
  Um projeto que já entrou não tem como sair da versão em que entrou (a 0.5.0
  renomeou 40 finding codes e a saída documentada foi "find-and-replace na mão").
  E ninguém sabe se vale a pena começar: a cadeia inteira só produz sinal depois
  que o DESIGN está escrito, que é tarde demais para descobrir que o projeto era
  inviável.

### A frase que não muda

A 0.6.0 não afrouxa a regra sobre a qual tudo se apoia: **você não pode declarar
uma tarefa concluída**. Tudo que entra aqui — estimativa, baseline de legado,
RFC condicional — é avaliado contra o risco de virar um caminho de fuga para
essa regra. Onde a máquina não consegue provar, ela **exige que a declaração
seja explícita e rastreável**, em vez de aceitar silêncio.

---

## 2. A mudança estrutural: a nova cadeia de documentos

### 2.1 A cadeia

```
SCOPE ──▶ PRD (N) ──▶ RFC (condicional) ──▶ DESIGN ──▶ SPEC ──▶ código ──▶ teste ──▶ auditoria
  G0        G1              G2                  G3        G4                  G5         G6
panorama  o quê,        qual caminho,      como       o que              está      ainda
do        pra quem,     entre os           construir, será               provado   concordam
projeto   por quê       possíveis          em detalhe implementado
```

| Documento | Responde | É dono de | Obrigatório |
|---|---|---|---|
| `SCOPE.md` | panorama, MVP, prioridades, viabilidade | milestones `M-xxx` · integrações `INT-xxx` · pesos `W-xxx` | sempre, 1 por projeto |
| `PRD.md` | **o quê**, para **quem**, **por quê** | problemas `PB-xxx` · métricas de sucesso `MET-xxx` | sempre, N por projeto |
| `RFC.md` | **qual caminho**, entre os possíveis | decisões `D-xxx` · opções `OPT-xxx` | **só quando há porta de mão única** |
| `DESIGN.md` | **como construir**, em detalhe | contratos `CT-xxx` · riscos `R-xxx` · rollback `RB-xxx` | conforme a matriz (§2.5) |
| `SPEC.md` | **o que a máquina confere** | histórias `US-xxx` · critérios `AC-xxx` · premissas `ASM-xxx` · questões `Q-xxx` · tarefas `T-xxx` | sempre, 1 por PRD |
| `BACKLOG.md` | **o que ficou para depois do MVP** — seções de produto e técnica | nada — **itens de backlog não carregam código de rastreio** | sempre, 1 por projeto |
| `DEFERRALS.md` | **os achados com que se escolheu conviver, e até quando** | adiamentos `DEF-xxx` | criado sob demanda |

A invariante que sustenta a detecção de duplicata continua valendo e agora cobre
cinco documentos: **todo código tem exatamente um lugar de definição, e é único
no projeto inteiro.** Um `T-xxx` no `DESIGN.md` passa a ser um finding, não um alias.

> **Mudança em relação à 0.5.0 — `US-xxx` e `AC-xxx` saem do PRD e vão para a
> SPEC.** Enquanto o PRD for dono de critério de aceite, ele é empurrado para o
> lado técnico e vira spec disfarçada — o antipadrão #4 da aula, "PRD que virou
> spec". Separando: o **PRD é prosa de uma página, sem código de rastreio e sem
> tecnologia**; a **SPEC é a camada que a máquina confere**. O PRD volta a poder
> ser lido pelo dono do produto, e o motor não perde nada — só passa a ler os
> códigos um documento adiante.

### 2.2 O SCOPE muda de natureza

Hoje o SCOPE é um formulário de abertura que ninguém volta a ler. Na 0.6 ele
vira o **documento vivo de contexto**: é o que a IA lê primeiro para entender o
que o projeto faz, é de onde saem os PRDs, e é onde moram três coisas novas que
o resto da cadeia consome — os **pesos de decisão** (seção 4), as **integrações**
e a **estimativa em Ponto de Função**.

Consequência prática: o SCOPE de um projeto complexo já nasce quebrado em N
milestones focados em MVP, e cada milestone aponta os PRDs que o compõem. O
`adp new` deixa de criar "uma feature" e passa a criar "um PRD dentro de um
milestone".

#### O MVP é uma fronteira declarada, não uma intenção

Para projeto novo, o SCOPE **sempre mira o MVP**: o menor recorte que entrega
valor a um usuário de verdade. Isso já estava na intenção da ferramenta; o que
falta é a fronteira ser um objeto que a máquina consegue guardar.

**Três regras fazem isso funcionar:**

1. **O milestone de MVP declara seus PRDs no momento da aprovação do escopo.**
   A partir dali, acrescentar PRD a ele é `MVP_WIDENED` — warning durante o
   trabalho, **erro em `--ci`**. Não é proibição: é a mesma regra do baseline do
   brownfield, e pelo mesmo motivo. Uma fronteira que se move sozinha não é
   fronteira, e MVP que cresce em silêncio é a forma mais comum de um projeto
   pequeno virar um projeto de dois anos.
2. **Todo PRD está no MVP ou no backlog — nunca em lugar nenhum.** PRD sem
   milestone e sem entrada no backlog é `PRD_UNPLACED` (erro, G1). É o que
   impede o meio-termo silencioso: "isso a gente vê depois" escrito em lugar
   nenhum é escopo que volta na pior hora.
3. **Sai do escopo indo para o backlog, não sendo apagado.** O raciocínio de por
   que algo ficou de fora tem valor — é o mesmo princípio de manter o D-011 no
   RFC em vez de apagar o monitor descartado. Quem propuser a mesma coisa daqui
   a seis meses encontra o argumento em vez de repeti-lo.

**Fechado o MVP, o projeto não acaba — ele muda de modo.** O escopo continua
aberto para features novas, que agora saem do backlog em vez de saírem do nada,
e cada uma vira um PRD com o mesmo rito. O `SCOPE.md` segue vivo como o
panorama, exatamente como você quis em §2.2.

#### Por que o backlog não tem código de rastreio

Item de backlog **não entra no grafo de rastreabilidade**. Se carregasse
`US-xxx` ou `AC-xxx`, ele produziria achados de coisa não implementada para todo
sempre — critério sem teste, critério sem tarefa — e o vermelho da ferramenta
passaria a significar "existe futuro imaginado", que é o oposto do que ele
significa hoje. Backlog é prosa numerada informalmente; **só ao ser promovido a
PRD é que o item ganha códigos** e entra na auditoria. `BACKLOG_ITEM_WITH_CODE`
reporta quem tentar burlar isso.

### 2.3 A RFC condicional — e a armadilha que ela abre

Você quer RFC só quando a decisão é irreversível ou cara de desfazer. Concordo
com a intenção: RFC obrigatória para tudo produz RFC de mentira, que é pior que
nenhuma. Mas há um risco direto:

> **"Não precisava de RFC" vira o novo `[done]` sem prova.**

Se a ausência de RFC for aceita em silêncio, todo agente apressado descobre em
uma sessão que pular o G2 é grátis. A ausência precisa custar uma declaração.

**A regra vem pronta da aula, e é melhor que a que eu tinha proposto:**

> **Pergunta em aberto + porta de mão única = RFC.**

Ela se apoia no filtro da Amazon: **porta de mão dupla** é reversível — errou,
volta e pronto; decida rápido, teste, ajuste. **Porta de mão única** é
irreversível ou caríssima de desfazer — decida devagar, com opções honestas e
revisão. Mudar a cor de um botão é mão dupla. Escolher como guardar data e fuso
horário é mão única, e migrar milhões de registros gravados errados depois é o
pesadelo clássico.

O ganho de encaixar a regra aqui é que **`Q-xxx` já existe no motor**. Não é
família nova, é um campo novo:

- `Q-xxx` ganha `Door: one-way | two-way`.
- `Door: one-way` + `Status: open` e nenhuma RFC vinculada → `RFC_REQUIRED`
  (erro, G2).
- `Door: two-way` → segue sem RFC; a declaração fica escrita, datada e com autor.
- Campo ausente → `DOOR_UNDECLARED` (erro, G2).
- A RFC fecha a questão: `Q-001 | respondida | RFC-003: sempre UTC`. A pergunta
  fecha **com rastro** — quem decidiu, quando e por quê.

A máquina não sabe se uma porta é de mão única. Ela sabe se alguém foi obrigado
a responder. É o mesmo padrão do `verification(gate)` na constituição: *declara,
não prova nada* — mas declara, e fica assinado.

### 2.4 A RFC ganha estrutura executável

Formato fechado, herdando o `create-rfc` e apertando o que dá para checar:

| Seção | Checável por máquina |
|---|---|
| Título orientado a ação | verbo no infinitivo na primeira palavra |
| Contexto **com números** | ao menos uma grandeza numérica com unidade |
| Premissas `ASM-xxx` | já existe |
| **Critérios de decisão com pesos** | os critérios são os `W-xxx` do SCOPE; a soma dos pesos é declarada |
| **Opções — mínimo 2 reais + "não fazer nada"** | contagem ≥ 3 e presença de uma opção marcada `OPT-000 — do nothing` |
| Matriz de pontuação | toda opção pontuada contra todo critério |
| Recomendação | aponta uma `OPT-xxx` existente |
| Resultado (`## Outcome`) | vazio até a decisão; ao fechar, exige data e a opção escolhida |

**A ordem das seções é normativa, não estética.** Os critérios vêm **antes** das
opções, e isso é checável: `CRITERIA_AFTER_OPTIONS` (erro, G2). A razão é a
analogia da compra de carro — quem visita a loja primeiro se apaixona por um
modelo e **depois inventa** os critérios que justificam a paixão. Quem define
antes "preço, consumo, porta-malas, peso 10/8/5" compara de cabeça fria. Em RFC
é igual: critério escrito depois das opções vira advogado da favorita. É a
diferença entre decisão honesta e decisão de estimação, e ela mora na ordem do
arquivo — que é exatamente o tipo de coisa que um parser consegue guardar.

E o achado que dá dente aos pesos: se a recomendação **não** é a opção de maior
score ponderado, isso é permitido — mas exige um parágrafo de justificativa, e a
falta dele é `RECOMMENDATION_AGAINST_SCORE` (erro, G2). É a versão "decisão"
daquilo que o `TASK_DONE_WITHOUT_PROOF` é para tarefa: você pode contrariar o
número, não pode contrariá-lo em silêncio.

#### O que o time sabe entra na conta da opção

Uma opção não custa o mesmo para times diferentes. "Hold com validade no Redis"
é barato para quem opera Redis há três anos e caro — às vezes proibitivo — para
quem nunca subiu um. Hoje isso fica na cabeça de quem escreve a RFC e some do
documento; na 0.6 vira estrutura:

- **Toda `OPT-xxx` declara o que exige:** `Requires: redis, event-sourcing`.
- **O perfil do time declara o que domina**, por capacidade e nível (§PRD-003).
- **A lacuna entre os dois vira um multiplicador de horas** aplicado *àquela
  opção*, não ao projeto. Menos experiência, mais tempo — e o número aparece na
  matriz de pontuação, ao lado dos critérios ponderados, em vez de virar um
  argumento verbal na reunião.

**Isto conecta com algo que já existe e ninguém tinha ligado:** "tecnologia nova
para o time" é literalmente **um dos cinco sinais** da matriz de cerimônia
(§2.5). Uma opção que exige capacidade que ninguém declarou acende
`OPTION_BEYOND_TEAM` e **dispara esse sinal automaticamente** — a decisão que
leva o time para fora do que ele conhece passa a merecer mais formalidade,
sozinha, sem que alguém precise lembrar. Não é conceito novo: é o conceito que
já estava lá, agora alimentado por dado em vez de por memória.

**O motor nunca declara um caminho inviável.** Ele reporta a lacuna e o custo
dela; quem decide seguir mesmo assim é gente, e a decisão fica escrita com o
número que ela contrariou — que é a regra do `RECOMMENDATION_AGAINST_SCORE`
aplicada a capacidade em vez de a peso.

**O multiplicador começa declarado e vira medido.** No início é um número que
você escreve no perfil, honestamente rotulado como palpite. Conforme fechamentos
acumulam, o registro passa a guardar **quais capacidades foram exercidas em cada
entrega** (campo `capabilities`), e aí a ferramenta consegue responder o que
custou de verdade aprender aquilo. Melhor ainda: **custo de aprendizado é
único, não recorrente** — a mesma capacidade no projeto seguinte já não paga o
multiplicador cheio, e o histórico é justamente o que sabe disso.

Pesquisa na internet e busca de GAPs entram como **capacidade da skill**, não do
motor. O motor não tem como auditar a qualidade de uma pesquisa. O que ele
audita é que as opções existem, estão pontuadas e citam fonte quando afirmam
número — `CONTEXT_NUMBER_WITHOUT_SOURCE`, warning.

### 2.5 A matriz de cerimônia — o mecanismo que faltava

Este é o item mais valioso que entra nesta versão, e ele resolve de uma vez o
problema de "quantos documentos esta mudança merece". Cruza-se **tamanho do
risco × reversibilidade**, e a resposta sai sozinha:

| Situação | Cerimônia devida |
|---|---|
| Pequena · reversível · 1 pessoa · tecnologia que o time domina | **SPEC + tarefas direto** (ou um ADR de 1 página) |
| Média · 1 time · algum risco | **DESIGN leve** (~8 seções) |
| Decisão em aberto que afeta vários times | **RFC obrigatória → depois DESIGN** |
| Pagamento · dado pessoal · irreversível ou regulado | **PRD + RFC + DESIGN completos e revisados** |

**Os cinco sinais de que a decisão merece documento formal.** Quanto mais deles
acumularem, mais formalidade ela merece:

1. vários times afetados
2. custo de reversão alto
3. dinheiro ou dado de usuário no meio
4. tecnologia nova para o time
5. **1 mês ou mais de trabalho**

O sinal 5 é onde a estimativa em Ponto de Função (PRD-003) para de ser um número
solto e vira gatilho: **a contagem de PF dispara o sinal sozinha.** Estimou acima
do limiar configurado, o nível de cerimônia sobe e o motor passa a exigir o
documento correspondente. As duas features que você pediu separadas são, na
verdade, uma só — e é essa ligação que faz a estimativa participar do veredito
sem nunca virar prova.

A matriz não ganha comando próprio (§12.2). Ela aparece nos dois lugares onde a
resposta muda uma decisão: **`adp new` orienta** — calcula o nível na hora de
criar o PRD e diz quais documentos são devidos — e **`adp status` reporta** —
mostra o nível vigente, quais sinais acenderam e o que falta. O `init` e o `new`
consultam a matriz antes de gerar arquivo, então um projeto pequeno **não nasce
com cinco documentos vazios** — que é o principal risco de abandono desta versão.

A frase que governa a matriz inteira:

> **O erro clássico acontece dos dois lados: documentar DEMAIS o trivial e DE
> MENOS o irreversível.** A matriz existe para calibrar.

E o corolário, que autoriza cortar: **um documento só cumpre o papel se puder
mudar a decisão de alguém. Se não pode, é cerimônia — corte sem culpa.**

#### As três exceções honestas

Pular etapa é legítimo em três casos nomeados, e nomeá-los é o que impede que
"pulei" vire desculpa genérica:

| Exceção | Quando | O que acontece |
|---|---|---|
| **Mudança 100% técnica** | migrar de MySQL para PostgreSQL — não há produto envolvido | pode não existir PRD; o caminho começa na RFC |
| **RFC que já é o design** | a RFC já detalhou a arquitetura | **não escreva TDD separado — 2 documentos = 2 verdades** |
| **Mudança pequena e reversível** | porta de mão dupla | SPEC + tarefas direto; no máximo um ADR de 1 página |

Toda exceção usada é **declarada no documento e nomeada**, nunca inferida do
silêncio: `SKIP_UNDECLARED` (erro). O critério para pular é sempre o mesmo
— *quanto custa errar essa decisão?* — e a ordem é um mapa, não uma lei.

**ADR entra como sexto tipo de documento**, deliberadamente mínimo: 1 página,
imutável, contexto → decisão → consequências. A diferença de papel importa e
deve estar escrita no template: **a RFC propõe** (ainda vai se discutir); **o ADR
registra** (já se decidiu, fica para a posteridade).

**Duas fases nunca são puladas, em nenhum nível da matriz: especificar e
auditar.** Sem SPEC não há o que provar; sem auditoria não há veredito. Todo o
resto auto-dimensiona.

### 2.6 Gates: sete, e o exit code quebra

Cinco documentos não cabem em seis gates sem fundir dois deles. Duas saídas:

**Decidido: sete gates, exit code 1–7.** G0 SCOPE · G1 PRD · G2 RFC/caminho ·
G3 DESIGN · G4 SPEC · G5 Proven · G6 Aligned.

E **um quarto estado**, além de `clean`, `red` e `blocked`: **`n/a`**, quando o
nível de cerimônia declarado (§2.5) não exige aquele gate. Três estados eram
suficientes quando a cadeia era obrigatória inteira; com a matriz, "este gate
não se aplica a esta mudança" é uma resposta diferente de "está limpo" e de
"nem chegamos lá" — e renderizar as três igual é o mesmo erro que o `blocked`
foi criado para evitar. `n/a` nunca vale para G0, G4, G5 e G6, e sempre imprime
o motivo (§12.1).

A alternativa rejeitada era manter seis, com DESIGN e SPEC dividindo o G3 —
preserva o contrato de exit code, ao custo de um gate que responde duas
perguntas. Um gate com duas perguntas não consegue dizer qual delas falhou, que
é exatamente o que os gates existem para evitar. E a 0.6 já carrega migração de
diretório e renomeação de arquivo; carregar a quebra do exit code junto é um
constrangimento só, feito uma vez.

Três consequências que **precisam** entrar junto, senão a quebra é silenciosa:

- `CHANGELOG` sob **⚠️ Breaking**, com a tabela de exit codes velho → novo.
- `adp upgrade` procura workflows do projeto que chamem `agent-dev-pipeline`
  **sem versão fixada** e avisa alto — é o caso em que o portão do repositório
  muda sem um commit.
- `--json` passa a carregar `gateId` textual (`"G4"`), para que o próximo
  pipeline dependa de um identificador estável em vez do inteiro. Se os gates
  mudarem outra vez, quem migrou para o campo textual não sente.

Registrado como `RFC-002`.

---

## 3. Os PRDs desta versão

### PRD-001 — Atualização entre versões

**Problema (`PB-001`):** um projeto que rodou `init` na 0.4.x não tem caminho de
volta. O `init` nunca sobrescreve — o que é a política certa — mas o efeito
colateral é que ele também nunca **atualiza**, então um payload novo nunca chega
em quem já instalou. E os 40 finding codes renomeados na 0.5.0 saíram sem
codemod. **Reversible:** no.

**O que passa a existir:**

1. **Lockfile de instalação** — `.spec/.adp-install.json`, escrito pelo `init`,
   contendo a versão que instalou e o SHA-256 de cada arquivo do payload no
   momento em que foi escrito. É o `MANIFEST.json` que já existe, mas do lado do
   projeto. Sem isso, "este arquivo foi editado pelo usuário?" é indecidível.

2. **`adp upgrade`** — compara lockfile × manifesto novo e classifica cada
   arquivo em três estados, que é o mínimo para não mentir:

   | Estado | Detecção | Ação |
   |---|---|---|
   | intacto | hash em disco == hash do lockfile | atualiza em silêncio |
   | editado | hash em disco != hash do lockfile | **não toca**; escreve `<arquivo>.new` ao lado e reporta |
   | novo | existe no manifesto, não no lockfile | cria |
   | removido | existe no lockfile, não no manifesto | reporta, não apaga |

   **Dry-run é o default.** Escrever exige `--apply`. Uma ferramenta cujo produto
   é evidência não pode ter um comando que altera o repositório antes de mostrar
   o que vai alterar.

3. **Registry de migrations** — `src/migrations/<versão>.js`, cada uma exportando
   uma transformação sobre `.spec/**` e uma checagem de idempotência. O codemod
   0.4→0.5 (as tabelas de rename que já estão no CHANGELOG) entra retroativamente
   como a primeira. `adp upgrade` encadeia todas as migrations entre a versão do
   lockfile e a atual.

4. **`adp doctor` reporta drift de versão** — projeto na 0.4.x rodando motor 0.6
   vira aviso alto, com o comando exato para resolver.

**O que a máquina prova:** que o hash bate, que a migration é idempotente
(rodar duas vezes produz o mesmo arquivo), que o `.new` foi criado.
**O que ela não prova:** que a sua edição no hook continua fazendo sentido depois
do upgrade. Isso é revisão humana, e o relatório precisa dizer isso com todas as
letras em vez de sugerir que o upgrade foi "limpo".

---

### PRD-002 — Projetos legados (brownfield)

**Problema (`PB-002`):** a ferramenta só sabe nascer junto com o projeto. Num
repositório com 4 anos de código e documentação espalhada, o `init` de hoje
escreve `.spec/` vazio e o primeiro `audit` produz um muro de `FILE_ORPHAN` que
ninguém lê. **Reversible:** no (mexe em arquivos do usuário).

**Fluxo proposto — `adp init --brownfield` (ou detecção automática):**

**Passo 1 — Reconhecimento, sem escrever nada.** Varre e classifica: `README*`,
`docs/**`, `doc/**`, `adr/**`, `rfc/**`, `wiki/**`, `*.openapi.{yml,json}`,
`swagger*`, migrations de banco, `CHANGELOG*`, `CONTRIBUTING*`, comentários de
módulo. Produz um inventário e **mostra ao usuário antes de qualquer ação**.

**Passo 2 — Consentimento explícito.** Lista exatamente o que vai ser movido,
para onde, e por qual comando. Sem `--yes`, para de propósito.

**Passo 3 — Arquivamento em `project_old_artifacts/`.** Com três guardas que
considero inegociáveis:

- **`git mv`, nunca `mv`.** Preserva histórico e torna a operação revertível com
  um `git reset`. Fora de um repositório git, o comando **recusa** — mover
  documentação de alguém sem rede de segurança não é uma opção que a ferramenta
  deva oferecer.
- **Recusa em árvore suja.** `git status` não-limpo → para. O usuário precisa
  poder desfazer com um comando, e não pode se o commit de resgate misturar
  trabalho dele.
- **Lista de intocáveis.** `README.md`, `LICENSE`, `CONTRIBUTING.md`,
  `SECURITY.md`, `CODE_OF_CONDUCT.md` e qualquer caminho referenciado por
  workflow de CI são **copiados**, nunca movidos. Mover o README quebra a
  landing page do GitHub e, dependendo do build, quebra o build — e a ferramenta
  teria feito isso enquanto se apresentava como quem organiza a casa.

**Passo 4 — Arqueologia.** Um agente novo (`archaeologist`, com skill
`project-archaeology`) lê `project_old_artifacts/` **mais o código** e propõe:
SCOPE preenchido, integrações detectadas, e um recorte de PRDs candidatos. O
resultado sai como **proposta em `Draft`**, nunca `Approved` — G0 continua
exigindo assinatura humana, e isso vale ainda mais quando o texto foi inferido
por máquina a partir de documentação velha.

**Passo 5 — Baseline, e este é o item que faltava na sua lista.** Um projeto
legado tem milhares de arquivos que nenhuma tarefa mapeia. Sem tratamento, G3/G4
nascem vermelhos para sempre, o operador aprende a ignorar o vermelho, e a
ferramenta perde o único ativo que tem, que é o vermelho significar alguma
coisa.

Proposta: `.spec/BASELINE.md`, gerado no `init --brownfield`, registrando o
commit-base e o conjunto de arquivos pré-existentes. Modo **ratchet**:

- arquivo no baseline e não tocado desde ele → findings são **warning**
- arquivo tocado depois do baseline → findings são **erro**, regra cheia
- arquivo novo → regra cheia

A dívida existente fica visível e contável sem bloquear; a dívida nova é barrada
na entrada. O baseline **só encolhe** — um arquivo que sai dele não volta, e a
tentativa de reexpandir é `BASELINE_WIDENED`, erro. Sem essa regra o baseline
vira o caminho de fuga de todos os outros gates.

---

### PRD-003 — Estimativa por Ponto de Função

**Problema (`PB-003`):** hoje o primeiro sinal de tamanho aparece quando o DESIGN
está pronto. Quem descobre ali que o projeto é inviável já gastou a fase mais
cara de raciocínio. **Reversible:** yes (é um documento a mais, não uma
mudança de gramática).

**Âncora normativa:** **Roteiro de Métricas de Software do SISP v2.3**
(Ministério do Planejamento/SETIC, 2018), que é guia local complementar ao
**CPM 4.3.1 do IFPUG**. É domínio público, é o que a Administração Pública
Federal usa para medir e remunerar contrato de desenvolvimento, e portanto é
defensável numa conversa comercial — que é exatamente o uso que você quer.

**Como entra na cadeia:**

- O `adp new` (ou o `init`) roda um **questionário de contagem** no nível do
  SCOPE: funções de dados (`ALI`, `AIE`) e funções transacionais (`EE`, `CE`,
  `SE`), cada uma classificada em baixa/média/alta pelas tabelas do CPM.
- A pergunta sobre **integrações externas** que você quer no SCOPE não é
  cosmética: `AIE` e boa parte das `EE` saem exatamente daí. As duas coisas são
  a mesma pergunta feita uma vez.
- Tabelas de peso em **arquivo de dados versionado** (`payload/metrics/sisp-2.3.json`),
  não em código. Trocar de guia local — ou usar o roteiro do próprio órgão, como
  o do Ibama — vira trocar um arquivo, e a fonte fica declarada no relatório.
- **Horas por PF é configuração, com faixa, nunca número único.** A dispersão de
  mercado é grande demais para um valor cravado. O default sai do config em
  `estimate.hoursPerFP: { low, likely, high }` e o relatório mostra as três.

**O fechamento do laço, que é o que torna isto diferente de uma planilha:** a
0.5.0 já registra cada execução de tarefa no ledger, com tempo real. Então a
ferramenta pode **calibrar o próprio h/PF** a partir do histórico do projeto e
mostrar estimado × realizado. A primeira estimativa é mercado; da terceira em
diante é o seu time. Isso também é a única forma de o número virar evidência em
vez de opinião, que é o padrão da casa.

**Saída:** `adp estimate [--csv]`, produzindo o CSV que você pediu — projeto,
milestone, PRD, tarefa, tipo de função, complexidade, PF, faixa de horas — mais
um resumo em `.spec/ESTIMATE.md`.

**A linha que precisa estar escrita no documento, em negrito:**

> **A estimativa nunca é prova.** O gate só verifica que ela existe, que está
> completa, que declara a versão do guia e o h/PF usados, e que foi recontada
> quando o escopo mudou (`ESTIMATE_STALE`). Ele **não** verifica se ela está
> certa, porque nenhuma máquina verifica isso.

E o limite de aplicabilidade tem que ser dito na cara do usuário: **APF foi
desenhada para sistemas de informação.** Ela mede mal biblioteca, CLI, infra,
compilador e ML. A própria `agent-dev-pipeline` seria mal medida por ela. O
comando deve avisar quando o perfil do projeto sugere baixa aderência, em vez de
imprimir um número com falsa precisão — uma checagem que não pode falhar e um
número que não pode estar errado são o mesmo tipo de mentira.

**Viabilidade:** o corte "não vale a pena, não vamos seguir" é **decisão
humana registrada no SCOPE**, informada pelo número. O motor não veta projeto.

#### O parâmetro difícil: horas por Ponto de Função (`Q-006`)

**O que existe de referência no mercado, e o que cada coisa serve.**

| Fonte | O que dá | Limite |
|---|---|---|
| **ISBSG** — repositório com milhares de projetos; a métrica chama-se **PDR** (*Project Delivery Rate*), em horas por ponto de função | a única base estatística séria, com percentis (P25/P50/P75/P90) por linguagem, plataforma e tipo de aplicação | assinatura paga; a amostra pende para projeto corporativo grande |
| **SISP v2.3** | as regras de contagem, grátis e em domínio público, **e a distribuição de esforço por fase** — que é o que permite quebrar a estimativa em análise/design/código/teste em vez de cuspir um total | é guia de *contagem*, não de produtividade: não publica h/PF |
| **Contratos públicos federais** | preço por PF em R$, dado público e consultável | mede **preço**, não esforço, e varia com o pacote de artefatos exigido |

**Os números que dá para citar.** Aplicação Java gira em torno de **8 h/PF** na
média da indústria, enquanto COBOL passa de **15 h/PF** — a mesma equipe com o
mesmo desempenho pontua diferente só por causa da linguagem, e é por isso que
comparar PDR entre times sem normalizar por plataforma não significa nada. Num
exemplo publicado de aplicação de negócio bancária com 850 PF, um PDR de
**10,2 h/PF** caiu entre o P75 e o P90 do grupo de comparação — ou seja, *acima*
da média, o que já mostra o tamanho da dispersão. Referências mais antigas do
próprio ISBSG citavam mediana de **14 h/PF**. Do lado de preço, levantamento de
contratos brasileiros aponta faixa de **R$ 255 a R$ 1.000 por PF**, com média
por volta de **R$ 488** — e a própria fonte avisa que citar a média é enganoso,
porque um contrato pode exigir só software funcionando e outro exigir vinte e
poucos artefatos intermediários pela mesma funcionalidade.

**E agora o problema que muda o desenho.** Toda essa base mede **equipes
humanas**. Esta ferramenta orquestra agentes. E a literatura sobre produtividade
com IA não converge:

- experimento controlado clássico com Copilot: tarefa concluída **56% mais
  rápido**;
- estudo randomizado com desenvolvedores experientes **nos próprios
  repositórios**, início de 2025: **19% mais lentos** com IA;
- o mesmo grupo, um ano depois: **18% mais rápidos** — os autores atribuem tanto
  à melhora das ferramentas quanto ao aprendizado de quando usá-las;
- meta-análise de 2026: o intervalo entre estudos vai de **−20% a +100%**;
- na média organizacional, ganhos medidos ficam na casa de **10–30%**, mesmo com
  adoção acima de 84%.

**Conclusão honesta: não existe h/PF defensável para desenvolvimento assistido
por agente hoje.** Qualquer número que este pacote embarcasse como "o fator de
IA" seria palpite vestido de dado — exatamente o erro que a ferramenta existe
para pegar em outros lugares.

**Daí a decisão que governa toda a estimativa: existem dois relógios, e eles
nunca se misturam.**

| Relógio | O que mede | Para que serve | De onde vem |
|---|---|---|---|
| **Esforço humano** (`h/PF`) | quanto custaria a um time humano com esta stack e esta familiaridade | é a moeda da estimativa: comparável ao mercado, defensável em proposta e em contrato | tabela de perfil + calibração por fechamento |
| **Tempo de parede** (wall-clock) | quanto tempo de calendário a execução com agentes realmente levou | previsão de entrega, ocupação de lane, acompanhamento | ledger, mecanicamente |

**Misturar os dois envenena a base para sempre.** Se o wall-clock dos agentes
alimentasse o `h/PF`, a tabela deixaria de significar algo para um leitor humano
e não poderia mais ser defendida numa negociação — e como a razão entre os dois
varia de −20% a +100% conforme o estudo, ela nem sequer é estável o bastante
para servir de conversor. **Não existe `aiFactor` no cálculo.** O ganho da IA,
seja qual for, aparece como a *diferença* entre horas humanas estimadas e
wall-clock entregue, reportada ao lado como observação — nunca dobrada dentro da
base.

**A entrevista de stack — o que seleciona a faixa em vez de adivinhá-la.**
Roda no `init` e é regravável com `adp profile`:

| Dimensão | Por que entra |
|---|---|
| stack principal | Java ~8 h/PF contra COBOL >15 h/PF na base de mercado — a linguagem sozinha quase dobra o número |
| **familiaridade do time** (nunca entreguei nela · já entreguei · domino) | é a variável que mais move a faixa, e a única que o mercado não consegue medir por você |
| tipo de aplicação (negócio·CRUD · tempo real · infra · matemático) | APF mede bem o primeiro e mal os outros três |
| greenfield ou brownfield | baseline ligado aplica multiplicador |
| a base tem testes automatizados? | muda o custo de provar, que é metade do trabalho do G4 |
| nº de integrações externas (`INT-xxx`) | já perguntado no SCOPE; alimenta AIE e EE na contagem |
| **ferramentas do ciclo** — CI, framework de teste, deploy, observabilidade, IaC | ambiente e ferramental movem a produtividade tanto quanto a linguagem; e a resposta já alimenta o `testCommand` e o `STACK.md`, que o payload instala hoje |
| **capacidades declaradas**, por nível (`redis: domino`, `kafka: nunca usei`) | é o que as opções de RFC consultam para calcular a lacuna |

A entrevista é **curta de propósito**. Entrevista longa é entrevista que ninguém
termina, e um perfil abandonado no meio é pior que perfil nenhum, porque parece
preenchido. Tudo tem default e tudo é regravável depois.

O resultado é um **perfil**, e o perfil escolhe a linha da tabela. Perfil não
declarado é `PROFILE_UNDECLARED` — sem ele a estimativa é chute com aparência de
cálculo.

**A tabela mora num arquivo editável, não no código.**
`.spec/metrics/hours-per-fp.json`, semeada de
`payload/metrics/hours-per-fp.default.json`, versionada junto com o projeto e
aberta para o humano ajustar à mão. Cada linha carrega a própria procedência:

```json
{ "profile": "business-crud/familiar",
  "low": 8, "likely": 12, "high": 18,
  "source": "cold-start",
  "observations": 0,
  "updatedAt": null, "updatedBy": null }
```

`source` só assume três valores — `cold-start`, `market`, `measured` — e o
`adp estimate` **imprime qual linha usou e com que procedência**. Uma faixa sem
procedência é indistinguível de um chute, e a essa altura do documento isso já é
regra da casa.

#### O limiar da matriz de cerimônia (`Q-011`)

Não é constante — é conta, e a conta é curta:

```
limiarPF = horasPorMes ÷ hPF.alta
```

Com `horasPorMes: 160` (uma pessoa, ~21 dias úteis) e a ponta alta de 18 h/PF da
primeira linha da tabela: **≈ 9 PF**, que arredondamos para **10 PF** como
default embarcado.

**Por que a ponta alta e não a provável.** Usar `hPF.alta` produz o *menor*
limiar, e limiar menor faz o sinal disparar **mais cedo e mais vezes**. A escolha
é deliberada e vem da assimetria de custo: documentar demais o trivial custa
algumas horas; documentar de menos o irreversível custa o projeto. Errar para o
lado da cerimônia é o erro barato.

**Duas salvaguardas contra o limiar dominar a decisão.** Primeiro, ele é medido
**por PRD, não por projeto** — a matriz pergunta sobre *esta* mudança, não sobre
o sistema inteiro. Segundo, ele acende **um dos cinco sinais**, nunca decide
sozinho: um PRD de 40 PF com stack conhecida, sem dinheiro nem dado pessoal
envolvido e sem afetar outro time acende um sinal só e continua no nível leve.
Isso é o que torna o limiar robusto a estar errado — e ele vai estar errado no
começo, porque nasce sem calibração.

O `adp status` sempre imprime **quais sinais acenderam e por quê**, nunca só o
nível. Um veredito de cerimônia que não mostra o caminho é indistinguível de um
palpite, e a essa altura do documento isso já é regra da casa.

#### Contagem: a IA propõe, o humano confirma (`Q-007`)

O questionário é conduzido pela IA, que propõe a classificação de cada função de
dados e transacional — mas contagem inflada por modelo complacente é risco
comercial direto, então vêm três guardas:

1. **Toda função contada cita a origem** — o trecho do SCOPE ou do PRD que a
   justifica. Função sem origem é `FUNCTION_WITHOUT_SOURCE` e não entra no total.
2. **`adp estimate --review`** mostra a contagem item a item para confirmação
   antes de gravar; o total só é escrito depois do aceite.
3. **Quem confirmou e quando fica registrado** no `.spec/ESTIMATE.md`. Uma
   contagem sem confirmação humana é `ESTIMATE_UNCONFIRMED` (erro em `--ci`).

E a recontagem é obrigatória quando o escopo muda: `ESTIMATE_STALE`.

---

### PRD-003b — Os antipadrões viram achados

**Problema (`PB-007`):** hoje o motor audita a **estrutura** dos documentos —
código existe, referência resolve, teste passou. Ele não audita a **qualidade da
decisão**. Um RFC de mentirinha, com opções de palha para coroar a favorita,
passa por todos os seis gates. **Reversible:** yes (são achados novos, aditivos).

Os seis jeitos clássicos de estragar um documento são, quase todos, detectáveis
por máquina. Cada um vira um finding code:

| Antipadrão | Código | Como se detecta | Severidade |
|---|---|---|---|
| **#1 RFC de mentirinha** — opções de palha para coroar a favorita | `STRAW_OPTION` | opção sem contras declarados, ou com contras desproporcionalmente mais curtos que os da favorita | warning |
| **#2 Contexto sem números** — "nosso processo tem alguns problemas" | `CONTEXT_WITHOUT_NUMBERS` | nenhuma grandeza com unidade na seção de contexto | erro (G2) |
| **#3 Sem "não fazer nada"** | `OPTION_DO_NOTHING_MISSING` | ausência de `OPT-000` | erro (G2) |
| **#4 PRD que virou spec** | `PRD_WITH_SOLUTION` | vocabulário técnico proibido no PRD | erro (G1) |
| **#5 As 40 páginas** | `DOC_TOO_LONG` | contagem de linhas acima do teto por tipo de documento | warning |
| **#6 O documento fóssil** | `DOC_FOSSIL` | último commit do documento é anterior ao último commit dos arquivos que ele mapeia | warning, **erro em `--ci`** |

Três observações de implementação:

**O #4 não precisa de motor novo.** É exatamente uma
`verification(forbidden)` — a máquina de regex em subprocesso com timeout que já
existe para a constituição, apontada para `.spec/prd/**` com uma lista de termos
de solução (nomes de banco, framework, biblioteca, "lock", "cache", "fila"). O
padrão embarcado vem no payload e é editável, porque o vocabulário proibido de
um projeto de infraestrutura não é o de um e-commerce. Regra de ouro do PRD:
*ele descreve o problema, nunca a solução técnica*. `"Usar PostgreSQL com trava
na tabela de vagas"` é errado; `"o sistema nunca pode aceitar mais pedidos do
que a capacidade da janela"` é certo — e quem decide a tecnologia é a engenharia,
mais tarde, na RFC e no DESIGN.

**O #6 é o `PROOF_STALE` aplicado a documento.** O motor já sabe comparar
timestamp de prova com timestamp de código; aqui é a mesma comparação com o
documento no lugar da prova. É barato e é o achado mais valioso da lista: *doc
que mente é pior que doc nenhum, porque alguém vai confiar nele e quebrar tudo.*

**Mais dois achados vindos das regras de revisão de documento gerado por IA:**

- `AC_NOT_OBSERVABLE` (erro, G4) — critério com adjetivo vago e sem número.
  `"a confirmação deve ser rápida"` não vale; `"confirma em menos de 3 s"` vale.
  Um critério que nenhum teste consegue checar é um critério que nunca vai gerar
  prova, e hoje ele atravessa a cadeia inteira até morrer no G4 sem explicação.
- `DUPLICATE_PROSE` (warning, G5) — trecho substancial repetido entre dois
  documentos. **Os documentos se apontam, não se copiam** (`PRD ← RFC ← DESIGN`):
  cópia cria duas versões e uma sempre desatualiza.

**O contexto que justifica tudo isto:** o perigo da IA não é escrever mal, é
escrever **bem demais** — texto fluente, confiante e volumoso, que soa
impressionante e passa na revisão sem ninguém conferir. Um motor que só valida
estrutura é exatamente o que um texto assim atravessa sem esforço.

---

### PRD-003c — Fechamento e lições aprendidas: a base empírica

**Problema (`PB-008`):** a estimativa nasce de uma tabela de mercado que não
mede este time, e hoje **nada no projeto registra o que de fato aconteceu em
horas humanas**. Sem esse registro, a tabela nunca sai do cold start e a
estimativa continua sendo opinião importada para sempre. **Reversible:** yes.

O ledger da 0.5.0 não resolve isso: ele grava wall-clock de lane, que é o outro
relógio. O número que calibra `h/PF` **precisa ser declarado por uma pessoa**,
porque é a única coisa que mede o que a métrica diz medir.

#### `adp close <prd>` — o registro de finalização

Disponível quando um PRD chega ao **G6 limpo**. Grava
`.spec/metrics/closures/PRD-<NNN>.json`:

| Campo | Origem |
|---|---|
| PF contado na abertura, e o recontado se o escopo mudou | automático |
| perfil de stack vigente no período | automático |
| faixa estimada (baixa/provável/alta) e a procedência usada | automático |
| **horas humanas de esforço** | **declarado por uma pessoa** — é o único campo que a máquina não sabe |
| desvio estimado × realizado, em % | calculado |
| wall-clock de calendário, nº de lanes, reexecuções, gates vermelhos atravessados | automático, do ledger |
| quem declarou e quando | automático |

**A maior parte do formulário se preenche sozinha.** O único campo
obrigatoriamente humano é o de horas — e isso é deliberado, porque um formulário
longo no fim do trabalho é um formulário que ninguém preenche de verdade, e um
registro preenchido de qualquer jeito é pior que registro nenhum.

#### A honestidade do número declarado

Horas declaradas são **declaração, não prova** — mesma categoria do
`verification(gate)` na constituição. O documento precisa dizer isso com essas
palavras, e não fingir que fechou o laço de prova quando fechou o laço de
registro. Mas dá para fazer melhor que declaração pura:

- **`HOURS_UNDECLARED`** — PRD em G6 limpo sem registro de fechamento. Warning
  durante o trabalho, **erro em `--ci`**.
- **`HOURS_IMPLAUSIBLE`** — a declaração desacorda grosseiramente dos sinais
  mecânicos que o ledger já tem. Duas horas declaradas contra catorze execuções
  de lane em nove dias de calendário é uma discrepância que vale mostrar. O
  achado **não acusa ninguém de mentir**: imprime os dois lados e deixa a pessoa
  corrigir o que estiver errado, que às vezes é o ledger.
- **Toda declaração é atribuída e datada.** Número anônimo apodrece — em seis
  meses ninguém sabe se aquilo era esforço de uma pessoa ou de três.

#### A regra que impede isto de virar cerimônia

O critério é o do próprio material de referência: *um documento só cumpre o
papel se puder mudar a decisão de alguém.* Um "lições aprendidas" que só produz
prosa é o antipadrão #5 e vira o #6 em seis meses. Então o fechamento tem **duas
saídas, com dois destinos**:

| Parte | Formato | Destino | Quem lê |
|---|---|---|---|
| medição | estruturada | recalcula `.spec/metrics/hours-per-fp.json` | a máquina, na próxima estimativa |
| aprendizado | prosa curta — o que surpreendeu, o que faríamos diferente | `.spec/BEST_PRACTICES.md`, que **já existe** no payload | a próxima sessão, humana ou agente |

Não criamos um quinto arquivo de memória: o `BEST_PRACTICES.md` já carrega a
regra certa — *um padrão só entra depois de ter funcionado mais de uma vez; uma
opinião sem cicatriz atrás é ruído, e ruído nesse arquivo é o que faz as pessoas
pararem de lê-lo.* Vale igual para lição aprendida.

É a mesma divisão do `DESIGN.md` × `SPEC.md`, uma camada acima: **a parte que um
humano lê e a parte que a máquina confere**, cada uma no seu arquivo, nenhuma
fingindo ser as duas.

#### Os regimes de calibração, agora contados em fechamentos

Contar tarefas do ledger era a métrica errada. O que calibra é **PRD fechado com
horas declaradas, no mesmo perfil de stack**:

| Fechamentos no perfil | Fonte usada | Rótulo no relatório |
|---|---|---|
| 0 | tabela de cold start | **sem calibração** |
| 1–2 | cold start, **com o desvio observado impresso ao lado** | **sem calibração — 2 observações** |
| 3–5 | mistura ponderada entre tabela e observado | **calibração parcial** |
| ≥ 6 | faixa do próprio projeto, com P50/P75/P90 | **calibrado** |

Com menos de seis observações a faixa sai **larga de propósito**, e o relatório
diz por quê em vez de esconder a incerteza numa casa decimal.

**A linha que vale mais que a tabela inteira.** Da segunda entrega em diante, o
`adp estimate` consegue imprimir:

> *o último PRD deste perfil estimou 120 h e levou 168 h (+40%)*

Isso muda uma decisão de negócio de verdade, hoje, com uma amostra de um — que é
mais do que qualquer percentil de mercado consegue fazer pelo seu time.

#### A base histórica: saída de um projeto, entrada do próximo

O fechamento só paga o próprio custo se o que ele mede **sair do projeto**. Um
registro que morre no repositório onde nasceu obriga cada projeto novo a começar
do cold start de novo, e aí a calibração nunca acumula: fica-se para sempre com
amostra de um a três.

**Dois arquivos, e a relação entre eles é a doutrina da casa.**

| Arquivo | O que é | Onde vive |
|---|---|---|
| `hours-history.jsonl` | **a verdade** — um registro por linha, append-only, imutável | state dir (`~/.adp/metrics/`), fora de qualquer repositório |
| `.spec/metrics/hours-per-fp.json` | **o cache** — a faixa derivada por perfil | no projeto, versionada, recalculável a qualquer momento |

*O histórico é a verdade; a tabela é cache.* É a mesma frase sobre a qual o board
inteiro já se apoia, aplicada uma camada acima — e ela tem uma consequência
prática: **apagar a tabela nunca perde dado**, basta recalcular. Só o `.jsonl`
precisa de cuidado, e por isso ele é append-only e nunca reescrito.

**JSONL e não CSV como formato canônico**, por um motivo específico: uma linha
por registro faz dois times mesclarem históricos em git sem conflito. O CSV
continua existindo, mas como **exportação** (`adp metrics export --csv`) — a
visão que abre no Excel e vai para dentro de uma proposta.

**O registro, mínimo de propósito** — schema grande é schema que apodrece:

```json
{ "schemaVersion": 1,
  "closedAt": "2026-08-05",
  "profile": { "stack": "node", "familiarity": "domino",
               "appType": "business-crud", "brownfield": false, "hasTests": true },
  "countingGuide": "sisp-2.3",
  "fp": { "counted": 34, "recounted": 41 },
  "estimate": { "low": 272, "likely": 408, "high": 612,
                "source": "cold-start", "observationsAtTime": 0 },
  "actors": [ { "kind": "human", "role": "senior", "id": "sha256:…", "hours": 26 },
              { "kind": "agent", "model": "…", "lanes": 9,
                "wallClockHours": 31, "supervisionHours": 12 } ],
  "declaredAt": "2026-08-05",
  "capabilities": { "exercised": ["redis"], "wasNew": ["redis"] },
  "corroboration": { "calendarDays": 23, "lanes": 9, "reruns": 2, "redGates": 4 },
  "origin": { "projectHash": "sha256:…", "toolVersion": "0.6.0", "imported": false } }
```

#### Os três cuidados que este arquivo obriga

**1. Anonimização por default, porque ele atravessa clientes.** Um registro de
fechamento nasce ao lado de nome de projeto, de feature e às vezes de cliente. Se
esse arquivo vai virar entrada do projeto seguinte, o repositório do cliente B
passa a conter dado do cliente A — e o vazamento teria sido feito pela ferramenta
que se apresenta como quem organiza a casa. **Nada disso é necessário para
calibrar:** perfil, PF, horas e desvio bastam. A exportação **remove nome de
projeto, de feature e de pessoa por default**, guardando só um hash do projeto
para deduplicar; `--with-names` mantém, e avisa o que está mantendo.

**2. Procedência, porque um histórico é falsificável.** Um `.jsonl` colocado à
mão na pasta certa justifica qualquer estimativa. Mesma categoria do
`testCommand`: importar base externa é **ato explícito** (`adp metrics import
<arquivo>`), cada registro carrega `imported: true`, e o `adp estimate` reporta
a composição — *"18 observações, 12 do próprio projeto e 6 importadas"*. Nunca é
proibido; é sempre visível.

**3. Longevidade, porque é o único artefato cujo valor inteiro é durar.** Ele
tem `schemaVersion`, e a regra para o `adp upgrade` é dura: **migration que
toque neste arquivo só pode acrescentar campo, nunca remover registro**, e roda
com backup antes. É o único arquivo do sistema em que perder dado é irreversível
— a tabela recalcula, o payload reinstala, o histórico não volta.

#### O campo que faz a feature provar a si mesma

`observationsAtTime` guarda **quantas observações existiam quando aquela
estimativa foi feita**. Com ele, o `adp estimate --history` responde a pergunta
que qualquer um faria:

> *estimativas feitas a frio erraram em média 45%; feitas com calibração,
> erraram 12%*

Sem esse campo, a calibração é uma feature que pede fé — o que seria irônico
nesta ferramenta. Com ele, ela é auditável pelo mesmo padrão que todo o resto: o
número aparece porque foi medido, não porque foi prometido.

#### Como vira entrada de fato

No `init` de um projeto novo, se existir histórico no state dir — ou se
`metrics.historyPath` no config apontar para um caminho compartilhado pelo time —
a **primeira** estimativa já sai calibrada, com os registros filtrados pelo
perfil que casa. Projeto número quatro começa onde o projeto número três parou,
que é o ponto inteiro de ter feito os três primeiros.

O compartilhamento entre pessoas é deliberadamente burro: **um caminho de
arquivo**, versionável num repositório pequeno de métricas se o time quiser.
Sem servidor, sem conta, sem sincronização — coerente com `local-only` ser o
default e com a ferramenta não ter dependência de runtime.

---

### PRD-004 — O monitor acompanha o fluxo

**Problema (`PB-004`):** você criou um projeto do zero, a cadeia
SCOPE → PRD → RFC → DESIGN aconteceu, e **a página não mostrou isso acontecendo**.
Ela mostra seis luzes, que é o estado do veredito — não o estado do trabalho.
**Reversible:** yes.

**O que passa a aparecer:**

- **Trilha da cadeia por PRD**: qual documento existe, em que status, qual o
  próximo passo — a coisa que você olhou e não encontrou.
- **Lanes ao vivo** (a execução paralela da 0.5.0 é invisível hoje): worktree,
  tarefa corrente, resultado do teste in-lane, o que já mergeou.
- **Achados atrás do primeiro gate vermelho**, com o texto pronto para colar.
- **Painel de dívida** — baseline herdado + adiamentos ativos + backlog, com
  tendência. É a melhoria contínua como visão, sem tocar no veredito (§12.1).
- **Estimado × realizado** em duas linhas separadas: horas humanas (declaradas no fechamento) e wall-clock (do ledger), nunca somadas nem convertidas.
- **Atualização por SSE** em vez de polling. SSE é `GET`; não custa a invariante.

**A invariante não se toca.** Qualquer método que não seja `GET`/`HEAD` continua
recusado com 405 **antes de o caminho ser examinado**, o arquivo do servidor
continua sem nenhuma chamada de escrita, e o teste que afirma isso continua
valendo. Se algum item acima parecer pedir um botão que age, ele vira **um
comando para copiar**, não um endpoint. A página é segura perto de trabalho em
andamento porque não consegue corromper documento — essa propriedade é o motivo
de ela existir e vale mais que qualquer conveniência de UI.

---

### PRD-005 — Ergonomia: alias e modelo por fase

**Problema (`PB-005`):** `adp` só existe se o usuário criar um alias na mão, e o
`init` não tem como escolher modelo por fase do trabalho. **Reversible:** yes.

**Alias.** Escrever em `~/.bashrc` é tentador e é a opção errada: este pacote se
vende como "não deixa nada para trás", e mexer no dotfile do usuário contradiz
isso na primeira linha do README. Proposta:

- **Default:** o `init` escreve um wrapper executável `./adp` **dentro do
  projeto**, com a **versão fixada** — `npx @codryx/agent-dev-pipeline@0.6.0 "$@"`.
  Resolve o alias e resolve o pinning de CI de uma vez, dentro do raio de alcance
  que o pacote já declara (ele já escreve hooks executáveis).
- **Opt-in:** `--shell-alias` acrescenta a linha ao rc, dentro de um bloco
  marcado e removível, **com confirmação explícita**. Nunca em silêncio.
- Windows/PowerShell: `adp.cmd` ao lado, mesma regra.

**Modelo por fase.** O config já tem `parallel.model`. Generalizar:

```json
"agent": {
  "models": { "scope": "opus", "prd": "opus", "rfc": "opus",
              "tdd": "sonnet", "implementation": "sonnet" }
}
```

Duas regras: **escalar modelo pergunta antes** (custa mais dinheiro do usuário, e
consentimento sobre custo é o mesmo princípio do `adp trust`); e harness que não
suporta seleção de modelo **recusa em vez de adivinhar** — exatamente o padrão
`editArgs: null` que já está no `agent.js`. Palpite errado aqui falha silencioso
e só aparece horas depois.

---

### PRD-006 — Self-hosting: a ferramenta se especifica

**Problema (`PB-006`):** você quer que a 0.6 seja construída pela própria
ferramenta, mas a 0.6 muda a gramática que a ferramenta lê. **Reversible:** no.

**O bootstrap em duas fases**, que é a única saída sem paradoxo:

**Fase 1 — Especificar na gramática velha.** Este SCOPE e os PRDs acima são
escritos em gramática 0.5 e auditados por `npx @codryx/agent-dev-pipeline@0.5.0
audit --ci`, pinado. A ferramenta estável guarda a especificação da instável.

**Fase 2 — Virar a chave.** Quando o parser novo passa nos próprios testes,
roda-se `adp upgrade --apply` no próprio `.spec/` do repositório e o CI ganha um
segundo job: `node bin/adp.js audit --ci`, o self-audit. Durante a transição os dois
jobs coexistem — o pinado é obrigatório, o local é informativo. No fim da 0.6, o
local vira obrigatório e o pinado sai.

**Consequências operacionais:**

- `.exemplo/` precisa existir nas duas gramáticas durante a transição, ou ser
  regenerado pelo próprio codemod — que é, aliás, o melhor teste do codemod que
  existe.
- Cada defesa de supply chain continua sendo um `P-xxx` com verificação
  executável; as novas (guarda do `git mv`, recusa em árvore suja, regra do
  baseline que só encolhe) entram como princípios, não como código solto.
- A meta é que o `audit --ci` deste repositório fique verde **na gramática nova**
  antes do `publish`. Se a ferramenta não consegue se auditar, ela não está
  pronta para auditar terceiro.

---

### PRD-007 — Documentação e os dois exemplos executáveis

**Problema (`PB-009`):** a 0.6 muda a cadeia, os gates, os exit codes, os nomes
de arquivo e o modo de instalar. **Toda a documentação embarcada passa a mentir
no dia do release** — e este pacote tem um achado próprio para isso, o
`DOC_FOSSIL`. Publicar a 0.6 com a documentação da 0.5 seria a ferramenta
cometendo o antipadrão que ela audita. **Reversible:** yes.

#### O que precisa ser reescrito

| Arquivo | Por quê |
|---|---|
| `README.md` | cadeia de 5 documentos, 7 gates, exit 1–7, matriz de cerimônia, MVP/backlog, estimativa e as duas rotas de entrada |
| `README.pt-BR.md` | **está desatualizado desde antes desta versão** — descreve o estado 0.4.x, fala em "139 testes" e ao mesmo tempo diz que o monitor foi removido *e* documenta o monitor. Precisa ser regerado a partir do inglês, não remendado |
| `ARCHITECTURE.md` | ainda descreve `templates/`, `skill/SKILL.md` e "56 testes"; a estrutura mudou duas versões atrás |
| `INSTALL.md` | o wrapper `./adp` muda a história de instalação e resolve o pinning; a seção "por que fixar no CI" ganha o aviso automático do `upgrade` |
| `payload/AGENTS.md` | **o contrato que toda IA lê primeiro.** Precisa ensinar a cadeia nova, a regra da porta, a matriz de cerimônia e o MVP declarado |
| `payload/claude/skills/adp/SKILL.md` | é o contrato do agente com o motor — vocabulário, regras inegociáveis e **catálogo de achados**. Com ~26 códigos novos, é reescrita, não remendo |
| `payload/templates/*` | SCOPE ganha MVP/pesos/perfil; nasce `BACKLOG.md`; `TDD.md` vira `DESIGN.md`; nasce `SPEC.md` e o template de ADR |
| `CHANGELOG.md` | a seção **⚠️ Breaking** com as tabelas velho→novo de exit codes, nomes de arquivo e diretórios |

A regra que evita repetir o problema: **a documentação entra no escopo do
`DOC_FOSSIL` do próprio repositório**. Se o motor mudar e o README não for
tocado no mesmo PR, o self-audit do M7 acusa.

#### Os dois exemplos, porque são duas histórias diferentes

Hoje existe um `.exemplo/`, e ele conta a história de um projeto novo. A 0.6
abre uma segunda porta de entrada — e uma porta de entrada sem exemplo é uma
porta que ninguém atravessa.

**`.exemplo/` — projeto novo (verde, MVP fechado).**
Continua sendo o delivery com janela de entrega, regerado na gramática nova.
Passa a mostrar o que a 0.6 acrescenta: SCOPE com MVP declarado e itens no
`BACKLOG.md`; um `Q-xxx` de **porta de mão única** que obriga a RFC e um de mão
dupla que não obriga; a RFC com critérios ponderados antes das opções e a opção
"não fazer nada"; `DESIGN.md` e `SPEC.md` separados pelo teste da longevidade;
uma estimativa em PF com o rótulo **sem calibração**; e um `adp close` já
gravado, para que `adp estimate` mostre o desvio da entrega anterior.

Mantém a propriedade que já tem hoje e que é o coração dele: **chega sem prova,
de propósito**. E o README dele ganha as quebras novas — apague a fronteira do
MVP e veja `MVP_WIDENED`; tire o `Door:` de uma questão e veja
`DOOR_UNDECLARED`; escreva "usar PostgreSQL com trava na tabela" no PRD e veja
`PRD_WITH_SOLUTION`.

**`.exemplo-legado/` — projeto que já existe (vermelho, e legivelmente
vermelho).**
Um repositório pequeno mas convincente: código, testes parciais, um `README`
antigo, uma pasta `docs/` com um ADR solto e uma especificação que não
corresponde mais ao código. O que ele demonstra é justamente o que não dá para
explicar em prosa:

1. `adp init --brownfield` faz o inventário e **pede confirmação** antes de
   qualquer escrita;
2. o arquivamento em `project_old_artifacts/`, com o `README.md` **copiado e não
   movido**, para provar a lista de intocáveis;
3. a arqueologia gerando um SCOPE em **`Draft`**, com cada afirmação citando o
   arquivo de origem;
4. o `BASELINE.md` e o modo ratchet: dívida velha em warning, e um arquivo
   tocado depois do baseline virando erro cheio;
5. o primeiro `audit` sendo **legível** — algumas dezenas de linhas, não um muro.

Este segundo exemplo é o teste mais honesto do PRD-002. Se a experiência dele
for ruim, a feature de brownfield não está pronta, por mais que os testes
unitários passem.

---

## 4. Pesos de decisão do projeto (`W-xxx`)

Declarados aqui, consumidos por toda RFC. Escala 1–5.

| Código | Critério | Peso | Por quê neste projeto |
|---|---|---|---|
| `W-001` | Segurança / raio de alcance | 5 | escreve hook executável e instrução de IA dentro do repo alheio |
| `W-002` | Não destruir trabalho do usuário | 5 | 0.6 passa a **mover arquivos**, coisa que a 0.5 nunca fez |
| `W-003` | Manutenibilidade | 4 | zero dependências é uma escolha que se paga em código próprio |
| `W-004` | Honestidade do veredito | 5 | um verde falso destrói a ferramenta inteira |
| `W-005` | Tempo de desenvolvimento | 3 | importa, mas perde para os quatro acima |
| `W-006` | Ergonomia do operador | 3 | o `PB-004` nasceu daqui |

_(pesos a confirmar pelo dono do escopo — ver `Q-009`)_

---

## 5. Fora de escopo

- Suporte a idioma nos tokens do motor. Fechado em D-016, não reabre.
- Escrita pela página do monitor, em qualquer forma.
- Estimativa por qualquer método além de APF nesta versão (COSMIC, story points).
- Qualquer tentativa de derivar esforço humano a partir de wall-clock de agente,
  ou de publicar um fator de produtividade de IA. A literatura não sustenta, e
  publicar sustentaria a aparência de que sustenta.
- Automação de resolução de conflito de merge nas lanes.
- Hospedagem/telemetria remota. `local-only` continua sendo o default — o
  compartilhamento do histórico é um caminho de arquivo, não um serviço.

---

## 6. Milestones

| # | Entrega | Por que nesta ordem |
|---|---|---|
| **M1** | Lockfile + `adp upgrade` + registry de migrations | tudo depois disto muda arquivo em disco; sem caminho de atualização, nada mais pode ser publicado com segurança |
| **M2** | Nova cadeia (SCOPE/PRD/RFC/DESIGN/SPEC), sete gates, renomeação `TDD.md`→`DESIGN.md` e skill `tdd`→`test-driven-development`, codemod 0.5→0.6 | é a mudança de gramática; quanto antes, menos documento escrito no formato velho |
| **M2b** | Matriz de cerimônia (orientação no `adp new`, estado no `adp status`) + ADR + exceções declaradas | é o que impede a nova cadeia de virar burocracia; sem ela, M2 aumenta o custo de toda feature pequena |
| **M2c** | Fronteira de MVP declarada, `BACKLOG.md`, promoção de item a PRD | define o que o projeto é antes de estimá-lo; M3 estima o MVP, não o sonho |
| **M3** | Estimativa por PF: entrevista de stack, contagem, tabela editável, CSV, gatilho do sinal "1 mês" | depende do SCOPE novo do M2 e fecha na matriz do M2b |
| **M3c** | `adp close`, registro de finalização, calibração por fechamento | fecha o laço empírico; sem ele a tabela nunca sai do cold start |
| **M3d** | `adp metrics export/import/show`, `hours-history.jsonl` anonimizado | tira a medição de dentro do projeto; é o que faz a calibração acumular entre projetos em vez de reiniciar |
| **M3b** | Os seis antipadrões como finding codes + `AC_NOT_OBSERVABLE` + `DUPLICATE_PROSE` | aditivo, não quebra nada; pode sair em paralelo |
| **M4** | Brownfield: inventário, arquivamento, arqueologia, baseline | depende de M1 (upgrade) e M2 (gramática destino) |
| **M5** | Monitor: trilha da cadeia, lanes ao vivo, estimado × realizado, painel de dívida | consome tudo que os anteriores produzem |
| **M5b** | Quarto estado `n/a`, adiamento declarado (`DEFERRALS.md`), `audit --strict` | é o que torna o vermelho sustentável em projeto real sem abrir escapatória |
| **M6** | Ergonomia: wrapper `./adp`, modelos por fase | independente; pode antecipar se algum bloquear |
| **M6b** | Documentação reescrita (README EN/pt-BR, ARCHITECTURE, INSTALL — incluindo a política de convivência 0.5×0.6, §12.8 —, AGENTS.md, skill `adp`, templates) e os dois exemplos executáveis | sem isso a 0.6 publica com a documentação da 0.5 — o `DOC_FOSSIL` que a própria ferramenta audita |
| **M7** | Self-audit verde na gramática nova + `publish` | é o critério de pronto da versão |

Cada milestone é testável isoladamente antes do próximo. M1 pode ser publicado
como 0.5.1 e entregar valor sozinho.

---

## 7. Critérios de aceite do projeto

- `AC-P1` — Um projeto instalado na 0.4.x chega à 0.6.0 com um comando, sem perder
  nenhuma edição sua, e o relatório lista o que foi mantido.
- `AC-P2` — Um repositório legado real chega a um `audit` legível na primeira
  execução: sem muro de findings, com dívida existente visível e contável.
- `AC-P3` — Nenhum arquivo do usuário é movido sem consentimento explícito, e
  todo movimento é revertível por um comando git.
- `AC-P4` — `adp estimate` produz PF e faixa de horas com a fonte normativa, o
  perfil de stack e a procedência da linha usada declarados na saída.
- `AC-P4b` — Um PRD fechado com horas declaradas altera a faixa da próxima
  estimativa do mesmo perfil, e o relatório mostra o desvio da entrega anterior.
- `AC-P4c` — Esforço humano e wall-clock aparecem sempre como duas colunas
  distintas; nenhum cálculo do motor converte um no outro.
- `AC-P4d` — Um histórico exportado de um projeto calibra a primeira estimativa
  de um projeto novo, sem passo manual além de apontar o caminho.
- `AC-P4e` — A exportação default não contém nome de projeto, de feature nem de
  pessoa, e o comando declara o que removeu.
- `AC-P4f` — `adp estimate --history` informa o erro médio das estimativas feitas
  a frio contra o das feitas com calibração.
- `AC-P8` — Um projeto novo sai do `init` com o MVP declarado e um backlog, e
  acrescentar PRD ao MVP depois da aprovação produz um achado.
- `AC-P9` — Uma opção de RFC que exige capacidade não declarada pelo time acende
  o sinal "tecnologia nova" na matriz de cerimônia, sem intervenção manual.
- `AC-P10` — Nenhum item de backlog carrega código de rastreio, e promover um
  item a PRD é o que lhe dá códigos.
- `AC-P5` — O monitor mostra, sem recarregar, em que ponto da cadeia cada PRD
  está e o que as lanes estão fazendo.
- `AC-P6` — O servidor continua sem nenhum caminho de escrita, provado por teste.
- `AC-P7` — Este repositório fica verde no próprio `audit --ci`, na gramática
  nova, antes do publish.
- `AC-P11` — `.exemplo/` chega a `audit --ci` limpo depois de `trust`, `verify`,
  `audit`, e continua chegando **sem prova de propósito**.
- `AC-P12` — `.exemplo-legado/` produz um primeiro `audit` legível — dezenas de
  linhas, não centenas — e nenhum arquivo da lista de intocáveis foi movido.
- `AC-P13` — README, `--help` e a skill `adp` listam o mesmo conjunto de
  comandos e os mesmos exit codes.
- `AC-P14` — Nenhum gate pode ser desligado. Um gate só fica `n/a` por
  consequência do nível de cerimônia declarado, e imprime o motivo.
- `AC-P14b` — Adiar exige dono, motivo e prazo; vencido volta a erro sozinho; a
  contagem ativa é sempre impressa; e nenhum código da lista de não-adiáveis
  aceita adiamento, provado por teste.
- `AC-P14c` — Um adiamento que casa mais de cinco achados é recusado.
- `AC-P15` — O codemod 0.5→0.6 não perde uma linha de conteúdo do usuário, e o
  que falta depois dele aparece como achado, não como silêncio.
- `AC-P16` — O `INSTALL.md` declara explicitamente que a 0.5.0 continua
  publicada e suportada, com o comando exato para fixar versão em CI.

---

## 8. Dados e segurança

- Nenhum dado novo sai da máquina. Estimativa e ledger ficam no state dir, fora
  do repositório.
- `project_old_artifacts/` pode conter documentação sensível movida do repo. O
  arquivamento **não** altera o `.gitignore` do usuário — decidir se aquilo vai
  para o remoto é dele, e a ferramenta avisa que a pasta será commitada como
  qualquer outra.
- O questionário de PF e o de SCOPE podem coletar informação de negócio. Vale
  dizer no `AGENTS.md` que esse conteúdo vai para o modelo configurado.

---

## 9. Entrega

- **Repositório:** github.com/Codryx-Tec/agent-dev-pipeline
- **Modo:** `local-only` (default)
- **Publicação:** trusted publishing OIDC + `--provenance`, sem mudança
- **Versão:** 0.6.0, com quebra declarada (gates, diretórios, exit codes)

---

## 10. Decisões do escopo (antigas questões em aberto)

Todas respondidas em 2026-08-05 pelo dono do escopo. Ficam registradas aqui com
a decisão e a consequência, não apagadas — a próxima pessoa que propuser o
contrário encontra o argumento em vez de repeti-lo.

- [x] **`Q-001` — Layout.** Uma RFC **pode** servir a mais de um PRD, e um PRD
      costuma gerar **várias** RFCs (uma por porta de mão única). Logo o
      aninhamento estava errado. Layout: `.spec/prd/<M#-NNN-nome>/` com `PRD.md`,
      `DESIGN.md` e `SPEC.md`; `.spec/rfc/RFC-<NNN>-<slug>.md` **plano, numerado
      globalmente**, referenciado por link.
- [x] **`Q-002` — SETE GATES.** G0 SCOPE · G1 PRD · G2 RFC/caminho · G3 DESIGN ·
      G4 SPEC · G5 Proven · G6 Aligned. **Exit codes passam a ser 1–7**, e isso
      quebra todo pipeline que hoje interpreta o número.
      Consequências obrigatórias: entra no `CHANGELOG` sob **⚠️ Breaking**, com a
      tabela velho→novo; `adp upgrade` avisa quando encontra um workflow do
      projeto que casa `agent-dev-pipeline` sem versão fixada; e o `--json` ganha
      `gateId` textual (`"G4"`) para que o próximo pipeline não dependa do
      inteiro. Registrar como `RFC-002`.
- [x] **`Q-003` — Dois documentos, fronteira nítida.** **Teste da longevidade**
      (DESIGN): *"se trocarmos de framework amanhã, essa frase continua
      verdadeira?"* — SIM entra, é decisão; NÃO fica fora, é detalhe de código.
      **Teste da conferência** (SPEC): o DESIGN é o blueprint que **um humano
      lê**; a SPEC é **a parte que a máquina confere**.
- [x] **`Q-004` — Numeração por milestone**, com uma ressalva que precisa estar
      no código. O **diretório** carrega o milestone (`.spec/prd/M1-001-agendamento/`),
      mas o **código de rastreio é global e imutável** (`PRD-007`). Se o código
      embutisse o milestone, mover um PRD de M1 para M2 renomearia a identidade
      dele — e a invariante "todo código tem exatamente um lugar de definição e
      é estável" cairia justamente na operação mais comum de replanejamento.
      **Diretório é navegação; código é identidade.** Mover um PRD entre
      milestones renomeia a pasta e não toca em nada mais; `MILESTONE_MISMATCH`
      (warning) reporta pasta e milestone declarado divergentes.
- [x] **`Q-005` — Mover com `--archive`.** Default continua **copiar** (não
      destrutivo); `--archive` move via `git mv`. As três guardas valem nos dois
      modos: recusa fora de repositório git, recusa em árvore suja, lista de
      intocáveis (`README.md`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`,
      `CODE_OF_CONDUCT.md` e qualquer caminho referenciado por workflow de CI).
- [x] **`Q-006` — Faixa de h/PF: ver §3, PRD-003.** Resposta curta: **nenhuma
      referência de mercado mede o que esta ferramenta faz**, então o número
      embarcado é declaradamente um *cold start* e a calibração pelo ledger é o
      mecanismo principal, não um extra.
- [x] **`Q-007` — A IA propõe, o humano confirma.** Com três guardas contra
      contagem inflada, detalhadas no PRD-003.
- [x] **`Q-008` — Junto, num primeiro momento.** `adp upgrade` encadeia as
      migrations. **Dry-run continua sendo o default**; escrever exige `--apply`.
      O uso granular — rodar um passo isolado ao depurar — é atendido por
      `adp upgrade --only-migrations`, **não** por um comando `adp migrate`
      separado: um segundo comando para o mesmo ato é superfície duplicada
      (§12.2).
- [x] **`Q-009` — Pesos confirmados** conforme a seção 4.
- [x] **`Q-010` — Renomear os dois lados.** A skill `tdd` passa a
      `test-driven-development`; o documento `TDD.md` passa a **`DESIGN.md`**,
      com o cabeçalho declarando *Technical Design Document (TDD)* para não
      perder o vocabulário de mercado. Entra no codemod 0.5→0.6 e na migration
      de payload. O `AGENTS.md` ganha a desambiguação escrita, porque projetos
      legados vão continuar chamando o arquivo de TDD por anos.
- [x] **`Q-011` — O limiar é calculado, não constante.** `160 h ÷ h-PF`,
      usando a ponta **alta** da faixa. Detalhado no PRD-003.
- [x] **`Q-012` — Sim, embarcar `create-prd`.** É o único elo da cadeia sem
      skill, é o documento que o dono do produto lê, e é onde o antipadrão #4
      ("PRD que virou spec") nasce. A skill entrevista, recusa vocabulário de
      solução e devolve **uma página**.

---

## 11. RFCs obrigatórias nesta versão

Decisões de porta de mão única — cada uma exige uma RFC com ≥2 opções reais mais
`OPT-000 — do nothing`, pontuadas contra os pesos da seção 4:

| RFC | Decisão | Por que é irreversível |
|---|---|---|
| `RFC-001` | Layout de diretório e famílias de código da nova cadeia | todo documento já escrito no mundo passa a estar no lugar errado |
| `RFC-002` | Sete gates e a quebra do contrato de exit code | quebra pipeline de terceiro em silêncio, que é o pior modo de quebrar |
| `RFC-003` | Estratégia de arquivamento no brownfield (`git mv` × cópia) | mexe em arquivo do usuário; errar aqui custa a confiança inteira |
| `RFC-004` | RFC condicional e o campo `Door` em `Q-xxx` | define se o G2 tem dente ou vira decorativo |
| `RFC-005` | Baseline/ratchet: semântica e regra de só-encolher | é o único mecanismo da ferramenta que **desliga** findings |
| `RFC-006` | Separação dos dois relógios (esforço humano × wall-clock) e a tabela de cold start | vira base de proposta comercial; errar aqui custa dinheiro de terceiro, e o número fica citado em contrato |

---

## 12. Pontas soltas — resolvidas

### 12.1 O que substitui o "desligar gate" — três mecanismos, nesta ordem

A necessidade é legítima. As duas formas propostas — chave de desligar e G7 —
quebram propriedades das quais o produto depende, então abaixo está a forma
aplicável de cada pedaço da necessidade. **A regra é tentar na ordem: se o caso
não couber nos três, o achado está certo e o trabalho é que está errado.**

---

#### Camada 1 — `n/a` por cerimônia: o "desligado" honesto

**Esta é a que provavelmente resolve 80% do que você quer, e ela já está
desenhada** — só faltava reconhecer que é isso.

Um gate hoje tem três estados: `clean`, `red`, `blocked`. A 0.6 acrescenta o
quarto: **`n/a` — não se aplica neste nível de cerimônia.**

| Nível da matriz (§2.5) | G2 (RFC) | G3 (DESIGN) |
|---|---|---|
| pequena · reversível · 1 pessoa | `n/a` | `n/a` |
| média · 1 time · algum risco | `n/a` | avaliado |
| decisão que afeta vários times | avaliado | avaliado |
| pagamento · dado pessoal · irreversível | avaliado | avaliado |

A diferença com uma chave de desligar é tudo: **`n/a` é consequência de um nível
declarado**, derivado dos cinco sinais, e não de alguém ter decidido que aquele
gate incomodava. Ninguém escolhe o `n/a` diretamente — escolhe-se o nível, com
os sinais à mostra, e o `n/a` cai fora disso.

Regras: `n/a` **nunca** vale para G0, G4, G5 e G6 — especificar e auditar não se
pulam em nenhum nível. E `n/a` aparece no status com o motivo ao lado
(*"G2 n/a — cerimônia leve: nenhum sinal formal aceso"*), nunca como um espaço
em branco.

---

#### Camada 2 — adiamento declarado: para o achado real com que se escolhe conviver

Quando o achado é verdadeiro, se aplica, e mesmo assim a decisão certa hoje é
conviver com ele. **Não é o achado que some — é a decisão que passa a existir**,
do mesmo jeito que `Door:` fez com a pergunta em aberto.

**Onde mora:** `.spec/DEFERRALS.md`, um arquivo, dono da família `DEF-xxx`. Um
arquivo só porque dívida espalhada é dívida que ninguém soma.

```markdown
## DEF-001 — TEST_ORPHAN em test/legacy/

- Finding: TEST_ORPHAN
- Scope: test/legacy/**
- Owner: <quem responde por isso>
- Reason: a suíte antiga sai junto com a migração do módulo de faturamento
- Until: 2026-11-30
- Opened: 2026-08-05
```

**As seis regras que impedem isto de virar a chave de desligar pela porta dos
fundos:**

1. **Escopo estreito, nunca por código.** `Scope:` é caminho ou instância. Adiar
   `TEST_ORPHAN` no projeto inteiro *é* desligar o gate — então um adiamento que
   casa mais que `deferrals.maxMatches` (default **5**) achados é
   `DEFERRAL_TOO_BROAD`, erro. É esta regra, e não a boa intenção, que separa os
   dois conceitos.
2. **`Until:` obrigatório, com teto.** Default `deferrals.maxDays: 90`.
   Adiamento sem prazo é apagar o achado com passos extras.
3. **Vence sozinho.** Passou da data, o achado volta na severidade original e
   ainda soma `DEFERRAL_EXPIRED`. Ninguém precisa lembrar.
4. **Renovar é permitido e fica contado.** Renovação **acrescenta linha**, não
   edita a anterior. Na terceira, `DEFERRAL_RENEWED_REPEATEDLY` (warning) diz o
   que está acontecendo de verdade: aquilo não está adiado, está aceito — e
   aceito pertence ao baseline ou ao backlog, não aqui. Coerente com o resto da
   casa: a ferramenta mostra e a pessoa decide, não proíbe.
5. **`Owner:` e `Reason:` obrigatórios.** `DEFERRAL_WITHOUT_OWNER` é erro.
   Dívida anônima não tem quem a pague.
6. **A contagem ativa é sempre impressa**, ao lado do verde e do vermelho:
   `✔ limpo — 0 erros, 7 adiados`. Dívida escondida é a única que cresce sem
   ninguém ver.

**A lista de códigos que nunca podem ser adiados — e ela é o produto:**

`TASK_DONE_WITHOUT_PROOF` · `AC_WITHOUT_PROOF` · `PROOF_WEAK` · `PROOF_STALE` ·
`SCOPE_NOT_APPROVED` · `RFC_REQUIRED` · `DOOR_UNDECLARED` · `MVP_WIDENED` ·
`BASELINE_WIDENED` · `HOURS_IMPLAUSIBLE`

Adiável só o que pertence a **G5 e G6** — os gates que descrevem o mundo mudando
debaixo do documento. **Não se adia decidir**, e não se adia a recusa sobre a
qual tudo se apoia. Se `TASK_DONE_WITHOUT_PROOF` pudesse ser adiado, o produto
teria sido apagado por configuração.

**Em `--ci`:** os adiamentos **valem**, senão o pipeline fica vermelho para
sempre e as pessoas param de rodar com `--ci`, que é pior. Mas o resumo os
imprime, e `adp audit --strict` ignora todos e mostra o estado real — a rodada
que vale a pena marcar para uma vez por mês.

---

#### Camada 3 — baseline: para dívida herdada, não escolhida

Já está no PRD-002 e **não se sobrepõe** ao adiamento, desde que a fronteira
esteja escrita:

| | Baseline | Adiamento |
|---|---|---|
| O que cobre | código que já existia antes da ferramenta chegar | achado sobre código que a ferramenta já governa |
| Como se cria | automático, em bloco, uma vez no `init --brownfield` | manual, um a um |
| Expira? | não — **encolhe** conforme os arquivos são tocados | sim, e vence sozinho |
| Quem escolheu | ninguém: é herança | uma pessoa, com nome |

Achado em arquivo do baseline **já é warning** e não precisa de adiamento. Sem
essa linha escrita, as pessoas usam o mecanismo que for mais fácil e os dois
viram um só, mal definido.

---

#### E a melhoria contínua, que era a intenção do G7

Ela vira **duas coisas que já existem**, nenhuma delas um gate:

- **`BACKLOG.md` ganha duas seções: produto e técnico.** É o lugar da melhoria
  contínua — e continua sem código de rastreio, portanto sem gerar achado, que é
  exatamente o que se quer de um item que ainda não foi comprometido.
- **Painel de dívida no monitor**, somando as três origens — baseline herdado,
  adiamentos ativos, backlog técnico — com tendência no tempo. É a leitura que o
  G7 daria, com a diferença de que **nada disso mexe no veredito**: o número que
  o CI lê continua significando o que sempre significou.

### 12.2 Inventário de comandos — três foram cortados

Aplicando *"se não faz sentido, nem crie"*:

| Comando | A pergunta que responde | Veredito |
|---|---|---|
| `adp upgrade` | "como saio da versão em que entrei?" | **fica** — é o PRD-001 inteiro |
| `adp estimate [--csv] [--review] [--history]` | "quanto isso custa, e o quanto erramos das outras vezes?" | **fica** — produz artefato próprio |
| `adp profile` | "o que este time domina hoje?" | **fica** — o `init` nunca sobrescreve, então não há outro jeito de reentrevistar quando o time muda |
| `adp close <prd>` | "quantas horas isso custou de verdade?" | **fica** — é o único ponto do sistema em que uma pessoa precisa declarar algo que a máquina não sabe |
| `adp metrics export\|import` | "como levo isto para o próximo projeto?" | **fica** — é a portabilidade da base histórica |
| ~~`adp migrate`~~ | — | **cortado.** A decisão do `Q-008` foi "junto"; um segundo comando para o mesmo ato é superfície duplicada. Vira `adp upgrade --only-migrations` |
| ~~`adp ceremony`~~ | — | **cortado.** A matriz é orientação no `adp new` e estado no `adp status`. Um comando só para reimprimir o que outros dois já mostram é o começo de um CLI que ninguém decora |
| ~~`adp metrics show`~~ | — | **cortado.** Vira `adp estimate --history`. A precisão histórica é uma pergunta sobre estimativa, não sobre métrica solta |

Saldo: **cinco comandos novos, não oito.** README, `--help` e a skill `adp`
derivam desta tabela — e `AC-P13` exige que os três concordem.

### 12.3 Codemod: uma estrutura melhor, e ela inverte o risco

A operação perigosa era extrair `US-xxx`/`AC-xxx` de dentro do `PRD.md` para um
`SPEC.md` novo — reescrita estrutural de documento do usuário, capaz de
corromper conteúdo. **Proposta melhor: não dividir nada.**

O `PRD.md` da 0.5 **já é, estruturalmente, uma spec** — ele é dono de US e AC.
Então o destino natural dele não é o PRD novo; é o `SPEC.md`.

| Passo | Operação | Risco |
|---|---|---|
| 1 | `.spec/features/<nome>/PRD.md` → `.spec/prd/<M#-NNN-nome>/SPEC.md` | renomeio, **sem perda** |
| 2 | `TDD.md` → `DESIGN.md`, `RFC.md` → `.spec/rfc/RFC-<NNN>-<slug>.md` | renomeio |
| 3 | `PRD.md` novo **não é gerado com conteúdo inventado** — fica ausente | nenhum |
| 4 | G1 acusa `PRD_MISSING`, e a skill `create-prd` entrevista para escrevê-lo | nenhum |

**Por que isto é melhor:** em vez de a máquina cortar um documento ao meio e
torcer para acertar, ela **move o que existe sem tocar no conteúdo** e declara o
que falta. Nada é destruído; algo é acrescentado. E a dívida fica **visível como
achado**, não silenciosa.

É também mais honesto: a ferramenta admite que **não sabe escrever o seu PRD** —
o que é exatamente certo, porque o PRD é o único documento da cadeia que o dono
do produto precisa possuir. Um PRD gerado por máquina a partir de uma spec seria
o antipadrão #4 ao contrário, e ninguém leria.

### 12.4 G2 sem porta de mão única: verde **declarando**

Fica verde, mas por declaração e não por vacuidade. A SPEC carrega a linha
`RFC: not required — no one-way door` e o relatório imprime *"G2 limpo — nenhuma
RFC exigida (declarado)"*. Ausência da declaração é `RFC_EXEMPTION_UNDECLARED`.
Uma checagem que não pode falhar é idêntica a uma que passou; a declaração é o
que separa as duas.

### 12.5 Histórico por ator: pessoa **e** máquina

O registro deixa de ter um número de horas e passa a ter **atores**:

```json
"actors": [
  { "kind": "human", "role": "senior",  "id": "sha256:…", "hours": 26 },
  { "kind": "human", "role": "junior",  "id": "sha256:…", "hours": 44 },
  { "kind": "agent", "model": "…", "lanes": 9, "wallClockHours": 31, "supervisionHours": 12 }
]
```

Três consequências que valem estar escritas:

**Para ator máquina, "horas humanas" tem outro significado** — é **supervisão e
revisão**, não execução. Precisa de campo próprio (`supervisionHours`), senão o
`h/PF` fica contaminado pelo relógio errado, que é justamente o que a §PRD-003
proíbe.

**Papel entra na régua; identidade não.** Sênior e júnior no mesmo perfil de
stack produzem faixas diferentes, e misturá-los produz uma faixa larga que não
ajuda ninguém. Mas **`role` é o que calibra, `id` não** — então o `id` é hash
desde o início e a exportação nem o carrega.

**Isto é dado pessoal, e o SCOPE deste projeto tem seção de LGPD.** Um histórico
que atravessa projetos com nome de pessoa dentro é tratamento de dado pessoal
feito pela ferramenta, sem base legal declarada e sem o usuário perceber. A
anonimização da exportação, que já estava no PRD-003c por causa de dado de
cliente, **também é a resposta aqui** — e agora é obrigatória, não default
educado.

### 12.6 Procedência do material conceitual — resolvida

O material de aula não é público e pertence ao contexto de um dos projetos que
este repositório **já credita**. Nada novo a licenciar. Ação restante, barata:
estender a linha de crédito existente para mencionar também as formulações
aproveitadas — a matriz de cerimônia, os seis antipadrões e o teste da
longevidade —, mantendo o padrão que este repositório já pratica de registrar de
onde cada coisa veio.

### 12.7 O mapeamento código → gate → severidade

Regra de fundo, herdada sem mudança: **todo código pertence a exatamente um
gate.** `test/gates.test.js` continua falhando se algum não pertencer a gate
nenhum — a 0.6 não relaxa essa garantia, só estende a tabela de 6 para 7 gates.

**A mudança estrutural que move a maioria dos códigos não é nova regra — é
consequência de §2.1.** `US-xxx`, `AC-xxx`, `ASM-xxx` e `Q-xxx` saem do PRD e
passam a ser donos da SPEC (a tabela de §2.1 já dizia isso). Logo, todo código
de gate que hoje verifica essas famílias **muda de G1 para G4**, porque G4 é o
gate da SPEC na numeração nova, não porque a checagem em si mudou. Da mesma
forma, G3 deixa de ser "breakdown implementável" (TDD + tarefas) e passa a ser
só DESIGN — as checagens de tarefa (`AC_WITHOUT_TASK`, `REF_BROKEN`,
`REF_WITHOUT_AC`, `TASK_WITHOUT_FILES`, `TASK_STATUS_INVALID`, `FILE_MISSING`)
migram para G4 pelo mesmo motivo: tarefa é uma família da SPEC.

E a renumeração pura desloca o resto: G4 (Proven) vira **G5**; G5 (Aligned)
vira **G6**. Nenhum código dessas duas listas muda de comportamento — só de
número.

#### G0 — Scope approved

| Código | Origem | Severidade |
|---|---|---|
| `SCOPE_MISSING` | existente | erro |
| `SCOPE_NOT_APPROVED` | existente | erro |
| `SCOPE_FIELD_EMPTY` | existente | erro |
| `MVP_WIDENED` | novo (§2.2) | warning · **erro em `--ci`** · não-adiável |
| `PROFILE_UNDECLARED` | novo (§PRD-003) | erro |
| `ESTIMATE_UNCONFIRMED` | novo (§PRD-003, Q-007) | warning · erro em `--ci` |
| `ESTIMATE_STALE` | novo (§PRD-003) | warning · erro em `--ci` |
| `FUNCTION_WITHOUT_SOURCE` | novo (§PRD-003, Q-007) | warning — função exclui-se do total, não bloqueia sozinha |

Motivo de MVP e estimativa morarem aqui: ambos são donos do SCOPE (§2.2, e a
contagem de PF "roda no nível do SCOPE"), não de um PRD específico.

#### G1 — PRD complete

| Código | Origem | Severidade |
|---|---|---|
| `PRD_MISSING` | existente | erro |
| `ID_DUPLICATE` | existente | erro |
| `ID_TOO_SHORT` | existente | erro |
| `PRD_WITH_SOLUTION` | novo (§PRD-003b, antipadrão #4) | erro |
| `PRD_UNPLACED` | novo (§2.2) | erro |
| `BACKLOG_ITEM_WITH_CODE` | novo (§2.2) | erro |
| `MILESTONE_MISMATCH` | novo (Q-004) | warning |

`SPEC_WITHOUT_US`, `US_WITHOUT_AC`, `AC_INCOMPLETE` e `AC_OUTSIDE_US` **saem**
daqui — ver G4. `SPEC_WITHOUT_US` mantém o nome (já dizia "SPEC", coincidência
feliz); só o rótulo humano muda de "PRD has no user story" para "SPEC has no
user story".

#### G2 — Path decided (RFC)

| Código | Origem | Severidade |
|---|---|---|
| `RFC_MISSING` | existente | erro |
| `DECISION_WITHOUT_ALTERNATIVE` | existente | erro |
| `DECISION_WITHOUT_CHOICE` | existente | erro |
| `SECTION_MISSING` | existente | erro |
| `STATUS_INVALID` | existente | erro |
| `RFC_REQUIRED` | novo (§2.3) | erro · não-adiável |
| `DOOR_UNDECLARED` | novo (§2.3) | erro · não-adiável |
| `RFC_EXEMPTION_UNDECLARED` | novo (§12.4) | erro |
| `CRITERIA_AFTER_OPTIONS` | novo (§2.4) | erro |
| `OPTION_DO_NOTHING_MISSING` | novo (§PRD-003b, antipadrão #3) | erro |
| `CONTEXT_WITHOUT_NUMBERS` | novo (§PRD-003b, antipadrão #2) | erro |
| `RECOMMENDATION_AGAINST_SCORE` | novo (§2.4) | erro |
| `CONTEXT_NUMBER_WITHOUT_SOURCE` | novo (§2.4) | warning |
| `STRAW_OPTION` | novo (§PRD-003b, antipadrão #1) | warning |
| `OPTION_BEYOND_TEAM` | novo (§2.4) | warning — dispara sinal de cerimônia, não bloqueia sozinho |

`Q_BLOCKING_OPEN` e `ASM_WITHOUT_CODE` **saem** daqui — a família `Q-xxx` e
`ASM-xxx` agora é dona da SPEC (§2.1), então a checagem estrutural delas migra
para G4. O que fica em G2 é só o que pertence à *forma da RFC em si*.

#### G3 — DESIGN

| Código | Origem | Severidade |
|---|---|---|
| `DESIGN_MISSING` | renomeado de `TDD_MISSING` (Q-010) | erro |
| `SKIP_UNDECLARED` | novo (§2.5) | erro |

G3 fica deliberadamente curto: no nível leve da matriz de cerimônia (§2.5) ele
é `n/a` na maioria dos projetos, e as checagens de conteúdo de tarefa que hoje
moram junto com TDD migraram para G4 (SPEC), que é onde `T-xxx` de fato vive.

#### G4 — SPEC

| Código | Origem | Severidade |
|---|---|---|
| `SPEC_MISSING` | **novo, adicionado aqui** — ver nota abaixo | erro |
| `SPEC_WITHOUT_US` | existente, migrado de G1 | erro |
| `US_WITHOUT_AC` | existente, migrado de G1 | erro |
| `AC_INCOMPLETE` | existente, migrado de G1 | erro |
| `AC_OUTSIDE_US` | existente, migrado de G1 | erro |
| `AC_WITHOUT_TASK` | existente, migrado de G3 | erro |
| `REF_BROKEN` | existente, migrado de G3 | erro |
| `REF_WITHOUT_AC` | existente, migrado de G3 | warning |
| `TASK_WITHOUT_FILES` | existente, migrado de G3 | erro |
| `TASK_STATUS_INVALID` | existente, migrado de G3 | erro |
| `FILE_MISSING` | existente, migrado de G3 | erro |
| `Q_BLOCKING_OPEN` | existente, migrado de G2 | erro |
| `ASM_WITHOUT_CODE` | existente, migrado de G2 | erro |
| `AC_NOT_OBSERVABLE` | novo (§PRD-003b) | erro |

**Nota sobre `SPEC_MISSING`.** Nenhuma seção do escopo nomeou este código, mas
a lacuna é a mesma que `PRD_MISSING`/`RFC_MISSING`/`DESIGN_MISSING` cobrem para
os outros três documentos: SPEC.md é "sempre, 1 por PRD" (§2.1), então sua
ausência precisa de sinal próprio, senão G4 fica mudo justamente no documento
que ele existe para conferir. Registrado aqui de forma explícita — é uma
adição, não uma inferência silenciosa — e conta para o "~26" do total.

#### G5 — Proven (era G4)

| Código | Origem | Severidade |
|---|---|---|
| `AC_WITHOUT_TEST` | existente, renumerado | erro |
| `AC_WITHOUT_PROOF` | existente, renumerado | warning · erro em `--ci` · não-adiável |
| `PROOF_STALE` | existente, renumerado | warning · erro em `--ci` · não-adiável |
| `PROOF_WEAK` | existente, renumerado | erro · não-adiável |

Sem adições — a pergunta "todo critério tem teste que passa" não muda de forma
na 0.6.

#### G6 — Aligned (era G5)

| Código | Origem | Severidade |
|---|---|---|
| `TEST_ORPHAN` | existente, renumerado | warning |
| `TASK_DONE_WITHOUT_PROOF` | existente, renumerado | erro · não-adiável |
| `ASM_OPEN` | existente, renumerado | warning |
| `Q_OPEN` | existente, renumerado | warning · erro em `--ci` |
| `PRINCIPLE_WITHOUT_VERIFICATION` | existente, renumerado | warning |
| `PRINCIPLE_VIOLATED` | existente, renumerado | erro |
| `LEVEL_INVALID` | existente, renumerado | erro |
| `VERIFICATION_MALFORMED` | existente, renumerado | erro |
| `GLOB_WITHOUT_FILES` | existente, renumerado | warning |
| `FILE_ORPHAN` | existente, renumerado | warning · erro em `--ci` |
| `FEATURE_MISMATCH` | existente, renumerado | erro |
| `PROJECT_INVALID` | existente, renumerado | erro |
| `DOC_FOSSIL` | novo (§PRD-003b, antipadrão #6) | warning · erro em `--ci` |
| `DOC_TOO_LONG` | novo (§PRD-003b, antipadrão #5) | warning |
| `DUPLICATE_PROSE` | novo (§PRD-003b) — corrigido de "G5" para G6, ver nota | warning |
| `BASELINE_WIDENED` | novo (§PRD-002) | erro · não-adiável |
| `HOURS_UNDECLARED` | novo (§PRD-003c) | warning · erro em `--ci` |
| `HOURS_IMPLAUSIBLE` | novo (§PRD-003c) | warning · erro em `--ci` · não-adiável |
| `DEFERRAL_TOO_BROAD` | novo (§12.1) | erro |
| `DEFERRAL_WITHOUT_OWNER` | novo (§12.1) | erro |
| `DEFERRAL_EXPIRED` | novo (§12.1) | warning — soma-se ao achado original, que volta à severidade plena |
| `DEFERRAL_RENEWED_REPEATEDLY` | novo (§12.1) | warning |

**Nota sobre `DUPLICATE_PROSE`.** A §PRD-003b dizia "warning, G5" — escrito
antes de a numeração de sete gates (Q-002) estar fechada, quando G5 ainda
significava "Aligned". É o mesmo tipo de deriva que o commit `4f080c2` já
corrigiu seis vezes neste documento; esta é a sétima, pega agora porque o
mapeamento obrigou a percorrer cada código um a um. Semanticamente pertence
aqui: "os documentos não se copiam" é exatamente a pergunta que G6 faz.

#### As duas perguntas nomeadas, respondidas

- **`DOC_FOSSIL` é do G6, para qualquer tipo de documento.** A alternativa —
  um `DOC_FOSSIL` por gate de documento (`PRD_FOSSIL` em G1, `RFC_FOSSIL` em
  G2…) — multiplicaria o código sem mudar a pergunta que ele faz, que é sempre
  a mesma: *"este documento ainda concorda com o que ele descreve?"* Isso é
  literalmente a pergunta do G6 ("os documentos, o código e a constituição
  ainda concordam?"), então um código, um gate, aplicado a qualquer caminho de
  documento. O achado carrega qual arquivo apodreceu; o gate não precisa saber.
- **`HOURS_UNDECLARED` é gate, em G6, não só relatório.** A própria §PRD-003c
  já tinha decidido isso na prática — "warning durante o trabalho, erro em
  `--ci`" é exatamente o padrão `CI_ESCALATES` que só existe para código de
  gate. A pergunta em aberto aqui não sobrevive à leitura do resto do
  documento; só faltava dizer isso com todas as letras.

#### O saldo

**40 códigos existentes, redistribuídos** (nenhum perdido, oito migram de gate
por causa da mudança de dono de família, o resto só renumera). **31 códigos
novos** (30 nomeados ao longo do documento + `SPEC_MISSING`, adicionado aqui
por necessidade estrutural) — o "~26" da nota original era subestimativa;
ficou claro só ao somar. Total: **71 códigos, sete gates, nenhum órfão.**

### 12.8 A política de convivência 0.5 × 0.6

A proposta do rascunho original é confirmada, sem mudança: **a 0.6 lê apenas
gramática 0.6; a ponte é o `adp upgrade`; a 0.5.0 segue publicada no registry
para sempre.** Quem fixou a versão em CI (`@codryx/agent-dev-pipeline@0.5.0`,
prática que o próprio `INSTALL.md` de hoje já recomenda) nunca é forçado a
migrar — o pacote antigo continua instalável e continua rodando contra
projetos escritos na gramática antiga.

**A consequência que evita o problema do `README.pt-BR.md`** (§PRD-007: um
documento que descreve um estado que já passou) **é que isto não pode viver só
no `CHANGELOG.md`.** Changelog é histórico — alguém que instala pela primeira
vez em 2027 não lê seis versões de changelog antes de rodar `init`. A decisão
de convivência precisa estar onde quem está decidindo *agora* qual versão
instalar vai procurar, e esse lugar é o `INSTALL.md`.

**Isto é adicionado como item explícito do M6b** (§6), que já lista a reescrita
do `INSTALL.md` por outro motivo (o wrapper `./adp` e o aviso automático do
`upgrade`). Registrado aqui para que a reescrita do M6b não esqueça esta seção
por não ter sido nomeada na lista original — o mesmo cuidado que fez o
`DOC_FOSSIL` existir. Critério de aceite próprio, `AC-P16` (§7): o `INSTALL.md`
declara explicitamente que a 0.5.0 continua publicada e suportada, com o
comando exato para fixar versão, e não deixa essa informação implícita no
número da versão do pacote.

---

## 13. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| A 0.6 quebra tudo de novo, uma versão depois da 0.5 ter quebrado tudo | perda da base instalada e da credibilidade | M1 sai antes e sozinho: caminho de atualização existe **antes** da quebra |
| O baseline vira desculpa geral e a ferramenta para de significar algo | perda do ativo central | baseline só encolhe; `BASELINE_WIDENED` é erro; relatório mostra a dívida encolhendo ou não |
| A estimativa em PF é lida como promessa de prazo | conflito comercial com cliente | faixa em vez de número, fonte declarada, aviso de baixa aderência, e a frase "estimativa não é prova" no relatório |
| Alguém usa a tabela de cold start como base de contrato antes de qualquer calibração | prejuízo real, e a culpa cai na ferramenta | rótulo **sem calibração** impresso no relatório e no CSV; procedência (`cold-start`) em toda linha; a tabela nunca aparece sem os três pontos |
| As horas declaradas no fechamento são chutadas por preguiça, e a calibração fica pior que o cold start | a base empírica vira ruído com cara de dado | `HOURS_IMPLAUSIBLE` confronta a declaração com os sinais do ledger; toda declaração é atribuída e datada; o relatório mostra a dispersão entre fechamentos em vez de só a média |
| O fechamento vira formulário que ninguém preenche de verdade | o laço nunca fecha e a ferramenta fica com uma feature morta | o registro é curto e a maior parte dele é preenchida automaticamente; o único campo obrigatoriamente humano é o de horas |
| Histórico exportado leva dado de um cliente para o repositório de outro | vazamento causado pela própria ferramenta | anonimização por default na exportação; nome só com `--with-names`, que declara o que mantém |
| Alguém importa um histórico fabricado para justificar uma estimativa | número com aparência de evidência | importação é ato explícito; `imported: true` por registro; `adp estimate` reporta a composição da amostra |
| Uma migration corrompe ou trunca o `hours-history.jsonl` | perda irreversível — é o único artefato que não se recria | append-only; migration só acrescenta campo; backup obrigatório antes de tocar no arquivo |
| O multiplicador de conhecimento vira desculpa para não tentar nada novo | o time congela na stack que já domina | o motor **nunca declara inviável**; reporta lacuna e custo, e a decisão de seguir mesmo assim é registrada com o número que contrariou |
| O backlog vira depósito de tudo que ninguém quis decidir | o MVP fica artificialmente pequeno e o projeto real fica invisível | `PRD_UNPLACED` obriga escolha explícita; o backlog aparece no monitor com contagem, não escondido num arquivo que ninguém abre |
| A 0.6 publica com a documentação da 0.5 | a ferramenta comete o `DOC_FOSSIL` que ela audita, e perde autoridade para cobrá-lo | M6b é milestone próprio, não rabo do M7; a documentação entra no escopo do `DOC_FOSSIL` deste repositório |
| Os ~26 códigos novos entram sem mapeamento de gate | `test/gates.test.js` quebra, ou pior: um código não pertence a gate nenhum e fica invisível | a tabela código→gate→severidade é entregável do M2, **antes** do parser |
| O adiamento vira o desligamento de gate pela porta dos fundos | o vermelho perde significado e o produto perde a razão de existir | nunca vale para G0–G2; exige dono, motivo e prazo; vence sozinho; a contagem ativa é sempre impressa; o próprio mecanismo é auditado |
| O histórico exportado carrega identidade de pessoa entre clientes | tratamento de dado pessoal feito pela ferramenta, sem base legal e sem o usuário perceber | `id` é hash desde a gravação; a exportação não carrega identidade em nenhum modo; `role` calibra, identidade não |
| Cinco documentos por PRD viram burocracia e as pessoas param de usar | abandono | **a matriz de cerimônia (§2.5) é a mitigação principal** — feature pequena vai direto para SPEC + tarefas; RFC condicional (§2.3); `--minimal` continua existindo; medir no `.exemplo/` quanto texto uma feature pequena custa |
| Os novos achados de qualidade (`STRAW_OPTION`, `DOC_TOO_LONG`) geram falso positivo e viram ruído | perda de confiança no vermelho | entram como **warning**, não erro; só `CONTEXT_WITHOUT_NUMBERS`, `OPTION_DO_NOTHING_MISSING` e `PRD_WITH_SOLUTION` nascem como erro, porque são binários |
| Arqueologia inventa um SCOPE plausível e errado | especificação bonita que não descreve o sistema | saída sempre em `Draft`; G0 exige assinatura humana; toda afirmação inferida cita o arquivo de origem em `project_old_artifacts/` |
