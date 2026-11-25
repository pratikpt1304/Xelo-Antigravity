import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, Banner, Card, Chip, Kpis, PageHead, Seg, statusTone } from '../../../components/ui';
import { useAction, useLoad } from '../../../lib/hooks';
import { computeReport } from '../../../lib/api/report';
import { downloadCsv } from '../../../lib/logic/csv';
import { classifyLearners, histogram, mean, normalPdf, sd } from '../../../lib/logic/stats';
import { must, rpc, supabase } from '../../../lib/supabase';
import type {
  AttendanceRow,
  Course,
  CourseOutcome,
  EnrollmentRow,
  Profile,
  SessionRow,
  SubmissionRow,
  TestAttemptRow,
  VivaRow,
} from '../../../lib/types';

type ReportTab = 'coursefile' | 'internal' | 'labfiles' | 'final';

const COURSE_FILE_SECTIONS = [
  '1. Course details',
  '2. CO–PO/PSO mapping',
  '3. Session plan',
  '4. Actual log (planned vs conducted)',
  '5. Marking rubric',
  '6. Lab questions',
  '7. Mark list per rubric',
  '8. Internal CO attainment',
  '9. Internal summary',
  '10. BoS suggestions',
  '11. End-sem questions',
  '12. End-sem mark sheet',
  '13. Overall attainment',
  '14. Overall summary',
];

