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
export type UploadKey = { id: string; name: string; expires: number; created: number | null; last_used: number | null };
export type Member = { id: string; email: string; status: "pending_delivery" | "delivery_failed" | "sent" | "accepted"; invitation_url?: string };
export type StoredFile = { id: string; name: string; size: number; source: "device" | "s3"; sha256: string | null };
export type S3Connection = { id: string; bucket: string; prefix: string; indexed: number; next_cursor: string | null };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (DEMO_MODE) return demoRequest<T>(path, init);
  let response: Response;
  try {
    response = await fetch(`/workspace${path}`, {
      ...init, cache: "no-store",
      headers: { "Content-Type": "application/json", ...init.headers },
      signal: init.signal ?? AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error("The workspace service could not be reached. Please try again.");
  }
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("The workspace service is unavailable.");
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : `Request failed (${response.status}). Check your inputs and try again.`);
  return body as T;
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
export const connectBucket = (id: string, data: { bucket_url: string; region: string; access_key_id: string; secret_access_key: string; session_token?: string }) =>
  request<S3Connection>(`/projects/${id}/s3`, { method: "POST", body: JSON.stringify(data) });
export const indexBucket = (id: string, connection: string, cursor: string) => request<Pick<S3Connection, "indexed" | "next_cursor">>(`/projects/${id}/s3/${connection}/index`, { method: "POST", body: JSON.stringify({ cursor }) });

export function uploadFile(projectId: string, file: File, onProgress: (percent: number) => void, signal: AbortSignal) {
  if (DEMO_MODE) {
    if (signal.aborted) return Promise.reject(new Error('Upload cancelled.'));
    return demoRequest<StoredFile>(`/projects/${projectId}/files`, { method: 'POST', body: JSON.stringify({ name: file.name, size: file.size }) }).then((stored) => { onProgress(100); return stored; });
  }
  return new Promise<StoredFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    xhr.open("POST", `/workspace/projects/${projectId}/files?filename=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.timeout = 30 * 60 * 1000;
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded * 100 / event.total)); };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(typeof body.detail === "string" ? body.detail : "Upload failed. Please retry."));
      } catch { reject(new Error("The upload service returned an invalid response.")); }
    };
    xhr.onerror = () => reject(new Error("Upload connection lost. Please retry."));
    xhr.ontimeout = () => reject(new Error("Upload timed out. Please retry."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.onloadend = () => signal.removeEventListener("abort", abort);
    if (signal.aborted) { reject(new Error("Upload cancelled.")); return; }
    signal.addEventListener("abort", abort, { once: true });
    xhr.send(file);
  });
}
