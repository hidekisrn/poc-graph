# poc-graph — DDIA cap. 2 ("Data Models & Query Languages") aplicado

POC que coloca **todo o Capítulo 2 do _Designing Data-Intensive Applications_**
em código, com foco em grafos. A ideia central: **um único dataset canônico** —
o exemplo "pessoas e lugares" do livro, enriquecido com um **grafo social**
(amizades), **empresas** e um **organograma** — implementado em **5 modelos de
dados**, todos respondendo às **mesmas 9 perguntas**. Assim fica evidente, na
prática, por que cada modelo é bom ou ruim para dados de grafo.

O dataset tem **16 pessoas**, **31 lugares** numa hierarquia de **5 níveis**
(continente → país → estado → cidade → bairro), **4 empresas**, um grafo de
**amizades (KNOWS)** conexo com diâmetro grande, e um **organograma (`reportsTo`)**
com até **5 níveis** por empresa.

## As 9 perguntas canônicas

Cada uma estressa uma capacidade diferente dos modelos (gabarito calculado em memória):

| Pergunta | Estressa | Resposta |
|---|---|---|
| `emigrants` — quem emigrou dos EUA para a Europa? | hierarquia transitiva (2 restrições) | Ana, Lucy, Nadia, Sam, Tom |
| `colleagues` — quem trabalha na mesma empresa que a Lucy? | junção many-to-many simples | Ana, Chen, Priya, Sam |
| `friends-of-friends` — amigos-de-amigos da Lucy? | caminho de comprimento **fixo** (2 hops) | Diego, Meera, Omar, Sofia |
| `network` — rede social da Lucy (qualquer profundidade)? | **fecho transitivo** / componente conexo | 15 pessoas (todo o grafo) |
| `compatriots` — quem mora no mesmo país que a Lucy? | ancestral compartilhado na hierarquia | Ana, Priya, Sam, Tom, Uma |
| `shortest-path` — caminho de amizade mais curto Lucy→Ivan? | **shortest path** (8 saltos) | Lucy → Nadia → Meera → Chen → Tom → Uma → Ana → Gil → Ivan |
| `reports` — quem se reporta (transit.) à Lucy? | **recursão descendo** o organograma | Chen, Priya, Sam |
| `management-chain` — cadeia de gestão do Sam até o topo? | **caminho ordenado subindo** a árvore | Sam → Chen → Priya → Lucy → Ana |
| `mutual-friends` — amigos em comum de Lucy e Sofia? | interseção de conjuntos | Priya |

A mesma pergunta é uma linha em Cypher/SPARQL, exige `WITH RECURSIVE` em SQL,
`$graphLookup` no MongoDB e regras recursivas (com negação) em Datalog. Os casos
mais divergentes são **`shortest-path`** e **`management-chain`** (caminhos
ordenados): **Cypher** e **SQL** os resolvem nativamente; **SPARQL, MongoDB e
Datalog** buscam as arestas no store e reconstroem o caminho **no cliente**.

## Mapa DDIA → pacote

| Seção do DDIA (cap. 2) | Pacote | Backend | Destaque |
|---|---|---|---|
| Relational vs Document; object-relational mismatch; many-to-one/-many; **graph queries em SQL** | [`packages/relational`](packages/relational) | Postgres | tabela auto-referenciada + `WITH RECURSIVE` |
| Document (schema-on-read, data locality); **MapReduce querying** | [`packages/document`](packages/document) | MongoDB | currículo aninhado + `$graphLookup` |
| Query languages: **declarativo vs imperativo + MapReduce** | [`packages/query-languages`](packages/query-languages) | — | exemplo dos tubarões |
| **Property Graphs + Cypher** | [`packages/property-graph`](packages/property-graph) | Neo4j | a query icônica do livro |
| **Triple-Stores, SPARQL, Semantic Web (RDF)** | [`packages/rdf`](packages/rdf) | Oxigraph | triplas + property paths |
| **The Foundation: Datalog** | [`packages/datalog`](packages/datalog) | motor TS in-process | fatos + regras recursivas |

Infra compartilhada: [`packages/core`](packages/core) (interface `ModelAdapter`),
[`packages/dataset`](packages/dataset) (fonte única da verdade + gabarito),
[`packages/registry`](packages/registry) (lista os 5 adapters).
Entrega: [`apps/cli`](apps/cli) (comparativo no terminal) e
[`apps/web`](apps/web) (grafo + consultas).

## Pré-requisitos

- Node ≥ 20 (há um `.nvmrc` → `nvm use`). Testado com Node 22. **Importante:** o
  Node padrão do sistema pode ser antigo demais (Vite/tsx exigem ≥ 18) — sempre
  rode `nvm use` antes.
- npm (vem junto com o Node).
- Docker + Docker Compose (para Postgres/MongoDB/Neo4j/Oxigraph).

## Rodar

```bash
nvm use                    # Node 22 (lê o .nvmrc)
cp .env.example .env
npm install

npm run up                 # sobe postgres, mongo, neo4j, oxigraph (docker compose)
npm run seed               # popula todos os modelos a partir do dataset canônico

npm run ask                # roda TODAS as perguntas em todos os modelos, lado a lado
npm run ask -- network     # uma pergunta específica (repare no `--` do npm)
npm run cli -- sources network   # o SQL/Cypher/SPARQL/... cru de cada modelo
npm run cli -- query-languages   # demo declarativo vs imperativo + MapReduce

npm test                   # vitest: 9 perguntas × 5 modelos batem com o gabarito
npm run web                # UI em http://localhost:5173
npm run down               # derruba os bancos
```

> Passar argumento para um script npm exige `--` (ex.: `npm run ask -- network`).

A **web** tem duas abas: **Comparação** (seletor de pergunta + grafo + resposta de
cada modelo lado a lado) e **Editor de query** (escreva SQL/Cypher/SPARQL/pipeline
Mongo livres e execute contra o banco real).

> Sem Docker? `npm test` ainda passa: os modelos dependentes de banco são
> pulados automaticamente e o modelo **Datalog** (in-process) roda sempre,
> exercitando toda a mecânica de comparação.

## Arquitetura em uma frase

Todo modelo implementa `ModelAdapter` (`seed` / `ask` / `querySource`); a CLI e
a web percorrem o [`registry`](packages/registry) e comparam as respostas contra
o gabarito calculado em memória por [`@poc/dataset`](packages/dataset) — provando
que os 5 modelos são semanticamente equivalentes para todas as perguntas.
