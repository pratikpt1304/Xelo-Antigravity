import { useState, type FormEvent } from 'react';
import { Card, Chip, Empty, statusTone } from '../../../components/ui';
import { formatIstDate } from '../../../lib/format';
import { useAction } from '../../../lib/hooks';
import { rpc } from '../../../lib/supabase';
import type { Department, Institution, School } from '../../../lib/types';

export function InstitutionsTab({
  institutions,
  schools,
  departments,
  onChanged,
  onBanner,
}: {
  institutions: Institution[];
  schools: School[];
  departments: Department[];
  onChanged: () => void;
  onBanner: (tone: 'ok' | 'err', text: string) => void;
}) {
  const [instName, setInstName] = useState('');
  const [domain, setDomain] = useState('');
  const [schoolInstId, setSchoolInstId] = useState(institutions[0]?.id ?? '');
  const [schoolName, setSchoolName] = useState('');
  const [deptInstId, setDeptInstId] = useState(institutions[0]?.id ?? '');
  const [deptSchoolId, setDeptSchoolId] = useState(schools[0]?.id ?? '');
  const [deptCode, setDeptCode] = useState('');
  const [deptName, setDeptName] = useState('');

  const createInst = useAction(async () => {
    await rpc('admin_create_institution', { p_name: instName, p_email_domain: domain });
  });

  const createSchool = useAction(async () => {
    await rpc('admin_create_school', { p_institution_id: schoolInstId, p_name: schoolName });
  });

  const createDept = useAction(async () => {
    await rpc('admin_create_department', {
      p_institution_id: deptInstId,
      p_school_id: deptSchoolId,
      p_code: deptCode,
      p_name: deptName,
    });
  });

  const handleInst = async (e: FormEvent) => {
    e.preventDefault();
    if (!instName.trim() || !domain.trim()) return;
    await createInst.run();
    onBanner('ok', `Added institution ${instName.trim()}.`);
    setInstName('');
    setDomain('');
    onChanged();
  };

  const handleSchool = async (e: FormEvent) => {
    e.preventDefault();
    if (!schoolInstId || !schoolName.trim()) return;
    await createSchool.run();
    onBanner('ok', `Added school ${schoolName.trim()}.`);
    setSchoolName('');
    onChanged();
  };

  const handleDept = async (e: FormEvent) => {
    e.preventDefault();
    if (!deptInstId || !deptSchoolId || !deptCode.trim() || !deptName.trim()) return;
    await createDept.run();
    onBanner('ok', `Added department ${deptCode.trim().toUpperCase()}.`);
    setDeptCode('');
    setDeptName('');
    onChanged();
  };

  const deptSchools = schools.filter((s) => s.institution_id === deptInstId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card title="Add institution">
        <form
          onSubmit={(e) => void handleInst(e)}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}
        >
          <label className="xe-field">
            <span>Institution name</span>
            <input
              className="xe-input"
              value={instName}
              onChange={(e) => setInstName(e.target.value)}
              placeholder="Sanjivani University"
            />
          </label>
          <label className="xe-field">
            <span>Email domain</span>
            <input
              className="xe-input"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="sanjivani.edu.in"
            />
          </label>
          <button type="submit" className="xe-btn xe-btn--primary" disabled={createInst.busy}>
            Add institution
          </button>
        </form>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        <Card title="Add school">
          <form
            onSubmit={(e) => void handleSchool(e)}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <label className="xe-field">
              <span>Institution</span>
              <select
                className="xe-select"
                value={schoolInstId}
                onChange={(e) => setSchoolInstId(e.target.value)}
              >
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="xe-field">
              <span>School name</span>
              <input
                className="xe-input"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="School of Engineering and Technology"
              />
            </label>
            <button type="submit" className="xe-btn" disabled={createSchool.busy}>
              Add school
            </button>
          </form>
        </Card>

        <Card title="Add department">
          <form
            onSubmit={(e) => void handleDept(e)}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <label className="xe-field">
              <span>Institution</span>
              <select
                className="xe-select"
                value={deptInstId}
                onChange={(e) => {
                  setDeptInstId(e.target.value);
                  const first = schools.find((s) => s.institution_id === e.target.value);
                  setDeptSchoolId(first?.id ?? '');
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
              <span>School</span>
              <select
                className="xe-select"
                value={deptSchoolId}
                onChange={(e) => setDeptSchoolId(e.target.value)}
              >
                {deptSchools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <label className="xe-field" style={{ width: 96 }}>
                <span>Code</span>
                <input
                  className="xe-input"
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value)}
                  placeholder="CSE"
                />
              </label>
              <label className="xe-field" style={{ flex: 1 }}>
                <span>Department name</span>
                <input
                  className="xe-input"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="Computer Science and Engineering"
                />
              </label>
            </div>
            <button type="submit" className="xe-btn" disabled={createDept.busy}>
              Add department
            </button>
          </form>
        </Card>
      </div>

      <Card title="Institutions" noPadding>
        {institutions.length === 0 ? (
          <div style={{ padding: 16 }}>
            <Empty message="No institutions added yet." />
          </div>
        ) : (
          <div className="xe-table-wrap">
            <table className="xe-table">
              <thead>
                <tr>
                  <th>Institution</th>
                  <th>Domain</th>
                  <th>Schools</th>
                  <th>Departments</th>
                  <th>Plan</th>
                  <th>Valid until</th>
                </tr>
              </thead>
              <tbody>
                {institutions.map((inst) => (
                  <tr key={inst.id}>
                    <td style={{ fontWeight: 500 }}>{inst.name}</td>
                    <td className="xe-mono" style={{ fontSize: 12 }}>
                      {inst.email_domain}
                    </td>
                    <td className="xe-mono">
                      {schools.filter((s) => s.institution_id === inst.id).length}
                    </td>
                    <td className="xe-mono">
                      {departments.filter((d) => d.institution_id === inst.id).length}
                    </td>
                    <td>
                      <Chip tone={inst.plan ? statusTone('active') : 'neutral'}>
                        {inst.plan ? inst.plan.toUpperCase() : 'No plan'}
                      </Chip>
                    </td>
                    <td className="xe-mono" style={{ fontSize: 12 }}>
                      {inst.plan_end ? formatIstDate(inst.plan_end) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
