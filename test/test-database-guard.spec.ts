import { assertTestDatabase } from './test-database-guard.js';

const base = 'postgresql://postgres:postgres@localhost:5432';

describe('assertTestDatabase', () => {
  it('allows a database whose name ends in _test', () => {
    expect(() => assertTestDatabase(`${base}/legit_gg_test`)).not.toThrow();
  });

  it('refuses the dev database', () => {
    expect(() => assertTestDatabase(`${base}/legit_gg`)).toThrow(/legit_gg/);
  });

  it('refuses a production-looking database', () => {
    expect(() => assertTestDatabase(`${base}/legit_gg_prod`)).toThrow(
      /Refusing/,
    );
  });

  it('refuses a name that merely contains _test somewhere', () => {
    expect(() => assertTestDatabase(`${base}/legit_test_backup`)).toThrow(
      /Refusing/,
    );
  });

  it('refuses an unset DATABASE_URL rather than guessing', () => {
    expect(() => assertTestDatabase(undefined)).toThrow(
      /DATABASE_URL is not set/,
    );
  });
});
