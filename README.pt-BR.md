# agent-dev-pipeline

*[English](README.md) · Português*

**A especificação que continua verdadeira.**

A maioria das ferramentas *spec-driven* é *spec-first*: a especificação gera
código, o código evolui, e em duas semanas a especificação virou ficção bem
formatada. Esta é *spec-anchored*: a especificação é auditada mecanicamente
contra o código, o tempo todo, e **o veredito é um exit code, não uma
alegação**.

Zero dependências em runtime. Node ≥ 24 e `git`. Nada para instalar: roda a
partir do `npx` e não deixa rastro.

```
SCOPE ──▶ PRD ──▶ RFC ──▶ DESIGN ──▶ SPEC ──▶ código ──▶ teste ──▶ audit
  G0      G1      G2       G3         G4                  G5       G6
o que      o quê,  qual     como,      a camada            está     ainda
combinamos p/quem, caminho  em         que a               provado  concordam
           por quê          detalhe    máquina confere
```

---

## Comece aqui

```sh
cd ~/meu-projeto && git init

npx @codryx/agent-dev-pipeline init     # instala tudo abaixo
```

O `init` escreve um `./adp` executável (e `adp.cmd` no Windows) **dentro do
projeto**, fixado na versão exata que o instalou — nenhum alias para
configurar na mão, e ele já resolve a fixação de versão do CI de brinde:

```sh
./adp new matricula-de-aluno
./adp status              # sete luzes
./adp monitor             # a página somente leitura
```

Quer também um `adp` solto no seu `PATH`? `./adp init --shell-alias`
acrescenta um bloco marcado e removível ao seu arquivo de rc do shell — é
opt-in, e pede confirmação antes de escrever qualquer coisa fora do
projeto, a mesma postura que `adp trust` já tem antes de rodar qualquer
coisa de dentro dele.

Não existe outra rota de instalação, e nada para desinstalar. O `npx` busca
um pacote pequeno e o executa; nada é adicionado ao seu projeto e nenhum
`node_modules` aparece nele. Veja [`INSTALL.md`](INSTALL.md) — inclusive por
que fixar a versão no CI, e como a ferramenta continua instalável na versão
que você fixou depois que uma nova for publicada.

Ou leia um projeto pronto em vez disso — dois, na verdade, um para cada
porta de entrada: **[`.exemplo/`](.exemplo/)** é um projeto completo e
executável que chega a um `audit --ci` limpo em três comandos — `trust`,
`verify`, `audit`. Ele chega **sem prova, de propósito**: prova não é um
arquivo que alguém te entrega, é o resultado de rodar os testes na sua
máquina. O README dele lista oito formas de quebrá-lo para você ver cada
gate disparar, e percorre uma estimativa em Ponto de Função recalibrada por
um `adp close` de verdade. **[`.exemplo-legado/`](.exemplo-legado/)** é a
outra porta: um código pequeno, real e pré-existente — testes parciais, um
ADR solto, uma spec que já derivou do código — adotado com `adp init
--brownfield`. O [`START-HERE.md`](.exemplo-legado/START-HERE.md) dele
percorre o escaneamento de reconhecimento, o baseline e o mecanismo de
ratchet que mantém o primeiro audit de um projeto legado em poucas linhas,
não num muro.

---

## Os sete gates

Um gate está **verde** quando nada do que ele possui falhou, **vermelho**
quando algo falhou, **bloqueado** quando um gate anterior está vermelho, e
**n/a** quando a matriz de cerimônia diz que ele não é devido. Quatro
estados, não dois, de propósito: "ainda não chegamos lá" não é o mesmo que
"isto está errado", e "não exigido neste tamanho" não é o mesmo que nenhum
dos dois — tratá-los como iguais manda as pessoas corrigirem consequências
em vez de causas, ou escreverem um documento que ninguém precisa.

