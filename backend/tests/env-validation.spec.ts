import { validateEnv } from '../src/config/env.validation';

/**
 * Phase H1 — fail-fast environment validation.
 * Proves the app refuses to boot on missing/invalid configuration.
 */
describe('Env validation (Phase H1 — fail-fast config)', () => {
  let exitSpy: jest.SpyInstance;

  const baseEnv = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/tally_dev',
    JWT_SECRET: 'x'.repeat(48),
  };

  beforeEach(() => {
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('accepts a valid configuration and applies defaults', () => {
    const env = validateEnv(baseEnv);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.JWT_EXPIRES_IN).toBe('15m');
    expect(env.REFRESH_TOKEN_EXPIRES_IN).toBe('30d');
    expect(env.CORS_ORIGINS).toBe('http://localhost:5173');
  });

  it('refuses to boot without JWT_SECRET', () => {
    validateEnv({ DATABASE_URL: baseEnv.DATABASE_URL });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('refuses to boot without DATABASE_URL', () => {
    validateEnv({ JWT_SECRET: baseEnv.JWT_SECRET });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    validateEnv({ ...baseEnv, DATABASE_URL: 'mysql://user@host/db' });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('rejects an invalid NODE_ENV', () => {
    validateEnv({ ...baseEnv, NODE_ENV: 'staging' });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('rejects a non-numeric PORT', () => {
    validateEnv({ ...baseEnv, PORT: 'abc' });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('requires a 32+ char JWT_SECRET in production', () => {
    validateEnv({ ...baseEnv, JWT_SECRET: 'too-short', NODE_ENV: 'production' });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('allows a short JWT_SECRET outside production', () => {
    const env = validateEnv({ ...baseEnv, JWT_SECRET: 'dev-secret' });
    expect(exitSpy).not.toHaveBeenCalled();
    expect(env.JWT_SECRET).toBe('dev-secret');
  });

  it('coerces a string PORT', () => {
    const env = validateEnv({ ...baseEnv, PORT: '4000' });
    expect(env.PORT).toBe(4000);
  });
});
