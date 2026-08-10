# agent-dev-pipeline

*[English](README.md) · Português*

**A especificação que continua verdadeira.**

A maior parte das ferramentas de spec-driven é *spec-first*: a especificação gera
o código, o código evolui, e em duas semanas a especificação é ficção bem
formatada. Esta é *spec-anchored*: a especificação é audited mecanicamente
contra o código, o tempo todo, e **o veredito é um exit code, não uma
afirmação**.

Zero dependências de runtime. Node ≥ 24 e `git`. Nada a instalar: roda pelo `npx`
e não deixa nada para trás.

```
SCOPE ──▶ PRD ──▶ RFC ──▶ DESIGN ──▶ SPEC ──▶ código ──▶ teste ──▶ auditoria
  G0      G1      G2       G3         G4                  G5         G6
o que    o quê,  qual     como, em    a camada            está     ainda
foi      pra     caminho  detalhe     que a máquina       provado  concordam
acordado quem,                       confere
         por quê
```

---

## Comece por aqui

```sh
cd ~/meu-projeto && git init

npx @codryx/agent-dev-pipeline init     # instala tudo o que está abaixo
```

Depois crie um alias, porque você vai digitar isso o dia inteiro:

```sh
alias adp='npx @codryx/agent-dev-pipeline'

adp new matricula-aluno
adp status              # sete luzes
adp monitor             # a página somente leitura
```

Não existe outra rota de instalação, e não há o que desinstalar. O `npx` baixa um
pacote pequeno e o executa; nada é adicionado ao seu projeto e nenhum
`node_modules` aparece nele. Veja o [`INSTALL.md`](INSTALL.md) — inclusive por que
fixar a versão no CI.

Ou leia um projeto pronto: **[`.exemplo/`](.exemplo/)** é um projeto completo e
executável que chega a um `audit --ci` limpo em três comandos — `trust`, `verify`,
`audit`. Ele chega **sem prova, de propósito**: prova não é um arquivo que alguém
te entrega, é o resultado de rodar os testes na sua máquina. O README dele lista
quatro maneiras de quebrá-lo, para você ver cada gate disparar.

---

## Os sete gates

Um gate é **verde** quando nada sob sua responsabilidade falhou, **vermelho**
quando algo falhou, e **bloqueado** quando um gate anterior está vermelho.
Bloqueado é um terceiro estado de propósito: "ainda não chegamos lá" não é a
mesma coisa que "isto está errado", e tratar os dois igual manda as pessoas
corrigirem consequências em vez de causas.

| Gate | Pergunta | Passa quando |
|---|---|---|
| **G0** | O escopo está acordado? | `.spec/SCOPE.md` diz `Approved` |
| **G1** | O quê, para quem, por quê? | o PRD existe e sua linha `feature:` bate com o diretório |
| **G2** | Qual caminho? | toda decisão registra ≥2 alternativas e uma escolhida |
| **G3** | Como, em detalhe? | o documento de design existe |
| **G4** | É implementável? | toda história tem um critério, todo critério tem Given/When/Then, todo critério é coberto por uma tarefa, toda referência resolve, nenhuma questão bloqueante em aberto |
| **G5** | Está provado? | todo critério tem um teste que PASSOU |
| **G6** | Ainda concordam? | sem testes órfãos, sem "concluída" não provada, sem princípio violado |

**O exit code é o gate que falhou.** `0` limpo, `1`–`7` para G0–G6. Um pipeline
descobre *onde* quebrou só pelo status, sem nada para parsear.

Apenas os achados do primeiro gate vermelho são impressos. Num projeto cujo PRD
ainda não foi escrito, imprimir todos enterraria a única coisa a fazer agora sob
dezenas de consequências dela mesma.

---

## Os quatro documentos

Cada um é dono de uma família distinta de códigos de rastreabilidade, então todo
código tem exatamente um lugar de definição e a detecção de duplicatas
significa alguma coisa. Os códigos são únicos **no projeto inteiro**, não por
arquivo.

