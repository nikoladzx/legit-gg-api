const TEST_DATABASE_SUFFIX = '_test';

export function assertTestDatabase(databaseUrl: string | undefined): void {
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. E2E tests need a .env.test file — see .env.example.',
    );
  }

  const name = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (name.endsWith(TEST_DATABASE_SUFFIX)) {
    return;
  }

  throw new Error(
    `Refusing to run E2E tests against the "${name}" database: they TRUNCATE every ` +
      `table, including leetify_stats. DATABASE_URL must name a database ending in ` +
      `"${TEST_DATABASE_SUFFIX}". Set it in .env.test.`,
  );
}
