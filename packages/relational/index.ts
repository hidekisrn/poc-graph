import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { ModelAdapter, QuestionId, QueryResult, RawQueryable, RawResult } from "@poc/core";
import { sortPeople } from "@poc/core";
import { locations, people, companies, friendships, questions } from "@poc/dataset";
import { sqlFor } from "./queries.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function poolConfig(): pg.PoolConfig {
  return {
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "poc",
    password: process.env.POSTGRES_PASSWORD ?? "poc",
    database: process.env.POSTGRES_DB ?? "poc",
  };
}

export class RelationalAdapter implements ModelAdapter, RawQueryable {
  readonly id = "relational" as const;
  readonly ddiaSection = "Relational Model + Graph Queries in SQL (recursive CTE)";
  readonly language = "SQL";
  readonly sampleQuery = "SELECT name, type FROM locations WHERE type = 'country' ORDER BY name;";
  private pool: pg.Pool;

  constructor() {
    this.pool = new pg.Pool(poolConfig());
  }

  async connect(): Promise<void> {
    const c = await this.pool.connect();
    c.release();
  }

  async seed(): Promise<void> {
    const schema = await readFile(join(__dirname, "schema.sql"), "utf8");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(schema);

      // continentes → países → estados → cidades (ordem topológica p/ a FK within).
      const order = { continent: 0, country: 1, state: 2, city: 3, neighborhood: 4 } as const;
      const sorted = [...locations].sort((a, b) => order[a.type] - order[b.type]);
      for (const l of sorted) {
        await client.query(
          `INSERT INTO locations (id, name, type, within_id) VALUES ($1,$2,$3,$4)`,
          [l.id, l.name, l.type, l.within],
        );
      }
      for (const c of companies) {
        await client.query(`INSERT INTO companies (id, name) VALUES ($1,$2)`, [c.id, c.name]);
      }
      // `people` já vem em ordem top-down por empresa: o gestor é inserido antes
      // dos subordinados, satisfazendo a FK auto-referenciada `manager_id`.
      for (const p of people) {
        await client.query(
          `INSERT INTO persons (id, name, born_in_id, lives_in_id, company_id, manager_id) VALUES ($1,$2,$3,$4,$5,$6)`,
          [p.id, p.name, p.bornIn, p.livesIn, p.worksAt, p.reportsTo],
        );
      }
      for (const [a, b] of friendships) {
        await client.query(`INSERT INTO friendships (a, b) VALUES ($1,$2)`, [a, b]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async ask(question: QuestionId): Promise<QueryResult> {
    const sql = sqlFor(question);
    const t0 = performance.now();
    const res = await this.pool.query<{ id: string; name: string }>(sql);
    const elapsedMs = performance.now() - t0;
    const rows = res.rows.map((r) => ({ id: r.id, name: r.name }));
    // shortest-path é uma SEQUÊNCIA (a query já vem em ordem de caminho).
    const people = questions[question].ordered ? rows : sortPeople(rows);
    // Tempo de execução no servidor via EXPLAIN ANALYZE (planning + execution).
    let serverMs: number | undefined;
    try {
      const ex = await this.pool.query<{ "QUERY PLAN": Array<Record<string, number>> }>(
        `EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`,
      );
      const plan = ex.rows[0]?.["QUERY PLAN"]?.[0];
      if (plan) serverMs = (plan["Planning Time"] ?? 0) + (plan["Execution Time"] ?? 0);
    } catch {
      /* ignora — serverMs fica indefinido */
    }
    return { model: this.id, question, people, elapsedMs, serverMs };
  }

  querySource(question: QuestionId): string {
    return sqlFor(question);
  }

  async runRaw(query: string): Promise<RawResult> {
    const res = await this.pool.query(query);
    const columns = res.fields.map((f) => f.name);
    const rows = res.rows.map((r) => columns.map((c) => (r as Record<string, unknown>)[c]));
    return { columns, rows };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createAdapter(): ModelAdapter {
  return new RelationalAdapter();
}
