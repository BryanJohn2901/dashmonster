/**
 * Logs swallowed errors without breaking the user experience.
 *
 * Use in place of bare `.catch(() => {})` so errors are at least visible
 * in development and can be wired to telemetry in production.
 *
 * @param context - Short description of where the error occurred (e.g. "fetchInsights effect")
 * @param err     - The caught value (may not be an Error instance)
 */
export function logSilentError(context: string, err: unknown): void {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[silent-error] ${context}:`, err);
  }
  // Production telemetry hook (placeholder — wire to Sentry/Datadog when ready):
  // window.dispatchEvent(new CustomEvent("pta:silent-error", { detail: { context, err: String(err) } }));
}
