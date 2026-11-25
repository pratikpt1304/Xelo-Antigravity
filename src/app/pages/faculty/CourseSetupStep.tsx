import { useState, type FormEvent } from 'react';
import { Banner, Card, Chip, Modal, PageHead, statusTone } from '../../../components/ui';
import { useAction } from '../../../lib/hooks';
import { rubricTotal } from '../../../lib/logic/checks';
import { pdfToText } from '../../../lib/pdf';
import { fn, rpc, supabase } from '../../../lib/supabase';
import type { CoPoMapRow, Course, CourseOutcome } from '../../../lib/types';

const POS = ['PO1', 'PO2', 'PO3', 'PO4', 'PO5', 'PSO1'];
const LANGS = ['c', 'cpp', 'java', 'python', 'rust', 'go'];

export function CourseSetupStep({
  course,
  outcomes,
  coPoMap,
  onReload,
}: {
  course: Course;
  outcomes: CourseOutcome[];
  coPoMap: CoPoMapRow[];
  onReload: () => void;
}) {
  const locked = course.plan_status === 'sent' || course.plan_status === 'approved';

  const [rubric, setRubric] = useState(course.rubric);
  const [langs, setLangs] = useState<string[]>(course.allowed_langs);
  const [coCode, setCoCode] = useState(`CO${outcomes.length + 1}`);
  const [coStmt, setCoStmt] = useState('');
  const [coBtl, setCoBtl] = useState(3);
  const [coUnit, setCoUnit] = useState(1);

  const [openDraft, setOpenDraft] = useState(false);
  const [syllabusText, setSyllabusText] = useState('');
  const [draftRows, setDraftRows] = useState<
    Array<{ code: string; statement: string; btl: number; unit: number }>
  >([]);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const total = rubricTotal(rubric);

  const saveSettings = useAction(async () => {
    const { error } = await supabase
      .from('courses')
      .update({ rubric, allowed_langs: langs })
      .eq('id', course.id);
    if (error) throw new Error(error.message);
  });

  const addCo = useAction(async () => {
    const { error } = await supabase.from('course_outcomes').insert({
      course_id: course.id,
      code: coCode.trim().toUpperCase(),
      statement: coStmt.trim(),
      btl: coBtl,
      unit: coUnit,
    });
    if (error) throw new Error(error.message);
  });

  const deleteCo = useAction(async (id: string) => {
    const { error } = await supabase.from('course_outcomes').delete().eq('id', id);
    if (error) throw new Error(error.message);
  });

  const setMapLevel = useAction(async (coId: string, po: string, level: number) => {
    const { error } = await supabase
      .from('co_po_map')
      .upsert({ course_id: course.id, co_id: coId, po_code: po, level });
    if (error) throw new Error(error.message);
  });

  const submitPlan = useAction(async () => {
    await saveSettings.run();
    await rpc('submit_course_plan', { p_course_id: course.id });
  });

  const draftSyllabus = useAction(async () => {
    const res = await fn<{
      draft: {
        outcomes: Array<{ code: string; statement: string; btl: number; unit: number }>;
      };
    }>('ai-generate', {
      kind: 'outcomes',
      course_id: course.id,
      syllabus: syllabusText,
    });
    setDraftRows(res.draft.outcomes);
  });

  const insertDraft = useAction(async () => {
    for (const r of draftRows) {
      await supabase.from('course_outcomes').upsert(
        {
          course_id: course.id,
          code: r.code,
          statement: r.statement,
          btl: r.btl,
          unit: r.unit,
        },
        { onConflict: 'course_id,code' },
      );
    }
  });

  const handleAddCo = async (e: FormEvent) => {
    e.preventDefault();
    if (!coStmt.trim()) return;
    await addCo.run();
    setCoStmt('');
    setCoCode(`CO${outcomes.length + 2}`);
    onReload();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await pdfToText(file);
      setSyllabusText(text);
    } catch (e) {
      setBanner({ tone: 'err', text: e instanceof Error ? e.message : 'Could not read file' });
    }
  };

  const mapLookup = new Map(coPoMap.map((m) => [`${m.co_id}:${m.po_code}`, m.level]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead
        kicker="STEP 1 · PLAN"
        title="Course setup"
        lead="Details, course outcomes, CO–PO mapping, and 50-mark session rubric."
        actions={
          !locked ? (
            <button type="button" className="xe-btn xe-btn--assist" onClick={() => setOpenDraft(true)}>
              Draft from syllabus with Assist
            </button>
          ) : null
        }
      />

      {banner ? <Banner tone={banner.tone}>{banner.text}</Banner> : null}
      {submitPlan.message ? <Banner tone={submitPlan.message.tone}>{submitPlan.message.text}</Banner> : null}

      <Card title="Course details">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <div><div className="xe-kicker">Code</div><div className="xe-mono">{course.code}</div></div>
          <div><div className="xe-kicker">Title</div><div>{course.title}</div></div>
          <div><div className="xe-kicker">L-T-P-C</div><div className="xe-mono">{course.ltpc}</div></div>
          <div><div className="xe-kicker">Section · Sem</div><div>{course.section} · Sem {course.semester}</div></div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="xe-kicker">Allowed languages</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {LANGS.map((l) => {
              const checked = langs.includes(l);
              return (
                <label key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={checked}
                    onChange={() =>
                      setLangs((prev) =>
                        prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
                      )
                    }
                  />
                  <span className="xe-mono">{l}</span>
                </label>
              );
            })}
          </div>
        </div>
      </Card>

      <Card title="Course outcomes (CO1–COn)" noPadding>
        <div className="xe-table-wrap">
          <table className="xe-table">
            <thead>
              <tr>
                <th>CO</th>
                <th>Statement</th>
                <th>Unit</th>
                <th>BTL</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {outcomes.map((co) => (
                <tr key={co.id}>
                  <td className="xe-mono" style={{ fontWeight: 600 }}>{co.code}</td>
                  <td>{co.statement}</td>
                  <td className="xe-mono">{co.unit}</td>
                  <td className="xe-mono">BTL {co.btl}</td>
                  <td style={{ textAlign: 'right' }}>
                    {!locked ? (
                      <button
                        type="button"
                        className="xe-btn"
                        onClick={() => void deleteCo.run(co.id).then(onReload)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!locked ? (
          <form
            onSubmit={(e) => void handleAddCo(e)}
            style={{ padding: 12, borderTop: '1px solid var(--border-soft)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}
          >
            <label className="xe-field" style={{ width: 80 }}>
              <span>Code</span>
              <input className="xe-input xe-mono" value={coCode} onChange={(e) => setCoCode(e.target.value)} />
            </label>
            <label className="xe-field" style={{ flex: '1 1 240px' }}>
              <span>Statement</span>
              <input
                className="xe-input"
                value={coStmt}
                onChange={(e) => setCoStmt(e.target.value)}
                placeholder="Write modular C programs using pointers and files."
              />
            </label>
            <label className="xe-field" style={{ width: 70 }}>
              <span>Unit</span>
              <input
                type="number"
                min={1}
                max={10}
                className="xe-input xe-mono"
                value={coUnit}
                onChange={(e) => setCoUnit(Number(e.target.value))}
              />
            </label>
            <label className="xe-field" style={{ width: 80 }}>
              <span>BTL</span>
              <select className="xe-select xe-mono" value={coBtl} onChange={(e) => setCoBtl(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((b) => (
                  <option key={b} value={b}>
                    BTL {b}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="xe-btn" disabled={addCo.busy}>
              Add CO
            </button>
          </form>
        ) : null}
      </Card>

      {outcomes.length > 0 ? (
        <Card title="CO–PO/PSO mapping (levels 0–3)" noPadding>
          <div className="xe-table-wrap">
            <table className="xe-table">
              <thead>
                <tr>
                  <th>CO</th>
                  {POS.map((po) => (
                    <th key={po}>{po}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {outcomes.map((co) => (
                  <tr key={co.id}>
                    <td className="xe-mono">{co.code}</td>
                    {POS.map((po) => {
                      const val = mapLookup.get(`${co.id}:${po}`) ?? 0;
                      return (
                        <td key={po}>
                          <select
                            className="xe-select xe-mono"
                            style={{ height: 30, padding: '0 6px' }}
                            disabled={locked}
                            aria-label={`${co.code} ${po}`}
                            value={val}
                            onChange={(e) =>
                              void setMapLevel.run(co.id, po, Number(e.target.value)).then(onReload)
                            }
                          >
                            {[0, 1, 2, 3].map((lvl) => (
                              <option key={lvl} value={lvl}>
                                {lvl}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        <Card
          title="Marking rubric (internal)"
          actions={
            <Chip tone={total === 50 ? 'good' : 'bad'}>
              {total === 50 ? 'Totals 50' : `Totals ${total} / 50`}
            </Chip>
          }
          noPadding
        >
          <table className="xe-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Earned in each session</th>
                <th style={{ textAlign: 'right' }}>Marks</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['attendance', 'Attendance', 'Present / late check-in'],
                  ['pre_test', 'Pre-test', '5 MCQs before lab starts'],
                  ['post_test', 'Post-test', '5 MCQs after all hidden pass'],
                  ['visible', 'Visible tests', '2 visible tests per question'],
                  ['hidden', 'Hidden tests', '3 hidden tests per question'],
                  ['viva', 'Viva', 'Examiner oral check'],
                ] as const
              ).map(([key, label, desc]) => (
                <tr key={key}>
                  <td style={{ fontWeight: 500 }}>{label}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{desc}</td>
                  <td style={{ textAlign: 'right' }}>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      disabled={locked}
                      aria-label={`${label} marks`}
                      className="xe-input xe-mono"
                      style={{ width: 64, height: 30, textAlign: 'right' }}
                      value={rubric[key]}
                      onChange={(e) =>
                        setRubric((prev) => ({ ...prev, [key]: Number(e.target.value) || 0 }))
                      }
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ fontWeight: 600 }}>Total</td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>Scaled to /100 in reports</td>
                <td className="xe-mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                  {total}
                </td>
              </tr>
            </tbody>
          </table>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card title="Session rules">
            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div><strong>Pre-test:</strong> 5 MCQs (2E, 2M, 1H), one attempt, closes when the lab starts.</div>
              <div><strong>Lab:</strong> 2 coding questions, each with 2 visible and 3 hidden test cases.</div>
              <div><strong>Post-test:</strong> 5 MCQs (1E, 2M, 2H); opens only after all hidden tests pass; closes 23:59.</div>
            </div>
          </Card>

          <Card
            title="HOD approval"
            actions={<Chip tone={statusTone(course.plan_status)}>{course.plan_status}</Chip>}
          >
            {course.plan_remark ? (
              <p style={{ margin: '0 0 10px', fontSize: 13 }}>
                <strong>HOD remark:</strong> {course.plan_remark}
              </p>
            ) : null}
            {!locked ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="xe-btn"
                  disabled={saveSettings.busy}
                  onClick={() =>
                    void saveSettings.run().then(() => {
                      setBanner({ tone: 'ok', text: 'Draft saved.' });
                      onReload();
                    })
                  }
                >
                  Save draft
                </button>
                <button
                  type="button"
                  className="xe-btn xe-btn--primary"
                  disabled={submitPlan.busy}
                  onClick={() =>
                    void submitPlan.run().then((r) => {
                      if (r !== null) {
                        setBanner({ tone: 'ok', text: 'Course plan sent to HOD for approval.' });
                        onReload();
                      }
                    })
                  }
                >
                  Send course plan to HOD
                </button>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                Plan is locked while {course.plan_status}.
              </p>
            )}
          </Card>
        </div>
      </div>

      <Modal open={openDraft} title="Draft from syllabus with Assist" onClose={() => setOpenDraft(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="xe-field">
            <span>Upload syllabus (.pdf or .txt, max 2 MB)</span>
            <input
              type="file"
              accept=".pdf,.txt,text/plain,application/pdf"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </label>
          <label className="xe-field">
            <span>Or paste syllabus text</span>
            <textarea
              className="xe-input"
              style={{ height: 110, padding: 8 }}
              value={syllabusText}
              onChange={(e) => setSyllabusText(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="xe-btn xe-btn--assist"
            disabled={draftSyllabus.busy || syllabusText.trim().length < 20}
            onClick={() => void draftSyllabus.run()}
          >
            Draft outcomes (1 AI run)
          </button>
          {draftSyllabus.message ? (
            <Banner tone={draftSyllabus.message.tone}>{draftSyllabus.message.text}</Banner>
          ) : null}
          {draftRows.length > 0 ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Proposed outcomes (editable)</div>
              {draftRows.map((r, idx) => (
                <div key={r.code} style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="xe-input xe-mono"
                    style={{ width: 64 }}
                    value={r.code}
                    onChange={(e) =>
                      setDraftRows((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, code: e.target.value } : x)),
                      )
                    }
                  />
                  <input
                    className="xe-input"
                    style={{ flex: 1 }}
                    value={r.statement}
                    onChange={(e) =>
                      setDraftRows((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, statement: e.target.value } : x)),
                      )
                    }
                  />
                </div>
              ))}
              <button
                type="button"
                className="xe-btn xe-btn--primary"
                disabled={insertDraft.busy}
                onClick={() =>
                  void insertDraft.run().then(() => {
                    setOpenDraft(false);
                    onReload();
                  })
                }
              >
                Insert outcomes
              </button>
            </>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
