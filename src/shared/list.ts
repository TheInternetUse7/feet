export function capList<T>(items: T[], limit: number, render: (item: T) => string): string[] {
  const lines = items.slice(0, limit).map(render);
  const extra = items.length - limit;
  if (extra > 0) lines.push(`...and ${extra} more`);
  return lines;
}
