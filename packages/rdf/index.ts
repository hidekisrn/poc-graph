import type { ModelAdapter, QuestionId, QueryResult, RawQueryable, RawResult } from "@poc/core";
import { sortPeople } from "@poc/core";
import {
  locations,
  people,
  companies,
  friendships,
  questions,
  personById,
  bfsShortestPath,
} from "@poc/dataset";

const PREFIX = "urn:poc:";

function lit(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Gera as triplas (Turtle) a partir do dataset canônico — o modelo de
 * TRIPLE-STORE / RDF do DDIA. Lugares, pessoas e empresas viram recursos
 * `urn:poc:<id>`; relacionamentos (within, bornIn, livesIn, worksAt, knows)
 * viram predicados.
 */
export function toTurtle(): string {
  const lines: string[] = [`@prefix : <${PREFIX}> .`, ""];
  for (const l of locations) {
    lines.push(
      `:${l.id} a :Location ; :id ${lit(l.id)} ; :name ${lit(l.name)} ; :type ${lit(l.type)}${l.within ? ` ; :within :${l.within}` : ""} .`,
    );
  }
  lines.push("");
  for (const c of companies) {
    lines.push(`:${c.id} a :Company ; :name ${lit(c.name)} .`);
  }
  lines.push("");
  for (const p of people) {
    const mgr = p.reportsTo ? ` ; :reportsTo :${p.reportsTo}` : "";
    lines.push(
      `:${p.id} a :Person ; :id ${lit(p.id)} ; :name ${lit(p.name)} ; :bornIn :${p.bornIn} ; :livesIn :${p.livesIn} ; :worksAt :${p.worksAt}${mgr} .`,
    );
  }
  lines.push("");
  for (const [a, b] of friendships) {
    lines.push(`:${a} :knows :${b} .`);
  }
  return lines.join("\n") + "\n";
}

/**
 * As 5 perguntas em SPARQL. `(:knows|^:knows)` trata a amizade como
 * NÃO-DIRECIONADA; `*`/`+` são property paths (profundidade arbitrária).
 */
export function sparqlFor(question: QuestionId): string {
  const q = questions[question];
  const subj = q.subject ?? "";
  const base = `PREFIX : <${PREFIX}>\n`;
  switch (question) {
    case "emigrants":
      return (
        base +
        `SELECT DISTINCT ?id ?name WHERE {
  ?person a :Person ; :id ?id ; :name ?name ; :bornIn ?bi ; :livesIn ?li .
  ?bi :within* :${q.fromRoot} .
  ?li :within* :${q.toRoot} .
}
ORDER BY ?name`
      );
    case "colleagues":
      return (
        base +
        `SELECT DISTINCT ?id ?name WHERE {
  :${subj} :worksAt ?c .
  ?p :worksAt ?c ; :id ?id ; :name ?name .
  FILTER(?p != :${subj})
}
ORDER BY ?name`
      );
    case "friends-of-friends":
      return (
        base +
        `SELECT DISTINCT ?id ?name WHERE {
  :${subj} (:knows|^:knows) ?f .
  ?f (:knows|^:knows) ?p .
  ?p :id ?id ; :name ?name .
  FILTER(?p != :${subj})
  FILTER NOT EXISTS { :${subj} (:knows|^:knows) ?p }
}
ORDER BY ?name`
      );
    case "network":
      return (
        base +
        `SELECT DISTINCT ?id ?name WHERE {
  :${subj} (:knows|^:knows)+ ?p .
  ?p :id ?id ; :name ?name .
  FILTER(?p != :${subj})
}
ORDER BY ?name`
      );
    case "compatriots":
      return (
        base +
        `SELECT DISTINCT ?id ?name WHERE {
  :${subj} :livesIn/:within* ?c .
  ?c :type "country" .
  ?p :livesIn/:within* ?c ; :id ?id ; :name ?name .
  FILTER(?p != :${subj})
}
ORDER BY ?name`
      );
    case "reports":
      // Subordinados transitivos: property path `:reportsTo+`.
      return (
        base +
        `SELECT DISTINCT ?id ?name WHERE {
  ?p :reportsTo+ :${subj} .
  ?p :id ?id ; :name ?name .
}
ORDER BY ?name`
      );
    case "mutual-friends":
      return (
        base +
        `SELECT DISTINCT ?id ?name WHERE {
  :${subj} (:knows|^:knows) ?m .
  :${q.target} (:knows|^:knows) ?m .
  ?m :id ?id ; :name ?name .
  FILTER(?m != :${subj})
  FILTER(?m != :${q.target})
}
ORDER BY ?name`
      );
    case "management-chain":
      // A cadeia ORDENADA exige seguir :reportsTo passo a passo — buscamos as
      // arestas e caminhamos no cliente (SPARQL não devolve o caminho ordenado).
      return (
        base +
        `# cadeia ordenada → arestas + caminhada no cliente
SELECT ?p ?m WHERE { ?p :reportsTo ?m }`
      );
    case "shortest-path":
      // SPARQL 1.1 dá conectividade (property paths), mas NÃO o caminho mais
      // curto. Buscamos as arestas :knows e reconstruímos o caminho no cliente.
      return (
        base +
        `# SPARQL não expressa shortest path → arestas + BFS no cliente
SELECT ?a ?b WHERE { ?a :knows ?b }`
      );
  }
}

interface SparqlJson {
  head: { vars: string[] };
  results: { bindings: Array<Record<string, { value: string }>> };
}

export class RdfAdapter implements ModelAdapter, RawQueryable {
  readonly id = "rdf" as const;
  readonly ddiaSection = "Triple-Stores, SPARQL and the Semantic Web (RDF)";
  readonly language = "SPARQL";
  readonly sampleQuery =
    "PREFIX : <urn:poc:>\nSELECT ?name ?type WHERE { ?l a :Location ; :name ?name ; :type ?type }\nORDER BY ?type ?name";
  private base: string;

  constructor() {
    this.base = (process.env.OXIGRAPH_URL ?? "http://localhost:7878").replace(/\/$/, "");
  }

  async connect(): Promise<void> {
    const res = await fetch(`${this.base}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/sparql-query",
        Accept: "application/sparql-results+json",
      },
      body: "ASK { ?s ?p ?o }",
    });
    if (!res.ok) throw new Error(`Oxigraph indisponível (${res.status})`);
  }

  async seed(): Promise<void> {
    const res = await fetch(`${this.base}/store?default`, {
      method: "PUT",
      headers: { "Content-Type": "text/turtle" },
      body: toTurtle(),
    });
    if (!res.ok) throw new Error(`falha no seed RDF (${res.status}): ${await res.text()}`);
  }

  private async select(query: string): Promise<SparqlJson> {
    const res = await fetch(`${this.base}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/sparql-query",
        Accept: "application/sparql-results+json",
      },
      body: query,
    });
    if (!res.ok) throw new Error(`falha na query SPARQL (${res.status}): ${await res.text()}`);
    return (await res.json()) as SparqlJson;
  }

  async ask(question: QuestionId): Promise<QueryResult> {
    const t0 = performance.now();
    const strip = (iri: string) => iri.replace("urn:poc:", "");

    if (question === "shortest-path") {
      // Busca as arestas :knows do store e faz o BFS no cliente.
      const json = await this.select(sparqlFor(question));
      const adj = new Map<string, Set<string>>();
      const link = (a: string, b: string) => {
        if (!adj.has(a)) adj.set(a, new Set());
        adj.get(a)!.add(b);
      };
      for (const bnd of json.results.bindings) {
        const a = strip(bnd.a!.value);
        const b = strip(bnd.b!.value);
        link(a, b);
        link(b, a);
      }
      const q = questions[question];
      const path = bfsShortestPath(adj, q.subject!, q.target!);
      const people = path.map((id) => ({ id, name: personById[id]?.name ?? id }));
      return { model: this.id, question, people, elapsedMs: performance.now() - t0, note: "SELECT arestas + BFS no cliente" };
    }

    if (question === "management-chain") {
      // Busca as arestas :reportsTo e caminha do subject até o topo, em ordem.
      const json = await this.select(sparqlFor(question));
      const managerOf = new Map<string, string>();
      for (const bnd of json.results.bindings) {
        managerOf.set(strip(bnd.p!.value), strip(bnd.m!.value));
      }
      const q = questions[question];
      const chain: string[] = [];
      let cur: string | undefined = q.subject!;
      const seen = new Set<string>();
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        chain.push(cur);
        cur = managerOf.get(cur);
      }
      const people = chain.map((id) => ({ id, name: personById[id]?.name ?? id }));
      return { model: this.id, question, people, elapsedMs: performance.now() - t0, note: "SELECT arestas + caminhada no cliente" };
    }
    const json = await this.select(sparqlFor(question));
    const elapsedMs = performance.now() - t0;
    const ppl = json.results.bindings.map((b) => ({ id: b.id!.value, name: b.name!.value }));
    return { model: this.id, question, people: sortPeople(ppl), elapsedMs };
  }

  querySource(question: QuestionId): string {
    return sparqlFor(question);
  }

  async runRaw(query: string): Promise<RawResult> {
    const json = await this.select(query);
    const columns = json.head.vars;
    const rows = json.results.bindings.map((b) => columns.map((c) => b[c]?.value ?? null));
    return { columns, rows };
  }

  async close(): Promise<void> {}
}

export function createAdapter(): ModelAdapter {
  return new RdfAdapter();
}
