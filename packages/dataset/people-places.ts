/**
 * Dataset canônico — o exemplo "pessoas e lugares" do DDIA (cap. 2), bem
 * aprofundado para dar profundidade às consultas de grafo:
 *
 *  - hierarquia geográfica de 5 níveis (continente → país → estado → cidade → bairro);
 *  - um GRAFO SOCIAL conexo (`friendships`, arestas KNOWS não-direcionadas);
 *  - EMPRESAS (`companies`) com relação `worksAt`;
 *  - um ORGANOGRAMA (`reportsTo`) — cadeia de gestão de até 5 níveis por empresa,
 *    que habilita buscas recursivas fundas (subordinados transitivos, cadeia até o topo).
 *
 * É a ÚNICA fonte de dados da POC — cada adapter traduz estas estruturas, e o
 * gabarito das perguntas é calculado em memória a partir daqui (ver questions.ts).
 */

export type LocationType = "continent" | "country" | "state" | "city" | "neighborhood";

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  within: string | null;
}

export interface Company {
  id: string;
  name: string;
}

export interface Person {
  id: string;
  name: string;
  bornIn: string; // location id
  livesIn: string; // location id
  worksAt: string; // company id
  reportsTo: string | null; // person id do gestor (null = topo/CEO)
  positions: string[];
  education: string[];
}

export const locations: Location[] = [
  // continentes
  { id: "north_america", name: "North America", type: "continent", within: null },
  { id: "europe", name: "Europe", type: "continent", within: null },
  { id: "asia", name: "Asia", type: "continent", within: null },
  { id: "south_america", name: "South America", type: "continent", within: null },
  // países
  { id: "usa", name: "United States", type: "country", within: "north_america" },
  { id: "france", name: "France", type: "country", within: "europe" },
  { id: "england", name: "England", type: "country", within: "europe" },
  { id: "germany", name: "Germany", type: "country", within: "europe" },
  { id: "india", name: "India", type: "country", within: "asia" },
  { id: "japan", name: "Japan", type: "country", within: "asia" },
  { id: "brazil", name: "Brazil", type: "country", within: "south_america" },
  // estados / regiões
  { id: "idaho", name: "Idaho", type: "state", within: "usa" },
  { id: "washington", name: "Washington", type: "state", within: "usa" },
  { id: "ny_state", name: "New York State", type: "state", within: "usa" },
  { id: "bavaria", name: "Bavaria", type: "state", within: "germany" },
  { id: "maharashtra", name: "Maharashtra", type: "state", within: "india" },
  { id: "sp_state", name: "São Paulo State", type: "state", within: "brazil" },
  // cidades
  { id: "london", name: "London", type: "city", within: "england" },
  { id: "cambridge", name: "Cambridge", type: "city", within: "england" },
  { id: "paris", name: "Paris", type: "city", within: "france" },
  { id: "lyon", name: "Lyon", type: "city", within: "france" },
  { id: "beaumont", name: "Beaumont", type: "city", within: "france" },
  { id: "seattle", name: "Seattle", type: "city", within: "washington" },
  { id: "ny_city", name: "New York City", type: "city", within: "ny_state" },
  { id: "munich", name: "Munich", type: "city", within: "bavaria" },
  { id: "tokyo", name: "Tokyo", type: "city", within: "japan" },
  { id: "mumbai", name: "Mumbai", type: "city", within: "maharashtra" },
  { id: "sao_paulo", name: "São Paulo", type: "city", within: "sp_state" },
  // bairros (5º nível — aprofunda o `within`)
  { id: "camden", name: "Camden", type: "neighborhood", within: "london" },
  { id: "shoreditch", name: "Shoreditch", type: "neighborhood", within: "london" },
  { id: "montmartre", name: "Montmartre", type: "neighborhood", within: "paris" },
];

export const companies: Company[] = [
  { id: "acme", name: "Acme Corp" },
  { id: "globex", name: "Globex" },
  { id: "initech", name: "Initech" },
  { id: "umbrella", name: "Umbrella" },
];

