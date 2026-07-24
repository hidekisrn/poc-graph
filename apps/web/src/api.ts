export interface Person {
  id: string;
  name: string;
}

export interface QuestionMeta {
  id: string;
  prompt: string;
  ddia: string;
}

export interface AskResult {
  id: string;
  language: string;
  ddiaSection: string;
  querySource: string;
  ok: boolean;
  people: Person[];
  elapsedMs: number; // total da query (cliente): rede + banco
  matchesExpected: boolean;
  error: string | null;
  connectMs: number; // tempo de abrir a conexão/sessão
  serverMs: number | null; // execução reportada pelo banco (quando disponível)
  networkMs: number | null; // elapsedMs - serverMs (rede + overhead do driver)
  note: string | null;
}

export interface AskResponse {
  question: string;
  prompt: string;
  ddia: string;
  expected: Person[];
  results: AskResult[];
}

export interface GraphElement {
  data: Record<string, string>;
}
export interface GraphData {
  nodes: GraphElement[];
  edges: GraphElement[];
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

export interface QueryModel {
  id: string;
  language: string;
  sampleQuery: string;
}

export interface ModelSource {
  id: string;
  language: string;
  ddiaSection: string;
  querySource: string;
}

export interface SourcesResponse {
  question: string;
  prompt: string;
  sources: ModelSource[];
}

export interface RawRun {
  ok: boolean;
  columns?: string[];
  rows?: unknown[][];
  elapsedMs?: number;
  error?: string;
}

export const api = {
  questions: () => json<QuestionMeta[]>("/api/questions"),
  graph: () => json<GraphData>("/api/graph"),
  seed: () => json<Array<{ id: string; ok: boolean; error: string | null }>>("/api/seed", { method: "POST" }),
  ask: (question: string) => json<AskResponse>(`/api/ask?question=${encodeURIComponent(question)}`),
  sources: (question: string) => json<SourcesResponse>(`/api/sources?question=${encodeURIComponent(question)}`),
  queryModels: () => json<QueryModel[]>("/api/query/models"),
  runQuery: (model: string, query: string) =>
    json<RawRun>("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, query }),
    }),
};
