export default function Home() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="page-title">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">CQ</div>
          <span>ContextQuill</span>
        </div>
        <div className="status"><span aria-hidden="true" /> Connection service online</div>
        <h1 id="page-title">LinkedIn authorization, without shared accounts.</h1>
        <p className="lead">
          This service connects a ContextQuill installation to the LinkedIn member who personally authorizes it.
          Installing the plugin never grants access to another person&apos;s account.
        </p>
      </section>

      <section className="principles" aria-label="Security model">
        <article>
          <span className="step">01</span>
          <h2>LinkedIn handles consent</h2>
          <p>Credentials are entered only on LinkedIn. ContextQuill requests identity and post-publishing permission.</p>
        </article>
        <article>
          <span className="step">02</span>
          <h2>One-time secure handoff</h2>
          <p>The authorization result is encrypted and redeemable once by the installation that started the request.</p>
        </article>
        <article>
          <span className="step">03</span>
          <h2>Local credential ownership</h2>
          <p>The plugin stores the token in the user&apos;s secure local credential store. The handoff copy is erased.</p>
        </article>
      </section>

      <footer>
        ContextQuill publishes only the exact post version a human reviewed and approved.
      </footer>
    </main>
  );
}
