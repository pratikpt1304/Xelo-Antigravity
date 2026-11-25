import type { ReactNode } from 'react';
import { Elzeo, Wordmark } from '../../components/ui';
import { NotificationBell } from '../../components/NotificationBell';
import { useSession } from '../../lib/session';

export interface ConsoleTab {
  id: string;
  label: string;
  badge?: number;
}

export function ConsoleShell({
  portalTitle,
  scopeLabel,
  tabs,
  activeTab,
  onSelectTab,
  children,
}: {
  portalTitle: string;
  scopeLabel: string;
  tabs: ConsoleTab[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  children: ReactNode;
}) {
  const { profile, signOut } = useSession();

  return (
    <div className="xe-console">
      <aside className="xe-console-rail xe-dark" aria-label={`${portalTitle} navigation`}>
        <div style={{ padding: '0 6px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 20 }}>
              <Wordmark dark />
            </span>
            <span style={{ fontSize: 14, color: '#CFCDC5' }}>{portalTitle}</span>
          </div>
          <div style={{ fontSize: 11, color: '#A8A69E', marginTop: 2 }}>{scopeLabel}</div>
        </div>

        <nav className="xe-console-nav">
          {tabs.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                className={`xe-console-nav-btn ${active ? 'xe-console-nav-btn--active' : ''}`}
                onClick={() => onSelectTab(tab.id)}
              >
                <span style={{ flex: 1, textAlign: 'left' }}>{tab.label}</span>
                {tab.badge && tab.badge > 0 ? (
                  <span className="xe-console-badge">{tab.badge}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div
          style={{
            marginTop: 'auto',
            padding: '0 8px',
            fontSize: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <span style={{ color: '#A8A69E' }}>{profile?.email}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8F8D85' }}>
            <span>by</span>
            <Elzeo dark />
          </div>
        </div>
      </aside>

      <div className="xe-console-main">
        <header className="xe-console-topbar">
          <NotificationBell />
          <span className="xe-mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
            {profile?.email}
          </span>
          <button type="button" className="xe-btn" onClick={() => void signOut()}>
            Sign out
          </button>
        </header>
        <main className="xe-console-body">{children}</main>
      </div>
    </div>
  );
}
