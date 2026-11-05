import { readJsonResponse } from './api';

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL || ''}/api/admin`;

export function getAdminApiBaseUrl(): string {
  return API_BASE;
}

export async function adminFetch<T extends Record<string, unknown> = Record<string, unknown>>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('unipay_token') || '' : '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('unipay_token');
      window.location.replace('/admin/login');
    }
    throw new Error('Session expired');
  }

  const data = await readJsonResponse<T>(response);
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'API request failed');
  }
  return data;
}
