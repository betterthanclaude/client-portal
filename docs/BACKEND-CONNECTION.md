# Connecting the client portal

The frontend now uses the regional account and workspace API from `kanook-0`.
The local clone is `.local/data-ingest-kanook-0`, based on `cb06844`. The changes
prepared in that clone are also saved in `deploy/backend-portal.patch` because
`.local` is deliberately ignored by Git. Nothing in this handoff has been
deployed to Google Cloud or pushed to the backend repository.

## Local preview

Run `npm run dev -- --host 127.0.0.1 --port 5190` and open
`http://127.0.0.1:5190/?demo=1`. Demo mode is explicit and uses sample data only.
Use `?demo=0` for real login. `KANOOK_BACKEND_URL` sets the Vite proxy destination;
it defaults to `https://kanook.oru-el.com`. Local real-session testing needs a
loopback regional API with an explicit loopback portal origin and development
cookies. Do not weaken production cookies to support a local browser.

The browser signs in using the existing account console-key exchange and keeps
the resulting session in an HttpOnly cookie. State-changing requests use the
session CSRF token. Keys are not saved in browser storage. The proxy no longer
injects a shared service credential.

## Backend release

1. In a clean checkout of `kanook-0`, inspect and apply the included patch with
   `git apply --check /path/to/backend-portal.patch`, then `git apply` that file.
   Reconcile newer branch changes before applying if the branch has moved.
2. Run the backend's release checks and normal migration process. This patch
   adds migration 16 for project settings, key labels, grievances, and project
   run associations; migration 15 remains unchanged.
3. Set Terraform `portal_origins` to the exact public frontend origin, for example
   `https://client-portal-sepia-sigma-61.vercel.app`. This feeds
   `ORUEL_PORTAL_ORIGINS` and the workspace bucket CORS allowlist. Include no
   paths, trailing slashes, or wildcard preview domains. The default is empty.
4. Supply the existing deployment's workspace bucket, runtime storage permissions,
   enrolled dataset connections, execution profiles, workers, and SMTP settings
   if project invitation email delivery is required. Apply through the normal
   reviewed infrastructure and service release process.
5. Deploy the frontend with `VITE_DEMO_MODE=false`. Its checked-in Vercel rewrites
   forward `/account/v1`, `/workspace`, and `/qc-api` to the regional API.
   Preserve the browser Origin, cookie, and CSRF headers. Never spoof Origin to
   bypass the backend allowlist. Do not put a shared secret in Vite variables.
6. Verify login/session restore/logout, project membership, uploads, keys, and
   a grievance receipt. Verify job execution with an approved canary dataset;
   no paid production job was dispatched during this implementation.

Same-origin hosting under the backend's `/app` mount is also possible, but build
with `VITE_BASE_PATH=/app/` and ensure the production edge supplies the `/qc-api`
rewrite. Vite's development proxy is not a production reverse proxy.

## Connected capabilities and limits

- Account: real session login/logout, identity, role-gated team invitations and
  access changes, and activity history. Organization identity and execution
  provisioning remain operator-managed because the backend has no customer
  write contract for those settings.
- Workspace: project creation, optional invitations, requirements/configuration
  persistence, scoped upload key issuance/list/revocation, and file metadata.
- Uploads: initiate a GCS resumable session, send bytes directly to GCS, then
  complete and verify metadata. The browser uploader is capped at 256 MB because
  it computes SHA-256 in memory. S3 reference indexing requires short-lived
  credentials per page; credentials are not persisted.
- Jobs: project-linked QC submissions with stable idempotency keys on retries,
  history, polling, plan execution, cancellation, and server results. The API
  requires enrolled dataset/spec manifest references and hashes. Uploading raw
  files or saving preferences does not automatically create those manifests.
  Automated enrollment/requirements translation needs an additional backend
  contract. Real reports display server results without fabricated scores.
- Support: grievances are persisted with an idempotent receipt and private
  member history. This does not send an email or provide an operator triage UI.
- Docs: `public/api/openapi.json` is generated from the actual regional app,
  with source revision/local-change metadata. Regenerate with
  `.venv/Scripts/python.exe scripts/generate-api-docs.py --backend .local/data-ingest-kanook-0`.

## Verification

`npm test`, `npm run build`, and `npm run lint` cover the frontend. Regional
integration tests use disposable SQLite stores and in-process FastAPI transports:
`.venv/Scripts/python.exe -m unittest discover -s tests -p test_regional_portal.py -v`.
They exercise sessions, CSRF/origin checks, tenant isolation, persistence, key
revocation, grievance privacy/idempotency, and duplicate dispatch prevention.
Cloud Run, PostgreSQL migration, email delivery, GCS transfer, and paid execution
still require validation in the deployment environment.
