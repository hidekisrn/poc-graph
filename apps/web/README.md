# @poc/web — UI comparativa

Vite + React + Fastify. Reusa os mesmos adapters da CLI (`@poc/registry`).

Três abas no painel lateral:

**Comparação**
- **Grafo do dataset** (Cytoscape.js, layout force-directed): pessoas (losangos),
  empresas (retângulos) e lugares (círculos por tipo), com arestas
  `WITHIN`/`BORN_IN`/`LIVES_IN`/`WORKS_AT`/`KNOWS` (tracejada).
- **Seletor de pergunta** + **Seed** + **Perguntar a todos**: roda a pergunta em
  cada modelo e mostra resposta, tempo e se bate com o gabarito.
- Cada modelo mostra a resposta + a **decomposição de tempo** (conexão, execução
  no banco, rede+overhead, total) numa barrinha. Clique num modelo para ver a
  query crua e destacar, no grafo, a resposta daquele modelo.

**Consultas**
- Para a pergunta selecionada, lista a query de **todos os 5 modelos** lado a
  lado (SQL, Cypher, SPARQL, pipeline Mongo, regras Datalog) — ideal para
  comparar como cada modelo expressa a mesma pergunta.

**Editor de query**
- Escolha um modelo (relational/document/property-graph/rdf) e, opcionalmente,
  uma **pergunta** para carregar a query canônica daquele modelo+pergunta no
  editor. Edite e execute contra o banco real (`Ctrl/⌘+Enter`); o resultado vem
  como tabela. Datalog não entra no editor livre (não é linguagem de texto
  tabular) — mas sua consulta aparece na aba **Consultas** e na **Comparação**.

```bash
docker compose up -d      # bancos rodando
npm run web   # na raiz (sobe API + Vite)
# client em http://localhost:5173  (API em :8787)
```

> Dev-only: o editor roda a query como está (sem sandbox) contra os bancos
> locais. Endpoints em [`server.ts`](./server.ts): `GET /api/questions`,
> `GET /api/graph`, `GET /api/sources?question=`, `GET /api/ask?question=`,
> `POST /api/seed`, `GET /api/query/models`, `POST /api/query`.
