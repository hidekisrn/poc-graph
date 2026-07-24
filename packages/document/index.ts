import { MongoClient, type Db, type Document } from "mongodb";
import type { ModelAdapter, QuestionId, QueryResult, Person, RawQueryable, RawResult } from "@poc/core";
import { sortPeople } from "@poc/core";
import {
  locations,
  people,
  companies,
  friendAdjacency,
  bfsShortestPath,
  countryOf,
  personById,
  questions,
} from "@poc/dataset";
import { pipelineFor } from "./queries.js";

function mongoUrl(): string {
  const host = process.env.MONGO_HOST ?? "localhost";
  const port = process.env.MONGO_PORT ?? "27017";
  return `mongodb://${host}:${port}`;
}

interface PersonDoc {
  _id: string;
  name: string;
  born_in_id: string;
  lives_in_id: string;
  company_id: string;
  /** Gestor (organograma) — null para CEOs. */
  manager_id: string | null;
  /** Adjacência de amizade SIMETRIZADA (para $graphLookup). */
  knows: string[];
  resume: { positions: string[]; education: string[] };
}

export class DocumentAdapter implements ModelAdapter, RawQueryable {
  readonly id = "document" as const;
  readonly ddiaSection = "Document Model (schema-on-read, data locality) + MapReduce/aggregation";
  readonly language = "MongoDB aggregation ($graphLookup)";
  readonly sampleQuery = JSON.stringify(
    [{ $match: { company_id: "acme" } }, { $project: { _id: 1, name: 1 } }, { $sort: { name: 1 } }],
    null,
    2,
  );
  private client: MongoClient;
  private db: Db;

  constructor() {
    this.client = new MongoClient(mongoUrl());
    this.db = this.client.db(process.env.MONGO_DB ?? "poc");
  }

  async connect(): Promise<void> {
    await this.client.connect();
    await this.db.command({ ping: 1 });
  }

  async seed(): Promise<void> {
    await this.db.collection("locations").deleteMany({});
    await this.db.collection("persons").deleteMany({});
    await this.db.collection("companies").deleteMany({});

    await this.db.collection("locations").insertMany(
      locations.map((l) => ({ _id: l.id as unknown as never, name: l.name, type: l.type, within_id: l.within })),
    );
    await this.db.collection("companies").insertMany(
      companies.map((c) => ({ _id: c.id as unknown as never, name: c.name })),
    );

    const adj = friendAdjacency();
    const docs: PersonDoc[] = people.map((p) => ({
      _id: p.id,
      name: p.name,
      born_in_id: p.bornIn,
      lives_in_id: p.livesIn,
      company_id: p.worksAt,
      manager_id: p.reportsTo,
      knows: [...(adj.get(p.id) ?? [])],
      resume: { positions: p.positions, education: p.education },
    }));
    await this.db.collection("persons").insertMany(docs as unknown as never[]);
  }

  async ask(question: QuestionId): Promise<QueryResult> {
    const t0 = performance.now();

    if (question === "shortest-path") {
      // $graphLookup dá distância, mas não o caminho — buscamos `knows` e fazemos BFS.
      const docs = await this.db
        .collection<PersonDoc>("persons")
        .find({}, { projection: { knows: 1 } })
        .toArray();
      const adj = new Map<string, Set<string>>();
      for (const d of docs) adj.set(d._id, new Set(d.knows ?? []));
      const q = questions["shortest-path"];
      const path = bfsShortestPath(adj, q.subject!, q.target!);
      const ppl: Person[] = path.map((id) => ({ id, name: personById[id]?.name ?? id }));
      return { model: this.id, question, people: ppl, elapsedMs: performance.now() - t0, note: "find + BFS no cliente" };
    }

    if (question === "management-chain") {
      // Cadeia ordenada → caminha manager_id a partir do subject (cliente).
      const docs = await this.db
        .collection<PersonDoc>("persons")
        .find({}, { projection: { manager_id: 1 } })
        .toArray();
      const managerOf = new Map<string, string | null>();
      for (const d of docs) managerOf.set(d._id, d.manager_id ?? null);
      const q = questions["management-chain"];
      const chain: string[] = [];
      let cur: string | null | undefined = q.subject!;
      const seen = new Set<string>();
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        chain.push(cur);
        cur = managerOf.get(cur) ?? null;
      }
      const ppl: Person[] = chain.map((id) => ({ id, name: personById[id]?.name ?? id }));
      return { model: this.id, question, people: ppl, elapsedMs: performance.now() - t0, note: "find + caminhada no cliente" };
    }

    const pipeline = pipelineFor(question);

    if (question === "compatriots") {
      // Mongo calcula o país de cada pessoa; a comparação com a Lucy é no cliente.
      const rows = await this.db
        .collection<PersonDoc>("persons")
        .aggregate<{ _id: string; name: string; country: string | null }>(pipeline)
        .toArray();
      const subj = questions.compatriots.subject!;
      const subjCountry = countryOf(people.find((p) => p.id === subj)!.livesIn);
      const ppl: Person[] = rows
        .filter((r) => r._id !== subj && r.country === subjCountry)
        .map((r) => ({ id: r._id, name: r.name }));
      return { model: this.id, question, people: sortPeople(ppl), elapsedMs: performance.now() - t0, note: "$graphLookup + filtro no cliente" };
    }

    const rows = await this.db
      .collection<PersonDoc>("persons")
      .aggregate<{ _id: string; name: string }>(pipeline)
      .toArray();
    const elapsedMs = performance.now() - t0;
    return {
      model: this.id,
      question,
      people: sortPeople(rows.map((r) => ({ id: r._id, name: r.name }))),
      elapsedMs,
    };
  }

  querySource(question: QuestionId): string {
    if (question === "shortest-path") {
      return `db.persons.find({}, { knows: 1 })\n\n// + BFS no cliente ($graphLookup dá distância, não o caminho)`;
    }
    if (question === "management-chain") {
      return `db.persons.find({}, { manager_id: 1 })\n\n// + caminhada no cliente subindo manager_id (a partir de sam)`;
    }
    const pipeline = JSON.stringify(pipelineFor(question), null, 2);
    if (question === "compatriots") {
      return `${pipeline}\n\n// + filtro no cliente: country === countryOf(Lucy)`;
    }
    return pipeline;
  }

  async runRaw(query: string): Promise<RawResult> {
    const pipeline = JSON.parse(query) as Document[];
    const docs = await this.db.collection("persons").aggregate(pipeline).toArray();
    const columns = docs.length ? [...new Set(docs.flatMap((d) => Object.keys(d)))] : [];
    const rows = docs.map((d) =>
      columns.map((c) => {
        const v = (d as Record<string, unknown>)[c];
        return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
      }),
    );
    return { columns, rows };
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

export function createAdapter(): ModelAdapter {
  return new DocumentAdapter();
}
