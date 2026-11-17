# Kanook home-page intake

This is a working **local, single-workspace development service**, not a public
multi-user deployment. It runs alongside the existing reference-only QC API.
The frontend's existing sign-in screen remains a UI demo, not authentication.

The frontend currently opens in MVP demo mode. Set `VITE_DEMO_MODE=false` in
`.env.local` and restart Vite to use this service. Otherwise all workspace actions
use sample data saved in the browser and no requests reach this server.

## Run on this Windows workspace

Dependencies are installed in `D:/kanook/.venv`; DATA-INGEST's environment was not changed.
For a fresh checkout, create a virtual environment and install `server/requirements.txt`.

```powershell
npm run dev:api
# In another terminal:
npm run dev -- --port 5174
```

Copy `.env.example` to `.env.local` if needed. Put a valid **customer console key**
in the ignored `.local/qc.key`. Vite reads the file for each QC request, so replacing
an expired key requires no rebuild. Never put operator/customer passcodes in React
code or `VITE_` variables. The supplied sample passcode returned 401 on 2026-11-17;
the operator credential was not used or stored.

The Vite server proxies `/workspace` to port 8782 and injects a local service
credential. `/qc-api` goes to the configured QC deployment. Keep both servers on
loopback. `vite build` outputs static files only; its development proxies do not
exist in that output. See [deployment handoff](../docs/deployment-handoff.md).

## What works

- Projects navigation with ongoing/completed filters, search, invitations, saved
  guided/written requirements, and explicit completion/reopening. Completion here is
  a workspace status, not a claim that QC ran successfully.
- Dataset overview of real inventory, stored targets and file selection. Free
  configuration, inventory drill-down, Restart to requirements retaining files,
  New Project back to Home, and a downloadable JSON snapshot. Deep QC results and
  priced execution are not yet connected; those states are labeled unavailable.
- Named upload-key listing with expiry/last use and once-only secret display. Existing
  keys are preserved; their unavailable historical creation date is shown as a dash.
- A shared API Keys/Usage screen backed by the local upload-key service and the
  existing organization QC key/usage endpoints, with UTC daily measured-hour bars.

- Project creation without invitations, persisted project selection, and reopening projects.
- Optional project invitations before uploading or later. Tokens are hashed, expire
  after 7 days, and are accepted once. New invitation URLs are returned once.
- Streaming device/API uploads, per-file progress, cancellation, SHA-256 checksums,
  and a project file list. Default limit: 512 MiB per file. Empty files are rejected.
- Expiring project upload keys; only hashes are stored. Keys can upload/list files
  for their project, but cannot create projects, invite users, or access other projects.
- Real S3 ListObjectsV2 access using the supplied bucket URL, AWS region and credentials.
  One page contains at most 1,000 references; the UI supports loading subsequent pages.
  References are deduplicated. Media stays in the bucket; credentials are only in
  the service process, so reconnect after restarting the service. This does not
  enroll a QC worker or prove GetObject access.
- A read-only check of the existing deployment's registered QC storage connections.

SQLite metadata and uploaded bytes live under `.local/`. S3 references are not
downloaded. Uploading does not submit a QC job or consume inference credit. QC must
be given a worker-readable, enrolled storage reference in a subsequent workflow.

## Optional mail delivery

Set these **environment variables in the intake process**, then restart it:
`KANOOK_SMTP_HOST`, `KANOOK_SMTP_PORT` (default 587), `KANOOK_SMTP_FROM`,
`KANOOK_SMTP_USER`, `KANOOK_SMTP_PASSWORD`. SMTP uses STARTTLS. No email was sent
during verification. Without configuration, invitations show **Email not sent**
and offer a copyable link. Copy newly generated links before navigating away.

`KANOOK_PUBLIC_URL` sets the invitation link origin (default `http://localhost:5174`).
Localhost invitations are usable only on the machine running the service; remote
collaboration needs the authenticated deployment described in the handoff.
`KANOOK_MAX_UPLOAD_BYTES` overrides the file limit. `KANOOK_ALLOWED_ORIGINS` is a
comma-separated list of exact local UI origins. `KANOOK_DATA_ROOT` relocates local
data; if changed, update the proxy's service-key path to match before running.

## Verify

```powershell
npm test
npm run test:api
npm run build
npm run lint
```

Backend tests use temporary stores and fake S3/mail transports. Browser verification
used a synthetic local text file and an `example.test` invitation. No production
project, invitation, key, upload, or QC job was created. Live S3 and SMTP require
your bucket/mail configuration and have not been exercised.
