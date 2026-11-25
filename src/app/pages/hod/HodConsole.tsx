import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banner, Card, Chip, Empty, ErrorNote, Kpis, Loading, PageHead, statusTone } from '../../../components/ui';
import { useAction, useLoad } from '../../../lib/hooks';
import { planChecks } from '../../../lib/logic/checks';
import { approvalAgeLabel, hodSuggestions } from '../../../lib/logic/oversight';
import { useSession } from '../../../lib/session';
import { must, rpc, supabase } from '../../../lib/supabase';
import type { CoPoMapRow, Course, CourseOutcome, Profile } from '../../../lib/types';
import { ConsoleShell } from '../../components/ConsoleShell';

type HodTab = 'overview' | 'approvals' | 'courses' | 'live' | 'final';

interface CourseStatRow {
  course_id: string;
  students: number;
  sessions_total: number;
  sessions_conducted: number;
  attendance_pct: number;
  completion_pct: number;
  at_risk: number;
  live_now: number;
}

interface AtRiskRow {
  student_id: string;
  roll_no: string | null;
  full_name: string;
  course_id: string;
  code: string;
  reason: string;
  attendance_pct: number;
}

interface LiveLabRow {
  run_id: string;
  course_id: string;
  course_code: string;
  batch_name: string;
  room: string;
  slot: string;
  session_n: number;
  topic: string;
  present: number;
  enrolled: number;
  pre_done: number;
  passed: number;
  struggling: number;
}

interface HodAssessmentRow {
  id: string;
  course_id: string;
  batch_id: string;
  hod_status: string;
  stage: string;
}

