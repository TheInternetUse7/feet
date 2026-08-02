const UTC_DB_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.\d+)?$/;

export function toUtcDbString(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function parseUtcDbString(str: string): Date {
  const match = UTC_DB_RE.exec(str);
  if (!match) return new Date(str);
  return new Date(`${match[1]}T${match[2]}Z`);
}
