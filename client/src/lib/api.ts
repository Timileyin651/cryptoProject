/**
 * REST API client.
 *
 * Injects the in-memory access token into every request.
 * Handles 401 → automatic token refresh via httpOnly cookie.
 */

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

interface ApiOptions extends RequestInit {
  json?: unknown;
}

class ApiError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(body.message as string || `API error ${status}`);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { json, ...init } = opts;
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> || {}),
  };

  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(path, {
    ...init,
    headers,
    credentials: 'include', // send httpOnly cookies
  });

  if (res.status === 401 && accessToken) {
    // Try token refresh
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      const retryRes = await fetch(path, { ...init, headers, credentials: 'include' });
      if (!retryRes.ok) {
        const body = await retryRes.json().catch(() => ({}));
        throw new ApiError(retryRes.status, body as Record<string, unknown>);
      }
      return retryRes.json() as Promise<T>;
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body as Record<string, unknown>);
  }

  return res.json() as Promise<T>;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      accessToken = null;
      return false;
    }
    const data = await res.json();
    const newToken = data?.data?.accessToken;
    if (newToken) {
      accessToken = newToken;
      return true;
    }
    accessToken = null;
    return false;
  } catch {
    accessToken = null;
    return false;
  }
}

// ── Typed API methods ──

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', json: body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', json: body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', json: body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export { ApiError };