export function HodConsole() {
  const { institution } = useSession();
  const [tab, setTab] = useState<HodTab>('overview');
  const [selectedId, setSelectedId] = useState('');
  const [remark, setRemark] = useState('');
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const { data, loading, error, reload } = useLoad(async () => {
    const [courseRes, coRes, mapRes, profRes, assRes] = await Promise.all([
      supabase.from('courses').select('*').order('created_at', { ascending: false }),
      supabase.from('course_outcomes').select('*').order('code'),
      supabase.from('co_po_map').select('*'),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('assessments').select('id, course_id, batch_id, hod_status, stage').eq('hod_status', 'sent'),
    ]);
    const courses = must(courseRes) as Course[];
    const ids = courses.map((c) => c.id);
    const [stats, atRisk, liveLabs] = ids.length
      ? await Promise.all([
          rpc<CourseStatRow[]>('course_stats', { p_course_ids: ids }).catch(() => []),
          rpc<AtRiskRow[]>('at_risk_students', { p_course_ids: ids }).catch(() => []),
          rpc<LiveLabRow[]>('live_lab_stats', { p_course_ids: ids }).catch(() => []),
        ])
      : [[], [], []];

    return {
      courses,
      outcomes: must(coRes) as CourseOutcome[],
      coPoMap: must(mapRes) as CoPoMapRow[],
      profiles: (profRes.data ?? []) as Pick<Profile, 'id' | 'full_name'>[],
      assessments: (assRes.data ?? []) as HodAssessmentRow[],
      stats: stats ?? [],
      atRisk: atRisk ?? [],
      liveLabs: liveLabs ?? [],
    };
  }, []);

  useEffect(() => {
    if (tab !== 'live') return;
    const t = window.setInterval(() => reload(), 30000);
    return () => window.clearInterval(t);
  }, [tab, reload]);

  const decidePlanAction = useAction(async (courseId: string, approve: boolean) => {
    await rpc('decide_course_plan', { p_course_id: courseId, p_approve: approve, p_remark: remark.trim() || null });
  });

  const decideFinalAction = useAction(async (courseId: string, approve: boolean) => {
    await rpc('decide_final_marks', { p_course_id: courseId, p_approve: approve, p_remark: remark.trim() || null });
  });

  const decideAssessmentAction = useAction(async (assessmentId: string, approve: boolean) => {
    await rpc('decide_assessment', { p_assessment_id: assessmentId, p_approve: approve, p_remark: remark.trim() || null });
  });

  const courses = data?.courses ?? [];
  const statMap = new Map((data?.stats ?? []).map((s) => [s.course_id, s]));
  const profMap = new Map((data?.profiles ?? []).map((p) => [p.id, p.full_name]));
  const courseMap = new Map(courses.map((c) => [c.id, c]));

  const approvalQueue = [
    ...courses.filter((c) => c.plan_status === 'sent').map((c) => ({ kind: 'Course plan' as const, course: c, assessmentId: '' })),
    ...courses.filter((c) => c.final_status === 'submitted').map((c) => ({ kind: 'Final marks' as const, course: c, assessmentId: '' })),
    ...(data?.assessments ?? [])
      .map((a) => {
        const course = courseMap.get(a.course_id);
        return course ? { kind: 'End-sem set' as const, course, assessmentId: a.id } : null;
      })
      .filter((x): x is { kind: 'End-sem set'; course: Course; assessmentId: string } => x !== null),
  ];

  const selectedItem =
    approvalQueue.find((q) => `${q.kind}:${q.course.id}:${q.assessmentId}` === selectedId) ?? approvalQueue[0] ?? null;

  const totalStudents = (data?.stats ?? []).reduce((a, s) => a + s.students, 0);
  const avgAtt = data?.stats.length
    ? Math.round(data.stats.reduce((a, s) => a + s.attendance_pct, 0) / data.stats.length)
    : 0;
  const avgComp = data?.stats.length
    ? Math.round(data.stats.reduce((a, s) => a + s.completion_pct, 0) / data.stats.length)
    : 0;
  const liveCount = data?.liveLabs.length ?? 0;

  const suggestions = hodSuggestions(
    courses.map((c) => {
      const st = statMap.get(c.id);
      return {
        code: c.code,
        title: c.title,
        plan_status: c.plan_status,
        final_status: c.final_status,
        at_risk: st?.at_risk ?? 0,
        completion_pct: st?.completion_pct ?? 0,
      };
    }),
  );

  const handleDecision = async (approve: boolean) => {
    if (!selectedItem) return;
    if (selectedItem.kind === 'Course plan') {
      await decidePlanAction.run(selectedItem.course.id, approve);
    } else if (selectedItem.kind === 'End-sem set') {
      await decideAssessmentAction.run(selectedItem.assessmentId, approve);
    } else {
      await decideFinalAction.run(selectedItem.course.id, approve);
    }
    setBanner({
      tone: 'ok',
      text: approve ? `Approved ${selectedItem.course.code} (${selectedItem.kind}).` : `Declined ${selectedItem.course.code}.`,
    });
    setRemark('');
    reload();
  };

  return (
    <ConsoleShell
      portalTitle="HOD"
      scopeLabel={institution?.name ?? 'Department'}
      tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'approvals', label: 'Approvals', badge: approvalQueue.length },
        { id: 'courses', label: 'Courses' },
        { id: 'live', label: 'Live', badge: liveCount },
        { id: 'final', label: 'Final marks' },
      ]}
      activeTab={tab}
      onSelectTab={(id) => {
        setTab(id as HodTab);
        setBanner(null);
      }}
    >
      <PageHead
        title={
          tab === 'overview'
            ? 'Department overview'
            : tab === 'approvals'
              ? 'Approvals'
              : tab === 'courses'
                ? 'Department courses'
                : tab === 'live'
                  ? 'Live labs'
                  : 'Final marks pipeline'
        }
        lead="Departmental oversight, approvals, and live lab monitoring."
        actions={
          <Link className="xe-btn" to="/faculty">
            Faculty workspace →
          </Link>
        }
      />

      {banner ? <Banner tone={banner.tone}>{banner.text}</Banner> : null}
      {decidePlanAction.message ? <Banner tone={decidePlanAction.message.tone}>{decidePlanAction.message.text}</Banner> : null}
      {decideFinalAction.message ? <Banner tone={decideFinalAction.message.tone}>{decideFinalAction.message.text}</Banner> : null}
      {error ? <ErrorNote message={error} /> : null}

      {loading || !data ? (
        <Loading />
      ) : tab === 'overview' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Kpis
            items={[
              { label: 'Lab courses', value: courses.length },
              { label: 'Students', value: totalStudents },
              { label: 'Avg attendance', value: `${avgAtt}%` },
              { label: 'Avg completion', value: `${avgComp}%` },
              { label: 'At risk', value: data.atRisk.length },
              { label: 'Waiting for you', value: approvalQueue.length },
            ]}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
            <Card title="Waiting for you">
              {approvalQueue.length === 0 ? (
                <Empty message="Nothing waiting." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {approvalQueue.map((item) => (
                    <button
                      key={`${item.kind}:${item.course.id}`}
                      type="button"
                      className="xe-btn"
                      style={{ justifyContent: 'space-between' }}
                      onClick={() => {
                        setSelectedId(`${item.kind}:${item.course.id}`);
                        setTab('approvals');
                      }}
                    >
                      <span>
                        <Chip tone="warn">{item.kind}</Chip> {item.course.code}
                      </span>
                      <span className="xe-mono" style={{ fontSize: 12 }}>
                        {approvalAgeLabel(new Date().toISOString())}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Assist suggests">
              {suggestions.length === 0 ? (
                <Empty message="All department courses are on track." />
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {suggestions.map((s) => (
                    <li key={s} style={{ marginBottom: 6 }}>
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card title="Students at risk across the department" noPadding>
            {data.atRisk.length === 0 ? (
              <div style={{ padding: 16 }}>
                <Empty message="No students flagged at risk." />
              </div>
            ) : (
              <div className="xe-table-wrap">
                <table className="xe-table">
                  <thead>
                    <tr>
                      <th>Roll</th>
                      <th>Student</th>
                      <th>Course</th>
                      <th>Reason</th>
                      <th>Attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.atRisk.map((r) => (
                      <tr key={`${r.course_id}:${r.student_id}`}>
                        <td className="xe-mono">{r.roll_no ?? '—'}</td>
                        <td>{r.full_name}</td>
                        <td className="xe-mono">{r.code}</td>
                        <td>{r.reason}</td>
                        <td className="xe-mono">{r.attendance_pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : tab === 'approvals' ? (
        approvalQueue.length === 0 ? (
          <Empty message="Nothing waiting. All clear." />
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
            <Card title="Queue" noPadding>
              <div style={{ minWidth: 260 }}>
                {approvalQueue.map((item) => {
                  const key = `${item.kind}:${item.course.id}:${item.assessmentId}`;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedId(key)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 14px',
                        border: 0,
                        borderBottom: '1px solid var(--border-soft)',
                        background:
                          selectedItem && `${selectedItem.kind}:${selectedItem.course.id}:${selectedItem.assessmentId}` === key
                            ? 'var(--surface-alt)'
                            : 'var(--surface)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong>{item.course.code}</strong>
                        <Chip tone="warn">{item.kind}</Chip>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{item.course.title}</div>
                    </button>
                  );
                })}
              </div>
            </Card>

            {selectedItem ? (
              <div style={{ flex: '2 1 480px' }}>
                <Card title={`${selectedItem.course.code} · ${selectedItem.kind}`}>
                  {selectedItem.kind === 'Course plan' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {(() => {
                        const cos = data.outcomes.filter((o) => o.course_id === selectedItem.course.id);
                        const mapped = new Set(
                          data.coPoMap
                            .filter((m) => m.course_id === selectedItem.course.id && m.level > 0)
                            .map((m) => m.co_id),
                        );
                        return planChecks(selectedItem.course.rubric, cos, mapped).map((ck) => (
                          <div key={ck.text} style={{ color: ck.ok ? 'var(--teal)' : 'var(--assist)', fontSize: 13 }}>
                            {ck.ok ? '✓' : '!'} {ck.text}
                          </div>
                        ));
                      })()}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13 }}>
                      Sessions conducted: {statMap.get(selectedItem.course.id)?.sessions_conducted ?? 0}/
                      {statMap.get(selectedItem.course.id)?.sessions_total ?? 0}
                    </div>
                  )}

                  <label className="xe-field" style={{ marginTop: 12 }}>
                    <span>Remarks to faculty (required to decline)</span>
                    <textarea
                      className="xe-input"
                      style={{ height: 70, padding: 8 }}
                      value={remark}
                      onChange={(e) => setRemark(e.target.value)}
                    />
                  </label>

                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      type="button"
                      className="xe-btn xe-btn--primary"
                      onClick={() => void handleDecision(true)}
                    >
                      {selectedItem.kind === 'Final marks' ? 'Approve and recommend to CoE' : 'Approve course plan'}
                    </button>
                    <button type="button" className="xe-btn" onClick={() => void handleDecision(false)}>
                      Decline
                    </button>
                  </div>
                </Card>
              </div>
            ) : null}
          </div>
        )
      ) : tab === 'courses' ? (
        <Card noPadding>
          <div className="xe-table-wrap">
            <table className="xe-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Faculty</th>
                  <th>Students</th>
                  <th>Sessions</th>
                  <th>Attendance</th>
                  <th>Completion</th>
                  <th>At risk</th>
                  <th>Plan</th>
                  <th>Final marks</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => {
                  const st = statMap.get(c.id);
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="xe-mono" style={{ fontSize: 11 }}>{c.code}</div>
                        <div style={{ fontWeight: 500 }}>{c.title}</div>
                      </td>
                      <td>{profMap.get(c.faculty_id) ?? 'Faculty'}</td>
                      <td className="xe-mono">{st?.students ?? 0}</td>
                      <td className="xe-mono">{st?.sessions_conducted ?? 0}/{st?.sessions_total ?? 0}</td>
                      <td className="xe-mono">{st?.attendance_pct ?? 0}%</td>
                      <td className="xe-mono">{st?.completion_pct ?? 0}%</td>
                      <td className="xe-mono">{st?.at_risk ?? 0}</td>
                      <td><Chip tone={statusTone(c.plan_status)}>{c.plan_status}</Chip></td>
                      <td><Chip tone={statusTone(c.final_status)}>{c.final_status}</Chip></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : tab === 'live' ? (
        <Card title="Today's live labs (refreshes every 30 s)" noPadding>
          {data.liveLabs.length === 0 ? (
            <div style={{ padding: 16 }}>
              <Empty message="No labs running right now." />
            </div>
          ) : (
            <div className="xe-table-wrap">
              <table className="xe-table">
                <thead>
                  <tr>
                    <th>Slot</th>
                    <th>Course · batch</th>
                    <th>Session</th>
                    <th>Room</th>
                    <th>Present</th>
                    <th>Pre-test</th>
                    <th>Passed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.liveLabs.map((l) => (
                    <tr key={l.run_id}>
                      <td className="xe-mono">{l.slot}</td>
                      <td>{l.course_code} · {l.batch_name}</td>
                      <td className="xe-mono">S{l.session_n}</td>
                      <td>{l.room}</td>
                      <td className="xe-mono">{l.present}/{l.enrolled}</td>
                      <td className="xe-mono">{l.pre_done}</td>
                      <td className="xe-mono">{l.passed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card title="Final marks pipeline" noPadding>
          <div className="xe-table-wrap">
            <table className="xe-table">
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Submitted</th>
                  <th>HOD approved</th>
                  <th>CoE accepted</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td><span className="xe-mono">{c.code}</span> {c.title}</td>
                    <td><Chip tone={c.final_status !== 'draft' ? 'good' : 'neutral'}>{c.final_status !== 'draft' ? 'Yes' : 'No'}</Chip></td>
                    <td><Chip tone={c.final_status === 'hod_approved' || c.final_status === 'coe_accepted' ? 'good' : 'neutral'}>{c.final_status === 'hod_approved' || c.final_status === 'coe_accepted' ? 'Yes' : 'No'}</Chip></td>
                    <td><Chip tone={c.final_status === 'coe_accepted' ? 'good' : 'neutral'}>{c.final_status === 'coe_accepted' ? 'Yes' : 'No'}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </ConsoleShell>
  );
}