| Gate | Pergunta | Passa quando |
|---|---|---|
| **G0** | O escopo está combinado? | `.spec/SCOPE.md` diz `Approved` |
| **G1** | O quê, para quem, por quê? | o PRD existe, sua linha `feature:` bate com o diretório, e ele está listado no checklist de MVP do `SCOPE.md` |
| **G2** | Qual caminho? | toda decisão registra ≥2 alternativas e uma escolhida — `n/a` abaixo de cerimônia rfc-first |
| **G3** | Como, em detalhe? | o documento de design existe — `n/a` em cerimônia leve |
| **G4** | É implementável? | toda história tem critério, todo critério tem Given/When/Then, todo critério é coberto por uma tarefa, toda referência resolve, nenhuma questão bloqueante em aberto |
| **G5** | Está provado? | todo critério tem um teste que PASSOU |
| **G6** | Ainda concordam? | nenhum teste órfão, nenhum "concluído" sem prova, nenhum princípio violado |

**O exit code é o gate que falhou.** `0` limpo, `1`–`7` para G0–G6. `n/a`
nunca define o exit code — G4, G5 e G6 são avaliados independentemente do
que G2/G3 leem. Um pipeline aprende *onde* quebrou só olhando o status, sem
parsear nada.

**Nem toda feature deve a mesma cerimônia.** A linha `> signals:` do PRD
declara quais de cinco coisas são verdadeiras sobre ela —
`multiple-teams`, `hard-to-reverse`, `money-or-pii`, `new-tech`,
`large-estimate` — e um nível é computado a partir disso, nunca escrito à
mão: nenhum sinal declarado significa SPEC e tarefas direto (G2/G3 ambos
`n/a`); um sinal mais leve significa um DESIGN leve devido; uma decisão
aberta entre times significa RFC-first; dinheiro ou dado pessoal significa
a cadeia completa. `adp new <feature> --signals <lista>` gera só o que o
nível computado precisa, e `adp status` reporta o nível e os sinais por
feature.

**Todo PRD está no MVP ou em lugar nenhum.** O checklist "MVP
(prioritized)" do `SCOPE.md` nomeia features por slug — `- [ ] <slug-da-
feature> — descrição` — e um PRD cujo slug está ausente ali é
`PRD_UNPLACED` (G1). O que ainda não começou pertence ao `BACKLOG.md`:
prosa simples, um item por linha, deliberadamente sem código de rastreio —
só um PRD promovido ganha um. Um item que já parece um código real
(`AC-002`, `T-003`, ...) é `BACKLOG_ITEM_WITH_CODE`, um warning. Para
promover um item: remova a linha, rode `adp new <slug-da-feature>`,
acrescente o slug ao checklist — nenhum comando dedicado para isso.

Só os achados do primeiro gate vermelho são impressos. Para um projeto cujo
PRD ainda não foi escrito, imprimir todos eles enterraria a única coisa a
fazer a seguir sob dezenas das suas próprias consequências.

---

## Os quatro documentos

Cada um possui uma família distinta de códigos de rastreabilidade, então
todo código tem exatamente um lugar de definição e detecção de duplicata
realmente significa algo. Códigos são únicos **em todo o projeto**, não por
arquivo.

| Documento | Responde | Possui |
|---|---|---|
| `PRD.md` | **o quê**, para **quem**, **por quê** | nada de seu — uma linha `rfcs:` no cabeçalho liga o(s) arquivo(s) `RFC-xxx` de que depende |
| `RFC.md` | **qual caminho**, entre os possíveis | decisões `D-xxx`, cada uma com alternativas e uma escolha |
| `DESIGN.md` | **como**, em detalhe — o blueprint que um humano lê | só prosa — nenhum código próprio |
| `SPEC.md` | **o que a máquina confere** | histórias `US-xxx` · critérios `AC-xxx` · suposições `ASM-xxx` · questões abertas `Q-xxx` · tarefas `T-xxx`, cada uma declarando `Refs:`, `Files:` e opcionalmente `Reads:` e `Depends on:` |

`RFC.md` é plano e global, em `.spec/rfc/RFC-<NNN>-<slug>.md` — não
aninhado sob uma feature. Uma RFC pode servir várias PRDs, e uma PRD
costuma precisar de várias, uma por porta de mão única (Q-001); um arquivo
irmão fixo não conseguiria expressar isso. Crie uma com `adp new --rfc
<slug>`.

Quatro documentos em vez de um porque as perguntas que respondem têm
audiências e ciclos de vida diferentes: *o quê e por quê* muda quando o
negócio muda, *qual caminho* quando as restrições mudam, *como* raramente,
e *o que a máquina confere* toda vez que uma tarefa é escrita ou um teste é
adicionado. PRD e RFC continuam prosa que um dono de produto e um revisor
leem sem tropeçar em código; SPEC é a camada que existe só para ser
conferida.

### A cadeia, e por que ela se sustenta

```
US-001 ──possui──▶ AC-001 ◀──Refs──  T-001 ──Files──▶ src/coisa.js
                      ▲                                        │
                      └────── @spec:AC-001 no título do teste ──┘
