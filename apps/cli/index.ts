#!/usr/bin/env -S npx tsx
/**
 * CLI comparativa da POC.
 *
 *   poc seed                 → popula todos os modelos a partir do dataset canônico
 *   poc ask [questionId]      → roda a(s) pergunta(s) em todos os modelos, lado a lado
 *   poc sources <questionId>  → imprime o texto cru da consulta de cada modelo
 *   poc query-languages       → demo declarativo vs imperativo + MapReduce
 *
 * Sem questionId, `ask` roda TODAS as perguntas em sequência.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import type { ModelAdapter, QuestionId } from "@poc/core";
import { samePeople } from "@poc/core";
import { createAllAdapters } from "@poc/registry";
import { questions, QUESTION_ORDER, expectedAnswer } from "@poc/dataset";
import { demo as queryLanguagesDemo } from "@poc/query-languages";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "../../.env") });

const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m",
};
const color = (s: string, code: string) => `${code}${s}${c.reset}`;

function isQuestion(x: string | undefined): x is QuestionId {
  return !!x && (QUESTION_ORDER as string[]).includes(x);
}

/** Conecta todos os adapters uma vez; devolve os que responderam. */
async function connectAll(): Promise<Array<{ adapter: ModelAdapter; ok: boolean; error?: string }>> {
  const out = [];
  for (const adapter of createAllAdapters()) {
    try {
      await adapter.connect();
      out.push({ adapter, ok: true });
    } catch (err) {
      out.push({ adapter, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}

async function cmdSeed(): Promise<void> {
  console.log(color("\nSeeding todos os modelos a partir do dataset canônico...\n", c.bold));
  for (const adapter of createAllAdapters()) {
    try {
      await adapter.connect();
      await adapter.seed();
      console.log(`  ${color("✓", c.green)} ${adapter.id.padEnd(16)} ${color(adapter.language, c.dim)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ${color("✗", c.red)} ${adapter.id.padEnd(16)} ${color(msg, c.red)}`);
    } finally {
      await adapter.close().catch(() => {});
    }
  }
  console.log();
}

function printTable(
  question: QuestionId,
  rows: Array<{ id: string; language: string; ok: boolean; names?: string; match?: boolean; ms?: number; error?: string }>,
): void {
  const q = questions[question];
  const expected = expectedAnswer(q);
  console.log(color(`\n▸ ${question}  —  ${q.prompt}`, c.bold));
  console.log(color(`  DDIA: ${q.ddia}`, c.dim));
  console.log(color(`  Gabarito: ${expected.map((p) => p.name).join(", ")}`, c.dim));
  const header = `  ${"MODELO".padEnd(16)} ${"LINGUAGEM".padEnd(20)} ${"RESPOSTA".padEnd(34)} ${"ms".padStart(7)}  OK`;
  console.log(color(header, c.cyan));
  for (const r of rows) {
    if (!r.ok) {
      console.log(`  ${r.id.padEnd(16)} ${r.language.padEnd(20)} ${color("erro: " + (r.error ?? ""), c.red)}`);
      continue;
    }
    const badge = r.match ? color("✓", c.green) : color("≠", c.yellow);
    console.log(
      `  ${r.id.padEnd(16)} ${r.language.padEnd(20)} ${(r.names || "(vazio)").padEnd(34)} ${(r.ms ?? 0).toFixed(1).padStart(7)}  ${badge}`,
    );
  }
}

async function cmdAsk(arg: string | undefined): Promise<void> {
  const list = isQuestion(arg) ? [arg] : QUESTION_ORDER;
  if (arg && !isQuestion(arg)) {
    console.log(color(`pergunta desconhecida: ${arg}. Use uma de: ${QUESTION_ORDER.join(", ")}`, c.red));
    return;
  }
  const conns = await connectAll();
  try {
    for (const question of list) {
      const expected = expectedAnswer(questions[question]);
      const rows = [];
      for (const { adapter, ok, error } of conns) {
        if (!ok) { rows.push({ id: adapter.id, language: adapter.language, ok: false, error }); continue; }
        try {
          const r = await adapter.ask(question);
          rows.push({
            id: adapter.id, language: adapter.language, ok: true,
            names: r.people.map((p) => p.name).join(", "),
            match: samePeople(r.people, expected), ms: r.elapsedMs,
          });
        } catch (err) {
          rows.push({ id: adapter.id, language: adapter.language, ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      }
      printTable(question, rows);
    }
  } finally {
    for (const { adapter } of conns) await adapter.close().catch(() => {});
  }
  console.log(color("\nMesma pergunta, mesma resposta — expressividade bem diferente. Veja: poc sources <pergunta>\n", c.dim));
}

function cmdSources(arg: string | undefined): void {
  if (!isQuestion(arg)) {
    console.log(color(`uso: poc sources <${QUESTION_ORDER.join("|")}>`, c.yellow));
    return;
  }
  console.log(color(`\n# ${arg} — ${questions[arg].prompt}`, c.bold));
  for (const adapter of createAllAdapters()) {
    console.log(color(`\n### ${adapter.id}  (${adapter.language})`, c.bold));
    console.log(adapter.querySource(arg));
  }
  console.log();
}

function cmdQueryLanguages(): void {
  console.log("\n" + queryLanguagesDemo() + "\n");
}

function help(): void {
  console.log(`
${color("poc", c.bold)} — DDIA cap. 2 aplicado

  ${color("poc seed", c.cyan)}                    popula todos os modelos
  ${color("poc ask [pergunta]", c.cyan)}          roda a(s) pergunta(s) em todos os modelos
  ${color("poc sources <pergunta>", c.cyan)}      texto cru da consulta de cada modelo
  ${color("poc query-languages", c.cyan)}         demo declarativo vs imperativo + MapReduce

  perguntas: ${QUESTION_ORDER.join(", ")}
`);
}

async function main(): Promise<void> {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case "seed": await cmdSeed(); break;
    case "ask": await cmdAsk(arg); break;
    case "sources": cmdSources(arg); break;
    case "query-languages":
    case "ql": cmdQueryLanguages(); break;
    default: help();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
