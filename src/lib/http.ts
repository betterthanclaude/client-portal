export type Session = { organization: string; organization_name: string; member_id: string; email: string; role: 'owner' | 'admin' | 'member' | 'viewer'; permissions: string[]; csrf: string };
let session: Session | null = null;
let sessionRequest: Promise<Session> | null = null;
export function clearSession() { session = null; sessionRequest = null; }
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const messages: Record<string, string> = {
  authentication_required: 'Sign in with your console key to continue.',
  csrf_check_failed: 'Your session could not be verified. Sign in again.',
  origin_not_permitted: 'This portal address has not been enabled by the backend administrator.',
  role_not_permitted: 'Your account does not have permission for this action.',
  endpoint_not_permitted: 'This operation is not enabled on the deployed backend yet.',
  workspace_storage_not_configured: 'File storage has not been configured on the backend yet.',
};
export async function apiRequest<T>(path: string, init: RequestInit = {}, publicRequest = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (init.method && !['GET', 'HEAD'].includes(init.method) && !publicRequest) headers.set('X-CSRF-Token', (await getSession()).csrf);
  let response: Response;
  try { response = await fetch(path, { ...init, headers, credentials: 'include', cache: 'no-store', signal: init.signal ?? AbortSignal.timeout(30000) }); }
  catch (error) { if (init.signal?.aborted) throw error; throw new Error('The backend could not be reached. Check your connection and try again.'); }
  if (!response.headers.get('content-type')?.includes('application/json')) throw new ApiError(response.status, 'The API route is unavailable. Check the backend deployment.');
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401 || body.error === 'csrf_check_failed') {
      clearSession();
      if (!publicRequest && typeof window !== 'undefined') window.dispatchEvent(new Event('kanook:session-expired'));
    }
    const detail = typeof body.detail === 'string' ? body.detail : messages[body.error] ?? (body.error ? String(body.error).replaceAll('_', ' ') : null);
    throw new ApiError(response.status, detail ?? (response.status === 422 ? 'Check the required fields and their allowed values.' : `Request failed (${response.status}). Please try again.`));
  }
  return body as T;
}
export function getSession(): Promise<Session> {
  if (session) return Promise.resolve(session);
  if (!sessionRequest) sessionRequest = apiRequest<Session>('/account/v1/session', {}, true).then((value) => {
    if (!value.csrf || !value.organization || !Array.isArray(value.permissions)) throw new Error('The backend did not return a valid browser session.');
    session = value; return value;
  }).finally(() => { sessionRequest = null; });
  return sessionRequest;
}
export async function login(key: string) { clearSession(); await apiRequest('/account/v1/login', { method: 'POST', body: JSON.stringify({ key }) }, true); return getSession(); }
export async function logout() { await apiRequest('/account/v1/logout', { method: 'POST', body: '{}' }); clearSession(); }
