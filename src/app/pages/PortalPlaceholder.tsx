import { Card, PageHead } from '../../components/ui';
import { useSession } from '../../lib/session';
import { roleLabel } from '../../lib/types';

export function PortalPlaceholder({ title }: { title: string }) {
  const { profile, institution, signOut } = useSession();

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <PageHead
        kicker={profile ? roleLabel(profile.role) : 'Portal'}
        title={title}
        lead={institution ? institution.name : 'XeIO'}
        actions={
          <button type="button" className="xe-btn" onClick={() => void signOut()}>
            Sign out
          </button>
        }
      />
      <Card title="Workspace">
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          Signed in as <span className="xe-mono">{profile?.email}</span>. Full workspace features
          arrive in the next build phases.
        </p>
      </Card>
    </main>
  );
}