| Documento | Responde | É dono de |
|---|---|---|
| `PRD.md` | **o quê**, para **quem**, **por quê** | só prosa — nenhum código próprio |
| `RFC.md` | **qual caminho**, entre os possíveis | decisões `D-xxx`, cada uma com alternativas e uma escolha |
| `DESIGN.md` | **como**, em detalhe — o projeto que um humano lê | só prosa — nenhum código próprio |
| `SPEC.md` | **o que a máquina confere** | histórias `US-xxx` · critérios `AC-xxx` · premissas `ASM-xxx` · questões em aberto `Q-xxx` · tarefas `T-xxx`, cada uma declarando `Refs:`, `Files:` e opcionalmente `Reads:` e `Depends on:` |

Quatro documentos em vez de um porque as perguntas que eles respondem têm
públicos e tempos de vida diferentes: *o quê e por quê* muda quando o negócio
muda, *qual caminho* quando as restrições mudam, *como* raramente, e *o que a
máquina confere* toda vez que uma tarefa é escrita ou um teste é acrescentado.
PRD e RFC continuam prosa que um dono de produto e um revisor leem sem
tropeçar em código; SPEC é a camada que existe só para ser conferida.

### A cadeia, e por que ela se sustenta

```
US-001 ──dono de──▶ AC-001 ◀──Refs──  T-001 ──Files──▶ src/coisa.js
                       ▲                                        │
                       └───── @spec:AC-001 no título do teste ───┘
```

Corte qualquer elo e um gate fica vermelho nomeando o elo que você cortou. A
anotação vai no **título do teste**, não num comentário, porque o título
sobrevive até a saída do reporter de qualquer runner — é isso que permite a um
único scanner atender `pytest` e `vitest` sem conhecer nenhum dos dois.

### A regra sobre a qual tudo se apoia

**Você não pode declarar uma tarefa concluída.** `[done]` com um critério
não provado é `TASK_DONE_WITHOUT_PROOF`, um erro. Quem decide é o runner de
testes, e **um teste skipado nunca é prova**. Essa recusa é o produto; todo o
resto é andaime em volta dela.

---

## A constituição realmente executa

`.spec/CONSTITUTION.md` guarda princípios `P-xxx` em `[MUST]`, `[SHOULD]` ou
`[MAY]`. Todo `[MUST]` precisa de uma verificação executável, numa de quatro
formas:

