import neo4j, { type Driver, type Integer } from "neo4j-driver";
import type { ModelAdapter, QuestionId, QueryResult, RawQueryable, RawResult } from "@poc/core";
import { sortPeople } from "@poc/core";
import { locations, people, companies, friendships, questions } from "@poc/dataset";
import { cypherFor } from "./queries.js";

/** Converte valores do driver Neo4j em JS puro para o editor de query. */
function toPlain(v: unknown): unknown {
  if (neo4j.isInt(v)) return (v as Integer).toNumber();
  if (v && typeof v === "object" && "properties" in (v as object)) {
    return (v as { properties: unknown }).properties;
  }
  return v;
}

export class PropertyGraphAdapter implements ModelAdapter, RawQueryable {
  readonly id = "property-graph" as const;
  readonly ddiaSection = "Property Graphs + the Cypher Query Language";
  readonly language = "Cypher";
  readonly sampleQuery =
    "MATCH (p:Person)-[:KNOWS]-(f)\nRETURN p.name AS person, count(f) AS friends\nORDER BY friends DESC";
  private driver: Driver;

  constructor() {
    const uri = process.env.NEO4J_URI ?? "bolt://localhost:7687";
    const user = process.env.NEO4J_USER ?? "neo4j";
    const password = process.env.NEO4J_PASSWORD ?? "pocpocpoc";
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }

  async connect(): Promise<void> {
    await this.driver.verifyConnectivity();
  }

  async seed(): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run("MATCH (n) DETACH DELETE n");
      await session.run(
        `UNWIND $rows AS r CREATE (:Location {id: r.id, name: r.name, type: r.type})`,
        { rows: locations.map((l) => ({ id: l.id, name: l.name, type: l.type })) },
      );
      await session.run(
        `UNWIND $rows AS r CREATE (:Company {id: r.id, name: r.name})`,
        { rows: companies },
      );
      await session.run(
        `UNWIND $rows AS r
         MATCH (child:Location {id: r.child}), (parent:Location {id: r.parent})
         CREATE (child)-[:WITHIN]->(parent)`,
        {
          rows: locations.filter((l) => l.within).map((l) => ({ child: l.id, parent: l.within })),
        },
      );
      await session.run(
        `UNWIND $rows AS r
         CREATE (p:Person {id: r.id, name: r.name})
         WITH p, r
         MATCH (b:Location {id: r.bornIn}), (l:Location {id: r.livesIn}), (co:Company {id: r.worksAt})
         CREATE (p)-[:BORN_IN]->(b)
         CREATE (p)-[:LIVES_IN]->(l)
         CREATE (p)-[:WORKS_AT]->(co)`,
        {
          rows: people.map((p) => ({
            id: p.id,
            name: p.name,
            bornIn: p.bornIn,
            livesIn: p.livesIn,
            worksAt: p.worksAt,
          })),
        },
      );
      await session.run(
        `UNWIND $rows AS r
         MATCH (a:Person {id: r.a}), (b:Person {id: r.b})
         CREATE (a)-[:KNOWS]->(b)`,
        { rows: friendships.map(([a, b]) => ({ a, b })) },
      );
      await session.run(
        `UNWIND $rows AS r
         MATCH (p:Person {id: r.p}), (m:Person {id: r.m})
         CREATE (p)-[:REPORTS_TO]->(m)`,
        {
          rows: people
            .filter((p) => p.reportsTo)
            .map((p) => ({ p: p.id, m: p.reportsTo })),
        },
      );
    } finally {
      await session.close();
    }
  }

  async ask(question: QuestionId): Promise<QueryResult> {
    const session = this.driver.session();
    try {
      const t0 = performance.now();
      const res = await session.run(cypherFor(question));
      const elapsedMs = performance.now() - t0;
      // Preserva a ordem dos registros (necessário para shortest-path).
      const ordered: Array<{ id: string; name: string }> = [];
      const seen = new Set<string>();
      for (const rec of res.records) {
        const id = rec.get("id") as string;
        if (seen.has(id)) continue;
        seen.add(id);
        ordered.push({ id, name: rec.get("name") as string });
      }
      const people = questions[question].ordered ? ordered : sortPeople(ordered);
      // Tempo no servidor reportado pelo Neo4j (disponibilizar + consumir resultado).
      const s = res.summary;
      const serverMs = s.resultAvailableAfter.toNumber() + s.resultConsumedAfter.toNumber();
      return { model: this.id, question, people, elapsedMs, serverMs };
    } finally {
      await session.close();
    }
  }

  querySource(question: QuestionId): string {
    return cypherFor(question);
  }

  async runRaw(query: string): Promise<RawResult> {
    const session = this.driver.session();
    try {
      const res = await session.run(query);
      const columns = res.records[0] ? res.records[0].keys.map(String) : [];
      const rows = res.records.map((r) => columns.map((c) => toPlain(r.get(c))));
      return { columns, rows };
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

export function createAdapter(): ModelAdapter {
  return new PropertyGraphAdapter();
}
