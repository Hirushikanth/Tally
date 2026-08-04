import { z } from 'zod';

export const PASSWORD_RULES_MESSAGE =
  'Password must be at least 8 characters and contain at least one letter and one number';

export const passwordSchema = z
  .string()
  .min(8, PASSWORD_RULES_MESSAGE)
  .max(128, 'Password must be at most 128 characters')
  .regex(/(?=.*[A-Za-z])(?=.*\d)/, PASSWORD_RULES_MESSAGE);

export const confirmPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      });
    }
  });
