import { AxiosError } from 'axios';

/**
 * Extract a human-readable message from any thrown value.
 * Prefers the backend's `message` field (string or string[]), falls back to
 * the HTTP status text, then a caller-supplied default.
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as
      | { message?: string | string[] }
      | undefined;
    if (typeof data?.message === 'string' && data.message.length > 0) {
      return data.message;
    }
    if (Array.isArray(data?.message) && data.message.length > 0) {
      return data.message.join(', ');
    }
    if (err.response?.statusText) {
      return err.response.statusText;
    }
    if (err.message) {
      return err.message;
    }
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}
