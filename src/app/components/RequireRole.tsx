import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loading } from '../../components/ui';
import { useSession } from '../../lib/session';
import { homeForRole, type AppRole } from '../../lib/types';

export function RequireRole({
  roles,
  children,
}: {
  roles: ReadonlyArray<AppRole>;
  children: ReactNode;
}) {
  const { profile, restored } = useSession();
  const location = useLocation();

  if (!restored) {
    return (
      <main className="xe-auth-shell">
        <Loading label="Restoring session…" />
      </main>
    );
  }

  if (!profile) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!roles.includes(profile.role)) {
    return <Navigate to={homeForRole(profile.role)} replace />;
  }

  return <>{children}</>;
}
