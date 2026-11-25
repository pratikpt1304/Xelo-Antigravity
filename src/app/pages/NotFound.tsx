import { Link } from 'react-router-dom';
import { Card, PageHead } from '../../components/ui';

export function NotFound() {
  return (
    <main className="xe-auth-shell">
      <div className="xe-auth-card">
        <PageHead kicker="404" title="Page not found" lead="This route does not exist." />
        <Card>
          <Link className="xe-btn xe-btn--primary" to="/login">
            Go to sign in
          </Link>
        </Card>
      </div>
    </main>
  );
}
