import { useEffect, useState } from "react";
import { api, type QueryModel, type QuestionMeta, type RawRun } from "./api";

const FREE = "__free__";

/**
 * Editor de query livre: escolha um modelo e (opcionalmente) uma pergunta para
 * carregar a query canônica daquele modelo+pergunta; edite e execute contra o
 * backend real. (Dev-only: roda a query como está — sem sandbox.)
 */
export function QueryEditor({ questions }: { questions: QuestionMeta[] }) {
  const [models, setModels] = useState<QueryModel[]>([]);
  const [model, setModel] = useState<string>("");
  const [question, setQuestion] = useState<string>(FREE);
  const [query, setQuery] = useState<string>("");
  const [run, setRun] = useState<RawRun | null>(null);
  const [busy, setBusy] = useState(false);
  // querySource de cada modelo para a pergunta atualmente carregada.
  const [sourceByModel, setSourceByModel] = useState<Record<string, string>>({});

  useEffect(() => {
    api.queryModels().then((ms) => {
      setModels(ms);
      if (ms[0]) {
        setModel(ms[0].id);
        setQuery(ms[0].sampleQuery);
      }
    });
  }, []);

  function sampleFor(id: string): string {
    return models.find((m) => m.id === id)?.sampleQuery ?? "";
  }

  async function loadQuestion(qId: string, forModel: string) {
    if (qId === FREE) {
      setSourceByModel({});
      setQuery(sampleFor(forModel));
      return;
    }
    const res = await api.sources(qId);
    const map: Record<string, string> = {};
    for (const s of res.sources) map[s.id] = s.querySource;
    setSourceByModel(map);
    setQuery(map[forModel] ?? sampleFor(forModel));
  }

  function pickModel(id: string) {
    setModel(id);
    setRun(null);
    setQuery(question === FREE ? sampleFor(id) : (sourceByModel[id] ?? sampleFor(id)));
  }

  function pickQuestion(qId: string) {
    setQuestion(qId);
    setRun(null);
    void loadQuestion(qId, model);
  }

  async function execute() {
    setBusy(true);
    setRun(null);
    try {
      setRun(await api.runQuery(model, query));
    } catch (e) {
      setRun({ ok: false, error: String(e) });
    } finally {
      setBusy(false);
    }
  }

  const current = models.find((m) => m.id === model);

  return (
    <div className="editor">
      <div className="editor-bar">
        <select value={model} onChange={(e) => pickModel(e.target.value)}>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id} · {m.language}
            </option>
          ))}
        </select>
        <select value={question} onChange={(e) => pickQuestion(e.target.value)} title="carregar a query desta pergunta">
          <option value={FREE}>exemplo livre</option>
          {questions.map((q) => (
            <option key={q.id} value={q.id}>
              {q.id}
            </option>
          ))}
        </select>
        <button onClick={execute} disabled={busy || !model}>
          {busy ? "Rodando…" : "▶ Executar"}
        </button>
      </div>
      {current && (
        <div className="editor-hint">
          Editando {current.language}
          {question !== FREE ? ` · query de “${question}”` : ""}. Ctrl/⌘+Enter para rodar.
        </div>
      )}
      <textarea
        value={query}
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") execute();
        }}
      />
      {run && !run.ok && <div className="model-err">erro: {run.error}</div>}
      {run && run.ok && run.columns && (
        <div className="result">
          <div className="result-meta">
            {run.rows?.length ?? 0} linha(s) · {run.elapsedMs?.toFixed(1)} ms
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>{run.columns.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {run.rows!.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j}>{cell === null || cell === undefined ? "∅" : String(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
