import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Elzeo, Wordmark } from '../../../components/ui';
import { NotificationBell } from '../../../components/NotificationBell';
import { useSession } from '../../../lib/session';

export function StudentShell({
  todaySessionId,
  hasEndsem = false,
  children,
}: {
  todaySessionId?: string | null;
  hasEndsem?: boolean;
  children: ReactNode;
}) {
  const { profile, signOut } = useSession();
  const { pathname } = useLocation();

  const tabs = [
    { to: '/student', label: 'Home', active: pathname === '/student' },
    { to: '/student/classroom', label: 'Classroom', active: pathname.startsWith('/student/classroom') },
    ...(todaySessionId
      ? [
          {
            to: `/student/lab/${todaySessionId}`,
            label: "Today's lab",
            active: pathname.startsWith('/student/lab'),
          },
        ]
      : []),
    { to: '/student/lab-file', label: 'Lab file', active: pathname.startsWith('/student/lab-file') },
    ...(hasEndsem
      ? [
          {
            to: '/student/endsem',
            label: 'End-sem',
            active: pathname.startsWith('/student/endsem'),
          },
        ]
      : []),
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--paper)' }}>
      <header className="xe-stu-header xe-dark no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>
            <Wordmark dark />
          </span>
          <Elzeo dark />
        </div>

        <nav className="xe-stu-tabs" aria-label="Student navigation">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className={`xe-stu-tab ${t.active ? 'xe-stu-tab--active' : ''}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <NotificationBell dark />
          <span className="xe-mono" style={{ fontSize: 12, color: '#CFCDC5' }}>
            {profile?.full_name}
            {profile?.roll_no ? ` · ${profile.roll_no}` : ''}
          </span>
          <button
            type="button"
            className="xe-btn"
            style={{ background: '#2C2B28', borderColor: '#3D3B36', color: '#FFFFFF' }}
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 1240, width: '100%', margin: '0 auto', padding: 24 }}>
        {children}
      </main>

      <footer className="xe-landing-footer no-print">
        <span>XeIO · designed and maintained by Elzeo Future Technologies Pvt Ltd, India</span>
        <Elzeo />
      </footer>
    </div>
  );
}
