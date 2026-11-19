import { apiRequest, type Session } from './http.ts';
import { DEMO_MODE } from './demo.ts';

export type TeamMember = { id: string; email: string; role: Session['role']; active: number; created: number };
export type Invitation = { id: string; email: string; role: Session['role']; expires: number };
export type Activity = { id: string; action: string; status: number; created: number; duration_ms: number; request_id: string };
export type Grievance = { id: string; subject: string; category: string; status: string; created: number };
export const readTeam = () => apiRequest<{ members: TeamMember[]; invitations: Invitation[] }>('/account/v1/team');
export const inviteTeam = (email: string, role: Session['role']) => apiRequest<{ id: string; invitation_token: string; expires: number }>('/account/v1/invitations', { method: 'POST', body: JSON.stringify({ email, role }) });
export const updateMember = (id: string, role: Session['role'], active: boolean) => apiRequest(`/account/v1/team/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ role, active }) });
export const revokeInvitation = (id: string) => apiRequest(`/account/v1/invitations/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const readActivity = (before?: string) => apiRequest<{ items: Activity[]; next_cursor: string | null }>(`/account/v1/activity?limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`);

export async function submitGrievance(body: { category: string; subject: string; description: string; project_id: string | null }, idempotencyKey: string): Promise<Grievance> {
  if (DEMO_MODE) return { id: `preview-${crypto.randomUUID()}`, ...body, status: 'preview', created: Date.now() / 1000 };
  return apiRequest('/workspace/grievances', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(body) });
}
export const readGrievances = () => apiRequest<{ items: Grievance[] }>('/workspace/grievances');
