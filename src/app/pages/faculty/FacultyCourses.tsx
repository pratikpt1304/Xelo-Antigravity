import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Banner, Card, Chip, Empty, ErrorNote, Loading, Modal, PageHead, statusTone } from '../../../components/ui';
import { useAction, useLoad } from '../../../lib/hooks';
import { useSession } from '../../../lib/session';
import { must, supabase } from '../../../lib/supabase';
import type { Course, Department } from '../../../lib/types';

export function FacultyCourses() {
  const { profile, institution, signOut } = useSession();
  const [openNew, setOpenNew] = useState(false);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [ltpc, setLtpc] = useState('0-0-4-2');
  const [semester, setSemester] = useState(4);
  const [section, setSection] = useState('SY-B');
  const [deptId, setDeptId] = useState(profile?.department_id ?? '');

  const { data, loading, error, reload } = useLoad(async () => {
    const [courseRes, deptRes] = await Promise.all([
      supabase.from('courses').select('*').order('created_at', { ascending: false }),
      supabase.from('departments').select('*').order('code'),
    ]);
    return {
      courses: must(courseRes) as Course[],
      departments: must(deptRes) as Department[],
    };
  }, []);

  const createAction = useAction(async () => {
    if (!profile?.institution_id) throw new Error('forbidden');
    const targetDept = deptId || data?.departments[0]?.id;
    if (!targetDept) throw new Error('not_found');

    const res = await supabase
      .from('courses')
      .insert({
        institution_id: profile.institution_id,
        department_id: targetDept,
        faculty_id: profile.id,
        code: code.trim().toUpperCase(),
        title: title.trim(),
        ltpc: ltpc.trim(),
        semester,
        section: section.trim(),
      })
      .select('*')
      .single();
    return must(res) as Course;
  });

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !title.trim()) return;
    const created = await createAction.run();
    if (created) {
      setOpenNew(false);
      setCode('');
      setTitle('');
      reload();
    }
  };

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHead
        kicker={institution?.name ?? 'Faculty Workspace'}
        title="My courses"
        lead="Select a lab course to plan, prepare, run, and report."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="xe-btn xe-btn--primary" onClick={() => setOpenNew(true)}>
              New course
            </button>
            <button type="button" className="xe-btn" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        }
      />

      {error ? <ErrorNote message={error} /> : null}
      {createAction.message ? <Banner tone={createAction.message.tone}>{createAction.message.text}</Banner> : null}

      {loading || !data ? (
        <Loading />
      ) : data.courses.length === 0 ? (
        <Empty message="No courses yet. Create your first programming lab course." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {data.courses.map((c) => (
            <Card
              key={c.id}
              title={`${c.code} · ${c.section}`}
              actions={<Chip tone={statusTone(c.plan_status)}>{c.plan_status}</Chip>}
            >
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{c.title}</div>
              <div className="xe-mono" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
                Sem {c.semester} · {c.ltpc} · {c.academic_year}
              </div>
              <Link className="xe-btn xe-btn--primary" to={`/faculty/c/${c.id}/setup`}>
                Open workspace
              </Link>
            </Card>
          ))}
        </div>
      )}

      <Modal open={openNew} title="New lab course" onClose={() => setOpenNew(false)}>
        <form onSubmit={(e) => void handleCreate(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="xe-field">
            <span>Course code</span>
            <input
              className="xe-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="CSL-101"
              required
            />
          </label>
          <label className="xe-field">
            <span>Course title</span>
            <input
              className="xe-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Programming in C Lab"
              required
            />
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <label className="xe-field" style={{ flex: 1 }}>
              <span>L-T-P-C</span>
              <input className="xe-input" value={ltpc} onChange={(e) => setLtpc(e.target.value)} />
            </label>
            <label className="xe-field" style={{ width: 90 }}>
              <span>Semester</span>
              <input
                type="number"
                min={1}
                max={8}
                className="xe-input"
                value={semester}
                onChange={(e) => setSemester(Number(e.target.value))}
              />
            </label>
            <label className="xe-field" style={{ width: 100 }}>
              <span>Section</span>
              <input className="xe-input" value={section} onChange={(e) => setSection(e.target.value)} />
            </label>
          </div>
          {data?.departments.length ? (
            <label className="xe-field">
              <span>Department</span>
              <select
                className="xe-select"
                value={deptId || data.departments[0]?.id || ''}
                onChange={(e) => setDeptId(e.target.value)}
              >
                {data.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} · {d.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
            <button type="button" className="xe-btn" onClick={() => setOpenNew(false)}>
              Cancel
            </button>
            <button type="submit" className="xe-btn xe-btn--primary" disabled={createAction.busy}>
              Create course
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
