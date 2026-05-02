const KEY = "propsite_admin_token";

export function getToken(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

export function setToken(token: string): void {
  sessionStorage.setItem(KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
