import { z } from 'zod';

const databaseUrlSchema = z
  .string()
  .refine((value) => /^postgres(ql)?:\/\/.+/.test(value), {
    message: 'DATABASE_URL must be a postgres:// or postgresql:// URL',
  });

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    DATABASE_URL: databaseUrlSchema,
    JWT_SECRET: z
      .string()
      .min(
        1,
        'JWT_SECRET is required — generate one with: openssl rand -base64 48',
      ),
    JWT_EXPIRES_IN: z.string().default('15m'),
    REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    FRONTEND_URL: z.string().url().optional(),
    SENTRY_DSN: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.JWT_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message:
          'JWT_SECRET must be at least 32 characters when NODE_ENV=production',
      });
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const path = issue.path.join('.') || '(root)';
        return `  - ${path}: ${issue.message}`;
      })
      .join('\n');
    console.error('Invalid environment configuration:\n' + issues);
    console.error(
      'Refusing to start. See backend/.env.example for the required variables.',
    );
    process.exit(1);
  }
  return result.data;
}
