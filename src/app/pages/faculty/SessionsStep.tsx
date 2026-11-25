import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banner,
  Card,
  Chip,
  Empty,
  Kpis,
  Loading,
  Modal,
  PageHead,
  statusTone,
} from '../../../components/ui';
import { formatIstDateTime } from '../../../lib/format';
import { useAction, useLoad, useNow } from '../../../lib/hooks';
import { monitorAlerts, preTestAnalytics } from '../../../lib/logic/monitor';
import { sessionMarks } from '../../../lib/logic/rubric';
import { must, rpc, supabase } from '../../../lib/supabase';
import type {
  AttendanceRow,
  BankItemRow,
  BatchRow,
  Course,
  EnrollmentRow,
  Profile,
  SessionRunRow,
  SessionRow,
  SubmissionRow,
  TestAttemptRow,
  VivaRow,
} from '../../../lib/types';

export function SessionsStep({
  course,
  batches,
  enrollments,
  sessions,
}: {
  course: Course;
  batches: BatchRow[];
  enrollments: EnrollmentRow[];
  sessions: SessionRow[];
}) {
  const [batchId, setBatchId] = useState(batches[0]?.id ?? '');
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? '');
  const [openAtt, setOpenAtt] = useState(false);
  const [attDraft, setAttDraft] = useState<Record<string, 'present' | 'late' | 'absent'>>({});
  const [remark, setRemark] = useState('');
  const [hintText, setHintText] = useState('');
  const [selectedAlerts, setSelectedAlerts] = useState<string[]>([]);
  const [openTa, setOpenTa] = useState(false);
  const [inspectStudentId, setInspectStudentId] = useState<string | null>(null);
  const [inspectSessId, setInspectSessId] = useState<string | null>(null);
  const [showCodeId, setShowCodeId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const now = useNow(60000);
  const activeBatch = batches.find((b) => b.id === batchId) ?? batches[0] ?? null;
  const activeSess = sessions.find((s) => s.id === sessionId) ?? sessions[0] ?? null;

  const batchEnr = useMemo(
    () => enrollments.filter((e) => e.batch_id === (activeBatch?.id ?? '')),
    [enrollments, activeBatch?.id],
  );
  const studentIds = useMemo(() => batchEnr.map((e) => e.student_id), [batchEnr]);

  const { data, loading, reload } = useLoad(async () => {
    if (!activeSess || !activeBatch) return null;

    const runId = await rpc<string>('start_session_run', {
      p_session_id: activeSess.id,
      p_batch_id: activeBatch.id,
    }).catch(() => null);

    const [runsRes, profRes, attRes, subRes, testRes, bankRes, vivaRes] = await Promise.all([
      supabase.from('session_runs').select('*').eq('session_id', activeSess.id).eq('batch_id', activeBatch.id),
      studentIds.length
        ? supabase.from('profiles').select('id, full_name, email, roll_no').in('id', studentIds)
        : Promise.resolve({ data: [], error: null }),
      runId
        ? supabase.from('attendance').select('*').eq('session_run_id', runId)
        : Promise.resolve({ data: [], error: null }),
      supabase.from('submissions').select('*').eq('course_id', course.id).order('created_at', { ascending: false }),
      supabase.from('test_attempts').select('*').eq('session_id', activeSess.id),
      supabase.from('bank_items').select('id, level, answer').eq('session_id', activeSess.id),
      supabase.from('viva').select('*').eq('session_id', activeSess.id),
    ]);

    return {
      run: (must(runsRes) as SessionRunRow[])[0] ?? null,
      profiles: (must(profRes) as Pick<Profile, 'id' | 'full_name' | 'email' | 'roll_no'>[]) ?? [],
      attendance: must(attRes) as AttendanceRow[],
      submissions: must(subRes) as SubmissionRow[],
      attempts: must(testRes) as TestAttemptRow[],
      bankItems: (bankRes.data as Pick<BankItemRow, 'id' | 'level' | 'answer'>[]) ?? [],
      vivas: must(vivaRes) as VivaRow[],
    };
  }, [activeSess?.id, activeBatch?.id, studentIds.length]);

  // Pitfall 6: open attendance modal only after runs list has loaded and attendance is not done
  const promptedRunRef = useRef<string | null>(null);
  useEffect(() => {
    if (!data?.run || data.run.attendance_done || promptedRunRef.current === data.run.id) return;
    promptedRunRef.current = data.run.id;
    void rpc<Array<{ student_id: string; state: 'present' | 'late' | 'absent' }>>('suggest_attendance', {
      p_run_id: data.run.id,
    })
      .then((rows) => {
        const next: Record<string, 'present' | 'late' | 'absent'> = {};
        for (const r of rows) next[r.student_id] = r.state;
        for (const sid of studentIds) {
          if (!next[sid]) next[sid] = 'absent';
        }
        setAttDraft(next);
        setOpenAtt(true);
      })
      .catch(() => null);
  }, [data?.run, studentIds]);

  // Debounced Realtime subscription (1.5 s)
  const reloadTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!activeSess) return;
    const ch = supabase
      .channel(`live-subs-${activeSess.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'submissions', filter: `session_id=eq.${activeSess.id}` },
        () => {
          if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
          reloadTimerRef.current = window.setTimeout(() => reload(), 1500);
        },
      )
      .subscribe();
    return () => {
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      void supabase.removeChannel(ch);
    };
  }, [activeSess, reload]);

  const saveAttAction = useAction(async () => {
    if (!data?.run) return;
    const entries = studentIds.map((sid) => ({
      student_id: sid,
      state: attDraft[sid] ?? 'absent',
    }));
    await rpc('save_attendance', { p_run_id: data.run.id, p_entries: entries });
  });

  const endRunAction = useAction(async () => {
    if (!data?.run) return;
    await rpc('end_session_run', { p_run_id: data.run.id, p_remark: remark });
  });

  const vivaAction = useAction(async (sid: string, marks: number) => {
    if (!activeSess) return;
    await rpc('set_viva', { p_student_id: sid, p_session_id: activeSess.id, p_assessment_id: null, p_marks: marks });
  });

  const hintAction = useAction(async () => {
    if (!data?.run || selectedAlerts.length === 0 || !hintText.trim()) return;
    await rpc('send_hint', { p_run_id: data.run.id, p_student_ids: selectedAlerts, p_text: hintText.trim() });
  });

  const slowAction = useAction(async (sid: string) => {
    await supabase.from('course_flags').upsert({
      course_id: course.id,
      student_id: sid,
      kind: 'slow',
      note: 'Flagged from live session alerts',
    });
  });

  if (sessions.length === 0 || batches.length === 0) {
    return <Empty message="Save a session plan and import batches before running sessions." />;
  }

  const attMap = new Map((data?.attendance ?? []).map((a) => [a.student_id, a.state]));
  const absentSet = new Set(
    Array.from(attMap.entries())
      .filter(([, st]) => st === 'absent')
      .map(([sid]) => sid),
  );
  const sessSubs = (data?.submissions ?? []).filter((s) => s.session_id === activeSess?.id);
  const alerts = monitorAlerts(studentIds, sessSubs, new Map(), absentSet, now);
  const preAttempts = (data?.attempts ?? []).filter((a) => a.bank === 'pre');
  const analytics = preTestAnalytics(preAttempts, data?.bankItems ?? []);

  const presentCount = Array.from(attMap.values()).filter((s) => s === 'present').length;
  const lateCount = Array.from(attMap.values()).filter((s) => s === 'late').length;
  const absentCount = Array.from(attMap.values()).filter((s) => s === 'absent').length;

  const inspectProfile = data?.profiles.find((p) => p.id === inspectStudentId);
  const inspectSubs = (data?.submissions ?? []).filter(
    (s) => s.student_id === inspectStudentId && (!inspectSessId || s.session_id === inspectSessId),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead
        kicker="STEP 6 · RUN"
        title="Sessions (live lab)"
        lead="Attendance, pre-test analytics, live monitor, hints, viva, and student inspector."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              aria-label="Batch"
              className="xe-select"
              value={activeBatch?.id ?? ''}
              onChange={(e) => setBatchId(e.target.value)}
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {data?.run ? (
              <button type="button" className="xe-btn" onClick={() => setOpenAtt(true)}>
                Attendance
              </button>
            ) : null}
          </div>
        }
      />

      {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {sessions.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`xe-btn xe-mono ${activeSess?.id === s.id ? 'xe-btn--primary' : ''}`}
            onClick={() => setSessionId(s.id)}
          >
            S{s.n}
          </button>
        ))}
      </div>

      {loading || !data ? (
        <Loading label="Loading session…" />
      ) : (
        <>
          <Card
            title={`S${activeSess?.n} · ${activeSess?.topic}`}
            actions={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Chip tone={data.run?.ended_at ? 'good' : data.run?.attendance_done ? 'warn' : 'neutral'}>
                  {data.run?.ended_at ? 'Ended' : data.run?.attendance_done ? 'Live' : 'Not started'}
                </Chip>
                {data.run && !data.run.ended_at ? (
                  <button
                    type="button"
                    className="xe-btn"
                    disabled={endRunAction.busy}
                    onClick={() =>
                      void endRunAction.run().then(() => {
                        setMsg({ tone: 'ok', text: 'Session ended.' });
                        reload();
                      })
                    }
                  >
                    End session
                  </button>
                ) : null}
              </div>
            }
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
              <input
                className="xe-input"
                style={{ flex: 1 }}
                placeholder="Session remark (for course file actual log)"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
              />
            </div>
            <Kpis
              items={[
                { label: 'Present', value: presentCount },
                { label: 'Late', value: lateCount },
                { label: 'Absent', value: absentCount },
                { label: 'Pre-test taken', value: preAttempts.length },
                { label: 'Alerts', value: alerts.length },
              ]}
            />
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
            <Card title="Pre-test performance">
              <div
                role="img"
                aria-label={`Pre-test histogram: ${analytics.histogram.join(', ')}`}
                style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90, borderBottom: '1px solid var(--border)' }}
              >
                {analytics.histogram.map((cnt, score) => (
                  <div key={score} style={{ flex: 1, textAlign: 'center' }}>
                    <div className="xe-mono" style={{ fontSize: 11 }}>{cnt}</div>
                    <div
                      style={{
                        height: Math.max(4, cnt * 14),
                        background: 'var(--teal)',
                        borderRadius: '3px 3px 0 0',
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="xe-mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                <span>0/5</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5/5</span>
              </div>
              <div className="xe-mono" style={{ fontSize: 12, marginTop: 8 }}>
                Easy {analytics.levelPct.easy}% · Medium {analytics.levelPct.medium}% · Hard {analytics.levelPct.hard}%
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--assist)' }}>{analytics.insight}</p>
            </Card>

            <Card title="Live alerts">
              {alerts.length === 0 ? (
                <Empty message="No struggling or idle students right now." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {alerts.map((al) => {
                    const prof = data.profiles.find((p) => p.id === al.studentId);
                    const checked = selectedAlerts.includes(al.studentId);
                    return (
                      <label key={al.studentId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedAlerts((prev) =>
                              prev.includes(al.studentId)
                                ? prev.filter((x) => x !== al.studentId)
                                : [...prev, al.studentId],
                            )
                          }
                        />
                        <span className="xe-mono">{prof?.roll_no ?? prof?.full_name ?? al.studentId.slice(0, 6)}</span>
                        <Chip tone="warn">{al.kind}</Chip>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{al.reason}</span>
                      </label>
                    );
                  })}
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <input
                      className="xe-input"
                      style={{ flex: 1 }}
                      placeholder="Hint to selected students…"
                      value={hintText}
                      onChange={(e) => setHintText(e.target.value)}
                    />
                    <button
                      type="button"
                      className="xe-btn xe-btn--assist"
                      disabled={selectedAlerts.length === 0 || !hintText.trim() || hintAction.busy}
                      onClick={() =>
                        void hintAction.run().then(() => {
                          setHintText('');
                          setMsg({ tone: 'ok', text: `Sent hint to ${selectedAlerts.length} student(s).` });
                        })
                      }
                    >
                      Send hint to {selectedAlerts.length}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="xe-btn" onClick={() => setOpenTa(true)}>
                      Send TA to seats
                    </button>
                    <button
                      type="button"
                      className="xe-btn"
                      disabled={selectedAlerts.length === 0}
                      onClick={() =>
                        void Promise.all(selectedAlerts.map((id) => slowAction.run(id))).then(() =>
                          setMsg({ tone: 'ok', text: 'Added to slow-learner list.' }),
                        )
                      }
                    >
                      Add to slow-learner list
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </div>

          <Card title="Live monitor" noPadding>
            <div className="xe-table-wrap">
              <table className="xe-table">
                <thead>
                  <tr>
                    <th>Roll</th>
                    <th>Student</th>
                    <th>Attendance</th>
                    <th>Runs</th>
                    <th>Status</th>
                    <th>Pre</th>
                    <th>Post</th>
                    <th>Viva (/{course.rubric.viva})</th>
                  </tr>
                </thead>
                <tbody>
                  {data.profiles.map((p) => {
                    const att = attMap.get(p.id) ?? 'absent';
                    const mySubs = sessSubs.filter((s) => s.student_id === p.id);
                    const allPassed = mySubs.some((s) => s.hidden_total > 0 && s.hidden_passed === s.hidden_total);
                    const visPassed = mySubs.some((s) => s.visible_total > 0 && s.visible_passed === s.visible_total);
                    const preScore = data.attempts.find((a) => a.student_id === p.id && a.bank === 'pre')?.score;
                    const postScore = data.attempts.find((a) => a.student_id === p.id && a.bank === 'post')?.score;
                    const vivaVal = data.vivas.find((v) => v.student_id === p.id)?.marks ?? 0;

                    return (
                      <tr key={p.id}>
                        <td className="xe-mono">{p.roll_no ?? '—'}</td>
                        <td>
                          <button
                            type="button"
                            className="xe-btn"
                            onClick={() => {
                              setInspectStudentId(p.id);
                              setInspectSessId(activeSess?.id ?? null);
                            }}
                          >
                            {p.full_name}
                          </button>
                        </td>
                        <td>
                          <Chip tone={statusTone(att)}>{att}</Chip>
                        </td>
                        <td className="xe-mono">{mySubs.length}</td>
                        <td>
                          <Chip tone={allPassed ? 'good' : visPassed ? 'warn' : 'neutral'}>
                            {allPassed ? 'All passed' : visPassed ? 'Visible passed' : mySubs.length ? 'In progress' : 'Not started'}
                          </Chip>
                        </td>
                        <td className="xe-mono">{preScore !== undefined ? `${preScore}/5` : '—'}</td>
                        <td className="xe-mono">{postScore !== undefined ? `${postScore}/5` : '—'}</td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={course.rubric.viva}
                            disabled={att === 'absent'}
                            aria-label={`Viva for ${p.full_name}`}
                            className="xe-input xe-mono"
                            style={{ width: 64, height: 30 }}
                            defaultValue={vivaVal}
                            onBlur={(e) => void vivaAction.run(p.id, Number(e.target.value) || 0)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {inspectProfile ? (
            <Card
              title={`Student inspector · ${inspectProfile.full_name}`}
              actions={
                <button type="button" className="xe-btn" onClick={() => setInspectStudentId(null)}>
                  Close
                </button>
              }
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`xe-btn xe-mono ${inspectSessId === s.id ? 'xe-btn--primary' : ''}`}
                    onClick={() => setInspectSessId(s.id)}
                  >
                    S{s.n}
                  </button>
                ))}
              </div>
              {inspectSessId ? (
                <div style={{ marginBottom: 12, fontSize: 13 }}>
                  Session rubric breakdown:{' '}
                  <span className="xe-mono">
                    {
                      sessionMarks(
                        {
                          attendance: attMap.get(inspectProfile.id) ?? 'absent',
                          preCorrect:
                            data.attempts.find(
                              (a) => a.student_id === inspectProfile.id && a.bank === 'pre',
                            )?.score ?? 0,
                          postCorrect:
                            data.attempts.find(
                              (a) => a.student_id === inspectProfile.id && a.bank === 'post',
                            )?.score ?? 0,
                          questions: inspectSubs.map((s) => ({
                            visiblePassed: s.visible_passed,
                            visibleTotal: s.visible_total,
                            hiddenPassed: s.hidden_passed,
                            hiddenTotal: s.hidden_total,
                          })),
                          viva: data.vivas.find((v) => v.student_id === inspectProfile.id)?.marks ?? 0,
                        },
                        course.rubric,
                      ).total
                    }
                    /50
                  </span>
                </div>
              ) : null}
              <div className="xe-table-wrap">
                <table className="xe-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Lang</th>
                      <th>Visible</th>
                      <th>Hidden</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {inspectSubs.map((s) => (
                      <tr key={s.id}>
                        <td className="xe-mono" style={{ fontSize: 12 }}>{formatIstDateTime(s.created_at)}</td>
                        <td className="xe-mono">{s.lang}</td>
                        <td className="xe-mono">{s.visible_passed}/{s.visible_total}</td>
                        <td className="xe-mono">{s.hidden_passed}/{s.hidden_total}</td>
                        <td>
                          <button
                            type="button"
                            className="xe-btn"
                            onClick={() => setShowCodeId((prev) => (prev === s.id ? null : s.id))}
                          >
                            {showCodeId === s.id ? 'Hide code' : 'View code'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {showCodeId ? (
                <pre
                  className="xe-mono"
                  style={{
                    marginTop: 10,
                    padding: 12,
                    background: 'var(--editor-bg)',
                    color: '#F4F3EF',
                    borderRadius: 6,
                    overflowX: 'auto',
                  }}
                >
                  {inspectSubs.find((s) => s.id === showCodeId)?.code}
                </pre>
              ) : null}
            </Card>
          ) : null}
        </>
      )}

      <Modal open={openAtt} title="Confirm attendance" onClose={() => setOpenAtt(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Click a student to cycle: present → late → absent. Confirming closes the pre-test and starts the lab.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6 }}>
            {(data?.profiles ?? []).map((p) => {
              const st = attDraft[p.id] ?? 'absent';
              const nextState = st === 'present' ? 'late' : st === 'late' ? 'absent' : 'present';
              return (
                <button
                  key={p.id}
                  type="button"
                  className="xe-btn"
                  style={{ justifyContent: 'space-between' }}
                  onClick={() => setAttDraft((prev) => ({ ...prev, [p.id]: nextState }))}
                >
                  <span className="xe-mono">{p.roll_no ?? p.full_name.slice(0, 8)}</span>
                  <Chip tone={statusTone(st)}>{st}</Chip>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="xe-btn" onClick={() => setOpenAtt(false)}>
              Later
            </button>
            <button
              type="button"
              className="xe-btn xe-btn--primary"
              disabled={saveAttAction.busy}
              onClick={() =>
                void saveAttAction.run().then(() => {
                  setOpenAtt(false);
                  setMsg({ tone: 'ok', text: 'Attendance confirmed. Pre-test closed.' });
                  reload();
                })
              }
            >
              Confirm and open session
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={openTa} title="Send TA to seats" onClose={() => setOpenTa(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13 }}>
            Lab staff: {activeBatch?.staff.length ? activeBatch.staff.join(', ') : 'Assigned TA'}
          </div>
          <div style={{ fontSize: 13 }}>
            Students needing help:{' '}
            {selectedAlerts
              .map((id) => data?.profiles.find((p) => p.id === id)?.roll_no ?? id.slice(0, 6))
              .join(', ') || 'None selected'}
          </div>
          <button type="button" className="xe-btn" onClick={() => window.print()}>
            Print sheet
          </button>
        </div>
      </Modal>
    </div>
  );
}
