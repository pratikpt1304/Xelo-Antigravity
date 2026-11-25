import { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { go } from '@codemirror/lang-go';
import { java } from '@codemirror/lang-java';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { Banner, Chip } from './ui';
import type { JudgeSummary } from '../lib/logic/judge';
import { LANG_FILES, LANG_LABELS, STARTER_CODE, type CodeLang } from '../lib/logic/starters';

export interface WorkbenchQuestion {
  id: string;
  title: string;
  co_code: string;
  difficulty: string;
  statement: string;
  input_spec: string;
  output_spec: string;
  constraints: string;
  visibleTests: Array<{ ord: number; input: string; expected: string }>;
  hiddenCount: number;
}

function langExtension(lang: CodeLang) {
  switch (lang) {
    case 'c':
    case 'cpp':
      return cpp();
    case 'java':
      return java();
    case 'python':
      return python();
    case 'rust':
      return rust();
    case 'go':
      return go();
  }
}

export function Workbench({
  title,
  questions,
  allowedLangs,
  initialQuestionId,
  initialLang,
  initialCodes,
  preview = false,
  statusChips,
  postTestCard,
  onRun,
  onSaveDraft,
  onExit,
}: {
  title: string;
  questions: WorkbenchQuestion[];
  allowedLangs: CodeLang[];
  initialQuestionId?: string;
  initialLang?: CodeLang;
  initialCodes?: Record<string, string>; // key: `${qId}:${lang}`
  preview?: boolean;
  statusChips?: React.ReactNode;
  postTestCard?: React.ReactNode;
  onRun?: (qId: string, lang: CodeLang, code: string, mode: 'run' | 'submit') => Promise<JudgeSummary>;
  onSaveDraft?: (qId: string, lang: CodeLang, code: string) => Promise<void>;
  onExit?: () => void;
}) {
  const [activeQId, setActiveQId] = useState(initialQuestionId ?? questions[0]?.id ?? '');
  const [lang, setLang] = useState<CodeLang>(initialLang ?? allowedLangs[0] ?? 'c');
  const [codes, setCodes] = useState<Record<string, string>>(() => initialCodes ?? {});
  const [results, setResults] = useState<Record<string, JudgeSummary>>({});
  const [busy, setBusy] = useState(false);
  const [saveNote, setSaveNote] = useState('');

  const editorHostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const dirtyRef = useRef(false);

  const activeQ = questions.find((q) => q.id === activeQId) ?? questions[0];
  const codeKey = `${activeQ?.id ?? ''}:${lang}`;
  const currentCode = codes[codeKey] ?? STARTER_CODE[lang];
  const currentCodeRef = useRef(currentCode);

  useEffect(() => {
    currentCodeRef.current = currentCode;
  });

  useEffect(() => {
    const host = editorHostRef.current;
    if (!host) return;

    const state = EditorState.create({
      doc: currentCodeRef.current,
      extensions: [
        basicSetup,
        langExtension(lang),
        EditorView.editable.of(!preview),
        keymap.of([
          {
            key: 'Escape',
            run: (view) => {
              view.contentDOM.blur();
              return true;
            },
          },
        ]),
        EditorView.theme({
          '&': { height: '100%', backgroundColor: '#1B1B1A', color: '#F4F3EF' },
          '.cm-gutters': { backgroundColor: '#141413', color: '#9C9A92', borderRight: '1px solid #2C2B28' },
          '.cm-activeLineGutter': { backgroundColor: '#2C2B28' },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const val = update.state.doc.toString();
            dirtyRef.current = true;
            setCodes((prev) => ({ ...prev, [codeKey]: val }));
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [codeKey, lang, preview]);

  // Autosave every 10 s
  useEffect(() => {
    if (preview || !onSaveDraft || !activeQ) return;
    const timer = window.setInterval(() => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      void onSaveDraft(activeQ.id, lang, currentCodeRef.current).then(() => {
        setSaveNote('Saved');
      });
    }, 10000);
    return () => window.clearInterval(timer);
  }, [activeQ, lang, onSaveDraft, preview]);

  const handleExec = async (mode: 'run' | 'submit') => {
    if (preview || !onRun || !activeQ) return;
    setBusy(true);
    try {
      if (onSaveDraft) {
        await onSaveDraft(activeQ.id, lang, currentCodeRef.current).catch(() => null);
        dirtyRef.current = false;
        setSaveNote('Saved');
      }
      const summary = await onRun(activeQ.id, lang, currentCodeRef.current, mode);
      setResults((prev) => ({ ...prev, [activeQ.id]: summary }));
    } finally {
      setBusy(false);
    }
  };

  const dotClass = (qId: string) => {
    const res = results[qId];
    if (!res) return 'xe-dot xe-dot--grey';
    if (res.hiddenTotal > 0 && res.hiddenPassed === res.hiddenTotal) return 'xe-dot xe-dot--teal';
    if (res.visibleTotal > 0 && res.visiblePassed === res.visibleTotal) return 'xe-dot xe-dot--orange';
    return 'xe-dot xe-dot--grey';
  };

  const activeRes = activeQ ? results[activeQ.id] : undefined;

  return (
    <div className="xe-ide">
      <div className="xe-ide-bar">
        <strong style={{ fontSize: 13, marginRight: 8, whiteSpace: 'nowrap' }}>{title}</strong>
        {questions.map((q, idx) => (
          <button
            key={q.id}
            type="button"
            className="xe-btn"
            style={{
              minHeight: 28,
              padding: '2px 10px',
              background: activeQ?.id === q.id ? '#2C2B28' : 'transparent',
              color: '#FFFFFF',
              borderColor: '#3D3B36',
            }}
            onClick={() => setActiveQId(q.id)}
          >
            <span className={dotClass(q.id)} />
            <span>Q{idx + 1}</span>
          </button>
        ))}

        <select
          aria-label="Language"
          className="xe-select xe-mono"
          style={{ height: 28, fontSize: 12, background: '#2C2B28', color: '#FFFFFF', borderColor: '#3D3B36' }}
          value={lang}
          onChange={(e) => setLang(e.target.value as CodeLang)}
        >
          {allowedLangs.map((l) => (
            <option key={l} value={l}>
              {LANG_LABELS[l]}
            </option>
          ))}
        </select>

        {statusChips}
        {saveNote ? <span className="xe-mono" style={{ fontSize: 11, color: '#A8A69E' }}>{saveNote}</span> : null}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="xe-btn"
            disabled={preview || busy}
            onClick={() => void handleExec('run')}
          >
            Run
          </button>
          <button
            type="button"
            className="xe-btn xe-btn--teal"
            disabled={preview || busy}
            onClick={() => void handleExec('submit')}
          >
            Submit
          </button>
          {onExit ? (
            <button type="button" className="xe-btn" onClick={onExit}>
              Exit
            </button>
          ) : null}
        </div>
      </div>

      {preview ? (
        <div style={{ padding: '6px 12px', background: 'var(--assist-tint)' }}>
          <Banner tone="info">Preview as student (read-only). Run and Save are disabled.</Banner>
        </div>
      ) : null}

      <div className="xe-ide-body">
        <section className="xe-ide-left" aria-label="Problem statement">
          {activeQ ? (
            <>
              <div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  <Chip tone="neutral">{activeQ.co_code}</Chip>
                  <Chip tone="neutral">{activeQ.difficulty}</Chip>
                  <Chip tone="neutral">{activeQ.visibleTests.length}V + {activeQ.hiddenCount}H</Chip>
                </div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{activeQ.title}</h2>
              </div>
              <p style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}>{activeQ.statement}</p>
              {activeQ.input_spec ? (
                <div>
                  <div className="xe-kicker">Input</div>
                  <div style={{ fontSize: 12 }}>{activeQ.input_spec}</div>
                </div>
              ) : null}
              {activeQ.output_spec ? (
                <div>
                  <div className="xe-kicker">Output</div>
                  <div style={{ fontSize: 12 }}>{activeQ.output_spec}</div>
                </div>
              ) : null}
              {activeQ.constraints ? (
                <div>
                  <div className="xe-kicker">Constraints</div>
                  <div className="xe-mono" style={{ fontSize: 12 }}>{activeQ.constraints}</div>
                </div>
              ) : null}

              <div>
                <div className="xe-kicker">Visible tests</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {activeQ.visibleTests.map((tc) => {
                    const verdict = activeRes?.visible.find((v) => v.ord === tc.ord);
                    return (
                      <div
                        key={tc.ord}
                        style={{
                          padding: 8,
                          borderRadius: 5,
                          border: '1px solid var(--border)',
                          background: 'var(--surface)',
                          fontSize: 12,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span className="xe-mono">Test {tc.ord}</span>
                          {verdict ? (
                            <Chip tone={verdict.passed ? 'good' : 'bad'}>
                              {verdict.passed ? 'Passed' : 'Failed'}
                            </Chip>
                          ) : null}
                        </div>
                        <div className="xe-mono">In: {tc.input || '—'}</div>
                        <div className="xe-mono">Out: {tc.expected}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="xe-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                Hidden tests:{' '}
                {activeRes
                  ? `${activeRes.hiddenPassed}/${activeRes.hiddenTotal || activeQ.hiddenCount} passed`
                  : `0/${activeQ.hiddenCount} passed`}
              </div>

              {postTestCard}
            </>
          ) : null}
        </section>

        <section className="xe-ide-right" aria-label="Code editor and console">
          <div style={{ padding: '4px 10px', background: '#141413', color: '#A8A69E', fontSize: 11 }} className="xe-mono">
            {LANG_FILES[lang]} (Press Esc then Tab to leave editor)
          </div>
          <div ref={editorHostRef} className="xe-ide-editor" />
          <div className="xe-ide-console" aria-label="Console output">
            {!activeRes ? (
              <span style={{ color: '#9C9A92' }}>Run or Submit your code to see test results.</span>
            ) : activeRes.compileError ? (
              <div style={{ color: '#FCA5A5', whiteSpace: 'pre-wrap' }}>{activeRes.compileError}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div>
                  Visible {activeRes.visiblePassed}/{activeRes.visibleTotal} · Hidden{' '}
                  {activeRes.hiddenPassed}/{activeRes.hiddenTotal} · {activeRes.maxRuntimeMs} ms
                </div>
                {activeRes.visible.map((v) => (
                  <div key={v.ord} style={{ color: v.passed ? '#6EE7B7' : '#FCA5A5' }}>
                    Test {v.ord}: {v.passed ? 'PASS' : `FAIL (got "${v.actual}", expected "${v.expected}")`}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
