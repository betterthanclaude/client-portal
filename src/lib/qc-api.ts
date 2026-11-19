import { apiRequest } from './http.ts';
import { DEMO_MODE, demoRequest } from './demo.ts';
export type StorageConnection = { id: string };
export type ConnectionReceipt = StorageConnection & {
  registered: boolean;
  storage: string;
  worker_readiness: string;
};
export type IssuedKey = {
  id: string;
  token: string;
  expires: number;
  shown_once: boolean;
  scope: string;
  name?: string;
  scopes?: string[];
};
export type QcKey = { id: string; name: string; scopes: string[]; created: number; expires: number; revoked: number | boolean; last_used: number | null };
export type UsageRun = { id: string; status: string; created: number; run_kind: string; measured_hours: number | null; measurement: string; cost_usd?: number };
export type UsageLedger = {
  since: number; until: number; prices_configured: boolean;
  demo?: boolean; spend_usd?: number;
  summary: { first_run: { runs: number; measured_runs: number; measured_hours: number }; rerun: { runs: number; measured_runs: number; measured_hours: number }; unmeasured_runs: number; unmetered_dataset_jobs: number };
  items: UsageRun[]; next_cursor: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (DEMO_MODE) return demoRequest<T>(path, init);
  return apiRequest<T>(`/qc-api${path}`, init);
}

export async function listConnections(after?: string) {
  const query = after ? `?after=${encodeURIComponent(after)}` : "";
  const result = await request<{ items: StorageConnection[]; next_cursor: string | null }>(`/v1/connections${query}`);
  if (!Array.isArray(result.items) || result.items.some((item) => typeof item.id !== "string")) {
    throw new Error("The QC API returned an invalid connection list.");
  }
  return result;
}

export function readConnection(id: string) {
  return request<ConnectionReceipt>(`/v1/connections/${encodeURIComponent(id)}`);
}

export async function listQcKeys(before?: string) {
  const result = await request<{ items: QcKey[]; next_cursor: string | null }>(`/v1/api-keys?limit=100${before ? `&before=${encodeURIComponent(before)}` : ''}`);
  if (!Array.isArray(result.items)) throw new Error('The QC API returned an invalid key list.');
  return result;
}

export const revokeQcKey = (id: string) => request(`/v1/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });

export async function getUsage(since: number, until: number, before?: string) {
  const query = new URLSearchParams({ since: String(since), until: String(until), limit: '100' });
  if (before) query.set('before', before);
  const result = await request<UsageLedger>(`/v1/usage/runs?${query}`);
  if (!Array.isArray(result.items) || !result.summary?.first_run || !result.summary?.rerun || result.items.some((item) =>
    !Number.isFinite(item.created) || (item.measured_hours !== null && (!Number.isFinite(item.measured_hours) || item.measured_hours < 0)))) {
    throw new Error('The QC API returned invalid usage data.');
  }
  return result;
}

export async function createApiKey(lifetimeHours: number, name = "Kanook QC") {
  const result = await request<IssuedKey>("/v1/api-keys", {
    method: "POST",
    body: JSON.stringify({ lifetime_hours: lifetimeHours, name, scopes: ["jobs:read", "jobs:write", "results:read", "usage:read"] }),
  });
  if (!result.token || typeof result.token !== "string" || !Number.isFinite(result.expires)) {
    throw new Error("The QC API did not return a usable key. Check existing keys before trying again.");
  }
  return result;
}
