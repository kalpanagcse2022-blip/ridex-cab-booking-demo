export const TOKEN_KEY = "ridex_session_token";

// Kept in memory as well as localStorage. When RideX is embedded in a preview frame the
// browser may reject the session cookie AND block localStorage. Without this copy the
// login succeeds on the server but the very next request has no credentials. The memory
// copy survives client-side navigation (login -> dashboard); only a full page reload
// needs localStorage or the cookie.
let memoryToken: string | null = null;

export function storeToken(token: string | null) {
  memoryToken = token || null;
  try {
    if (!token) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
    return true;
  } catch {
    return false;
  }
}

export function getToken() {
  if (memoryToken) return memoryToken;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function apiFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = typeof window !== "undefined" ? getToken() : null;
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, {
    ...init,
    headers,
    credentials: "include",
    cache: init.cache ?? "no-store",
  });
}

export function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export async function completeSignIn(token: string | undefined) {
  const persists = token ? storeToken(token) : false;
  return { persists };
}
