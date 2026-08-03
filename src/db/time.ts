import { SnowflakeUtil, formatTimestamp, type TimestampStyle } from "@fluxerjs/util";

const UTC_DB_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.\d+)?$/;
const SNOWFLAKE_RE = /^\d{17,20}$/;

export function snowflakeDate(id: string): Date | null {
  if (!SNOWFLAKE_RE.test(id)) return null;
  try {
    return SnowflakeUtil.dateFromSnowflake(id);
  } catch {
    return null;
  }
}

export function formatDateTimestamp(date: Date, style: TimestampStyle = "F"): string {
  return formatTimestamp(date.getTime(), style);
}

export function toUtcDbString(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function parseUtcDbString(str: string): Date {
  const match = UTC_DB_RE.exec(str);
  if (!match) return new Date(str);
  return new Date(`${match[1]}T${match[2]}Z`);
}
