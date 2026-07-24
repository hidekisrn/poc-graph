import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { samePeople } from "@poc/core";
import { createAllAdapters } from "@poc/registry";
import { questions, QUESTION_ORDER, expectedAnswer } from "@poc/dataset";

loadEnv({ path: resolve(__dirname, "../.env") });

/**
 * Prova a EQUIVALÊNCIA SEMÂNTICA entre modelos: para CADA pergunta canônica,
 * todos os modelos devem devolver o mesmo conjunto de pessoas do gabarito.
 *
 * Modelos que dependem de um banco são pulados automaticamente se o serviço não
 * estiver acessível — assim `pnpm test` passa mesmo sem Docker, exercitando ao
 * menos o modelo Datalog (in-process) em todas as perguntas.
 */
describe("equivalência semântica entre modelos", () => {
  it("gabaritos em memória conferem", () => {
    expect(expectedAnswer(questions.emigrants).map((p) => p.name)).toEqual(["Ana", "Lucy", "Nadia", "Sam", "Tom"]);
    expect(expectedAnswer(questions.colleagues).map((p) => p.name)).toEqual(["Ana", "Chen", "Priya", "Sam"]);
    expect(expectedAnswer(questions["friends-of-friends"]).map((p) => p.name)).toEqual(["Diego", "Meera", "Omar", "Sofia"]);
    expect(expectedAnswer(questions.network).map((p) => p.name)).toEqual(["Alain", "Ana", "Bob", "Chen", "Diego", "Gil", "Ivan", "Meera", "Nadia", "Omar", "Priya", "Sam", "Sofia", "Tom", "Uma"]);
    expect(expectedAnswer(questions.compatriots).map((p) => p.name)).toEqual(["Ana", "Priya", "Sam", "Tom", "Uma"]);
    expect(expectedAnswer(questions["shortest-path"]).map((p) => p.name)).toEqual(["Lucy", "Nadia", "Meera", "Chen", "Tom", "Uma", "Ana", "Gil", "Ivan"]);
    expect(expectedAnswer(questions.reports).map((p) => p.name)).toEqual(["Chen", "Priya", "Sam"]);
    expect(expectedAnswer(questions["management-chain"]).map((p) => p.name)).toEqual(["Sam", "Chen", "Priya", "Lucy", "Ana"]);
    expect(expectedAnswer(questions["mutual-friends"]).map((p) => p.name)).toEqual(["Priya"]);
  });

  for (const adapter of createAllAdapters()) {
    describe(adapter.id, () => {
      let reachable = false;

      beforeAll(async () => {
        try {
          await adapter.connect();
          await adapter.seed();
          reachable = true;
        } catch {
          reachable = false;
        }
      });

      afterAll(async () => {
        await adapter.close().catch(() => {});
      });

      for (const question of QUESTION_ORDER) {
        it(`${question} bate com o gabarito (${adapter.language})`, async (ctx) => {
          if (!reachable) {
            ctx.skip();
            return;
          }
          const expected = expectedAnswer(questions[question]);
          const result = await adapter.ask(question);
          expect(
            samePeople(result.people, expected),
            `${adapter.id}/${question}: esperado ${JSON.stringify(
              expected.map((p) => p.id),
            )}, veio ${JSON.stringify(result.people.map((p) => p.id))}`,
          ).toBe(true);
          // Perguntas ordenadas (shortest-path): a SEQUÊNCIA também deve bater
          // (normaliza direção, pois o caminho é o mesmo nos dois sentidos).
          if (questions[question].ordered) {
            const got = result.people.map((p) => p.id);
            const exp = expected.map((p) => p.id);
            const gotNorm = got[0] === exp[0] ? got : [...got].reverse();
            expect(gotNorm).toEqual(exp);
          }
        });
      }
    });
  }
});
