/**
 * CSRF token holder (specification section 5.3).
 *
 * The token is tied to the pre-login or authenticated session, rotates on login and is
 * never the session secret. It is kept in a module variable rather than Redux or web
 * storage so it is not persisted, not serialized into dev tooling and not readable by
 * another origin's storage.
 */
let csrfToken: string | null = null;

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token && token.length > 0 ? token : null;
}

export function clearCsrfToken(): void {
  csrfToken = null;
}
