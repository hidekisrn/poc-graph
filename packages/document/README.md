# @poc/document — Modelo de Documento (MongoDB)

> DDIA cap. 2 — "The Relational Model Versus the Document Model" (locality,
> schema-on-read) e "Query Languages for Data → MapReduce querying".

## O que este pacote ilustra

- **Object-relational mismatch resolvido por aninhamento.** Cada pessoa é um
  documento com `resume.positions` e `resume.education` aninhados — a "árvore"
  do currículo do livro (exemplo do perfil do LinkedIn). Boa **localidade de
  dados**: um único read traz tudo.
- **Schema-on-read.** Não há `CREATE TABLE`; a forma do documento é interpretada
  na leitura. Flexível, mas sem garantias do banco.
- **Fraqueza em grafos.** O modelo de documento é ruim para relações
  many-to-many/recursivas. Para responder a pergunta canônica precisamos do
  operador especial **`$graphLookup`** — a prova de que o documento puro não
  atravessa hierarquias sozinho.
- **MapReduce / aggregation pipeline.** [`queries.ts`](./queries.ts) traz também
  `peoplePerContinentPipeline` (`$group` = o "reduce"), no espírito da seção de
  MapReduce do livro.

## A consulta (aggregation)

```js
[
  { $graphLookup: { from: "locations", startWith: "$born_in_id",
      connectFromField: "within_id", connectToField: "_id", as: "born_ancestors" } },
  { $graphLookup: { from: "locations", startWith: "$lives_in_id",
      connectFromField: "within_id", connectToField: "_id", as: "lives_ancestors" } },
  { $match: { "born_ancestors._id": "usa", "lives_ancestors._id": "europe" } },
  { $project: { _id: 1, name: 1 } },
]
```

## As 5 perguntas

`emigrants` e `network` usam `$graphLookup` (travessia recursiva); `friends-of-friends`
usa `$graphLookup` com `maxDepth: 1`; `colleagues` usa `$lookup` (auto-junção pela
empresa). Já `compatriots` expõe o limite do modelo: o `$graphLookup` calcula o
país de cada pessoa, mas a comparação com o país da Lucy é feita **no cliente** —
o documento sozinho não faz bem essa auto-junção sobre hierarquia. Tudo em
[`queries.ts`](./queries.ts); veja com `npm run cli -- sources <pergunta>`.

Adapter em [`index.ts`](./index.ts).
