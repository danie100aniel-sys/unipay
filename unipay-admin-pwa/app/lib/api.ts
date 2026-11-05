export async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? 'unknown';
  const rawText = await response.text();
  const trimmedText = rawText.trim();

  if (!trimmedText) {
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`);
    }
    return {} as T;
  }

  const preview = trimmedText.replace(/\s+/g, ' ').slice(0, 180);

  const looksLikeJson = trimmedText.startsWith('{') || trimmedText.startsWith('[');
  const isHtml = /text\/html|application\/html/i.test(contentType) || trimmedText.startsWith('<');

  if (!looksLikeJson && isHtml) {
    throw new Error(
      `Request failed with status ${response.status}. Server returned HTML instead of JSON: ${preview || 'empty body'}`,
    );
  }

  if (!looksLikeJson) {
    if (!response.ok) {
      throw new Error(
        `Request failed with status ${response.status}. Server response: ${preview || 'empty body'}`,
      );
    }

    throw new Error(
      `Unexpected server response (content-type: ${contentType}). Received: ${preview || 'empty body'}`,
    );
  }

  try {
    return JSON.parse(trimmedText) as T;
  } catch {
    if (!response.ok) {
      throw new Error(
        `Request failed with status ${response.status}. Server response: ${preview || 'empty body'}`,
      );
    }

    throw new Error(
      `Unexpected server response (content-type: ${contentType}). Received: ${preview || 'empty body'}`,
    );
  }
}
