export function newestFirst<T>(entries: readonly T[], timestamp: (entry: T) => string): T[] {
  return [...entries].sort((a, b) => Date.parse(timestamp(b)) - Date.parse(timestamp(a)));
}
