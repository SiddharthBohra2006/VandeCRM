const API_BASE = '/api';

interface ApiOptions extends RequestInit {
  token?: string;
}

function getToken(): string | null {
  return localStorage.getItem('crm_token');
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { token: overrideToken, ...fetchOptions } = options;
  const token = overrideToken || getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((fetchOptions.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers });
  } catch {
    // Network/unreachable — not a session problem. Callers may retry.
    throw new ApiError('Network error — could not reach the server. Check your connection and try again.', 0);
  }

  let data: any = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok || data.ok === false) {
    // Explicit 401 = expired/invalid session. Reconcile globally so pages get a
    // session-expired prompt instead of silently throwing or hard-reloading
    // (which would discard unsaved drafts).
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    throw new ApiError(data.error || `Request failed with status ${res.status}`, res.status);
  }
  return data;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute fresh TTL

export function clearApiCache(prefix?: string) {
  if (!prefix) {
    cache.clear();
  } else {
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) cache.delete(key);
    }
  }
}

export const api = {
  get: async <T,>(path: string, options?: { skipCache?: boolean }): Promise<T> => {
    if (!options?.skipCache) {
      const cached = cache.get(path);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data as T;
      }
    }
    const result = await request<T>(path);
    cache.set(path, { data: result, timestamp: Date.now() });
    return result;
  },

  post: async <T,>(path: string, body?: any) => {
    clearApiCache();
    return request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  put: async <T,>(path: string, body?: any) => {
    clearApiCache();
    return request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  delete: async <T,>(path: string) => {
    clearApiCache();
    return request<T>(path, { method: 'DELETE' });
  },
};

export async function downloadAuthenticatedFile(path: string, filename?: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`Download failed with status ${res.status}`);
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}