```

Corte qualquer elo e um gate fica vermelho nomeando o elo cortado. A
anotação vai no **título do teste**, não em um comentário, porque um
título sobrevive na saída de qualquer reporter — o que permite que um
único scanner sirva `pytest` e `vitest` sem conhecer nenhum dos dois.

### A regra sobre a qual tudo se apoia

**Você não pode declarar uma tarefa concluída.** `[done]` com um critério
não provado é `TASK_DONE_WITHOUT_PROOF`, um erro. Quem decide é o test
runner, e **um teste pulado nunca é prova**. Essa recusa é o produto; todo
o resto é andaime ao redor dela.

---

## A constituição realmente roda

`.spec/CONSTITUTION.md` guarda princípios `P-xxx` em `[MUST]`, `[SHOULD]`
ou `[MAY]`. Todo `[MUST]` precisa de uma verificação executável, em uma de
quatro formas:

```markdown
## P-002 [MUST] Segredos nunca no código-fonte

- verification(forbidden): `(password|secret)\s*[:=]\s*['"][^'"]{8,}` em `src/**`
- verification(required): `import hvac` em `src/core/vault.py`
- verification(test): @principle:P-002
- verification(gate): revisado por um humano — declara, não prova nada
```

As regexes **executam**. Um `[MUST]` sem nada verificável por máquina é
`PRINCIPLE_WITHOUT_VERIFICATION`. Um glob que não casa com nenhum arquivo é
`GLOB_WITHOUT_FILES`, porque uma checagem que não pode falhar parece
exatamente uma checagem que passou — o tipo mais caro de luz verde que
existe.

Esses padrões vêm do seu projeto, o que significa que são regexes
arbitrárias escritas por um humano. `(a+)+$` contra a entrada errada
retrocede catastroficamente. Eles rodam em um **subprocesso descartável com
timeout rígido**, então um padrão patológico degrada para um achado em vez
de travar o gate para sempre.

---

## O que o `adp init` instala

Tudo que um projeto precisa mora em `payload/` e é copiado para dentro.
**Nada nunca é sobrescrito**: toda escrita passa por um caminho de
criar-só-se-ausente, então rodar `init` de novo depois de você ter editado
tudo é seguro, e o relatório diz o que *manteve* em vez de pedir para você
confiar. É também por isso que atualizar não precisa de nenhum passo de
migração — a ferramenta nunca assume que escreveu o que está no disco.

| Instalado | O que é |
|---|---|
| `./adp`, `adp.cmd` | o wrapper, fixado na versão instalada — nunca sobrescrito |
| `.spec/SCOPE.md`, `CONSTITUTION.md`, `BACKLOG.md` | o acordo, as regras, e o que ficou fora da fronteira do MVP |
| `.spec/CHANGELOG.md`, `BEST_PRACTICES.md`, `TROUBLESHOOTING.md` | memória de processo — como a próxima sessão começa mais esperta que esta |
| `.spec/STACK.md`, `STRUCTURE.md` | como buildar, rodar e testar sem adivinhar |
| `.spec/metrics/hours-per-fp.json`, `fp-weights.json` | a tabela de horas de cold-start que `adp estimate` lê, e o que `adp close` recalibra ao registrar resultados reais |
| `AGENTS.md` | o contrato que toda IA lê primeiro |
| `docs/USAGE.md`, `DEPLOYMENT.md` | documentação de produto, para humanos, não para agentes |
| `.claude/skills/**` | 15 skills, incluindo `adp` e `create-rfc` |
| `.claude/agents/**` | 8 agentes de papel: analyst, architect, tech lead, backend, frontend, designer, security, tester |
| `.claude/hooks/**` | auto-format, scanner de segredos, persistência de contexto |
| `adp.config.json` | caminhos, comando de teste, porta, modo de entrega |

Flags reduzem isso: `--minimal` instala só `.spec/` e a skill própria da
ferramenta; `--no-roles`, `--no-docs`, `--no-memory`, `--no-skills`,
`--no-agents-md` pulam uma parte cada. `--agent
claude|cursor|codex|antigravity|none` escolhe o harness; do contrário ele é
detectado a partir dos diretórios já presentes, e um projeto ambíguo é
**avisado**, não decidido no palpite. `--brownfield` escaneia um código já
existente atrás de arquivos com cara de documentação e escreve
`.spec/BASELINE.md` — somente leitura, nada é movido ou reescrito; veja
[Adotando um projeto existente](#adotando-um-projeto-existente) abaixo.

> **Uma pegadinha que vale saber.** O Claude Code lê `.claude/skills/` — no
> plural. Um diretório `.claude/skill/` parece certo, é fácil de criar à
> mão, e nunca é carregado, silenciosamente. O instalador sempre escreve a
> forma plural, e avisa se encontra a singular por aí.

### As skills

`adp` é o contrato do agente com o motor: o vocabulário, as regras
inegociáveis, o catálogo de achados traduzido, e um teto explícito de três
tentativas para que um gate falhando escale para um humano em vez de
entrar em loop para sempre.

`create-rfc` (Tech Leads Club, CC-BY-4.0) escreve o registro de decisão —
opções com prós e contras genuínos, critérios de decisão ponderados, RACI,
desfecho. **O motor lê a saída dela nativamente**, sem passo de conversão:
cabeçalhos `### Option 1:` são as alternativas, e um marcador `⭐` ou uma
linha de decisão em `## Outcome` é a escolha. Suposições e questões
abertas pertencem ao `SPEC.md`, não aqui — codifique-as como `ASM-001` em
vez de um `1` solto. Veja
[`payload/claude/skills/create-rfc/INTEGRATION.md`](payload/claude/skills/create-rfc/INTEGRATION.md).

As outras treze cobrem desenvolvimento orientado a testes, implementação
incremental, depuração, trabalho de front-end, documentação, arquivos de
memória, limpeza de worktree, GitHub flow e kickoff de projeto.

---

## Adotando um projeto existente

`adp init --brownfield` reconhece um código que já existe em vez de tratá-
lo como se fosse novo. Ele escaneia atrás de arquivos com cara de
documentação — `README*`, `docs/**`, `adr/**`, specs OpenAPI, migrations,
`CHANGELOG*`, `CONTRIBUTING*` — e **imprime o que encontrou; nada é movido
ou reescrito**. O que ele escreve é `.spec/BASELINE.md`: o commit atual e
os arquivos-fonte que já existiam, para que a auditoria consiga distinguir
dívida herdada de dívida nova.

Um arquivo nomeado no baseline continua **warning**, isento de escalada
sob `--ci`, enquanto estiver intocado desde aquele commit — uma edição real
(mesmo sem commit) passa a dever a mesma checagem em força total de
qualquer arquivo novo, a partir daquele momento. A lista só encolhe, por
design; fazê-la crescer de volta é um achado por si só. É isso que mantém
o primeiro `adp audit` de um repositório legado **legível** — algumas
dezenas de linhas reais, não um muro.

O papel `archaeologist` lê o inventário de reconhecimento e o próprio
código e propõe um `SCOPE.md` em `Draft`, cada afirmação citando o arquivo
de origem — um ponto de partida para o humano dono do escopo, nunca um
acabado. Arquivar a documentação antiga em `project_old_artifacts/` está
deliberadamente não construído ainda: é o único passo em toda esta
ferramenta que moveria um arquivo real do usuário, e sai sozinho quando
existir, não junto com a metade segura e somente-leitura.

Veja isso acontecer contra um código legado pequeno e real em
[`.exemplo-legado/`](.exemplo-legado/) — reconhecimento, o arqueólogo, o
baseline e o ratchet, cada um com seu próprio comando e saída reais.

## Convivendo com um achado real de propósito

Nem todo achado real é corrigido hoje, e a resposta honesta para isso não é
"bloquear tudo" nem uma chave escondida que desliga um gate.
`.spec/DEFERRALS.md` — opcional, do projeto inteiro — registra uma
**decisão datada e com dono** de conviver com um achado específico por um
tempo:

```markdown
## DEF-001 — suíte legada sai junto com a migração de faturamento

- Finding: TEST_ORPHAN
- Scope: test/legacy/**
- Owner: alice
- Reason: a suíte antiga sai junto com a migração de faturamento
- Opened: 2026-08-05
- Until: 2026-11-03
```

Seis regras impedem que isto vire uma segunda forma de desligar um gate: só
achados que descrevem o mundo mudando debaixo de um documento — G5/G6 — são
elegíveis, e dez deles (prova, e as decisões das quais nada deveria se
desviar) nunca são; um `Scope:` largo demais, um `Until:` longe demais, um
`Owner:`/`Reason:`/`Until:` ausente, ou três renovações da mesma entrada
ganham cada um o seu próprio achado. Um adiamento vencido volta à
severidade plena sozinho — ninguém precisa lembrar de notar — e a contagem
de adiados ativos é sempre impressa ao lado do verde e do vermelho, nunca
somada em silêncio. `--ci` continua honrando um adiamento válido; `adp
audit --strict` ignora `DEFERRALS.md` inteiramente, para a rodada que
mostra o estado real de qualquer forma.

---

## Layout

```
src/                 O MOTOR — este é o projeto
  cli.js               despacho de comandos, em três anéis de custo
  config.js            tudo com default; roda sem nenhum arquivo de config
  parsers/             prd · rfc · spec · design · constitution · backlog · baseline · deferrals · annotations
  core/                project · audit · principles · gates · ceremony · init
                        estimate · count · closure · history · plan · executor
                        ledger · resume · trust · upgrade · report(-html)
  util/                text · glob
bin/adp.js           o comando
  server/              servidor http somente leitura + projeção de estado
  ui/                  index.html · app.css · app.js, embutidos na resposta
scripts/             build-manifest.js — o manifesto SHA-256 do payload
.github/workflows/   ci, e publish com provenance via OIDC
test/                374 testes, node:test, sem framework
payload/             O QUE É INSTALADO — templates, AGENTS.md, skills, agents, hooks, docs
.exemplo/            um projeto pronto, verde e executável para ler e quebrar
.exemplo-legado/     um código pré-existente pequeno, adotado com --brownfield
ARCHITECTURE.md      por que o motor é do jeito que é — leia antes de mudar algo
INSTALL.md           a única rota de instalação, e por que o CI deve fixar uma versão
```

A divisão que importa: **o que a ferramenta *é* mora em `src/`; o que a
ferramenta *instala* mora em `payload/`.** Nada finge ser as duas coisas,
por isso a raiz do repositório fica limpa e o `init` não tem caso especial
nenhum.

`src/core/` nunca toca I/O além de ler os documentos: recebe um projeto e
devolve achados. `src/cli.js` os renderiza, `--json` os serializa, e nenhum
dos dois consegue chegar a uma conclusão que o outro não chegaria. Manter
o veredito num só lugar é o que faz o número que o seu pipeline lê e o
texto que você lê serem o mesmo veredito, em vez de duas implementações
que hoje concordam.

---

## Comandos

```sh
# a cadeia
adp init [--agent <nome>] [--minimal] [--brownfield] [--shell-alias]
adp new <feature> [--signals <lista>]   cria PRD.md, SPEC.md, DESIGN.md se a matriz de cerimônia devê-lo
adp new --rfc <slug>                    cria um novo registro de decisão
adp status                              sete luzes
adp audit [--ci] [--strict] [--json]    achados atrás do primeiro gate vermelho
adp gates [--list]                      os gates e seu estado, sem os achados
adp prompt [<gate>]                     texto pronto para colar para sua IA
adp verify [--background]               roda o comando de teste e registra o que ele prova

# viabilidade e estimativa
adp report [--html <caminho>] [--json]  um retrato portátil: gates, cerimônia, MVP/backlog, estimativa
adp profile [--stack] [--familiarity] [--app-type] [--brownfield] [--tests]
adp estimate [--pf <n>] [--csv] [--review] [--confirm] [--history]
adp close --hours <n> [--note "<s>"]    registra horas reais; recalibra a tabela de estimativa
adp metrics import <arquivo> | export [--csv]

# execução em background
adp plan                                lanes de execução, sem rodar nada
adp run [--lane <id>] [--allow-edits]   executa tarefas pendentes em git worktrees isoladas
adp rerun <lane> [--allow-edits]        roda uma lane de novo, sem tocar no que já foi mesclado
adp resume | checkpoint --note "<s>"    onde o trabalho está, entre sessões
adp clean [--force]                     remove worktrees cujo trabalho já foi mesclado

# manutenção
adp monitor [--port <n>]                a página somente leitura
adp upgrade [--apply] [--only-migrations]
adp doctor                              confere esta cópia contra seu manifesto
adp trust [--revoke]                    aprova o testCommand deste projeto
```

`adp <comando> --help` é `adp help` hoje — a referência completa, com toda
flag, mora num só lugar: rode `./adp help`. (`Makefile.txt` embrulha alguns
desses comandos para trabalhar *no* motor em si — renomeie para `Makefile`
se você estiver desenvolvendo a ferramenta. Usar a ferramenta não precisa de
`make`.)

### No CI

```yaml
- run: ./adp audit --ci
```

`--ci` escala os achados mais brandos — critério não provado, prova
desatualizada, questão aberta, critério sem cobertura, arquivo-fonte órfão
— de warning para erro, e continua honrando uma entrada válida de
`DEFERRALS.md`. Um motor, duas posturas: quieto o bastante para trabalhar
sob ele, rígido o bastante para ser um gate.

**Fixe a versão no CI.** O `./adp` já faz isso por você — ele chama `npx
--yes @codryx/agent-dev-pipeline@<a versão que o escreveu>`, então o gate
que guarda seu repositório não pode mudar sem um commit. Sem o wrapper,
`npx @codryx/agent-dev-pipeline` (sem versão) roda o que quer que tenha
sido publicado mais recentemente, o que é estranho para uma ferramenta
cujo trabalho é produzir evidência:

```yaml
- run: npx --yes @codryx/agent-dev-pipeline@0.6.0 audit --ci
```

---

## O monitor

```sh
adp monitor          # http://127.0.0.1:7788
```

Uma página mostrando os sete gates, os achados atrás do primeiro vermelho,
e o progresso de cada feature. É **somente leitura, estruturalmente** — não
por política.

Qualquer método que não seja `GET` ou `HEAD` é recusado com 405 **antes
mesmo do caminho ser examinado**, então adicionar uma rota depois não pode
abrir um caminho de escrita por acidente. Nenhum corpo de requisição é
jamais lido. O arquivo do servidor não contém nenhuma chamada de escrita, e
um teste garante isso em vez de confiar no comentário.

Essa única propriedade é o que permite a página ser segura ao redor de
trabalho em andamento: ela não consegue corromper um documento, então não
há conflito para resolver quando você e sua IA editam o mesmo arquivo,
nenhuma checagem de versão, nenhum protocolo de edição. Você edita onde
sempre editou; a página reflete isso em poucos segundos.

**Ela não consegue afetar o projeto que observa.** A ferramenta tem zero
dependências e vive fora do seu repositório — nada é adicionado ao seu
`package.json`, nenhum `node_modules` aparece, não há passo de build nem
artefato. Telemetria mora no diretório de estado, fora do repo. Os dois
pontos reais de contato são tratados: a porta é configurável e uma porta já
ocupada **falha alto e não inicia nada** em vez de mudar silenciosamente, e
não existe nenhum caminho de escrita.

O bind é loopback sem autenticação, então o endereço de bind é toda a
fronteira — e uma requisição cujo header `Host` não é um nome loopback é
recusada, porque o bind sozinho não impede DNS rebinding pelo seu próprio
navegador.

---

## Cadeia de suprimentos

Este pacote escreve **hooks executáveis de shell** e **instruções de
agente** no seu repositório, onde persistem. Isso é um raio de ação maior
que uma dependência comum, então recebe defesas proporcionais — e cada uma
é declarada junto com o que ela *não* cobre, porque uma defesa anunciada
além do seu alcance é a mesma falha que uma checagem que não pode falhar.

| Defesa | Cobre | Não cobre |
|---|---|---|
| **Zero dependências** | typosquatting, comprometimento transitivo, engenharia social contra um mantenedor | qualquer coisa dentro deste próprio pacote |
| **Sem install scripts** | código rodando na sua máquina no `npm install` | código que você roda deliberadamente |
| **Trusted publishing** (OIDC, sem token guardado) | um token de publish roubado — a forma usual de pacotes npm caírem | um repositório comprometido |
| **`--provenance`** | um tarball que não veio desta fonte | um commit malicioso, perfeitamente atestado |
| **`payload/MANIFEST.json`** | adulteração após a publicação, um mirror ruim, uma cópia local editada, deriva | uma publicação maliciosa — o atacante controla o manifesto também |
| **Consentimento para o `testCommand`** | clonar um repo hostil e rodar o código do autor dele | um comando que você deliberadamente aprovou |
| **Guarda de caminho no `init`** | uma escrita escapando do diretório do seu projeto | — |
| **Nunca sobrescreve** | seu hook editado sendo silenciosamente substituído | — |

Confira a cópia que você tem, e de onde ela veio:

```sh
adp doctor              # o payload bate com o manifesto publicado junto dele
adp trust               # lê e aprova o testCommand antes dele rodar
npm audit signatures    # o pacote veio da fonte que ele declara
```

O `init` verifica o payload **antes de escrever qualquer coisa**, e uma
checagem falha é fatal, sem flag de override. Um manifesto ausente é
warning em vez disso — rodar a partir de uma working tree é um estado
normal, e recusar ali só ensinaria as pessoas a recorrer ao bypass.

Cada um desses é um princípio `P-xxx` em `.spec/CONSTITUTION.md` com uma
verificação executável, então a própria ferramenta audita seu próprio
endurecimento e o G6 fica vermelho se alguém o enfraquecer. Isso não é
decoração: o primeiro rascunho do padrão proibido do P-008 casava com a
palavra `NODE_AUTH_TOKEN` dentro do comentário que explicava que nenhum
token desses existia, e a auditoria pegou.

---

## Onde isto está

Construído e testado: o motor, os sete gates, a constituição executável, o
instalador e seu wrapper `./adp`, a matriz de cerimônia, MVP/backlog,
estimativa por Ponto de Função e o fechamento do laço com horas reais,
execução em background em worktrees isoladas, adoção brownfield, adiamento
declarado, e o monitor somente leitura. **374 testes**, cada um carregando
sua própria anotação `@spec:AC-xxx` ou `@principle:P-xxx` — a ferramenta se
prova com seu próprio mecanismo.

A especificação deste próprio repositório, em
`.spec/features/agent-dev-pipeline/`, já roda a cadeia PRD/RFC/DESIGN/SPEC
descrita acima — `adp audit --ci` contra este repositório está limpo. O que
ainda não está conectado é o job de CI que garante isso a cada push (o
último item na própria tabela de milestones do
`.spec/SCOPE-0.6.0.md`): o CI de hoje roda a suíte de testes e audita o
exemplo trabalhado, não o `.spec/` deste próprio repositório.

O monitor no navegador tem uma história em duas partes que vale conhecer,
porque a RFC registra as duas metades, não só a atual: **removido**
primeiro (D-011) — um servidor, um kanban projetado, um editor de
documento eram oito tarefas de interface para um único operador que já
está sentado num terminal — depois **reintroduzido, somente leitura**
(D-013), quando "acompanhar uma execução em background sem um terminal
aberto" se revelou uma necessidade real que a remoção tinha jogado fora
junto com as partes que nunca foram necessárias. O `adp monitor`,
documentado acima, é essa segunda decisão.

Uma consequência que dá para observar em `.exemplo/`: suas três tarefas
dizem `[done]`, e essa palavra não vale nada até `verify` ter rodado.
Apague o registro de prova e as três reportam `TASK_DONE_WITHOUT_PROOF` — o
status continua exatamente onde foi escrito, e o motor simplesmente para de
acreditar nele.

---

## Créditos

O design do motor descende de
[onp-spec-driven](https://github.com/onovoprogramador/onp-spec-driven), de
Vitor Manoel (MIT): a gramática markdown, o catálogo de achados, a prova que
recusa pulos, e a busca de padrão em sandbox.

A doutrina de operação descende de
[bridge-commander](https://github.com/tonylampada/bridge-commander), de
Tony Lampada — incluindo a frase sobre a qual todo o board se apoia: *o
estado do board é a verdade, a memória de conversa é um cache*.

`create-rfc` é do [Tech Leads Club](https://github.com/tech-leads-club),
CC-BY-4.0.

O raciocínio por trás de cada empréstimo, e as alternativas rejeitadas,
está registrado em `.spec/rfc/RFC-001-agent-dev-pipeline.md` — D-001 a
D-016.
