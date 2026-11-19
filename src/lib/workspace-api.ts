import { apiRequest } from './http.ts';
import type { IssuedKey } from "./qc-api";
import { DEMO_MODE, demoRequest } from './demo.ts';

export type ProjectRequirements = {
  mode: 'structured' | 'notes';
  component_weights: { visual_similarity: number | null; label_balance: number | null };
  visual_similarity: { context: number | null; temporal: number | null; layout: number | null; family: number | null; scene: number | null };
  label_balance: { label: string; target: number }[];
  notes: string;
};
export type ProjectConfiguration = { target_score: number | null; selected_file_ids: string[] | null };
export type WorkspaceProject = { id: string; name: string; created: number; status: 'ongoing' | 'completed'; updated?: number | null; file_count?: number; invitation_count?: number; requirements?: ProjectRequirements | null; configuration?: ProjectConfiguration };
export type UploadKey = { id: string; name: string; expires: number; created: number | null; last_used: number | null; revoked?: boolean | number };
export type Member = { id: string; email: string; status: "pending_delivery" | "delivery_failed" | "sent" | "accepted"; invitation_url?: string };
export type StoredFile = { id: string; name: string; size: number; source: "device" | "s3"; sha256: string | null };
export type S3Credentials = { access_key_id: string; secret_access_key: string; session_token?: string };
export type S3Connection = { id: string; bucket: string; prefix: string; indexed: number; next_cursor: string | null };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (DEMO_MODE) return demoRequest<T>(path, init);
  return apiRequest<T>(`/workspace${path}`, init);
}

export const listProjects = () => request<{ items: WorkspaceProject[] }>("/projects");
export const createProject = (name: string) => request<WorkspaceProject>("/projects", { method: "POST", body: JSON.stringify({ name }) });
export const getProject = (id: string) => request<WorkspaceProject & { members: Member[]; files: StoredFile[] }>(`/projects/${id}`);
export const updateProject = (id: string, changes: { status?: WorkspaceProject['status']; requirements?: ProjectRequirements; configuration?: ProjectConfiguration }) => request<WorkspaceProject>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });
export const inviteMember = (id: string, email: string) => request<Member>(`/projects/${id}/invitations`, { method: "POST", body: JSON.stringify({ email }) });
export const acceptInvitation = (token: string) => request<WorkspaceProject>("/invitations/accept", { method: "POST", body: JSON.stringify({ token }) });
export const listFiles = (id: string) => request<{ items: StoredFile[] }>(`/projects/${id}/files`);
export const createUploadKey = (id: string, lifetime_hours: number, name = 'Upload key') => request<IssuedKey>(`/projects/${id}/api-keys`, { method: "POST", body: JSON.stringify({ lifetime_hours, name }) });
export const listUploadKeys = (id: string) => request<{ items: UploadKey[] }>(`/projects/${id}/api-keys`);
export const revokeUploadKey = (projectId: string, id: string) => request(`/projects/${encodeURIComponent(projectId)}/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const connectBucket = (id: string, data: { bucket_url: string; region: string; access_key_id: string; secret_access_key: string; session_token?: string }) =>
  request<S3Connection>(`/projects/${id}/s3`, { method: "POST", body: JSON.stringify(data) });
export const indexBucket = (id: string, connection: string, cursor: string, credentials: S3Credentials) => request<Pick<S3Connection, "indexed" | "next_cursor">>(`/projects/${id}/s3/${connection}/index`, { method: "POST", body: JSON.stringify({ cursor, ...credentials }) });

export function uploadFile(projectId: string, file: File, onProgress: (percent: number) => void, signal: AbortSignal) {
  if (DEMO_MODE) {
    if (signal.aborted) return Promise.reject(new Error('Upload cancelled.'));
    return demoRequest<StoredFile>(`/projects/${projectId}/files`, { method: 'POST', body: JSON.stringify({ name: file.name, size: file.size }) }).then((stored) => { onProgress(100); return stored; });
  }
  return uploadToStorage(projectId, file, onProgress, signal);
}

async function uploadToStorage(projectId: string, file: File, onProgress: (percent: number) => void, signal: AbortSignal): Promise<StoredFile> {
  signal.throwIfAborted();
  if (file.size > 256 * 1024 * 1024) throw new Error('Use the API for files larger than 256 MB. Browser uploads are limited to keep checksum verification reliable.');
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  signal.throwIfAborted();
  const upload = await request<{ upload_id: string; upload_url: string }>(`/projects/${projectId}/files/initiate`, { method: 'POST', signal, body: JSON.stringify({ filename: file.name, size: file.size, sha256: digest }) });
  const target = new URL(upload.upload_url);
  if (target.protocol !== 'https:' || !(target.hostname === 'storage.googleapis.com' || target.hostname.endsWith('.storage.googleapis.com'))) throw new Error('The backend returned an invalid upload destination.');
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    xhr.open('PUT', upload.upload_url);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.timeout = 60 * 60 * 1000;
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded * 100 / event.total)); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed. Please retry.'));
    xhr.onerror = () => reject(new Error('Upload connection lost. Please retry.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out. Please retry.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    xhr.onloadend = () => signal.removeEventListener('abort', abort);
    if (signal.aborted) { reject(new Error('Upload cancelled.')); return; }
    signal.addEventListener('abort', abort, { once: true });
    xhr.send(file);
  });
  signal.throwIfAborted();
  return request<StoredFile>(`/projects/${projectId}/files/complete`, { method: 'POST', signal, body: JSON.stringify({ upload_id: upload.upload_id }) });
}
