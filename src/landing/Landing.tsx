import { Elzeo, Wordmark } from '../components/ui';

export function Landing() {
  return (
    <div className="xe-landing">
      <header className="xe-landing-header xe-dark">
        <Wordmark dark />
        <a className="xe-btn" href="/app/login">
          Sign in
        </a>
      </header>

      <main className="xe-landing-main">
        <section className="xe-landing-hero">
          <div className="xe-kicker">Programming Lab LMS</div>
          <h1 className="xe-landing-title">Plan, run, and report every programming lab.</h1>
          <p className="xe-landing-copy">
            XeIO connects course setup, lab execution, live monitoring, and NBA/NAAC course files
            in one workflow.
          </p>
          <a className="xe-btn xe-btn--primary" href="/app/login">
            Sign in to XeIO
          </a>
        </section>
      </main>

      <footer className="xe-landing-footer">
        <span>XeIO · designed and maintained by Elzeo Future Technologies Pvt Ltd, India</span>
        <Elzeo />
      </footer>
    </div>
  );
}
