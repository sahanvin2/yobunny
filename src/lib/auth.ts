const AUTH_KEY = "yobunny_auth";

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AUTH_KEY) === "1";
}

export function signInLocal(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_KEY, "1");
}

export function signOutLocal(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_KEY);
}
