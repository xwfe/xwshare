export type LogLevel = 'info' | 'warn' | 'error';

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export function logEvent(level: LogLevel, event: string, fields: LogFields = {}) {
  const entry = {
    ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
    timestamp: new Date().toISOString(),
    level,
    event
  };
  const line = JSON.stringify(entry);

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
