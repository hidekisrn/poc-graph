/**
 * API fina que reusa os mesmos adapters da CLI (@poc/registry).
 * Serve a comparação entre modelos (por pergunta) e o grafo do dataset para a UI.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import Fastify from "fastify";
import cors from "@fastify/cors";
import type { ModelAdapter, QuestionId } from "@poc/core";
import { samePeople, isRawQueryable } from "@poc/core";
import { createAllAdapters, createOne } from "@poc/registry";
import {
  locations,
  people,
  companies,
  friendships,
  questions,
  QUESTION_ORDER,
  expectedAnswer,
} from "@poc/dataset";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "../../.env") });

const app = Fastify({ logger: false });
await app.register(cors, { origin: true });

async function run<T>(adapter: ModelAdapter, fn: (a: ModelAdapter) => Promise<T>) {
  try {
    await adapter.connect();
    const value = await fn(adapter);
    return { ok: true as const, value };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  } finally {
    try {
      await adapter.close();
    } catch {
      /* ignore */
    }
  }
}

function parseQuestion(x: unknown): QuestionId {
  return (QUESTION_ORDER as string[]).includes(x as string)
    ? (x as QuestionId)
    : "emigrants";
}

/** Lista de perguntas canônicas. */
app.get("/api/questions", async () =>
  QUESTION_ORDER.map((id) => ({ id, prompt: questions[id].prompt, ddia: questions[id].ddia })),
);

/** Query CRUA de cada modelo para uma pergunta — sem executar nada no banco. */
app.get("/api/sources", async (req) => {
  const q = parseQuestion((req.query as Record<string, unknown>)?.question);
  const out = [];
  for (const adapter of createAllAdapters()) {
    out.push({
      id: adapter.id,
      language: adapter.language,
      ddiaSection: adapter.ddiaSection,
      querySource: adapter.querySource(q),
    });
    await adapter.close().catch(() => {});
  }
  return { question: q, prompt: questions[q].prompt, sources: out };
});

/** Grafo do dataset canônico para visualização (Cytoscape). */
app.get("/api/graph", async () => {
  const nodes = [
    ...locations.map((l) => ({ data: { id: l.id, label: l.name, kind: "location", type: l.type } })),
    ...companies.map((c) => ({ data: { id: c.id, label: c.name, kind: "company", type: "company" } })),
    ...people.map((p) => ({ data: { id: p.id, label: p.name, kind: "person", type: "person" } })),
  ];
  const edges = [
    ...locations
      .filter((l) => l.within)
      .map((l) => ({ data: { id: `w-${l.id}`, source: l.id, target: l.within!, label: "WITHIN" } })),
    ...people.map((p) => ({ data: { id: `b-${p.id}`, source: p.id, target: p.bornIn, label: "BORN_IN" } })),
    ...people.map((p) => ({ data: { id: `l-${p.id}`, source: p.id, target: p.livesIn, label: "LIVES_IN" } })),
    ...people.map((p) => ({ data: { id: `wa-${p.id}`, source: p.id, target: p.worksAt, label: "WORKS_AT" } })),
    ...people
      .filter((p) => p.reportsTo)
      .map((p) => ({ data: { id: `rt-${p.id}`, source: p.id, target: p.reportsTo!, label: "REPORTS_TO" } })),
    ...friendships.map(([a, b], i) => ({ data: { id: `k-${i}`, source: a, target: b, label: "KNOWS" } })),
  ];
  return { nodes, edges };
});

/** Popula todos os modelos. */
app.post("/api/seed", async () => {
  const out = [];
  for (const adapter of createAllAdapters()) {
    const r = await run(adapter, (a) => a.seed());
    out.push({ id: adapter.id, ok: r.ok, error: r.ok ? null : r.error });
  }
  return out;
});

/** Roda uma pergunta em todos os modelos, com a query crua e a decomposição de tempo. */
app.get("/api/ask", async (req) => {
  const q = parseQuestion((req.query as Record<string, unknown>)?.question);
  const expected = expectedAnswer(questions[q]);
  const results = [];
  for (const adapter of createAllAdapters()) {
    const querySource = adapter.querySource(q);
    let ok = true;
    let error: string | null = null;
    let people: Array<{ id: string; name: string }> = [];
    let matchesExpected = false;
    let connectMs = 0;
    let queryMs = 0;
    let serverMs: number | null = null;
    let note: string | null = null;
    try {
      const c0 = performance.now();
      await adapter.connect();
      connectMs = performance.now() - c0;
      const res = await adapter.ask(q);
      queryMs = res.elapsedMs;
      serverMs = res.serverMs ?? null;
      note = res.note ?? null;
      people = res.people;
      matchesExpected = samePeople(res.people, expected);
    } catch (err) {
      ok = false;
      error = err instanceof Error ? err.message : String(err);
    } finally {
      await adapter.close().catch(() => {});
    }
    // rede + overhead do driver = tempo total da query menos execução no banco.
    const networkMs = serverMs != null ? Math.max(0, queryMs - serverMs) : null;
    results.push({
      id: adapter.id,
      language: adapter.language,
      ddiaSection: adapter.ddiaSection,
      querySource,
      ok,
      people,
      elapsedMs: queryMs,
      matchesExpected,
      error,
      connectMs,
      serverMs,
      networkMs,
      note,
    });
  }
  return { question: q, prompt: questions[q].prompt, ddia: questions[q].ddia, expected, results };
});

/** Modelos que aceitam query livre no editor (+ query de exemplo). */
app.get("/api/query/models", async () => {
  const out = [];
  for (const adapter of createAllAdapters()) {
    if (isRawQueryable(adapter)) {
      out.push({ id: adapter.id, language: adapter.language, sampleQuery: adapter.sampleQuery });
    }
    await adapter.close().catch(() => {});
  }
  return out;
});

/** Executa uma query CRUA (SQL/Cypher/SPARQL/pipeline) contra um modelo. */
app.post("/api/query", async (req) => {
  const body = (req.body ?? {}) as { model?: string; query?: string };
  const id = body.model as Parameters<typeof createOne>[0];
  const query = body.query ?? "";
  let adapter: ModelAdapter;
  try {
    adapter = createOne(id);
  } catch {
    return { ok: false, error: `modelo inválido: ${body.model}` };
  }
  if (!isRawQueryable(adapter)) {
    await adapter.close().catch(() => {});
    return { ok: false, error: `${id} não suporta query livre` };
  }
  try {
    await adapter.connect();
    const t0 = performance.now();
    const { columns, rows } = await adapter.runRaw(query);
    return { ok: true, columns, rows, elapsedMs: performance.now() - t0 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await adapter.close().catch(() => {});
  }
});

const port = Number(process.env.WEB_API_PORT ?? 8787);
await app.listen({ port, host: "0.0.0.0" });
console.log(`[api] http://localhost:${port}`);