// Organogramas (worksAt + reportsTo consistentes):
//   acme:     ana → lucy → priya → chen → sam        (5 níveis)
//   globex:   gil → nadia → meera → omar
//   umbrella: uma → alain → sofia → tom
//   initech:  ivan → bob → diego
export const people: Person[] = [
  { id: "ana", name: "Ana", bornIn: "ny_city", livesIn: "camden", worksAt: "acme", reportsTo: null,
    positions: ["CEO at Acme"], education: ["MBA, Wharton"] },
  { id: "lucy", name: "Lucy", bornIn: "idaho", livesIn: "camden", worksAt: "acme", reportsTo: "ana",
    positions: ["VP Eng at Acme"], education: ["BSc, University of Idaho"] },
  { id: "priya", name: "Priya", bornIn: "mumbai", livesIn: "london", worksAt: "acme", reportsTo: "lucy",
    positions: ["Eng Manager at Acme"], education: ["MSc, Imperial College"] },
  { id: "chen", name: "Chen", bornIn: "tokyo", livesIn: "tokyo", worksAt: "acme", reportsTo: "priya",
    positions: ["Senior Engineer at Acme"], education: ["BEng, University of Tokyo"] },
  { id: "sam", name: "Sam", bornIn: "seattle", livesIn: "shoreditch", worksAt: "acme", reportsTo: "chen",
    positions: ["Engineer at Acme"], education: ["BSc, University of Washington"] },

  { id: "gil", name: "Gil", bornIn: "paris", livesIn: "paris", worksAt: "globex", reportsTo: null,
    positions: ["CEO at Globex"], education: ["PhD, École Polytechnique"] },
  { id: "nadia", name: "Nadia", bornIn: "ny_city", livesIn: "montmartre", worksAt: "globex", reportsTo: "gil",
    positions: ["Head of Data at Globex"], education: ["MSc, Columbia University"] },
  { id: "meera", name: "Meera", bornIn: "mumbai", livesIn: "munich", worksAt: "globex", reportsTo: "nadia",
    positions: ["ML Lead at Globex"], education: ["BTech, IIT Bombay"] },
  { id: "omar", name: "Omar", bornIn: "mumbai", livesIn: "mumbai", worksAt: "globex", reportsTo: "meera",
    positions: ["Data Engineer at Globex"], education: ["BTech, IIT Delhi"] },

  { id: "uma", name: "Uma", bornIn: "london", livesIn: "london", worksAt: "umbrella", reportsTo: null,
    positions: ["CEO at Umbrella"], education: ["BA, LSE"] },
  { id: "alain", name: "Alain", bornIn: "beaumont", livesIn: "lyon", worksAt: "umbrella", reportsTo: "uma",
    positions: ["Head of Ops at Umbrella"], education: ["Institut Paul Bocuse"] },
  { id: "sofia", name: "Sofia", bornIn: "mumbai", livesIn: "mumbai", worksAt: "umbrella", reportsTo: "alain",
    positions: ["Design Lead at Umbrella"], education: ["BDes, NID"] },
  { id: "tom", name: "Tom", bornIn: "seattle", livesIn: "cambridge", worksAt: "umbrella", reportsTo: "sofia",
    positions: ["Researcher at Umbrella"], education: ["PhD, University of Cambridge"] },

  { id: "ivan", name: "Ivan", bornIn: "sao_paulo", livesIn: "sao_paulo", worksAt: "initech", reportsTo: null,
    positions: ["CEO at Initech"], education: ["BSc, USP"] },
  { id: "bob", name: "Bob", bornIn: "idaho", livesIn: "seattle", worksAt: "initech", reportsTo: "ivan",
    positions: ["Head of Product at Initech"], education: ["BA, Boise State"] },
  { id: "diego", name: "Diego", bornIn: "sao_paulo", livesIn: "sao_paulo", worksAt: "initech", reportsTo: "bob",
    positions: ["DevOps at Initech"], education: ["BSc, USP"] },
];

/**
 * Amizades — arestas KNOWS NÃO-DIRECIONADAS (pares). O grafo é conexo (um único
 * componente), com diâmetro grande: p.ex. Lucy→Ivan são 8 saltos.
 */
export const friendships: Array<[string, string]> = [
  ["lucy", "nadia"],
  ["lucy", "bob"],
  ["lucy", "priya"],
  ["nadia", "meera"],
  ["nadia", "omar"],
  ["meera", "chen"],
  ["bob", "diego"],
  ["chen", "tom"],
  ["chen", "sam"],
  ["sam", "omar"],
  ["alain", "sofia"],
  ["sofia", "priya"],
  ["uma", "ana"],
  ["ana", "gil"],
  ["gil", "ivan"],
  ["tom", "uma"],
];

export const locationById: Record<string, Location> = Object.fromEntries(
  locations.map((l) => [l.id, l]),
);
export const personById: Record<string, Person> = Object.fromEntries(
  people.map((p) => [p.id, p]),
);

/** Ancestrais transitivos de uma location (inclui ela mesma). */
export function ancestors(locationId: string): Set<string> {
  const acc = new Set<string>();
  let cur: string | null = locationId;
  while (cur && !acc.has(cur)) {
    acc.add(cur);
    cur = locationById[cur]?.within ?? null;
  }
  return acc;
}

/** País (location de tipo "country") que contém uma location, se houver. */
export function countryOf(locationId: string): string | null {
  for (const id of ancestors(locationId)) {
    if (locationById[id]?.type === "country") return id;
  }
  return null;
}

/** Adjacência não-direcionada do grafo social (id → conjunto de amigos). */
export function friendAdjacency(): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const [a, b] of friendships) {
    add(a, b);
    add(b, a);
  }
  return adj;
}

/** Reports diretos de cada gestor (managerId → conjunto de subordinados diretos). */
export function directReports(): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const p of people) {
    if (!p.reportsTo) continue;
    if (!m.has(p.reportsTo)) m.set(p.reportsTo, new Set());
    m.get(p.reportsTo)!.add(p.id);
  }
  return m;
}

/** Subordinados TRANSITIVOS de um gestor (toda a subárvore abaixo dele). */
export function transitiveReports(managerId: string): string[] {
  const dr = directReports();
  const out: string[] = [];
  const stack = [...(dr.get(managerId) ?? [])];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    for (const c of dr.get(cur) ?? []) stack.push(c);
  }
  return out;
}

/** Cadeia de gestão de uma pessoa até o topo (inclui ela mesma), em ordem. */
export function managementChain(personId: string): string[] {
  const chain: string[] = [];
  let cur: string | null = personId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.push(cur);
    cur = personById[cur]?.reportsTo ?? null;
  }
  return chain;
}

/**
 * Caminho mais curto (BFS) entre dois nós num grafo de adjacência não-direcionado.
 * Vizinhos visitados em ordem alfabética → caminho CANÔNICO e determinístico.
 */
export function bfsShortestPath(
  adj: Map<string, Set<string>>,
  from: string,
  to: string,
): string[] {
  if (from === to) return [from];
  const prev = new Map<string, string>();
  const visited = new Set<string>([from]);
  const queue: string[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of [...(adj.get(cur) ?? [])].sort()) {
      if (visited.has(n)) continue;
      visited.add(n);
      prev.set(n, cur);
      if (n === to) {
        const path = [to];
        let c = to;
        while (prev.has(c)) {
          c = prev.get(c)!;
          path.unshift(c);
        }
        return path;
      }
      queue.push(n);
    }
  }
  return [];
}
