import type { Document } from "mongodb";
import type { QuestionId } from "@poc/core";
import { questions } from "@poc/dataset";

/**
 * As perguntas no MongoDB (aggregation pipelines).
 *
 * O modelo de documento brilha em documentos aninhados, mas para GRAFOS precisa
 * do operador especial `$graphLookup` (travessia recursiva) — a "confissão" de
 * que o documento sozinho não atravessa relações many-to-many. Cada pergunta:
 *  - emigrants          → 2× $graphLookup (ancestrais de born/lives)
 *  - colleagues         → $lookup (auto-junção pela empresa)
 *  - friends-of-friends → $graphLookup com maxDepth:1 + exclusões
 *  - network            → $graphLookup (profundidade arbitrária)
 *  - compatriots        → $graphLookup calcula o país de cada pessoa
 *                         (a comparação com o país da Lucy é feita no cliente)
 */
export function pipelineFor(question: QuestionId): Document[] {
  const q = questions[question];
  const subj = q.subject ?? "";
  switch (question) {
    case "emigrants":
      return [
        { $graphLookup: { from: "locations", startWith: "$born_in_id", connectFromField: "within_id", connectToField: "_id", as: "born_ancestors" } },
        { $graphLookup: { from: "locations", startWith: "$lives_in_id", connectFromField: "within_id", connectToField: "_id", as: "lives_ancestors" } },
        { $match: { "born_ancestors._id": q.fromRoot, "lives_ancestors._id": q.toRoot } },
        { $project: { _id: 1, name: 1 } },
        { $sort: { name: 1 } },
      ];
    case "colleagues":
      return [
        { $match: { _id: subj } },
        { $lookup: { from: "persons", localField: "company_id", foreignField: "company_id", as: "colleagues" } },
        { $unwind: "$colleagues" },
        { $match: { "colleagues._id": { $ne: subj } } },
        { $replaceRoot: { newRoot: "$colleagues" } },
        { $project: { _id: 1, name: 1 } },
        { $sort: { name: 1 } },
      ];
    case "friends-of-friends":
      return [
        { $match: { _id: subj } },
        { $graphLookup: { from: "persons", startWith: "$knows", connectFromField: "knows", connectToField: "_id", as: "r", maxDepth: 1, depthField: "d" } },
        { $project: { knows: 1, r: 1 } },
        { $unwind: "$r" },
        { $match: { $expr: { $and: [{ $ne: ["$r._id", subj] }, { $not: [{ $in: ["$r._id", "$knows"] }] }] } } },
        { $group: { _id: "$r._id", name: { $first: "$r.name" } } },
        { $project: { _id: 1, name: 1 } },
        { $sort: { name: 1 } },
      ];
    case "network":
      return [
        { $match: { _id: subj } },
        { $graphLookup: { from: "persons", startWith: "$knows", connectFromField: "knows", connectToField: "_id", as: "r" } },
        { $unwind: "$r" },
        { $match: { "r._id": { $ne: subj } } },
        { $group: { _id: "$r._id", name: { $first: "$r.name" } } },
        { $project: { _id: 1, name: 1 } },
        { $sort: { name: 1 } },
      ];
    case "reports":
      // Subordinados transitivos: $graphLookup DESCENDO o organograma
      // (de cada _id para quem tem manager_id igual a ele).
      return [
        { $match: { _id: subj } },
        { $graphLookup: { from: "persons", startWith: "$_id", connectFromField: "_id", connectToField: "manager_id", as: "subs" } },
        { $unwind: "$subs" },
        { $replaceRoot: { newRoot: "$subs" } },
        { $project: { _id: 1, name: 1 } },
        { $sort: { name: 1 } },
      ];
    case "mutual-friends":
      return [
        { $match: { _id: { $in: [subj, q.target] } } },
        { $group: { _id: null, sets: { $push: "$knows" } } },
        { $project: { common: { $setIntersection: [{ $arrayElemAt: ["$sets", 0] }, { $arrayElemAt: ["$sets", 1] }] } } },
        { $unwind: "$common" },
        { $match: { $expr: { $and: [{ $ne: ["$common", subj] }, { $ne: ["$common", q.target] }] } } },
        { $lookup: { from: "persons", localField: "common", foreignField: "_id", as: "p" } },
        { $unwind: "$p" },
        { $replaceRoot: { newRoot: "$p" } },
        { $project: { _id: 1, name: 1 } },
        { $sort: { name: 1 } },
      ];
    case "management-chain":
    case "shortest-path":
      // Tratados no adapter (caminhada/BFS no cliente): $graphLookup dá distância,
      // mas não o caminho ordenado. Não passam por este pipeline.
      return [];
    case "compatriots":
      // Calcula o país (transitivo) de cada pessoa. O adapter compara com o
      // país da Lucy no cliente (a auto-comparação num único pipeline seria
      // artificial — é justamente o ponto fraco do modelo de documento p/ grafo).
      return [
        { $graphLookup: { from: "locations", startWith: "$lives_in_id", connectFromField: "within_id", connectToField: "_id", as: "anc" } },
        {
          $addFields: {
            country: {
              $arrayElemAt: [
                { $map: { input: { $filter: { input: "$anc", as: "a", cond: { $eq: ["$$a.type", "country"] } } }, as: "c", in: "$$c._id" } },
                0,
              ],
            },
          },
        },
        { $project: { _id: 1, name: 1, country: 1 } },
      ];
  }
}
