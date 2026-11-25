import { useParams } from 'react-router-dom';
import { Card, Chip, ErrorNote, Loading, PageHead } from '../../components/ui';
import { useLoad } from '../../lib/hooks';
import { rpc } from '../../lib/supabase';

interface VerifyResult {
  full_name: string;
  roll_no: string | null;
  course_code: string;
  course_title: string;
  attendance_pct: number;
}

export function VerifyLabFile() {
  const { course, student } = useParams<{ course: string; student: string }>();

  const { data, loading, error } = useLoad(async () => {
    if (!course || !student) throw new Error('not_found');
    return await rpc<VerifyResult>('verify_lab_file', {
      p_course_id: course,
      p_student_id: student,
    });
  }, [course, student]);

  return (
    <main className="xe-auth-shell">
      <div className="xe-auth-card">
        <PageHead kicker="VERIFICATION" title="XeIO Lab File Record" />
        {loading ? (
          <Loading />
        ) : error || !data ? (
          <ErrorNote message={error ?? 'Record not found'} />
        ) : (
          <Card title={`${data.course_code} · ${data.course_title}`} actions={<Chip tone="good">Verified</Chip>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
              <div><strong>Student:</strong> {data.full_name}</div>
              <div className="xe-mono"><strong>Roll:</strong> {data.roll_no ?? '—'}</div>
              <div className="xe-mono"><strong>Attendance:</strong> {data.attendance_pct}%</div>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
