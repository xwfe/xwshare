export type LogLevel = 'info' | 'warn' | 'error';

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export function logEvent(level: LogLevel, event: string, fields: LogFields = {}) {
  const entry = {
    ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
    timestamp: new Date().toISOString(),
    level,
    event
  };

  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.info(entry);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
