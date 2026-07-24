# @poc/relational — Modelo Relacional (Postgres)

> DDIA cap. 2 — "The Relational Model Versus the Document Model" e "Graph-Like
> Data Models → Graph Queries in SQL".

## O que este pacote ilustra

- **Normalização e many-to-one/many-to-many.** Lugares e regiões são _IDs_
  (`locations.id`), não texto livre. O livro argumenta que armazenar `"Greater
  Seattle Area"` como string duplica dados e cria ambiguidade; com IDs, cada
  lugar existe uma vez e é referenciado por chave estrangeira.
- **Hierarquia via tabela auto-referenciada.** `locations.within_id` aponta para
  a location que a contém (cidade → estado → país → continente). Esse é o
  clássico "many-to-one" repetido.
- **Object-relational mismatch.** Uma pessoa e sua "árvore" de lugares se
  espalham por várias linhas/tabelas; a aplicação precisa remontar (compare com
  o documento aninhado em [`@poc/document`](../document)).
- **Graph queries em SQL.** A pergunta canônica exige percorrer a hierarquia com
  profundidade arbitrária → `WITH RECURSIVE` (ver [`queries.ts`](./queries.ts)).

## A consulta

```sql
WITH RECURSIVE
descendants_of_from AS (
  SELECT id FROM locations WHERE id = 'usa'
  UNION
  SELECT l.id FROM locations l JOIN descendants_of_from d ON l.within_id = d.id
),
descendants_of_to AS ( /* idem para 'europe' */ )
SELECT p.id, p.name FROM persons p
WHERE p.born_in_id  IN (SELECT id FROM descendants_of_from)
  AND p.lives_in_id IN (SELECT id FROM descendants_of_to);
```

Repare no contraste didático: o mesmo que o Cypher resolve com
`-[:WITHIN*0..]->` (uma expressão) aqui precisa de duas CTEs recursivas.

## As 5 perguntas em SQL

Além de `emigrants`, este modelo responde `colleagues` (subquery pela empresa),
`friends-of-friends` (auto-junção da tabela de amizades simetrizada), `network`
(**CTE recursiva** de reachability) e `compatriots` (CTE recursiva subindo até o
país). Veja todas em [`queries.ts`](./queries.ts) ou:

```bash
npm run cli -- sources network   # imprime a CTE recursiva do relacional
npm run ask                      # roda todas as perguntas em todos os modelos
```

Schema em [`schema.sql`](./schema.sql); adapter em [`index.ts`](./index.ts).
