# @poc/property-graph — Property Graph (Neo4j / Cypher)

> DDIA cap. 2 — "Graph-Like Data Models → Property Graphs" e "The Cypher Query
> Language".

## O que este pacote ilustra

- **Modelo property graph.** Vértices com rótulos (`:Person`, `:Location`) e
  arestas com tipo (`BORN_IN`, `LIVES_IN`, `WITHIN`). É o modelo mais natural
  para os dados de grafo — nascidos para relações many-to-many de profundidade
  arbitrária.
- **Cypher declarativo.** A pergunta canônica vira uma única expressão de
  caminho. `-[:WITHIN*0..]->` significa "zero ou mais arestas WITHIN", que é
  exatamente o que exigiu recursão explícita no SQL.

## A consulta (a query do livro)

```cypher
MATCH (p:Person)-[:BORN_IN]->()-[:WITHIN*0..]->(from:Location {id: 'usa'}),
      (p)-[:LIVES_IN]->()-[:WITHIN*0..]->(to:Location {id: 'europe'})
RETURN p.name
```

Compare com [`@poc/relational`](../relational) (duas CTEs recursivas) e
[`@poc/datalog`](../datalog) (regras recursivas). Mesmo resultado, expressividade
bem diferente.

## As 5 perguntas em Cypher

Aqui o property graph brilha: `friends-of-friends` é
`(s)-[:KNOWS]-(:Person)-[:KNOWS]-(fof)` (comprimento fixo) e `network` é
`(s)-[:KNOWS*1..]-(p)` (profundidade arbitrária) — cada um numa única linha.
`colleagues` e `compatriots` usam padrões de aresta simples. Veja todas em
[`queries.ts`](./queries.ts) ou `npm run cli -- sources <pergunta>`.

## Explorar

Abra o Neo4j Browser em <http://localhost:7474> (usuário `neo4j`, senha do
`.env`) e cole uma query para ver o grafo. Adapter em [`index.ts`](./index.ts).
