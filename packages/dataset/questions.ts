/**
 * As perguntas canônicas da POC e o cálculo da resposta esperada (gabarito),
 * feito puramente em memória — sem nenhum banco — para validar todos os modelos.
 *
 * Cada pergunta estressa uma capacidade diferente dos modelos de dados:
 *   emigrants          → hierarquia transitiva com duas restrições
 *   colleagues         → junção many-to-many simples
 *   friends-of-friends → caminho de comprimento FIXO (2 hops)
 *   network            → fecho transitivo / reachability (profundidade arbitrária)
 *   compatriots        → ancestral compartilhado numa hierarquia
 */
import type { QuestionId } from "@poc/core";
import {
  people,
  ancestors,
  countryOf,
  friendAdjacency,
  bfsShortestPath,
  transitiveReports,
  managementChain,
  personById,
  type Person,
} from "./people-places.js";

export interface Question {
  id: QuestionId;
  /** Descrição em linguagem natural. */
  prompt: string;
  /** Conceito do DDIA / capacidade que a pergunta estressa. */
  ddia: string;
  /** Pessoa-alvo (para perguntas sociais / de emprego / de país). */
  subject?: string;
  /** Segundo alvo (para `shortest-path`). */
  target?: string;
  /** Raízes da hierarquia (para `emigrants`). */
  fromRoot?: string;
  toRoot?: string;
  /** Se true, a resposta é uma SEQUÊNCIA ordenada (não deve ser reordenada). */
  ordered?: boolean;
}

const SUBJECT = "lucy";

export const questions: Record<QuestionId, Question> = {
  emigrants: {
    id: "emigrants",
    prompt: "Quais pessoas emigraram dos Estados Unidos para a Europa?",
    ddia: "Hierarquia transitiva (recursive CTE / property path)",
    fromRoot: "usa",
    toRoot: "europe",
  },
  colleagues: {
    id: "colleagues",
    prompt: "Quem trabalha na mesma empresa que a Lucy?",
    ddia: "Junção many-to-many simples",
    subject: SUBJECT,
  },
  "friends-of-friends": {
    id: "friends-of-friends",
    prompt: "Quem são os amigos-de-amigos da Lucy (a exatamente 2 conexões)?",
    ddia: "Caminho de comprimento fixo",
    subject: SUBJECT,
  },
  network: {
    id: "network",
    prompt: "Quem está na rede social da Lucy (alcançável por KNOWS, qualquer profundidade)?",
    ddia: "Fecho transitivo / componente conexo",
    subject: SUBJECT,
  },
  compatriots: {
    id: "compatriots",
    prompt: "Quem mora no mesmo país que a Lucy?",
    ddia: "Ancestral compartilhado na hierarquia",
    subject: SUBJECT,
  },
  "shortest-path": {
    id: "shortest-path",
    prompt: "Qual o caminho de amizade mais curto entre Lucy e Ivan?",
    ddia: "Shortest path (8 saltos) — Cypher tem shortestPath; SQL/SPARQL/Datalog sofrem",
    subject: SUBJECT,
    target: "ivan",
    ordered: true,
  },
  reports: {
    id: "reports",
    prompt: "Quem se reporta (direta ou indiretamente) à Lucy no organograma?",
    ddia: "Recursão descendo uma árvore (subordinados transitivos)",
    subject: SUBJECT,
  },
  "management-chain": {
    id: "management-chain",
    prompt: "Qual a cadeia de gestão do Sam até o topo da empresa?",
    ddia: "Caminho ordenado subindo a árvore de gestão",
    subject: "sam",
    ordered: true,
  },
  "mutual-friends": {
    id: "mutual-friends",
    prompt: "Quais amigos Lucy e Sofia têm em comum?",
    ddia: "Interseção de conjuntos (dois caminhos de 1 salto)",
    subject: SUBJECT,
    target: "sofia",
  },
};

export const QUESTION_ORDER: QuestionId[] = [
  "emigrants",
  "colleagues",
  "friends-of-friends",
  "network",
  "compatriots",
  "shortest-path",
  "reports",
  "management-chain",
  "mutual-friends",
];

const sortByName = (xs: Person[]) => [...xs].sort((a, b) => a.name.localeCompare(b.name));

/** Resposta de referência (gabarito), calculada em memória a partir do dataset. */
export function expectedAnswer(q: Question): Person[] {
  switch (q.id) {
    case "emigrants": {
      const from = q.fromRoot!;
      const to = q.toRoot!;
      return sortByName(
        people.filter((p) => ancestors(p.bornIn).has(from) && ancestors(p.livesIn).has(to)),
      );
    }
    case "colleagues": {
      const subj = personById[q.subject!]!;
      return sortByName(
        people.filter((p) => p.id !== subj.id && p.worksAt === subj.worksAt),
      );
    }
    case "friends-of-friends": {
      const subj = q.subject!;
      const adj = friendAdjacency();
      const direct = adj.get(subj) ?? new Set<string>();
      const fof = new Set<string>();
      for (const f of direct) {
        for (const g of adj.get(f) ?? []) {
          if (g !== subj && !direct.has(g)) fof.add(g);
        }
      }
      return sortByName([...fof].map((id) => personById[id]!));
    }
    case "network": {
      const subj = q.subject!;
      const adj = friendAdjacency();
      const seen = new Set<string>();
      const stack = [...(adj.get(subj) ?? [])];
      while (stack.length) {
        const cur = stack.pop()!;
        if (cur === subj || seen.has(cur)) continue;
        seen.add(cur);
        for (const n of adj.get(cur) ?? []) stack.push(n);
      }
      return sortByName([...seen].map((id) => personById[id]!));
    }
    case "compatriots": {
      const subj = personById[q.subject!]!;
      const subjCountry = countryOf(subj.livesIn);
      return sortByName(
        people.filter((p) => p.id !== subj.id && countryOf(p.livesIn) === subjCountry),
      );
    }
    case "shortest-path": {
      // Sequência ORDENADA — não reordenar por nome.
      const path = bfsShortestPath(friendAdjacency(), q.subject!, q.target!);
      return path.map((id) => personById[id]!);
    }
    case "reports": {
      return sortByName(transitiveReports(q.subject!).map((id) => personById[id]!));
    }
    case "management-chain": {
      // Sequência ORDENADA (pessoa → ... → topo).
      return managementChain(q.subject!).map((id) => personById[id]!);
    }
    case "mutual-friends": {
      const adj = friendAdjacency();
      const a = adj.get(q.subject!) ?? new Set<string>();
      const b = adj.get(q.target!) ?? new Set<string>();
      const common = [...a].filter((x) => b.has(x) && x !== q.subject && x !== q.target);
      return sortByName(common.map((id) => personById[id]!));
    }
  }
}
