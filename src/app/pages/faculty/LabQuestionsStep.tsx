import { useState, type FormEvent } from 'react';
import { Banner, Card, Chip, Empty, Modal, PageHead, statusTone } from '../../../components/ui';
import { useAction } from '../../../lib/hooks';
import { parseQuestionsJson, pickTwo } from '../../../lib/logic/prep';
import { fn, rpc, supabase } from '../../../lib/supabase';
import type { Course, QuestionRow, SessionQuestionRow, SessionRow } from '../../../lib/types';

export function LabQuestionsStep({
  course,
  sessions,
  questions,
  sessionQuestions,
  onReload,
}: {
  course: Course;
  sessions: SessionRow[];
  questions: QuestionRow[];
  sessionQuestions: SessionQuestionRow[];
  onReload: () => void;
}) {
  const [selectedSessionId, setSelectedSessionId] = useState(sessions[0]?.id ?? '');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [openWrite, setOpenWrite] = useState(false);

  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [statement, setStatement] = useState('');
  const [refCode, setRefCode] = useState('#include <stdio.h>\nint main() { return 0; }\n');

  const activeSess = sessions.find((s) => s.id === selectedSessionId) ?? sessions[0] ?? null;
  const sessCands = activeSess ? questions.filter((q) => q.session_id === activeSess.id) : [];
  const pickedIds = new Set(
    activeSess
      ? sessionQuestions.filter((sq) => sq.session_id === activeSess.id).map((sq) => sq.question_id)
      : [],
  );

  const draftAction = useAction(async (sess: SessionRow) => {
    await fn('ai-generate', {
      kind: 'lab_candidates',
      course_id: course.id,
      session_id: sess.id,
      topic: sess.topic,
      co_code: 'CO1',
      btl: sess.btl,
    });
  });

  const pickAction = useAction(async (sessionId: string, q1: string, q2: string) => {
    await rpc('pick_session_questions', { p_session_id: sessionId, p_q1: q1, p_q2: q2 });
  });

  const writeAction = useAction(async () => {
    if (!activeSess) return;
    const { data: q, error } = await supabase
      .from('questions')
      .insert({
        course_id: course.id,
        kind: 'lab',
        session_id: activeSess.id,
        difficulty,
        title: title.trim(),
        statement: statement.trim(),
        source: 'faculty',
        valid: false,
      })
      .select('id')
      .single();
    if (error || !q) throw new Error(error?.message ?? 'failed');
    await supabase.from('reference_solutions').insert({
      question_id: q.id,
      lang: 'c',
      code: refCode,
    });
    await fn('validate-question', { question_id: q.id }).catch(() => null);
  });

  const handleTogglePick = async (q: QuestionRow) => {
    if (!activeSess || !q.valid) return;
    const cur = Array.from(pickedIds);
    const next = cur.includes(q.id) ? cur.filter((id) => id !== q.id) : [...cur, q.id].slice(-2);
    if (next.length === 2) {
      await pickAction.run(activeSess.id, next[0]!, next[1]!);
      setMsg({ tone: 'ok', text: `Picked 2 questions for S${activeSess.n}.` });
      onReload();
    } else {
      setMsg({ tone: 'ok', text: 'Select 1 more valid question to save pair.' });
    }
  };

  const handleAutoPick = async (sess: SessionRow) => {
    const cands = questions.filter((q) => q.session_id === sess.id);
    const pair = pickTwo(cands);
    if (!pair) {
      setMsg({ tone: 'err', text: `S${sess.n} needs at least 2 valid candidates.` });
      return;
    }
    await pickAction.run(sess.id, pair[0].id, pair[1].id);
    setMsg({ tone: 'ok', text: `Assist picked 2 questions for S${sess.n}.` });
    onReload();
  };

  const handleDraftRemaining = async () => {
    const missing = sessions.filter((s) => !questions.some((q) => q.session_id === s.id));
    for (const s of missing) {
      const res = await draftAction.run(s);
      if (res === null) break; // stops on credit cap error
    }
    onReload();
  };

  const handleBulkPick = async () => {
    for (const s of sessions) {
      const hasTwo = sessionQuestions.filter((sq) => sq.session_id === s.id).length === 2;
      if (hasTwo) continue;
      const pair = pickTwo(questions.filter((q) => q.session_id === s.id));
      if (pair) await pickAction.run(s.id, pair[0].id, pair[1].id);
    }
    setMsg({ tone: 'ok', text: 'Bulk pick complete.' });
    onReload();
  };

  const handleUploadJson = async (file: File | undefined) => {
    if (!file || !activeSess) return;
    try {
      const text = await file.text();
      const parsed = parseQuestionsJson(text);
      for (const item of parsed) {
        const { data: q } = await supabase
          .from('questions')
          .insert({
            course_id: course.id,
            kind: 'lab',
            session_id: activeSess.id,
            co_code: item.co_code,
            difficulty: item.difficulty,
            title: item.title,
            statement: item.statement,
            input_spec: item.input_spec,
            output_spec: item.output_spec,
            constraints: item.constraints,
            source: 'faculty',
            valid: false,
          })
          .select('id')
          .single();
        if (q) {
          await supabase.from('test_cases').insert(
            item.tests.map((t, idx) => ({
              question_id: q.id,
              ord: idx + 1,
              input: t.input,
              expected: t.expected,
              hidden: t.hidden,
            })),
          );
          if (item.reference_c) {
            await supabase.from('reference_solutions').insert({
              question_id: q.id,
              lang: 'c',
              code: item.reference_c,
            });
          }
          await fn('validate-question', { question_id: q.id }).catch(() => null);
        }
      }
      setMsg({ tone: 'ok', text: `Uploaded ${parsed.length} question(s) to S${activeSess.n}.` });
      onReload();
    } catch {
      setMsg({ tone: 'err', text: 'Invalid question JSON format.' });
    }
  };

  const handleWriteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !statement.trim()) return;
    await writeAction.run();
    setOpenWrite(false);
    setTitle('');
    setStatement('');
    onReload();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead
        kicker="STEP 4 · PREPARE"
        title="Lab questions"
        lead="4 Assist candidates per session; pick 2 valid questions or add your own."
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="xe-btn xe-btn--primary" onClick={() => void handleBulkPick()}>
              Assist pick 2 for {sessions.length} sessions
            </button>
            <button
              type="button"
              className="xe-btn"
              disabled={draftAction.busy}
              onClick={() => void handleDraftRemaining()}
            >
              Draft candidates for remaining sessions
            </button>
          </div>
        }
      />

      {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}
      {draftAction.message ? <Banner tone={draftAction.message.tone}>{draftAction.message.text}</Banner> : null}
      {pickAction.message ? <Banner tone={pickAction.message.tone}>{pickAction.message.text}</Banner> : null}

      {sessions.length === 0 ? (
        <Empty message="Save a session plan in Step 3 before preparing lab questions." />
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`xe-btn ${activeSess?.id === s.id ? 'xe-btn--primary' : ''}`}
                onClick={() => setSelectedSessionId(s.id)}
              >
                <span className="xe-mono">S{s.n}</span>
                <Chip tone={statusTone(s.status)}>{s.status}</Chip>
              </button>
            ))}
          </div>

          {activeSess ? (
            <Card
              title={`S${activeSess.n} · ${activeSess.topic}`}
              actions={
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="xe-btn xe-btn--assist"
                    disabled={draftAction.busy}
                    onClick={() => void draftAction.run(activeSess).then(onReload)}
                  >
                    Draft 4 candidates
                  </button>
                  <button
                    type="button"
                    className="xe-btn"
                    onClick={() => void handleAutoPick(activeSess)}
                  >
                    Assist pick best 2
                  </button>
                  <button type="button" className="xe-btn" onClick={() => setOpenWrite(true)}>
                    Write own question
                  </button>
                  <label className="xe-btn">
                    Upload own
                    <input
                      type="file"
                      accept=".json"
                      style={{ display: 'none' }}
                      onChange={(e) => void handleUploadJson(e.target.files?.[0])}
                    />
                  </label>
                </div>
              }
            >
              {sessCands.length === 0 ? (
                <Empty message="No candidates yet. Click Draft 4 candidates or Write own question." />
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: 12,
                  }}
                >
                  {sessCands.map((q) => {
                    const picked = pickedIds.has(q.id);
                    return (
                      <div
                        key={q.id}
                        style={{
                          padding: 12,
                          borderRadius: 6,
                          border: picked ? '2px solid var(--teal)' : '1px solid var(--border)',
                          background: q.valid ? 'var(--surface)' : 'var(--surface-alt)',
                          opacity: q.valid ? 1 : 0.55,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                          <strong>{q.title}</strong>
                          <Chip tone={q.valid ? 'good' : 'bad'}>
                            {q.valid ? 'Valid' : 'Invalid'}
                          </Chip>
                        </div>
                        <div className="xe-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {q.co_code} · {q.difficulty} · {q.source}
                        </div>
                        <p style={{ margin: 0, fontSize: 13 }}>{q.statement}</p>
                        {q.validation_note ? (
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{q.validation_note}</div>
                        ) : null}
                        <div style={{ marginTop: 'auto', paddingTop: 6 }}>
                          <button
                            type="button"
                            className={`xe-btn ${picked ? 'xe-btn--teal' : ''}`}
                            disabled={!q.valid || pickAction.busy}
                            onClick={() => void handleTogglePick(q)}
                          >
                            {picked ? 'Picked' : 'Pick question'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          ) : null}
        </>
      )}

      <Modal open={openWrite} title="Write own lab question" onClose={() => setOpenWrite(false)}>
        <form onSubmit={(e) => void handleWriteSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="xe-field">
            <span>Title</span>
            <input className="xe-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label className="xe-field">
            <span>Difficulty</span>
            <select
              className="xe-select"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label className="xe-field">
            <span>Statement</span>
            <textarea
              className="xe-input"
              style={{ height: 90, padding: 8 }}
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              required
            />
          </label>
          <label className="xe-field">
            <span>Reference solution (C)</span>
            <textarea
              className="xe-input xe-mono"
              style={{ height: 90, padding: 8, fontSize: 12 }}
              value={refCode}
              onChange={(e) => setRefCode(e.target.value)}
            />
          </label>
          <button type="submit" className="xe-btn xe-btn--primary" disabled={writeAction.busy}>
            Save &amp; validate
          </button>
        </form>
      </Modal>
    </div>
  );
}
