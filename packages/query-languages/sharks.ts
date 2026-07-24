/**
 * DDIA cap. 2 — "Query Languages for Data": declarativo vs imperativo e MapReduce.
 * Usa o mesmo exemplo do livro: observações de animais marinhos (tubarões).
 */

export interface Animal {
  species: string;
  family: string;
  numberOfAnimals: number;
  /** ISO date da observação. */
  observationTimestamp: string;
}

export const observations: Animal[] = [
  { species: "Carcharodon carcharias", family: "Sharks", numberOfAnimals: 3, observationTimestamp: "1995-12-19" },
  { species: "Sphyrna zygaena", family: "Sharks", numberOfAnimals: 4, observationTimestamp: "1995-12-27" },
  { species: "Sphyrna zygaena", family: "Sharks", numberOfAnimals: 8, observationTimestamp: "1995-08-12" },
  { species: "Orcinus orca", family: "Whales", numberOfAnimals: 2, observationTimestamp: "1995-08-15" },
  { species: "Carcharodon carcharias", family: "Sharks", numberOfAnimals: 1, observationTimestamp: "1996-01-04" },
];

/**
 * IMPERATIVO: você diz PASSO A PASSO como filtrar (o "como").
 */
export function sharksImperative(animals: Animal[]): Animal[] {
  const result: Animal[] = [];
  for (let i = 0; i < animals.length; i++) {
    const a = animals[i]!;
    if (a.family === "Sharks") {
      result.push(a);
    }
  }
  return result;
}

/**
 * DECLARATIVO: você diz O QUE quer; o "como" fica a cargo do runtime.
 * (Análogo ao CSS/SQL — o argumento central do livro.)
 */
export function sharksDeclarative(animals: Animal[]): Animal[] {
  return animals.filter((a) => a.family === "Sharks");
}

/**
 * MapReduce: quantos tubarões foram observados por mês?
 * `map` emite (mês → quantidade); `reduce` soma por chave.
 * É exatamente o modelo map/reduce que o DDIA descreve (ex. do MongoDB).
 */
export function sharksPerMonthMapReduce(animals: Animal[]): Record<string, number> {
  // MAP: para cada observação de tubarão, emite [YYYY-MM, count].
  const emitted: Array<[string, number]> = [];
  for (const a of animals) {
    if (a.family !== "Sharks") continue; // filtro (query)
    const month = a.observationTimestamp.slice(0, 7); // YYYY-MM
    emitted.push([month, a.numberOfAnimals]);
  }
  // REDUCE: agrupa por mês e soma.
  const reduced: Record<string, number> = {};
  for (const [month, count] of emitted) {
    reduced[month] = (reduced[month] ?? 0) + count;
  }
  return reduced;
}

/** Equivalente declarativo do MapReduce acima — como uma aggregation pipeline. */
export function sharksPerMonthDeclarative(animals: Animal[]): Record<string, number> {
  return animals
    .filter((a) => a.family === "Sharks")
    .reduce<Record<string, number>>((acc, a) => {
      const month = a.observationTimestamp.slice(0, 7);
      acc[month] = (acc[month] ?? 0) + a.numberOfAnimals;
      return acc;
    }, {});
}

/** Demo textual para a CLI. */
export function demo(): string {
  const lines: string[] = [];
  lines.push("== Declarativo vs Imperativo (DDIA cap. 2) ==");
  lines.push(`Imperativo → ${sharksImperative(observations).length} observações de tubarão`);
  lines.push(`Declarativo → ${sharksDeclarative(observations).length} observações de tubarão (mesmo resultado)`);
  lines.push("");
  lines.push("== MapReduce: tubarões por mês ==");
  const mr = sharksPerMonthMapReduce(observations);
  for (const [month, count] of Object.entries(mr).sort()) {
    lines.push(`  ${month}: ${count}`);
  }
  return lines.join("\n");
}
