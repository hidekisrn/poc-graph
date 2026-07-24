import type { QuestionId } from "@poc/core";
import { questions } from "@poc/dataset";

/**
 * As 5 perguntas canônicas expressas em SQL puro. Os ids (usa, europe, lucy…)
 * são constantes internas do dataset — inlinadas para deixar a query legível
 * (não é entrada de usuário). Cada pergunta mostra um traço do modelo relacional:
 *
 *  - emigrants          → duas CTEs recursivas (hierarquia transitiva)
 *  - colleagues         → subquery / junção many-to-one (empresa)
 *  - friends-of-friends → auto-junção da tabela de amizades (simetrizada)
 *  - network            → CTE RECURSIVA (reachability de profundidade arbitrária)
 *  - compatriots        → CTE recursiva subindo a hierarquia até o país
 */
export function sqlFor(question: QuestionId): string {
  const q = questions[question];
  const subj = q.subject ?? "";
  switch (question) {
    case "emigrants":
      return /* sql */ `
WITH RECURSIVE
descendants_of_from AS (
  SELECT id FROM locations WHERE id = '${q.fromRoot}'
  UNION
  SELECT l.id FROM locations l JOIN descendants_of_from d ON l.within_id = d.id
),
descendants_of_to AS (
  SELECT id FROM locations WHERE id = '${q.toRoot}'
  UNION
  SELECT l.id FROM locations l JOIN descendants_of_to d ON l.within_id = d.id
)
SELECT p.id, p.name
FROM persons p
WHERE p.born_in_id  IN (SELECT id FROM descendants_of_from)
  AND p.lives_in_id IN (SELECT id FROM descendants_of_to)
ORDER BY p.name;`.trim();

    case "colleagues":
      return /* sql */ `
SELECT p.id, p.name
FROM persons p
WHERE p.company_id = (SELECT company_id FROM persons WHERE id = '${subj}')
  AND p.id <> '${subj}'
ORDER BY p.name;`.trim();

    case "friends-of-friends":
      return /* sql */ `
WITH knows AS (          -- simetriza a amizade (não-direcionada)
  SELECT a, b FROM friendships
  UNION
  SELECT b, a FROM friendships
)
SELECT DISTINCT p.id, p.name
FROM knows k1
JOIN knows k2 ON k1.b = k2.a
JOIN persons p ON p.id = k2.b
WHERE k1.a = '${subj}'
  AND k2.b <> '${subj}'
  AND k2.b NOT IN (SELECT b FROM knows WHERE a = '${subj}')  -- exclui amigos diretos
ORDER BY p.name;`.trim();

    case "network":
      return /* sql */ `
WITH RECURSIVE
knows AS (
  SELECT a, b FROM friendships
  UNION
  SELECT b, a FROM friendships
),
reach AS (
  SELECT b AS id FROM knows WHERE a = '${subj}'
  UNION
  SELECT k.b FROM knows k JOIN reach r ON k.a = r.id
)
SELECT DISTINCT p.id, p.name
FROM persons p JOIN reach ON p.id = reach.id
WHERE p.id <> '${subj}'
ORDER BY p.name;`.trim();

    case "compatriots":
      return /* sql */ `
WITH RECURSIVE
ancestor(start, node) AS (             -- ancestrais de cada location na hierarquia
  SELECT id, within_id FROM locations
  UNION
  SELECT a.start, l.within_id
  FROM ancestor a JOIN locations l ON a.node = l.id
  WHERE l.within_id IS NOT NULL
),
country_of AS (                        -- o país (transitivo) de cada pessoa
  SELECT p.id AS pid, c.id AS country
  FROM persons p
  JOIN ancestor a ON a.start = p.lives_in_id
  JOIN locations c ON c.id = a.node
  WHERE c.type = 'country'
)
SELECT DISTINCT p.id, p.name
FROM persons p
JOIN country_of co ON co.pid = p.id
WHERE co.country = (SELECT country FROM country_of WHERE pid = '${subj}')
  AND p.id <> '${subj}'
ORDER BY p.name;`.trim();

    case "reports":
      // Recursão DESCENDO o organograma (subordinados transitivos).
      return /* sql */ `
WITH RECURSIVE sub AS (
  SELECT id FROM persons WHERE manager_id = '${subj}'
  UNION
  SELECT p.id FROM persons p JOIN sub ON p.manager_id = sub.id
)
SELECT p.id, p.name FROM persons p JOIN sub ON p.id = sub.id
ORDER BY p.name;`.trim();

    case "management-chain":
      // Recursão SUBINDO o organograma; `depth` preserva a ordem da cadeia.
      return /* sql */ `
WITH RECURSIVE chain(id, depth) AS (
  SELECT id, 0 FROM persons WHERE id = '${subj}'
  UNION ALL
  SELECT p.manager_id, c.depth + 1
  FROM persons p JOIN chain c ON p.id = c.id
  WHERE p.manager_id IS NOT NULL
)
SELECT pr.id, pr.name FROM chain c JOIN persons pr ON pr.id = c.id
ORDER BY c.depth;`.trim();

    case "mutual-friends":
      return /* sql */ `
WITH knows AS (
  SELECT a, b FROM friendships
  UNION
  SELECT b, a FROM friendships
)
SELECT DISTINCT p.id, p.name FROM persons p
WHERE p.id IN (SELECT b FROM knows WHERE a = '${subj}')
  AND p.id IN (SELECT b FROM knows WHERE a = '${q.target}')
  AND p.id NOT IN ('${subj}', '${q.target}')
ORDER BY p.name;`.trim();

    case "shortest-path":
      // "SQL sofre": enumera TODOS os caminhos simples carregando um ARRAY de ids,
      // para na chegada e escolhe o mais curto. Compare com o shortestPath do Cypher.
      return /* sql */ `
WITH RECURSIVE
knows AS (
  SELECT a, b FROM friendships
  UNION
  SELECT b, a FROM friendships
),
paths(path, last) AS (
  SELECT ARRAY['${subj}']::text[], '${subj}'
  UNION ALL
  SELECT p.path || k.b, k.b
  FROM paths p JOIN knows k ON k.a = p.last
  WHERE p.last <> '${q.target}'          -- para de expandir ao chegar
    AND NOT (k.b = ANY(p.path))          -- evita ciclos
),
shortest AS (
  SELECT path FROM paths WHERE last = '${q.target}'
  ORDER BY array_length(path, 1) LIMIT 1
)
SELECT u.pid AS id, pr.name
FROM shortest s, unnest(s.path) WITH ORDINALITY AS u(pid, ord)
JOIN persons pr ON pr.id = u.pid
ORDER BY u.ord;`.trim();
  }
}
