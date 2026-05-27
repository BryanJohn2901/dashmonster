export function logSilentError(context: string, err: unknown): void {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[silent-error] ${context}:`, err);
  }
}
