import { useEffect, useMemo, useState } from "react";
import { api, type AskResponse, type AskResult, type GraphData, type QuestionMeta, type SourcesResponse } from "./api";
import { GraphView } from "./GraphView";
import { QueryEditor } from "./QueryEditor";

type Tab = "compare" | "sources" | "editor";

export function App() {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [questionList, setQuestionList] = useState<QuestionMeta[]>([]);
  const [question, setQuestion] = useState<string>("emigrants");
  const [ask, setAsk] = useState<AskResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [tab, setTab] = useState<Tab>("compare");

  useEffect(() => {
    api.graph().then(setGraph).catch((e) => setMsg(String(e)));
    api.questions().then(setQuestionList).catch((e) => setMsg(String(e)));
  }, []);

  const highlighted = useMemo(() => {
    if (!ask) return new Set<string>();
    const row = selected ? ask.results.find((r) => r.id === selected) : null;
    const people = row?.ok ? row.people : ask.expected;
    return new Set(people.map((p) => p.id));
  }, [ask, selected]);

  async function doSeed() {
    setBusy("seed");
    setMsg("");
    try {
      const r = await api.seed();
      const okCount = r.filter((x) => x.ok).length;
      setMsg(
        `Seed: ${okCount}/${r.length} modelos populados. ` +
          r.filter((x) => !x.ok).map((x) => `${x.id}: ${x.error}`).join(" | "),
      );
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function doAsk(q: string) {
    setBusy("ask");
    setMsg("");
    try {
      setAsk(await api.ask(q));
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(null);
    }
  }

  const current = questionList.find((q) => q.id === question);
  const selectedRow = selected && ask ? ask.results.find((r) => r.id === selected) : null;

  return (
    <div className="app">
      <header>
        <h1>POC Grafos</h1>
        <p className="subtitle">
          Um dataset canônico, 5 modelos de dados, 5 perguntas — a mesma resposta em cada modelo.
        </p>
        <div className="actions">
          <button onClick={doSeed} disabled={busy !== null}>
            {busy === "seed" ? "Populando…" : "1 · Seed"}
          </button>
          <select
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              setSelected(null);
            }}
          >
            {questionList.map((q) => (
              <option key={q.id} value={q.id}>
                {q.id} — {q.prompt}
              </option>
            ))}
          </select>
          <button onClick={() => doAsk(question)} disabled={busy !== null}>
            {busy === "ask" ? "Consultando…" : "2 · Perguntar a todos"}
          </button>
        </div>
        {current && <div className="ddia-hint">{current.ddia}</div>}
        {msg && <div className="msg">{msg}</div>}
      </header>

      <main>
        <section className="graph-panel">
          <div className="panel-title">
            Grafo do dataset {selected ? `· destaque: resposta de ${selected}` : ask ? "· destaque: gabarito" : ""}
          </div>
          {graph ? <GraphView graph={graph} highlighted={highlighted} /> : <div className="loading">carregando grafo…</div>}
          <Legend />
        </section>

        <section className="side">
          <div className="tabs">
            <button className={tab === "compare" ? "tab sel" : "tab"} onClick={() => setTab("compare")}>
              Comparação
            </button>
            <button className={tab === "sources" ? "tab sel" : "tab"} onClick={() => setTab("sources")}>
              Consultas
            </button>
            <button className={tab === "editor" ? "tab sel" : "tab"} onClick={() => setTab("editor")}>
              Editor de query
            </button>
          </div>

          {tab === "editor" ? (
            <QueryEditor questions={questionList} />
          ) : tab === "sources" ? (
            <SourcesView question={question} />
          ) : (
            <>
          <div className="panel-title">
            {ask ? `Respostas · ${ask.prompt}` : "Clique em “Perguntar a todos”"}
          </div>
          <div className="models">
            {(ask?.results ?? []).map((r) => {
              const isSel = selected === r.id;
              return (
                <button
                  key={r.id}
                  className={`model-row ${isSel ? "sel" : ""}`}
                  onClick={() => setSelected(isSel ? null : r.id)}
                >
                  <div className="model-head">
                    <span className="model-id">{r.id}</span>
                    <span className="model-lang">{r.language}</span>
                  </div>
                  {r.ok ? (
                    <>
                      <div className="model-answer">
                        {r.people.map((p) => p.name).join(", ") || "(vazio)"}
                        <span className={r.matchesExpected ? "ok" : "warn"}>{r.matchesExpected ? " ✓" : " ≠"}</span>
                        <span className="ms">{fmtMs(r.elapsedMs)} ms</span>
                      </div>
                      <Timings r={r} />
                    </>
                  ) : (
                    <div className="model-err">erro: {r.error}</div>
                  )}
                </button>
              );
            })}
            {!ask && <div className="hint-empty">Rode o Seed e depois “Perguntar a todos”.</div>}
          </div>

          {selectedRow && (
            <div className="query-box">
              <div className="panel-title">{selectedRow.id} · {selectedRow.language}</div>
              <pre>{selectedRow.querySource}</pre>
            </div>
          )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

/** Lista a query de CADA modelo para a pergunta selecionada (só leitura). */
function SourcesView({ question }: { question: string }) {
  const [data, setData] = useState<SourcesResponse | null>(null);
  const [err, setErr] = useState<string>("");
  useEffect(() => {
    setData(null);
    setErr("");
    api.sources(question).then(setData).catch((e) => setErr(String(e)));
  }, [question]);

  if (err) return <div className="model-err">erro: {err}</div>;
  if (!data) return <div className="hint-empty">carregando consultas…</div>;
  return (
    <div className="sources">
      <div className="panel-title">Como cada modelo expressa: {data.prompt}</div>
      {data.sources.map((s) => (
        <div key={s.id} className="source-item">
          <div className="source-head">
            <span className="model-id">{s.id}</span>
            <span className="model-lang">{s.language}</span>
          </div>
          <pre>{s.querySource}</pre>
        </div>
      ))}
    </div>
  );
}

function fmtMs(ms: number): string {
  return ms < 1 ? ms.toFixed(2) : ms.toFixed(1);
}

/** Decomposição do tempo: conexão, execução no banco, rede+overhead, total. */
function Timings({ r }: { r: AskResult }) {
  const hasSplit = r.serverMs != null && r.networkMs != null;
  const total = r.elapsedMs || 1;
  const serverPct = hasSplit ? (r.serverMs! / total) * 100 : 0;
  const netPct = hasSplit ? (r.networkMs! / total) * 100 : 0;
  return (
    <div className="timings">
      <div className="tbar" title="tempo da query: banco vs rede+overhead">
        {hasSplit ? (
          <>
            <span className="seg seg-server" style={{ width: `${serverPct}%` }} />
            <span className="seg seg-net" style={{ width: `${netPct}%` }} />
          </>
        ) : (
          <span className="seg seg-unknown" style={{ width: "100%" }} />
        )}
      </div>
      <div className="tnums">
        <span><i className="dot dot-conn" />conexão {fmtMs(r.connectMs)}</span>
        <span><i className="dot dot-server" />banco {r.serverMs != null ? fmtMs(r.serverMs) : "—"}</span>
        <span><i className="dot dot-net" />rede {r.networkMs != null ? fmtMs(r.networkMs) : "—"}</span>
        <span className="tnums-total">total {fmtMs(r.elapsedMs)} ms</span>
      </div>
      {r.note && <div className="tnote">{r.note}</div>}
    </div>
  );
}

function Legend() {
  const items: Array<[string, string]> = [
    ["continent", "#6366f1"],
    ["country", "#0ea5e9"],
    ["state", "#14b8a6"],
    ["city", "#22c55e"],
    ["neighborhood", "#84cc16"],
    ["person", "#f59e0b"],
    ["company", "#ec4899"],
  ];
  return (
    <div className="legend">
      {items.map(([label, color]) => (
        <span key={label}>
          <i style={{ background: color }} /> {label}
        </span>
      ))}
      <span className="hint">■ borda vermelha = resposta · — KNOWS tracejado</span>
    </div>
  );
}
