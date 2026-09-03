const API_BASE = '/api';

interface ApiOptions extends RequestInit {
  token?: string;
}

function getToken(): string | null {
  return localStorage.getItem('crm_token');
}

export async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { token: overrideToken, ...fetchOptions } = options;
  const token = overrideToken || getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((fetchOptions.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers });
  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),

  post: <T,>(path: string, body?: any) =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T,>(path: string, body?: any) =>
    request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T,>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
};
