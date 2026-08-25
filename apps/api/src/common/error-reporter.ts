import * as Sentry from "@sentry/node";

let initialized = false;

/**
 * No-op unless SENTRY_DSN is set — the app runs identically without it, no
 * signup required to develop or deploy. Set the env var to turn monitoring
 * on with no code changes.
 */
export function initErrorReporting() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({ dsn, environment: process.env.NODE_ENV ?? "development", tracesSampleRate: 0.1 });
  initialized = true;
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (!initialized) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
