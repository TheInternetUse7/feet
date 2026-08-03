const POSITIVE_ID_RE = /^[1-9]\d*$/;

export function parsePositiveId(str: string | undefined): number | null {
  return str !== undefined && POSITIVE_ID_RE.test(str) ? parseInt(str, 10) : null;
}
