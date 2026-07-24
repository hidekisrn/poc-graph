/**
 * Registry de todos os modelos. Ponto único usado pela CLI e pela web para
 * instanciar os adapters na mesma ordem (a ordem em que aparecem no DDIA).
 */
import type { ModelAdapter, ModelId } from "@poc/core";
import { createAdapter as relational } from "@poc/relational";
import { createAdapter as document } from "@poc/document";
import { createAdapter as propertyGraph } from "@poc/property-graph";
import { createAdapter as rdf } from "@poc/rdf";
import { createAdapter as datalog } from "@poc/datalog";

const factories: Record<ModelId, () => ModelAdapter> = {
  relational,
  document,
  "property-graph": propertyGraph,
  rdf,
  datalog,
};

/** Ordem de apresentação (segue o fluxo do capítulo). */
export const MODEL_ORDER: ModelId[] = [
  "relational",
  "document",
  "property-graph",
  "rdf",
  "datalog",
];

export function createAllAdapters(): ModelAdapter[] {
  return MODEL_ORDER.map((id) => factories[id]());
}

export function createOne(id: ModelId): ModelAdapter {
  return factories[id]();
}
