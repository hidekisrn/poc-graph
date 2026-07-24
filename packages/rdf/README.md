# @poc/rdf — Triple-Store / RDF (Oxigraph + SPARQL)

> DDIA cap. 2 — "Graph-Like Data Models → Triple-Stores and SPARQL" e "The
> Semantic Web".

## O que este pacote ilustra

- **Modelo de triplas (RDF).** Tudo é `(sujeito, predicado, objeto)`:
  `:lucy :bornIn :idaho`, `:idaho :within :usa`, `:lucy :name "Lucy"`. É o
  modelo do Semantic Web — o mesmo grafo, decomposto em fatos atômicos.
- **SPARQL com property paths.** `:within*` percorre zero-ou-mais arestas
  `:within` numa única linha, como o `*0..` do Cypher. Prova de que o poder de
  consulta de grafo não é exclusivo dos property graphs.
- **IRIs como identidade global.** Usamos `urn:poc:<id>`; no mundo real seriam
  URLs desreferenciáveis (a ideia da web semântica).

## Dados (Turtle) e consulta

```turtle
@prefix : <urn:poc:> .
:lucy a :Person ; :name "Lucy" ; :bornIn :idaho ; :livesIn :london .
:idaho :within :usa .   :london :within :england .   :england :within :europe .
```

```sparql
PREFIX : <urn:poc:>
SELECT ?name WHERE {
  ?person :name ?name ; :bornIn ?bi ; :livesIn ?li .
  ?bi :within* :usa .
  ?li :within* :europe .
}
```

## As 5 perguntas em SPARQL

`(:knows|^:knows)` trata a amizade como não-direcionada; `*` e `+` são property
paths de profundidade arbitrária (`network` = `(:knows|^:knows)+`). `friends-of-friends`
usa `FILTER NOT EXISTS` para excluir amigos diretos; `compatriots` usa o caminho
`:livesIn/:within*` até um `:type "country"`. Todas as queries são geradas por
`sparqlFor()` em [`index.ts`](./index.ts) — veja com `npm run cli -- sources <pergunta>`.

O Turtle é gerado a partir do dataset canônico por `toTurtle()`;
[`queries.sparql`](./queries.sparql) guarda a query de `emigrants` como referência.
