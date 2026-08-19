export async function requestJson<T>(path: string, init: RequestInit, fallbackError: string): Promise<T> {
  const response = await fetch(path, init);
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || fallbackError);
  return payload;
}
