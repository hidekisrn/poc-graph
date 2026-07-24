import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ModelAdapter, QuestionId, QueryResult, Person } from "@poc/core";
import { sortPeople } from "@poc/core";
import { locations, people, companies, friendships, questions, personById, bfsShortestPath } from "@poc/dataset";
import { Database, parseProgram, type Rule } from "./engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Pergunta → relação IDB (shortest-path e management-chain são tratadas à parte). */
const RELATION: Record<Exclude<QuestionId, "shortest-path" | "management-chain">, string> = {
  emigrants: "emigrant",
  colleagues: "colleague",
  "friends-of-friends": "fof",
  network: "network",
  compatriots: "compatriot",
  reports: "reports_q",
  "mutual-friends": "mutual_q",
};

export class DatalogAdapter implements ModelAdapter {
  readonly id = "datalog" as const;
  readonly ddiaSection = "The Foundation: Datalog";
  readonly language = "Datalog";
  private db = new Database();
  // Regras lidas de forma síncrona no construtor — assim `querySource` funciona
  // mesmo sem `connect()` (ex.: endpoint /api/sources, que não toca no banco).
  private readonly rulesText = readFileSync(join(__dirname, "rules.datalog"), "utf8");
  private readonly rules: Rule[] = parseProgram(this.rulesText);
  private nameById = new Map<string, string>();
  private seeded = false;

  async connect(): Promise<void> {
    // Motor em processo — nada a conectar (regras já carregadas no construtor).
  }

  async seed(): Promise<void> {
    this.db = new Database();
    this.nameById.clear();
    // EDB (fatos extensionais) a partir do dataset canônico.
    for (const l of locations) {
      if (l.within) this.db.addFact("within", [l.id, l.within]);
      if (l.type === "country") this.db.addFact("is_country", [l.id]);
    }
    for (const p of people) {
      this.db.addFact("born_in", [p.id, p.bornIn]);
      this.db.addFact("lives_in", [p.id, p.livesIn]);
      this.db.addFact("works_at", [p.id, p.worksAt]);
      this.db.addFact("person_name", [p.id, p.name]);
      if (p.reportsTo) this.db.addFact("reports_to", [p.id, p.reportsTo]);
      this.nameById.set(p.id, p.name);
    }
    for (const [a, b] of friendships) this.db.addFact("knows", [a, b]);
    // silencia "companies não usado" — empresas entram via works_at/id
    void companies;
    // IDB: deriva tudo por ponto-fixo.
    this.db.fixpoint(this.rules);
    this.seeded = true;
  }

  async ask(question: QuestionId): Promise<QueryResult> {
    if (!this.seeded) await this.seed();
    const t0 = performance.now();

    if (question === "shortest-path") {
      // Datalog puro não faz shortest path (sem agregação/min): usamos os fatos
      // `friend(A,B)` derivados pelo motor e um BFS no cliente.
      const adj = new Map<string, Set<string>>();
      for (const [a, b] of this.db.facts("friend")) {
        if (!adj.has(a!)) adj.set(a!, new Set());
        adj.get(a!)!.add(b!);
      }
      const q = questions["shortest-path"];
      const path = bfsShortestPath(adj, q.subject!, q.target!);
      const ppl: Person[] = path.map((id) => ({ id, name: personById[id]?.name ?? id }));
      const ms = performance.now() - t0;
      return { model: this.id, question, people: ppl, elapsedMs: ms, serverMs: ms, note: "in-process (sem rede) + BFS no cliente" };
    }

    if (question === "management-chain") {
      // A cadeia ORDENADA exige seguir reports_to passo a passo (cliente).
      const managerOf = new Map<string, string>();
      for (const [p, m] of this.db.facts("reports_to")) managerOf.set(p!, m!);
      const q = questions["management-chain"];
      const chain: string[] = [];
      let cur: string | undefined = q.subject!;
      const seen = new Set<string>();
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        chain.push(cur);
        cur = managerOf.get(cur);
      }
      const ppl: Person[] = chain.map((id) => ({ id, name: personById[id]?.name ?? id }));
      const ms = performance.now() - t0;
      return { model: this.id, question, people: ppl, elapsedMs: ms, serverMs: ms, note: "in-process (sem rede) + caminhada no cliente" };
    }

    const rel = RELATION[question];
    const bindings = this.db.query({ rel, terms: [{ var: "P" }] });
    const ppl: Person[] = bindings.map((b) => {
      const id = b.P!;
      return { id, name: this.nameById.get(id) ?? id };
    });
    const elapsedMs = performance.now() - t0;
    return { model: this.id, question, people: sortPeople(ppl), elapsedMs, serverMs: elapsedMs, note: "in-process (sem rede)" };
  }

  querySource(question: QuestionId): string {
    const rules = this.rulesText.trim() || "(regras em rules.datalog)";
    if (question === "shortest-path") {
      return `${rules}\n\n% Datalog puro não faz shortest path (sem agregação).\n% Deriva friend(A,B) e faz BFS no cliente entre lucy e ivan.`;
    }
    if (question === "management-chain") {
      return `${rules}\n\n% Cadeia ordenada → segue reports_to(P, M) no cliente, subindo a partir de sam.`;
    }
    return `${rules}\n\n?- ${RELATION[question]}(P).`;
  }

  async close(): Promise<void> {
    // nada a fechar
  }
}

export function createAdapter(): ModelAdapter {
  return new DatalogAdapter();
}
