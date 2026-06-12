const BASE_URL = 'https://fjf5irf18h.execute-api.ap-northeast-1.amazonaws.com';
const TENANT_ID = 'abc';

function getApiKey(): string {
  const key = import.meta.env.BLOG_API_KEY;
  if (!key) throw new Error('BLOG_API_KEY environment variable is not set');
  return key;
}

export interface Article {
  article_id: string;
  tenant_id: string;
  title: string;
  body: string;
  author_id: string;
  author_name: string;
  tags: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

/** Fetch with automatic retry on Aurora 503 cold-start responses. */
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 6): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);

    if (res.status !== 503) return res;

    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '20', 10);
    const wait = retryAfter * 1000;

    if (attempt < maxRetries) {
      console.log(`Aurora cold-start detected (503). Retrying in ${retryAfter}s... (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, wait));
    } else {
      return res; // return last 503 to surface the error
    }
  }
  // unreachable, but TypeScript needs it
  throw new Error('fetchWithRetry: unexpected exit');
}

async function fetchPage(cursor: string | null): Promise<{ items: Article[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ tenantId: TENANT_ID, limit: '100' });
  if (cursor) params.set('cursor', cursor);

  const res = await fetchWithRetry(
    `${BASE_URL}/aurora/articles/by-status?${params}&status=published`,
    { headers: { 'x-api-key': getApiKey() } }
  );

  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function getAllArticles(): Promise<Article[]> {
  const results: Article[] = [];
  let cursor: string | null = null;

  do {
    const data = await fetchPage(cursor);
    results.push(...data.items);
    cursor = data.nextCursor;
  } while (cursor);

  return results;
}

export async function getArticle(articleId: string): Promise<Article> {
  const res = await fetchWithRetry(
    `${BASE_URL}/aurora/articles/${articleId}`,
    { headers: { 'x-api-key': getApiKey() } }
  );

  if (!res.ok) throw new Error(`API error: ${res.status} for article ${articleId}`);
  return res.json();
}
