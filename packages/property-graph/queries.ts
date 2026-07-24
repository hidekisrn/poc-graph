import type { QuestionId } from "@poc/core";
import { questions } from "@poc/dataset";

/**
 * As 5 perguntas em Cypher. Repare como o property graph resolve caminhos de
 * profundidade fixa (`-[:KNOWS]-(:Person)-[:KNOWS]-`) e arbitrária
 * (`-[:KNOWS*1..]-`) numa única expressão — o argumento central do DDIA.
 * KNOWS é gravado uma vez e casado de forma NÃO-DIRECIONADA (`-[:KNOWS]-`).
 */
export function cypherFor(question: QuestionId): string {
  const q = questions[question];
  const subj = q.subject ?? "";
  switch (question) {
    case "emigrants":
      return `
MATCH (p:Person)-[:BORN_IN]->()-[:WITHIN*0..]->(from:Location {id: '${q.fromRoot}'}),
      (p)-[:LIVES_IN]->()-[:WITHIN*0..]->(to:Location {id: '${q.toRoot}'})
RETURN DISTINCT p.id AS id, p.name AS name
ORDER BY p.name`.trim();

    case "colleagues":
      return `
MATCH (s:Person {id: '${subj}'})-[:WORKS_AT]->(c:Company)<-[:WORKS_AT]-(p:Person)
WHERE p.id <> '${subj}'
RETURN DISTINCT p.id AS id, p.name AS name
ORDER BY p.name`.trim();

    case "friends-of-friends":
      return `
MATCH (s:Person {id: '${subj}'})-[:KNOWS]-(:Person)-[:KNOWS]-(fof:Person)
WHERE fof.id <> '${subj}' AND NOT (s)-[:KNOWS]-(fof)
RETURN DISTINCT fof.id AS id, fof.name AS name
ORDER BY fof.name`.trim();

    case "network":
      return `
MATCH (s:Person {id: '${subj}'})-[:KNOWS*1..]-(p:Person)
WHERE p.id <> '${subj}'
RETURN DISTINCT p.id AS id, p.name AS name
ORDER BY p.name`.trim();

    case "compatriots":
      return `
MATCH (s:Person {id: '${subj}'})-[:LIVES_IN]->()-[:WITHIN*0..]->(c:Location {type: 'country'})
MATCH (p:Person)-[:LIVES_IN]->()-[:WITHIN*0..]->(c)
WHERE p.id <> '${subj}'
RETURN DISTINCT p.id AS id, p.name AS name
ORDER BY p.name`.trim();

    case "reports":
      // Subordinados transitivos: quem chega a `subj` seguindo REPORTS_TO.
      return `
MATCH (m:Person {id: '${subj}'})<-[:REPORTS_TO*]-(p:Person)
RETURN DISTINCT p.id AS id, p.name AS name
ORDER BY p.name`.trim();

    case "management-chain":
      // Caminho subindo até o topo (CEO sem gestor); UNWIND numera para ordenar.
      return `
MATCH path = (s:Person {id: '${subj}'})-[:REPORTS_TO*0..]->(top:Person)
WHERE NOT (top)-[:REPORTS_TO]->()
UNWIND range(0, size(nodes(path)) - 1) AS i
WITH nodes(path)[i] AS n, i
RETURN n.id AS id, n.name AS name
ORDER BY i`.trim();

    case "mutual-friends":
      return `
MATCH (a:Person {id: '${subj}'})-[:KNOWS]-(m:Person)-[:KNOWS]-(b:Person {id: '${q.target}'})
WHERE m.id <> '${subj}' AND m.id <> '${q.target}'
RETURN DISTINCT m.id AS id, m.name AS name
ORDER BY m.name`.trim();

    case "shortest-path":
      // O destaque do property graph: shortestPath resolve o caminho mais curto
      // NATIVAMENTE, em uma expressão. UNWIND numera os nós para devolvê-los em ordem.
      return `
MATCH (a:Person {id: '${subj}'}), (b:Person {id: '${q.target}'}),
      path = shortestPath((a)-[:KNOWS*..15]-(b))
UNWIND range(0, size(nodes(path)) - 1) AS i
WITH nodes(path)[i] AS n, i
RETURN n.id AS id, n.name AS name
ORDER BY i`.trim();
  }
}
