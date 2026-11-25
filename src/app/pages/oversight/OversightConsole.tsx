import { useState, type FormEvent } from 'react';
import {
  Banner,
  Card,
  Chip,
  Empty,
  ErrorNote,
  Kpis,
  Loading,
  Modal,
  PageHead,
  statusTone,
} from '../../../components/ui';
import { formatIstDate } from '../../../lib/format';
import { useAction, useLoad } from '../../../lib/hooks';
import { useSession } from '../../../lib/session';
import { must, rpc, supabase } from '../../../lib/supabase';
import {
  roleLabel,
  type Course,
  type Department,
  type HolidayRow,
  type Profile,
} from '../../../lib/types';
import { ConsoleShell } from '../../components/ConsoleShell';

type OversightTab = 'monitor' | 'courses' | 'internals' | 'calendar';

interface SnapshotRow {
  course_id: string;
  students: number;
  internal_mean: number;
  below_40: number;
  overall_pct: number;
}

interface StatRow {
  course_id: string;
  students: number;
  sessions_total: number;
  sessions_conducted: number;
  attendance_pct: number;
  completion_pct: number;
  at_risk: number;
  live_now: number;
}

export function OversightConsole() {
  const { profile, institution, refresh } = useSession();
  const [tab, setTab] = useState<OversightTab>('monitor');
  const [deptFilter, setDeptFilter] = useState('');
  const [drillCourse, setDrillCourse] = useState<Course | null>(null);
  const [returnCourseId, setReturnCourseId] = useState<string | null>(null);
  const [remark, setRemark] = useState('');
  const [minAtt, setMinAtt] = useState(institution?.min_attendance_pct ?? 75);
  const [holDay, setHolDay] = useState('');
  const [holLabel, setHolLabel] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const isCoe = profile?.role === 'coe';
  const canCalendar = profile?.role === 'coe' || profile?.role === 'vc';

  const { data, loading, error, reload } = useLoad(async () => {
    const [deptRes, courseRes, snapRes, holRes, profRes] = await Promise.all([
      supabase.from('departments').select('*').order('code'),
      supabase.from('courses').select('*').order('code'),
      supabase.from('course_snapshots').select('*'),
      supabase.from('holidays').select('*').order('day'),
      supabase.from('profiles').select('id, full_name'),
    ]);
    const courses = must(courseRes) as Course[];
    const ids = courses.map((c) => c.id);
    const stats = ids.length
      ? await rpc<StatRow[]>('course_stats', { p_course_ids: ids }).catch(() => [])
      : [];
    return {
      departments: must(deptRes) as Department[],
      courses,
      snapshots: (snapRes.data ?? []) as SnapshotRow[],
      holidays: must(holRes) as HolidayRow[],
      profiles: (profRes.data ?? []) as Pick<Profile, 'id' | 'full_name'>[],
      stats: stats ?? [],
    };
  }, []);

  const coeDecide = useAction(async (courseId: string, approve: boolean, text?: string) => {
    await rpc('decide_final_marks', {
      p_course_id: courseId,
      p_approve: approve,
      p_remark: text ?? null,
    });
  });

  const saveMinAtt = useAction(async () => {
    await rpc('set_min_attendance', { p_pct: minAtt });
    await refresh();
  });

  const addHoliday = useAction(async () => {
    if (!profile?.institution_id || !holDay || !holLabel.trim()) return;
    await supabase.from('holidays').insert({
      institution_id: profile.institution_id,
      day: holDay,
      label: holLabel.trim(),
    });
  });

  const courses = data?.courses ?? [];
  const statMap = new Map((data?.stats ?? []).map((s) => [s.course_id, s]));
  const snapMap = new Map((data?.snapshots ?? []).map((s) => [s.course_id, s]));
  const profMap = new Map((data?.profiles ?? []).map((p) => [p.id, p.full_name]));
  const deptMap = new Map((data?.departments ?? []).map((d) => [d.id, d]));

  const totalStudents = (data?.stats ?? []).reduce((a, s) => a + s.students, 0);
  const liveNow = (data?.stats ?? []).reduce((a, s) => a + s.live_now, 0);
  const avgAtt = data?.stats.length
    ? Math.round(data.stats.reduce((a, s) => a + s.attendance_pct, 0) / data.stats.length)
    : 0;
  const avgAttainment = data?.snapshots.length
    ? Math.round(data.snapshots.reduce((a, s) => a + s.overall_pct, 0) / data.snapshots.length)
    : 0;

  const filteredCourses = deptFilter ? courses.filter((c) => c.department_id === deptFilter) : courses;
  const internalCourses = courses.filter(
    (c) => c.final_status === 'hod_approved' || c.final_status === 'coe_accepted',
  );

  const handleAddHoliday = async (e: FormEvent) => {
    e.preventDefault();
    await addHoliday.run();
    setHolDay('');
    setHolLabel('');
    setMsg({ tone: 'ok', text: 'Holiday added.' });
    reload();
  };

  return (
    <ConsoleShell
      portalTitle={profile ? `${roleLabel(profile.role)} Console` : 'Oversight'}
      scopeLabel={institution?.name ?? 'University'}
      tabs={[
        { id: 'monitor', label: 'Monitor' },
        { id: 'courses', label: 'Courses' },
        { id: 'internals', label: 'Internals', badge: internalCourses.filter((c) => c.final_status === 'hod_approved').length },
        ...(canCalendar ? [{ id: 'calendar', label: 'Calendar and eligibility' }] : []),
      ]}
      activeTab={tab}
      onSelectTab={(id) => {
        setTab(id as OversightTab);
        setMsg(null);
      }}
    >
      <PageHead
        title={
          tab === 'monitor'
            ? 'Oversight monitor'
            : tab === 'courses'
              ? 'Courses'
              : tab === 'internals'
                ? 'Internals'
                : 'Calendar and eligibility'
        }
        lead={profile?.role === 'dean' ? 'School-scoped overview' : 'University-wide overview'}
      />

      {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}
      {coeDecide.message ? <Banner tone={coeDecide.message.tone}>{coeDecide.message.text}</Banner> : null}
      {error ? <ErrorNote message={error} /> : null}

      {loading || !data ? (
        <Loading />
      ) : tab === 'monitor' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Kpis
            items={[
              { label: 'Departments', value: data.departments.length },
              { label: 'Lab courses', value: courses.length },
              { label: 'Students', value: totalStudents },
              { label: 'Labs live now', value: liveNow },
              { label: 'Avg attendance', value: `${avgAtt}%` },
              { label: 'CO attainment', value: `${avgAttainment}%` },
            ]}
          />

          <Card title="Departments" noPadding>
            <div className="xe-table-wrap">
              <table className="xe-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Courses</th>
                    <th>Students</th>
                    <th>Labs live</th>
                    <th>Attendance</th>
                    <th>Plans pending</th>
                    <th>With HOD</th>
                    <th>Accepted</th>
                  </tr>
                </thead>
                <tbody>
                  {data.departments.map((d) => {
                    const dc = courses.filter((c) => c.department_id === d.id);
                    const dStats = dc.map((c) => statMap.get(c.id)).filter((s): s is StatRow => Boolean(s));
                    const dAtt = dStats.length
                      ? Math.round(dStats.reduce((a, s) => a + s.attendance_pct, 0) / dStats.length)
                      : 0;
                    return (
                      <tr key={d.id}>
                        <td><strong>{d.code}</strong> · {d.name}</td>
                        <td className="xe-mono">{dc.length}</td>
                        <td className="xe-mono">{dStats.reduce((a, s) => a + s.students, 0)}</td>
                        <td className="xe-mono">{dStats.reduce((a, s) => a + s.live_now, 0)}</td>
                        <td className="xe-mono">{dAtt}%</td>
                        <td className="xe-mono">{dc.filter((c) => c.plan_status === 'sent').length}</td>
                        <td className="xe-mono">{dc.filter((c) => c.final_status === 'submitted').length}</td>
                        <td className="xe-mono">{dc.filter((c) => c.final_status === 'coe_accepted').length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : tab === 'courses' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label className="xe-field">
              <span>Department</span>
              <select
                className="xe-select"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
              >
                <option value="">All departments</option>
                {data.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} · {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <Card noPadding>
            <div className="xe-table-wrap">
              <table className="xe-table">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Department</th>
                    <th>Faculty</th>
                    <th>Students</th>
                    <th>Sessions</th>
                    <th>Attendance</th>
                    <th>Plan</th>
                    <th>Internals</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredCourses.map((c) => {
                    const st = statMap.get(c.id);
                    return (
                      <tr key={c.id}>
                        <td><span className="xe-mono">{c.code}</span> {c.title}</td>
                        <td>{deptMap.get(c.department_id)?.code ?? '—'}</td>
                        <td>{profMap.get(c.faculty_id) ?? 'Faculty'}</td>
                        <td className="xe-mono">{st?.students ?? 0}</td>
                        <td className="xe-mono">{st?.sessions_conducted ?? 0}/{st?.sessions_total ?? 0}</td>
                        <td className="xe-mono">{st?.attendance_pct ?? 0}%</td>
                        <td><Chip tone={statusTone(c.plan_status)}>{c.plan_status}</Chip></td>
                        <td><Chip tone={statusTone(c.final_status)}>{c.final_status}</Chip></td>
                        <td style={{ textAlign: 'right' }}>
                          <button type="button" className="xe-btn" onClick={() => setDrillCourse(c)}>
                            Attainment
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : tab === 'internals' ? (
        <Card
          title="HOD-approved internals"
          actions={
            isCoe ? (
              <button type="button" className="xe-btn" onClick={() => reload()}>
                Fetch HOD-approved internals
              </button>
            ) : null
          }
          noPadding
        >
          {internalCourses.length === 0 ? (
            <div style={{ padding: 16 }}>
              <Empty message="No HOD-approved internals waiting." />
            </div>
          ) : (
            <div className="xe-table-wrap">
              <table className="xe-table">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Faculty</th>
                    <th>Students</th>
                    <th>Mean /100</th>
                    <th>Below 40</th>
                    <th>Status</th>
                    {isCoe ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {internalCourses.map((c) => {
                    const snap = snapMap.get(c.id);
                    return (
                      <tr key={c.id}>
                        <td><span className="xe-mono">{c.code}</span> {c.title}</td>
                        <td>{profMap.get(c.faculty_id) ?? 'Faculty'}</td>
                        <td className="xe-mono">{snap?.students ?? statMap.get(c.id)?.students ?? 0}</td>
                        <td className="xe-mono">{snap?.internal_mean ?? '—'}</td>
                        <td className="xe-mono">{snap?.below_40 ?? '—'}</td>
                        <td><Chip tone={statusTone(c.final_status)}>{c.final_status}</Chip></td>
                        {isCoe ? (
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {c.final_status === 'hod_approved' ? (
                              <div style={{ display: 'inline-flex', gap: 6 }}>
                                <button
                                  type="button"
                                  className="xe-btn xe-btn--teal"
                                  onClick={() =>
                                    void coeDecide.run(c.id, true).then(() => {
                                      setMsg({ tone: 'ok', text: `Accepted ${c.code} into results.` });
                                      reload();
                                    })
                                  }
                                >
                                  Accept into results
                                </button>
                                <button
                                  type="button"
                                  className="xe-btn"
                                  onClick={() => setReturnCourseId(c.id)}
                                >
                                  Return to HOD
                                </button>
                              </div>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card title="Exam eligibility threshold">
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <label className="xe-field">
                <span>Minimum attendance %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="xe-input xe-mono"
                  style={{ width: 100 }}
                  value={minAtt}
                  onChange={(e) => setMinAtt(Number(e.target.value))}
                />
              </label>
              <button
                type="button"
                className="xe-btn xe-btn--primary"
                onClick={() =>
                  void saveMinAtt.run().then(() => setMsg({ tone: 'ok', text: `Minimum attendance set to ${minAtt}%.` }))
                }
              >
                Save threshold
              </button>
            </div>
          </Card>

          <Card title="Institution holidays">
            <form onSubmit={(e) => void handleAddHoliday(e)} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <input type="date" className="xe-input xe-mono" value={holDay} onChange={(e) => setHolDay(e.target.value)} required />
              <input className="xe-input" placeholder="Holiday name" value={holLabel} onChange={(e) => setHolLabel(e.target.value)} required />
              <button type="submit" className="xe-btn">Add holiday</button>
            </form>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.holidays.map((h) => (
                <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span><span className="xe-mono">{formatIstDate(h.day)}</span> · {h.label}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Modal open={Boolean(drillCourse)} title={`Attainment · ${drillCourse?.code ?? ''}`} onClose={() => setDrillCourse(null)}>
        {drillCourse ? (
          <div style={{ fontSize: 13 }}>
            <p>Overall attainment: <strong className="xe-mono">{snapMap.get(drillCourse.id)?.overall_pct ?? 0}%</strong></p>
            <p>Internal mean: <strong className="xe-mono">{snapMap.get(drillCourse.id)?.internal_mean ?? '—'}</strong></p>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(returnCourseId)} title="Return internals to HOD" onClose={() => setReturnCourseId(null)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label className="xe-field">
            <span>Remark (required)</span>
            <textarea
              className="xe-input"
              style={{ height: 80, padding: 8 }}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="xe-btn xe-btn--primary"
            onClick={() => {
              if (!returnCourseId) return;
              void coeDecide.run(returnCourseId, false, remark).then(() => {
                setReturnCourseId(null);
                setRemark('');
                reload();
              });
            }}
          >
            Confirm return
          </button>
        </div>
      </Modal>
    </ConsoleShell>
  );
}