export function ReportsStep({
  course,
  outcomes,
  sessions,
  enrollments,
  onReload,
}: {
  course: Course;
  outcomes: CourseOutcome[];
  sessions: SessionRow[];
  enrollments: EnrollmentRow[];
  onReload: () => void;
}) {
  const [tab, setTab] = useState<ReportTab>('coursefile');
  const [distCo, setDistCo] = useState<string>('internal');
  const [bosText, setBosText] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const studentIds = useMemo(() => enrollments.map((e) => e.student_id), [enrollments]);

  const { data } = useLoad(async () => {
    const [profRes, attRes, attmRes, subRes, vivaRes, notesRes, flagRes] = await Promise.all([
      studentIds.length
        ? supabase.from('profiles').select('id, full_name, email, roll_no').in('id', studentIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from('attendance').select('*'),
      supabase.from('test_attempts').select('*'),
      supabase.from('submissions').select('*').eq('course_id', course.id),
      supabase.from('viva').select('*'),
      supabase.from('course_notes').select('*').eq('course_id', course.id).maybeSingle(),
      supabase.from('course_flags').select('*').eq('course_id', course.id),
    ]);

    return {
      profiles: (must(profRes) as Pick<Profile, 'id' | 'full_name' | 'email' | 'roll_no'>[]) ?? [],
      attendance: must(attRes) as AttendanceRow[],
      attempts: must(attmRes) as TestAttemptRow[],
      submissions: must(subRes) as SubmissionRow[],
      vivas: must(vivaRes) as VivaRow[],
      notes: (notesRes.data as { bos_suggestions: string } | null) ?? null,
      flags: (flagRes.data as Array<{ id: string; student_id: string; kind: 'slow' | 'fast'; note: string | null }>) ?? [],
    };
  }, [course.id, studentIds.length]);

  const report = useMemo(() => {
    if (!data) return null;
    return computeReport({
      course,
      outcomes,
      sessions,
      enrollments,
      profiles: data.profiles,
      attendance: data.attendance,
      attempts: data.attempts,
      submissions: data.submissions,
      vivas: data.vivas,
    });
  }, [course, data, enrollments, outcomes, sessions]);

  const saveBosAction = useAction(async () => {
    await supabase
      .from('course_notes')
      .upsert({ course_id: course.id, bos_suggestions: bosText });
  });

  const saveSnapshotAction = useAction(async () => {
    if (!report) return;
    const scores = report.rows.map((r) => r.internal100);
    await supabase.from('course_snapshots').upsert({
      course_id: course.id,
      students: report.rows.length,
      internal_mean: Number(mean(scores).toFixed(2)),
      below_40: scores.filter((s) => s < 40).length,
      co_internal: report.coInternal,
      co_overall: report.coOverall,
      overall_pct: report.overallPct,
      computed_at: new Date().toISOString(),
    });
  });

  const submitFinalAction = useAction(async () => {
    await rpc('submit_final_marks', { p_course_id: course.id });
  });

  const scores = useMemo(() => {
    if (!report) return [];
    if (distCo === 'internal') return report.rows.map((r) => r.internal100);
    return report.rows.map((r) => r.coPcts[distCo] ?? 0);
  }, [distCo, report]);

  const hist = histogram(scores, 10, 100);
  const mu = mean(scores);
  const sigma = sd(scores);
  const learners = classifyLearners(
    (report?.rows ?? []).map((r) => ({ id: r.studentId, score: r.internal100, name: r.name, roll: r.rollNo })),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead
        kicker="STEP 9 · COMPLETE"
        title="Reports and course file"
        lead="14-section NBA/NAAC course file, internal CO attainment, student lab files, and final marks."
        actions={
          <Seg
            label="Report tabs"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'coursefile', label: 'Course file' },
              { value: 'internal', label: 'Internal report' },
              { value: 'labfiles', label: 'Student lab files' },
              { value: 'final', label: 'Final marks' },
            ]}
          />
        }
      />

      {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}

      {tab === 'coursefile' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card
            title="14-section course file"
            actions={
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="xe-btn"
                  onClick={() =>
                    downloadCsv(
                      `${course.code}-mark-list.csv`,
                      ['Roll', 'Name', 'Internal /100', 'Attendance %'],
                      (report?.rows ?? []).map((r) => [r.rollNo, r.name, r.internal100, r.attendancePct]),
                    )
                  }
                >
                  Mark list (CSV)
                </button>
                <button
                  type="button"
                  className="xe-btn"
                  onClick={() =>
                    downloadCsv(
                      `${course.code}-actual-log.csv`,
                      ['Session', 'Date', 'Topic', 'Status'],
                      sessions.map((s) => [`S${s.n}`, s.scheduled_date ?? '', s.topic, s.status]),
                    )
                  }
                >
                  Actual log (CSV)
                </button>
                <button type="button" className="xe-btn xe-btn--primary no-print" onClick={() => window.print()}>
                  Print / save as PDF
                </button>
              </div>
            }
            noPadding
          >
            <div className="xe-table-wrap">
              <table className="xe-table">
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {COURSE_FILE_SECTIONS.map((sec, idx) => {
                    const status =
                      idx >= 10 && idx <= 13
                        ? 'After end-sem'
                        : idx === 3 || idx === 6
                          ? `To date (${report?.conductedCount ?? 0})`
                          : 'Ready';
                    return (
                      <tr key={sec}>
                        <td style={{ fontWeight: 500 }}>{sec}</td>
                        <td>
                          <Chip tone={status === 'Ready' ? 'good' : 'neutral'}>{status}</Chip>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="10. BoS suggestions">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                aria-label="BoS suggestions"
                className="xe-input"
                style={{ height: 80, padding: 8 }}
                value={bosText || data?.notes?.bos_suggestions || ''}
                onChange={(e) => setBosText(e.target.value)}
              />
              <div>
                <button
                  type="button"
                  className="xe-btn"
                  onClick={() =>
                    void saveBosAction.run().then(() => setMsg({ tone: 'ok', text: 'BoS suggestions saved.' }))
                  }
                >
                  Save BoS suggestions
                </button>
              </div>
            </div>
          </Card>

          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            XeIO · designed and maintained by Elzeo Future Technologies Pvt Ltd, India
          </div>
        </div>
      ) : null}

      {tab === 'internal' && report ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Kpis
            items={[
              { label: 'Overall attainment', value: `${report.overallPct}%` },
              { label: 'Class mean', value: `${Math.round(mu)}/100` },
              { label: 'COs attained', value: Object.values(report.coInternal).filter((c) => c.level > 0).length },
              { label: 'Slow learners', value: learners.slow.length },
              { label: 'Fast learners', value: learners.fast.length },
            ]}
          />

          <Card
            title="CO attainment"
            actions={
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="xe-btn"
                  onClick={() =>
                    void saveSnapshotAction.run().then(() => setMsg({ tone: 'ok', text: 'Course snapshot saved.' }))
                  }
                >
                  Save snapshot
                </button>
                <button
                  type="button"
                  className="xe-btn"
                  onClick={() =>
                    downloadCsv(
                      `${course.code}-internal-sheet.csv`,
                      ['Roll', 'Name', 'Internal /100', ...outcomes.map((o) => o.code)],
                      report.rows.map((r) => [
                        r.rollNo,
                        r.name,
                        r.internal100,
                        ...outcomes.map((o) => r.coPcts[o.code] ?? 0),
                      ]),
                    )
                  }
                >
                  Mark sheet (CSV)
                </button>
              </div>
            }
            noPadding
          >
            <div className="xe-table-wrap">
              <table className="xe-table">
                <thead>
                  <tr>
                    <th>CO</th>
                    <th>Statement</th>
                    <th>% ≥ {course.attainment_target}</th>
                    <th>Mean</th>
                    <th>Level</th>
                  </tr>
                </thead>
                <tbody>
                  {outcomes.map((co) => {
                    const st = report.coInternal[co.code] ?? { pctAttaining: 0, level: 0, mean: 0 };
                    return (
                      <tr key={co.id}>
                        <td className="xe-mono">{co.code}</td>
                        <td>{co.statement}</td>
                        <td style={{ minWidth: 160 }}>
                          <div className="xe-mono" style={{ fontSize: 12 }}>{st.pctAttaining}%</div>
                          <Bar value={st.pctAttaining} target={course.attainment_target} label={co.code} />
                        </td>
                        <td className="xe-mono">{st.mean}%</td>
                        <td className="xe-mono">L{st.level}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card
            title="Distribution and bell curve"
            actions={
              <select
                aria-label="Distribution metric"
                className="xe-select"
                value={distCo}
                onChange={(e) => setDistCo(e.target.value)}
              >
                <option value="internal">Internal /100</option>
                {outcomes.map((o) => (
                  <option key={o.id} value={o.code}>
                    {o.code}
                  </option>
                ))}
              </select>
            }
          >
            <svg
              role="img"
              aria-label={`Score distribution with mean ${Math.round(mu)} and target ${course.attainment_target}`}
              viewBox="0 0 500 140"
              style={{ width: '100%', maxWidth: 620, height: 140 }}
            >
              {hist.map((cnt, idx) => {
                const maxCnt = Math.max(1, ...hist);
                const h = (cnt / maxCnt) * 100;
                return (
                  <rect
                    key={idx}
                    x={idx * 50 + 6}
                    y={120 - h}
                    width={38}
                    height={h}
                    fill="#E6F0EC"
                    stroke="#0E5E52"
                  />
                );
              })}
              {sigma > 0 ? (
                <polyline
                  fill="none"
                  stroke="#141413"
                  strokeWidth="2"
                  points={Array.from({ length: 50 }, (_, i) => {
                    const xVal = i * 2;
                    const y = 120 - Math.min(110, normalPdf(xVal, mu, sigma) * 2500);
                    return `${xVal * 5},${y.toFixed(1)}`;
                  }).join(' ')}
                />
              ) : null}
              <line x1={40 * 5} y1={10} x2={40 * 5} y2={125} stroke="#9F1D1D" strokeDasharray="3 3" />
              <line
                x1={course.attainment_target * 5}
                y1={10}
                x2={course.attainment_target * 5}
                y2={125}
                stroke="#C2410C"
                strokeDasharray="3 3"
              />
              <line x1={80 * 5} y1={10} x2={80 * 5} y2={125} stroke="#0E5E52" strokeDasharray="3 3" />
            </svg>
          </Card>
        </div>
      ) : null}

      {tab === 'labfiles' && report ? (
        <Card
          title="Student lab files"
          actions={
            <button type="button" className="xe-btn no-print" onClick={() => window.print()}>
              Print all lab files
            </button>
          }
          noPadding
        >
          <div className="xe-table-wrap">
            <table className="xe-table">
              <thead>
                <tr>
                  <th>Roll</th>
                  <th>Student</th>
                  <th>Internal /100</th>
                  <th>Attendance</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.studentId}>
                    <td className="xe-mono">{r.rollNo}</td>
                    <td>{r.name}</td>
                    <td className="xe-mono">{r.internal100}</td>
                    <td className="xe-mono">{r.attendancePct}%</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link className="xe-btn" to={`/verify/${course.id}/${r.studentId}`}>
                        Verify link
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === 'final' ? (
        <Card
          title="Final marks pipeline"
          actions={<Chip tone={statusTone(course.final_status)}>{course.final_status}</Chip>}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <Chip tone={course.final_status !== 'draft' ? 'good' : 'neutral'}>1. Faculty submitted</Chip>
            <Chip
              tone={
                course.final_status === 'hod_approved' || course.final_status === 'coe_accepted'
                  ? 'good'
                  : 'neutral'
              }
            >
              2. HOD approved
            </Chip>
            <Chip tone={course.final_status === 'coe_accepted' ? 'good' : 'neutral'}>
              3. CoE accepted
            </Chip>
          </div>
          {course.final_status === 'draft' || course.final_status === 'returned' ? (
            <button
              type="button"
              className="xe-btn xe-btn--primary"
              disabled={submitFinalAction.busy}
              onClick={() =>
                void submitFinalAction.run().then(() => {
                  setMsg({ tone: 'ok', text: 'Final marks submitted to HOD.' });
                  onReload();
                })
              }
            >
              Submit final marks to HOD
            </button>
          ) : (
            <p style={{ margin: 0, color: 'var(--muted)' }}>
              Current pipeline stage: {course.final_status}.
            </p>
          )}
        </Card>
      ) : null}
    </div>
  );
}
