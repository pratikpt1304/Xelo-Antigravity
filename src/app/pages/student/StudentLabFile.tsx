import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { Card, Chip, ErrorNote, Loading, PageHead } from '../../../components/ui';
import { formatIstDate } from '../../../lib/format';
import { useLoad } from '../../../lib/hooks';
import { computeReport } from '../../../lib/api/report';
import { useSession } from '../../../lib/session';
import { must, supabase } from '../../../lib/supabase';
import type {
  AttendanceRow,
  Course,
  CourseOutcome,
  EnrollmentRow,
  SessionRow,
  SubmissionRow,
  TestAttemptRow,
  VivaRow,
} from '../../../lib/types';
import { StudentShell } from './StudentShell';

export function StudentLabFile() {
  const { profile, institution } = useSession();
  const [showAllCode, setShowAllCode] = useState(false);

  const { data, loading, error } = useLoad(async () => {
    if (!profile) throw new Error('forbidden');
    const [courseRes, coRes, sessRes, enrRes, attRes, attmRes, subRes, vivaRes] = await Promise.all([
      supabase.from('courses').select('*').limit(1),
      supabase.from('course_outcomes').select('*').order('code'),
      supabase.from('sessions').select('*').order('n'),
      supabase.from('enrollments').select('*').eq('student_id', profile.id),
      supabase.from('attendance').select('*').eq('student_id', profile.id),
      supabase.from('test_attempts').select('*').eq('student_id', profile.id),
      supabase.from('submissions').select('*').eq('student_id', profile.id).order('created_at'),
      supabase.from('viva').select('*').eq('student_id', profile.id),
    ]);

    return {
      course: (must(courseRes) as Course[])[0] ?? null,
      outcomes: must(coRes) as CourseOutcome[],
      sessions: must(sessRes) as SessionRow[],
      enrollments: must(enrRes) as EnrollmentRow[],
      attendance: must(attRes) as AttendanceRow[],
      attempts: must(attmRes) as TestAttemptRow[],
      submissions: must(subRes) as SubmissionRow[],
      vivas: must(vivaRes) as VivaRow[],
    };
  }, [profile?.id]);

  const report = useMemo(() => {
    if (!data?.course || !profile) return null;
    return computeReport({
      course: data.course,
      outcomes: data.outcomes,
      sessions: data.sessions,
      enrollments: data.enrollments,
      profiles: [{ id: profile.id, full_name: profile.full_name, email: profile.email, roll_no: profile.roll_no }],
      attendance: data.attendance,
      attempts: data.attempts,
      submissions: data.submissions,
      vivas: data.vivas,
    });
  }, [data, profile]);

  const row = report?.rows[0];
  const verifyId = data?.course && profile
    ? `XO-${data.course.code.replace(/[^A-Za-z0-9]/g, '')}-${profile.roll_no ?? '0000'}-${profile.id.slice(0, 4).toUpperCase()}`
    : '';
  const verifyUrl = data?.course && profile
    ? `${window.location.origin}/app/verify/${data.course.id}/${profile.id}`
    : '';

  const qrSvg = useMemo(() => {
    if (!verifyUrl) return '';
    const qr = qrcode(0, 'M');
    qr.addData(verifyUrl);
    qr.make();
    return qr.createDataURL(4, 2);
  }, [verifyUrl]);

  return (
    <StudentShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PageHead
          kicker="LAB FILE"
          title="Printable lab file"
          lead="Official record of lab attendance, assessments, and submitted programs."
          actions={
            <div className="no-print" style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="xe-btn" onClick={() => setShowAllCode((s) => !s)}>
                {showAllCode ? 'Hide all code' : 'Show all code'}
              </button>
              <button type="button" className="xe-btn xe-btn--primary" onClick={() => window.print()}>
                Download as PDF
              </button>
            </div>
          }
        />

        {error ? <ErrorNote message={error} /> : null}
        {loading || !data ? (
          <Loading />
        ) : (
          <>
            <Card>
              <div className="xe-serif" style={{ textAlign: 'center', padding: '16px 8px' }}>
                <div style={{ fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>
                  {institution?.name ?? 'University'}
                </div>
                <h2 style={{ margin: '8px 0 4px', fontSize: 24 }}>
                  {data.course ? `${data.course.code} · ${data.course.title}` : 'Lab Course'}
                </h2>
                <div style={{ fontSize: 14, marginTop: 8 }}>
                  {profile?.full_name} · Roll {profile?.roll_no ?? '—'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 28, fontSize: 12 }}>
                  <span>Faculty in-charge</span>
                  <span>Head of Department</span>
                </div>
              </div>
            </Card>

            <Card title="Declaration & verification">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 260, fontSize: 13 }}>
                  <p style={{ margin: '0 0 8px' }}>
                    I, <strong>{profile?.full_name}</strong> (Roll{' '}
                    <span className="xe-mono">{profile?.roll_no ?? '—'}</span>), declare that the
                    programs recorded in this lab file are my original work.
                  </p>
                  <div className="xe-mono" style={{ fontSize: 12 }}>
                    Internal: {row?.internal100 ?? 0}/100 · Attendance: {row?.attendancePct ?? 0}% ·
                    Conducted: {report?.conductedCount ?? 0} · ID: {verifyId}
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                    As of today. The final file is issued after the last working day and is needed
                    to appear for the final practical.
                  </p>
                </div>
                {qrSvg ? <img src={qrSvg} alt={`QR verification ${verifyId}`} width={96} height={96} /> : null}
              </div>
            </Card>

            <Card title="Submitted programs" noPadding>
              <div className="xe-table-wrap">
                <table className="xe-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Lang</th>
                      <th>Visible</th>
                      <th>Hidden</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.submissions.map((s) => (
                      <tr key={s.id}>
                        <td className="xe-mono" style={{ fontSize: 12 }}>{formatIstDate(s.created_at)}</td>
                        <td className="xe-mono">{s.lang}</td>
                        <td className="xe-mono">{s.visible_passed}/{s.visible_total}</td>
                        <td className="xe-mono">{s.hidden_passed}/{s.hidden_total}</td>
                        <td>
                          <Chip tone={s.hidden_total > 0 && s.hidden_passed === s.hidden_total ? 'good' : 'neutral'}>
                            {s.hidden_total > 0 && s.hidden_passed === s.hidden_total ? 'Passed' : 'Submitted'}
                          </Chip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {showAllCode
                ? data.submissions.map((s) => (
                    <pre
                      key={s.id}
                      className="xe-mono"
                      style={{
                        margin: 12,
                        padding: 10,
                        background: 'var(--editor-bg)',
                        color: '#F4F3EF',
                        borderRadius: 6,
                        overflowX: 'auto',
                        fontSize: 12,
                      }}
                    >
                      {s.code}
                    </pre>
                  ))
                : null}
            </Card>

            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              XeIO · designed and maintained by Elzeo Future Technologies Pvt Ltd, India
            </div>
          </>
        )}
      </div>
    </StudentShell>
  );
}
