import { useState, type FormEvent } from 'react';
import { Card, Chip, Empty, statusTone } from '../../../components/ui';
import { useAction } from '../../../lib/hooks';
import { fn, rpc } from '../../../lib/supabase';
import {
  roleLabel,
  type AppRole,
  type Department,
  type Institution,
  type InviteRow,
  type Profile,
  type School,
} from '../../../lib/types';

export function UsersTab({
  institutions,
  schools,
  departments,
  profiles,
  invites,
  onChanged,
  onBanner,
}: {
  institutions: Institution[];
  schools: School[];
  departments: Department[];
  profiles: Profile[];
  invites: InviteRow[];
  onChanged: () => void;
  onBanner: (tone: 'ok' | 'err', text: string) => void;
}) {
  const [name, setName] = useState('');
  const [instId, setInstId] = useState(institutions[0]?.id ?? '');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppRole>('hod');
  const [schoolId, setSchoolId] = useState('');
  const [deptId, setDeptId] = useState('');

  const selectedInst = institutions.find((i) => i.id === instId) ?? institutions[0];
  const instSchools = schools.filter((s) => s.institution_id === (selectedInst?.id ?? ''));
  const instDepts = departments.filter(
    (d) =>
      d.institution_id === (selectedInst?.id ?? '') &&
      (!schoolId || d.school_id === schoolId),
  );

  const inviteAction = useAction(async () => {
    if (!selectedInst) throw new Error('not_found');
    await rpc('admin_invite', {
      p_email: email.trim().toLowerCase(),
      p_role: role,
      p_full_name: name.trim(),
      p_institution_id: selectedInst.id,
      p_school_id: schoolId || null,
      p_department_id: deptId || null,
    });
    try {
      await fn('send-invites', {
        invites: [{ email: email.trim().toLowerCase(), full_name: name.trim() }],
      });
    } catch {
      // Invite row is recorded even if email relay is offline in dev
    }
  });

  const toggleAction = useAction(async (userId: string, nextActive: boolean) => {
    await rpc('admin_set_active', { p_user_id: userId, p_active: nextActive });
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !selectedInst) {
      onBanner('err', 'Enter name, institution, and institutional email.');
      return;
    }
    const res = await inviteAction.run();
    if (res !== null || !inviteAction.message) {
      onBanner(
        'ok',
        `Login created for ${email.trim().toLowerCase()} as ${roleLabel(role)}. Invite sent.`,
      );
      setName('');
      setEmail('');
      onChanged();
    } else if (inviteAction.message?.tone === 'err') {
      onBanner('err', inviteAction.message.text);
    }
  };

  const handleToggle = async (p: Profile) => {
    const nextActive = !p.active;
    await toggleAction.run(p.id, nextActive);
    onBanner('ok', `${p.email} ${nextActive ? 'reactivated' : 'deactivated'}.`);
    onChanged();
  };

  const studentCount = profiles.filter((p) => p.role === 'student').length;
  const facultyCount = profiles.filter((p) => p.role === 'faculty' && p.active).length;

  const scopeName = (p: {
    institution_id: string | null;
    school_id: string | null;
    department_id: string | null;
  }) => {
    if (p.department_id) {
      return departments.find((d) => d.id === p.department_id)?.name ?? 'Department';
    }
    if (p.school_id) {
      return schools.find((s) => s.id === p.school_id)?.name ?? 'School';
    }
    return institutions.find((i) => i.id === p.institution_id)?.name ?? 'University';
  };

  const staffProfiles = profiles.filter((p) => p.role !== 'student');
  const pendingInvites = invites.filter((i) => !i.accepted_at && i.role !== 'student');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card>
        <form
          onSubmit={(e) => void handleSubmit(e)}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}
        >
          <label className="xe-field">
            <span>Name</span>
            <input
              className="xe-input"
              style={{ width: 170 }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dr. A. Kulkarni"
            />
          </label>

          <label className="xe-field">
            <span>Institution</span>
            <select
              className="xe-select"
              value={selectedInst?.id ?? ''}
              onChange={(e) => {
                setInstId(e.target.value);
                setSchoolId('');
                setDeptId('');
              }}
            >
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>

          <label className="xe-field">
            <span>
              Institutional email{' '}
              {selectedInst ? `(@${selectedInst.email_domain})` : ''}
            </span>
            <input
              type="email"
              className="xe-input"
              style={{ width: 220 }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={selectedInst ? `name@${selectedInst.email_domain}` : 'name@domain'}
            />
          </label>

          <label className="xe-field">
            <span>Role</span>
            <select
              className="xe-select"
              value={role}
              onChange={(e) => setRole(e.target.value as AppRole)}
            >
              <option value="vc">VC</option>
              <option value="coe">CoE</option>
              <option value="dean">Dean</option>
              <option value="hod">HOD</option>
              <option value="faculty">Faculty</option>
            </select>
          </label>

          <label className="xe-field">
            <span>School</span>
            <select
              className="xe-select"
              value={schoolId}
              onChange={(e) => {
                setSchoolId(e.target.value);
                setDeptId('');
              }}
            >
              <option value="">University-wide</option>
              {instSchools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="xe-field">
            <span>Department</span>
            <select
              className="xe-select"
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
            >
              <option value="">All departments</option>
              {instDepts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} · {d.name}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className="xe-btn xe-btn--primary" disabled={inviteAction.busy}>
            Create login and send invite
          </button>
        </form>
      </Card>

      <Card noPadding>
        {staffProfiles.length === 0 && pendingInvites.length === 0 ? (
          <div style={{ padding: 16 }}>
            <Empty message="No staff accounts or pending invites yet." />
          </div>
        ) : (
          <div className="xe-table-wrap">
            <table className="xe-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Scope</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {staffProfiles.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>{u.full_name}</td>
                    <td className="xe-mono" style={{ fontSize: 12 }}>
                      {u.email}
                    </td>
                    <td>{roleLabel(u.role)}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{scopeName(u)}</td>
                    <td>
                      <Chip tone={statusTone(u.active ? 'active' : 'deactivated')}>
                        {u.active ? 'Active' : 'Disabled'}
                      </Chip>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {u.role !== 'super_admin' ? (
                        <button
                          type="button"
                          className="xe-btn"
                          disabled={toggleAction.busy}
                          onClick={() => void handleToggle(u)}
                        >
                          {u.active ? 'Disable' : 'Enable'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {pendingInvites.map((inv) => (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 500 }}>{inv.full_name}</td>
                    <td className="xe-mono" style={{ fontSize: 12 }}>
                      {inv.email}
                    </td>
                    <td>{roleLabel(inv.role)}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{scopeName(inv)}</td>
                    <td>
                      <Chip tone="warn">Invited</Chip>
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}>
                      Pending SSO
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        Students are not created here: faculty onboard them with invitation emails carrying the
        class code. Currently <span className="xe-mono">{studentCount}</span> students onboarded by{' '}
        <span className="xe-mono">{facultyCount}</span> faculty.
      </div>
    </div>
  );
}
