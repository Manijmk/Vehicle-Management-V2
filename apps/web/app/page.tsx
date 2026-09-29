const foundationCapabilities = [
  'Versioned REST API and OpenAPI documentation',
  'Validated environment configuration',
  'PostgreSQL, Redis, and S3-compatible local services',
  'OpenTelemetry-compatible process bootstrap',
  'Automated unit, API, and browser checks',
];

export default function HomePage() {
  return (
    <main>
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Vehicle Management System</p>
        <h1 id="page-title">Fleet operations, built on a dependable foundation.</h1>
        <p className="summary">
          Milestone 0 establishes the production-oriented platform shell. Identity and organization
          capabilities arrive next, before operational fleet workflows are introduced.
        </p>
        <div className="status" role="status">
          <span className="status-dot" aria-hidden="true" />
          Foundation ready
        </div>
      </section>

      <section className="capabilities" aria-labelledby="capabilities-title">
        <h2 id="capabilities-title">Foundation capabilities</h2>
        <ul>
          {foundationCapabilities.map((capability) => (
            <li key={capability}>{capability}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