```markdown
## P-002 [MUST] Segredos nunca no código-fonte

- verification(forbidden): `(password|secret)\s*[:=]\s*['"][^'"]{8,}` in `src/**`
- verification(required): `import hvac` in `src/core/vault.py`
- verification(test): @principle:P-002
- verification(gate): revisado por um humano — declara, não prova nada
```

As regexes **executam**. Um `[MUST]` sem nada verificável por máquina é
`PRINCIPLE_WITHOUT_VERIFICATION`. Um glob que não casa com arquivo nenhum é
`GLOB_WITHOUT_FILES`, porque uma checagem que não pode falhar é idêntica a uma
checagem que passou — o tipo mais caro de luz verde que existe.

Esses padrões vêm do seu projeto, ou seja, são regexes arbitrárias escritas por
um humano. `(a+)+$` contra a entrada errada faz backtracking catastrófico. Elas
rodam num **subprocesso descartável com timeout rígido**, então um padrão
patológico vira um achado em vez de travar o gate para sempre.

---

## O que o `adp init` instala

Tudo o que um projeto precisa vive em `payload/` e é copiado para dentro.
**Nada é sobrescrito nunca**: toda escrita passa por um caminho de criar-somente-
se-não-existir, então rodar `init` de novo depois de você ter editado tudo é
seguro, e o relatório diz o que ele *manteve* em vez de pedir que você confie.
É também por isso que atualizar não precisa de passo de migração — a ferramenta
nunca supõe que foi ela quem escreveu o que está no disco.

| Instalado | O que é |
|---|---|
| `.spec/SCOPE.md`, `CONSTITUTION.md` | o acordo e as regras, a partir de templates |
| `.spec/CHANGELOG.md`, `BEST_PRACTICES.md`, `TROUBLESHOOTING.md` | memória de processo — como a próxima sessão começa mais esperta que esta |
| `.spec/STACK.md`, `STRUCTURE.md` | como buildar, rodar e testar sem adivinhar |
| `AGENTS.md` | o contrato que toda IA lê primeiro |
| `docs/USAGE.md`, `DEPLOYMENT.md` | documentação de produto, para humanos e não para agentes |
| `.claude/skills/**` | 15 skills, incluindo `adp` e `create-rfc` |
| `.claude/agents/**` | 8 agentes de papel: analista, arquiteto, tech lead, backend, frontend, designer, segurança, testador |
| `.claude/hooks/**` | auto-format, scanner de segredos, persistência de contexto |
| `adp.config.json` | caminhos, comando de teste, porta, modo de entrega |

Flags reduzem o pacote: `--minimal` instala só `.spec/` e a skill do próprio
motor; `--no-roles`, `--no-docs`, `--no-memory`, `--no-skills`,
`--no-agents-md` pulam uma parte cada. `--agent claude|cursor|codex|antigravity|none`
escolhe o harness; sem isso ele é detectado pelos diretórios já presentes, e um
projeto ambíguo é **avisado**, não chutado.

> **Uma armadilha que vale conhecer.** O Claude Code lê `.claude/skills/` — no
> plural. Um diretório `.claude/skill/` parece certo, é fácil de criar na mão, e
> silenciosamente nunca é carregado. O instalador sempre escreve a forma plural,
> e avisa se encontrar a singular largada por aí.

### As skills

`adp` é o contrato do agente com o motor: o vocabulário, as regras
inegociáveis, o catálogo de achados traduzido, e um limite explícito de três
tentativas para que um gate vermelho escale para um humano em vez de entrar em
loop eterno.

`create-rfc` (Tech Leads Club, CC-BY-4.0) escreve o registro de decisão —
opções com prós e contras de verdade, critérios de decisão ponderados, RACI,
desfecho. **O motor lê a saída dela nativamente**, sem passo de conversão:
títulos `### Option 1:` são as alternativas, e um marcador `⭐` ou uma linha de
decisão em `## Outcome` é a escolha. Premissas e questões em aberto pertencem
ao `SPEC.md`, não aqui — codifique-as como `ASM-001` em vez de um `1` solto.
Veja
[`payload/claude/skills/create-rfc/INTEGRATION.md`](payload/claude/skills/create-rfc/INTEGRATION.md).

As outras treze cobrem desenvolvimento orientado a testes, implementação
incremental, debugging, trabalho de front-end, documentação, arquivos de
memória, limpeza de worktree, fluxo no GitHub e kickoff de projeto.

---

## Estrutura

```
src/                 O MOTOR — este é o projeto
  cli.js               despacho de comandos, em três anéis de custo
  config.js            tudo com default; roda sem arquivo de config
  parsers/             prd · rfc · spec · design · constitution · annotations
  core/                project · audit · principles · gates · init · report
  util/                text · glob
bin/adp.js           o comando
  server/              servidor http somente leitura + projeção de estado
  ui/                  index.html · app.css · app.js, inlinados na resposta
scripts/             build-manifest.js — o manifesto SHA-256 do payload
.github/workflows/   ci, e publicação com provenance via OIDC
test/                197 testes, node:test, sem framework
payload/             O QUE É INSTALADO — templates, AGENTS.md, skills, agentes, hooks, docs
.exemplo/            um projeto pronto, verde e executável para ler e quebrar
ARCHITECTURE.md      por que o motor é como é — leia antes de mudá-lo
INSTALL.md           a única rota de instalação, e por que fixar versão no CI
```

A separação que importa: **o que a ferramenta *é* vive em `src/`; o que a
ferramenta *instala* vive em `payload/`.** Nada finge ser as duas coisas, e é
por isso que a raiz do repositório é limpa e o `init` não tem casos especiais.

`src/core/` não toca em I/O além de ler os documentos: recebe um projeto e
devolve achados. O `src/cli.js` os renderiza, o `--json` os serializa, e nenhum
dos dois consegue chegar a uma conclusão que o outro não chegaria. Manter o
veredito num lugar só é o que faz o número que o seu pipeline lê e o texto que
você lê serem o mesmo veredito, em vez de duas implementações que concordam hoje.

---

## Comandos

```sh
adp init [--agent <nome>] [--minimal]   monta o projeto
adp new <feature>                       cria PRD.md, RFC.md, DESIGN.md, SPEC.md
adp status                              sete luzes
adp audit [--ci] [--json]               achados por trás do primeiro gate vermelho
adp gates [--list]                      os gates e seus estados
adp prompt [<gate>]                     texto pronto para colar na sua IA
adp monitor [--port <n>]                a página somente leitura
adp doctor                              verifica esta cópia contra o manifesto
adp trust [--revoke]                    aprova o testCommand deste projeto
```

(O `Makefile.txt` embrulha isso para quem trabalha *no* motor — renomeie para
`Makefile` se for desenvolver a ferramenta. Usar a ferramenta não precisa de
`make`.)

### Em CI

```yaml
- run: npx @codryx/agent-dev-pipeline@0.4.0 audit --ci
```

`--ci` promove os achados mais brandos — critérios não provados, prova
desatualizada, questões em aberto, critérios não cobertos, arquivos-fonte órfãos
— de avisos para erros. Um motor, duas posturas: silencioso o bastante para se
trabalhar sob ele, rígido o bastante para ser um portão.

Fixe a versão no CI. Sem fixar, o `npx` roda o que foi publicado por último, ou
seja, o portão que guarda o seu repositório pode mudar sem um commit — constrangedor
para uma ferramenta cujo trabalho é produzir evidência.

```yaml
- run: npx @codryx/agent-dev-pipeline@0.4.0 audit --ci
```

---

## O monitor

```sh
adp monitor          # http://127.0.0.1:7788
```

Uma página com os sete gates, os achados por trás do primeiro vermelho e o
progresso de cada feature. Ela é **somente leitura por construção** — não por
política.

Qualquer método que não seja `GET` ou `HEAD` é recusado com 405 **antes mesmo de
o caminho ser examinado**, então acrescentar uma rota depois não abre caminho de
escrita por acidente. Nenhum corpo de requisição é lido. O arquivo do servidor
não contém chamada de escrita alguma, e há um teste que afirma isso em vez de
confiar no comentário.

É essa única propriedade que torna a página segura perto de trabalho em
andamento: ela não consegue corromper um documento, então não há conflito a
resolver quando você e a sua IA editam o mesmo arquivo, nem checagem de versão,
nem protocolo de edição. Você edita onde sempre editou; a página reflete em
poucos segundos.

**Ela não pode afetar o projeto que observa.** A ferramenta tem zero dependências
e vive fora do seu repositório — nada é adicionado ao seu `package.json`, nenhum
`node_modules` aparece, não há passo de build nem artefato. A telemetria fica no
diretório de estado, fora do repo. Os dois pontos de contato reais estão
tratados: a porta é configurável e uma porta já ocupada **falha alto e não sobe
nada**, em vez de mudar em silêncio, e não existe caminho de escrita.

O bind é loopback e não há autenticação, então o endereço é a fronteira — e uma
requisição cujo `Host` não seja um nome de loopback é recusada, porque só fazer
bind não impede DNS rebinding através do seu próprio navegador.

---

## Cadeia de suprimentos

Este pacote escreve **hooks shell executáveis** e **instruções para a IA** dentro
do seu repositório, onde eles ficam. É um raio de alcance maior que o de uma
dependência comum, então recebe defesas proporcionais — e cada uma vem com o que
ela **não** cobre, porque defesa anunciada além do alcance é a mesma falha que
uma checagem que não pode falhar.

| Defesa | Cobre | Não cobre |
|---|---|---|
| **Zero dependências** | typosquatting, comprometimento transitivo, engenharia social num mantenedor | qualquer coisa dentro deste pacote |
| **Sem scripts de instalação** | código rodando na sua máquina no `npm install` | código que você roda de propósito |
| **Trusted publishing** (OIDC, sem token guardado) | token de publicação roubado — como pacotes npm costumam cair | um repositório comprometido |
| **`--provenance`** | tarball que não veio desta origem | commit malicioso, perfeitamente atestado |
| **`payload/MANIFEST.json`** | adulteração pós-publicação, mirror ruim, cópia local editada, drift | publicação maliciosa — o atacante controla o manifesto também |
| **Consentimento p/ `testCommand`** | clonar um repo hostil e rodar o código dele | um comando que você aprovou de propósito |
| **Guarda de caminho no `init`** | escrita escapando do diretório do projeto | — |
| **Nunca sobrescreve** | seu hook editado sendo trocado em silêncio | — |

Para conferir a cópia que você tem, e de onde ela veio:

```sh
adp doctor              # payload bate com o manifesto que veio junto
adp trust               # lê e aprova o testCommand antes que ele rode
npm audit signatures    # o pacote veio da origem declarada
```

O `init` verifica o payload **antes de escrever qualquer coisa**, e uma falha é
fatal, sem flag de override. Manifesto ausente é só aviso — rodar a partir de uma
árvore de trabalho é estado normal, e recusar ali só ensinaria as pessoas a
procurar o atalho.

Cada uma dessas defesas é um princípio `P-xxx` em `.spec/CONSTITUTION.md` com
verificação executável, então a ferramenta audita a própria blindagem e o G6 fica
vermelho se alguém enfraquecer. Isso não é enfeite: o primeiro draft do padrão
proibido do P-008 casou com a palavra `NODE_AUTH_TOKEN` no comentário que
explicava que esse token não existe, e a auditoria pegou.

---

## Em que ponto isto está

Construído e testado: o motor, os sete gates, a constituição executável, o
instalador, os templates, as skills, o monitor somente leitura e o exemplo completo.
**197 testes**, cada um carregando sua anotação `@spec:AC-xxx` ou `@principle:P-xxx` — a
ferramenta se prova com o próprio mecanismo.

A especificação deste próprio repositório, em
`.spec/features/agent-dev-pipeline/`, ainda está escrita na gramática 0.5.0
(PRD/RFC/TDD) e é auditada pela versão 0.5.0 fixada — a ferramenta faz o
bootstrap da própria versão seguinte na gramática que a versão atual lê, e
troca de chave quando o novo parser passa nos próprios testes. Veja
`.spec/SCOPE-0.6.0.md` para a versão que introduziu a cadeia PRD/RFC/DESIGN/SPEC
descrita acima.

Especificado e depois **removido**: o monitor no navegador — um servidor, um
kanban projetado, um editor de documentos. Eram oito tarefas de interface para um
operador que já está sentado num terminal. O raciocínio, e as alternativas
pesadas contra ele, ficaram registrados como D-011 em vez de apagados, para que a
próxima pessoa que propuser uma página encontre o argumento em vez de repeti-lo.

Uma consequência que dá para observar em `.exemplo/`: as três tarefas dele dizem
`[done]`, e essa palavra não vale nada até o `verify` rodar. Apague o registro
de prova e as três passam a reportar `TASK_DONE_WITHOUT_PROOF` — o status
continua exatamente onde foi escrito, e o motor simplesmente para de acreditar.

---

## Créditos

O design do motor descende de
[onp-spec-driven](https://github.com/onovoprogramador/onp-spec-driven), de Vitor
Manoel (MIT): a gramática markdown, o catálogo de achados, a prova que recusa
skips, e a busca de padrões em sandbox.

A doutrina de operação descende de
[bridge-commander](https://github.com/tonylampada/bridge-commander), de Tony
Lampada — incluindo a frase sobre a qual todo o board se apoia: *o estado do
board é a verdade, a memória da conversa é cache*.

`create-rfc` é do [Tech Leads Club](https://github.com/tech-leads-club),
CC-BY-4.0.

O raciocínio por trás de cada empréstimo, e as alternativas rejeitadas, está
registrado em `.spec/features/agent-dev-pipeline/RFC.md` — D-001 até D-010.
