const CSRF_STORAGE_KEY = 'savoria_csrf_token';
const SESSION_STORAGE_KEY = 'savoria_session_token';

function readStoredValue(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage.getItem(key);
    }
  } catch {
    // Ignore storage access errors in restricted frames
  }
  return null;
}

function writeStoredValue(key: string, value: string | null) {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (value) {
        window.sessionStorage.setItem(key, value);
      } else {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage access errors in restricted frames
  }
}

let currentCsrfToken: string | null = readStoredValue(CSRF_STORAGE_KEY);
let currentSessionToken: string | null = readStoredValue(SESSION_STORAGE_KEY);

export function setCsrfToken(token: string | null) {
  currentCsrfToken = token;
  writeStoredValue(CSRF_STORAGE_KEY, token);
}

export function getCsrfToken(): string | null {
  return currentCsrfToken;
}

export function setSessionAuth(auth: { csrfToken: string | null; sessionToken?: string | null }) {
  setCsrfToken(auth.csrfToken);
  if (auth.sessionToken !== undefined) {
    currentSessionToken = auth.sessionToken;
    writeStoredValue(SESSION_STORAGE_KEY, auth.sessionToken);
  }
}

export function clearSessionAuth() {
  currentCsrfToken = null;
  currentSessionToken = null;
  writeStoredValue(CSRF_STORAGE_KEY, null);
  writeStoredValue(SESSION_STORAGE_KEY, null);
}

export class ApiError extends Error {
  status: number;
  fieldErrors?: Record<string, string[]>;

  constructor(message: string, status: number, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (currentSessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${currentSessionToken}`);
  }

  if (
    currentCsrfToken &&
    method !== 'GET' &&
    method !== 'HEAD' &&
    method !== 'OPTIONS'
  ) {
    headers.set('X-CSRF-Token', currentCsrfToken);
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      method,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError(
      'Unable to reach the Savoria server. Please check your connection and try again.',
      0
    );
  }

  let data: any = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    if (
      response.status === 401 &&
      !path.startsWith('/api/auth/login') &&
      !path.startsWith('/api/auth/register') &&
      !path.startsWith('/api/auth/google')
    ) {
      clearSessionAuth();
    }
    throw new ApiError(
      data?.error || `Request failed (${response.status}).`,
      response.status,
      data?.fieldErrors
    );
  }

  return data as T;
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}
