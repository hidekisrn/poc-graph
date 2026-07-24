/**
 * Um motor Datalog minimalista (bottom-up, ponto-fixo ingênuo) com suporte a
 * DESIGUALDADE (`X != Y`) e NEGAÇÃO estratificada (`not rel(...)`).
 *
 * Suficiente para a POC e — de propósito — pequeno o bastante para ser lido:
 * é o "coração" que o DDIA descreve quando chama Datalog de "a fundação" dos
 * modelos de grafo. Regras recursivas + fatos → deriva novos fatos até estabilizar.
 *
 * Limitação assumida: a negação é segura/estratificada — toda variável de um
 * literal negado ou de uma desigualdade já deve estar ligada por átomos
 * positivos anteriores no corpo, e a relação negada deve estar completa antes
 * das regras que a negam (garantido pela ORDEM das regras no arquivo).
 */

export type Term = { var: string } | { const: string };
export interface Atom {
  rel: string;
  terms: Term[];
}
export type Literal =
  | { kind: "atom"; atom: Atom }
  | { kind: "neg"; atom: Atom }
  | { kind: "neq"; a: Term; b: Term };
export interface Rule {
  head: Atom;
  body: Literal[];
}

const isUpper = (s: string) => /^[A-Z_]/.test(s);

function parseTerm(tok: string): Term {
  const t = tok.trim();
  if (t.startsWith('"') && t.endsWith('"')) return { const: t.slice(1, -1) };
  return isUpper(t) ? { var: t } : { const: t };
}

function parseAtom(src: string): Atom {
  const m = src.trim().match(/^([a-z_][\w]*)\s*\((.*)\)$/s);
  if (!m) throw new Error(`átomo inválido: ${src}`);
  const rel = m[1]!;
  const args = m[2]!.trim();
  const terms = args === "" ? [] : splitTop(args).map(parseTerm);
  return { rel, terms };
}

function parseLiteral(src: string): Literal {
  const s = src.trim();
  if (s.startsWith("not ")) return { kind: "neg", atom: parseAtom(s.slice(4)) };
  // Desigualdade: "X != Y" (fora de parênteses de átomos).
  if (/^[^()]*!=/.test(s)) {
    const [a, b] = s.split("!=");
    return { kind: "neq", a: parseTerm(a!), b: parseTerm(b!) };
  }
  return { kind: "atom", atom: parseAtom(s) };
}

/** Divide por vírgulas no nível superior (respeitando parênteses). */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim() !== "") out.push(cur);
  return out;
}

/** Faz o parse de um programa Datalog (só regras/fatos IDB, sem consultas). */
export function parseProgram(text: string): Rule[] {
  const noComments = text
    .split("\n")
    .map((l) => l.replace(/%.*$/, ""))
    .join("\n");
  const clauses = noComments
    .split(".")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  return clauses.map((clause) => {
    const [headSrc, bodySrc] = clause.split(":-");
    const head = parseAtom(headSrc!);
    const body = bodySrc ? splitTop(bodySrc).map(parseLiteral) : [];
    return { head, body };
  });
}

type Fact = string[];
type Binding = Record<string, string>;

function resolve(term: Term, b: Binding): string {
  if ("const" in term) return term.const;
  const v = b[term.var];
  if (v === undefined) throw new Error(`variável não ligada em literal seguro: ${term.var}`);
  return v;
}

/** Base de fatos: relação → conjunto de tuplas (serializadas). */
export class Database {
  private rels = new Map<string, Set<string>>();

  addFact(rel: string, tuple: Fact): void {
    if (!this.rels.has(rel)) this.rels.set(rel, new Set());
    this.rels.get(rel)!.add(JSON.stringify(tuple));
  }

  facts(rel: string): Fact[] {
    const s = this.rels.get(rel);
    return s ? [...s].map((t) => JSON.parse(t) as Fact) : [];
  }

  private has(rel: string, tuple: Fact): boolean {
    return this.rels.get(rel)?.has(JSON.stringify(tuple)) ?? false;
  }

  /** Aplica as regras repetidamente até não derivar nenhum fato novo. */
  fixpoint(rules: Rule[]): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (const rule of rules) {
        for (const binding of this.evalBody(rule.body, [{}])) {
          const tuple = rule.head.terms.map((t) =>
            "const" in t ? t.const : binding[t.var]!,
          );
          if (!this.has(rule.head.rel, tuple)) {
            this.addFact(rule.head.rel, tuple);
            changed = true;
          }
        }
      }
    }
  }

  /** Junta os literais do corpo, propagando bindings de variáveis. */
  private evalBody(body: Literal[], seed: Binding[]): Binding[] {
    let bindings = seed;
    for (const lit of body) {
      const next: Binding[] = [];
      if (lit.kind === "atom") {
        for (const b of bindings) {
          for (const tuple of this.facts(lit.atom.rel)) {
            const merged = this.unify(lit.atom.terms, tuple, b);
            if (merged) next.push(merged);
          }
        }
      } else if (lit.kind === "neq") {
        for (const b of bindings) {
          if (resolve(lit.a, b) !== resolve(lit.b, b)) next.push(b);
        }
      } else {
        // negação: mantém o binding se NENHUM fato casar com o átomo negado.
        for (const b of bindings) {
          const anyMatch = this.facts(lit.atom.rel).some(
            (tuple) => this.unify(lit.atom.terms, tuple, b) !== null,
          );
          if (!anyMatch) next.push(b);
        }
      }
      bindings = next;
    }
    return bindings;
  }

  private unify(terms: Term[], tuple: Fact, base: Binding): Binding | null {
    if (terms.length !== tuple.length) return null;
    const b = { ...base };
    for (let i = 0; i < terms.length; i++) {
      const term = terms[i]!;
      const val = tuple[i]!;
      if ("const" in term) {
        if (term.const !== val) return null;
      } else {
        const bound = b[term.var];
        if (bound === undefined) b[term.var] = val;
        else if (bound !== val) return null;
      }
    }
    return b;
  }

  /** Consulta simples: devolve os bindings que satisfazem um único átomo. */
  query(atom: Atom): Binding[] {
    return this.evalBody([{ kind: "atom", atom }], [{}]);
  }
}
