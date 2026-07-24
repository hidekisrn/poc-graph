/**
 * @poc/core — contratos compartilhados por todos os modelos de dados.
 *
 * A ideia central da POC (DDIA cap. 2): o MESMO dataset e a MESMA pergunta,
 * expressos em modelos diferentes. Todo modelo implementa `ModelAdapter`,
 * então a CLI e a web tratam todos de forma uniforme e comparam as respostas.
 */

/** Identificador de cada modelo de dados do capítulo. */
export type ModelId =
  | "relational"
  | "document"
  | "property-graph"
  | "rdf"
  | "datalog";

/** Perguntas canônicas que todos os modelos sabem responder. */
export type QuestionId =
  | "emigrants" // hierarquia transitiva (born∈USA ∧ lives∈Europa)
  | "colleagues" // many-to-many simples (mesma empresa que Lucy)
  | "friends-of-friends" // caminho de comprimento fixo (2 hops de KNOWS)
  | "network" // fecho transitivo / reachability (KNOWS a qualquer profundidade)
  | "compatriots" // ancestral compartilhado na hierarquia (mesmo país que Lucy)
  | "shortest-path" // caminho mais curto entre Lucy e Ivan (Cypher brilha; outros sofrem)
  | "reports" // subordinados transitivos de um gestor (recursão descendo o organograma)
  | "management-chain" // cadeia de gestão até o topo (caminho ordenado subindo)
  | "mutual-friends"; // amigos em comum entre duas pessoas (interseção)

/** Uma pessoa, formato normalizado de resposta (igual para todos os modelos). */
export interface Person {
  id: string;
  name: string;
}

/** Resultado de uma consulta, com metadados para a tabela comparativa. */
export interface QueryResult {
  model: ModelId;
  question: QuestionId;
  /** Conjunto de pessoas retornado, ordenado por nome. */
  people: Person[];
  /** Wall-clock da consulta no cliente (rede + execução no banco). Exclui conexão/seed. */
  elapsedMs: number;
  /** Tempo de execução reportado pelo próprio banco, quando disponível (ms). */
  serverMs?: number;
  /** Observação sobre a medição (ex.: "in-process", "inclui BFS no cliente"). */
  note?: string;
}

/**
 * Contrato que todo pacote de modelo implementa.
 * `seed()` popula o backend a partir de @poc/dataset;
 * `ask()` responde a pergunta canônica; `querySource()` devolve o texto
 * cru da query (SQL/Cypher/SPARQL/CozoScript) para exibir lado a lado.
 */
export interface ModelAdapter {
  readonly id: ModelId;
  /** Seção do DDIA que este modelo ilustra. */
  readonly ddiaSection: string;
  /** Linguagem/mecanismo de consulta (ex.: "SQL", "Cypher"). */
  readonly language: string;

  /** Verifica conectividade; lança se o backend não estiver acessível. */
  connect(): Promise<void>;
  /** Cria schema (se houver) e insere o dataset canônico. Idempotente. */
  seed(): Promise<void>;
  /** Executa a pergunta canônica e devolve o resultado normalizado. */
  ask(question: QuestionId): Promise<QueryResult>;
  /** Texto cru da consulta usada por `ask`, para fins didáticos. */
  querySource(question: QuestionId): string;
  /** Libera conexões. */
  close(): Promise<void>;
}

/** Resultado tabular genérico de uma query livre (editor de query da web). */
export interface RawResult {
  columns: string[];
  rows: unknown[][];
}

/**
 * Capacidade opcional: rodar uma query CRUA (SQL/Cypher/SPARQL/pipeline) escrita
 * pelo usuário. Nem todo modelo implementa (Datalog fica de fora do editor livre).
 */
export interface RawQueryable {
  /** Exemplo de query para pré-preencher o editor. */
  readonly sampleQuery: string;
  runRaw(query: string): Promise<RawResult>;
}

export function isRawQueryable(a: unknown): a is RawQueryable {
  return (
    typeof a === "object" &&
    a !== null &&
    typeof (a as RawQueryable).runRaw === "function"
  );
}

/** Ordena pessoas por nome — normaliza a comparação entre modelos. */
export function sortPeople(people: Person[]): Person[] {
  return [...people].sort((a, b) => a.name.localeCompare(b.name));
}

/** Compara dois conjuntos de pessoas por id (ignora ordem). */
export function samePeople(a: Person[], b: Person[]): boolean {
  const ids = (xs: Person[]) => new Set(xs.map((p) => p.id));
  const sa = ids(a);
  const sb = ids(b);
  if (sa.size !== sb.size) return false;
  for (const id of sa) if (!sb.has(id)) return false;
  return true;
}
