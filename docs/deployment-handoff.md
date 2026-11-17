# Connect this UI to the deployed branch

The live deployment at `https://kanook.oru-el.com` is reachable. The supplied
sample credential returns `401 authentication_required` from both `/v1/me` and
`/account/v1/login` (checked 2026-11-17). Refresh the customer credential first.
An operator key belongs to `/operator/v1/*`; it is not a customer API key.

## Existing integration points

The deployed account/operator implementation is present under
`D:/DATA-INGEST/.kanook-0/oruel/service/`. The parent checkout was on `api-final`
at `fe2b0c6`, which does not contain the same regional implementation. Make the
change on the branch used by the deployment; do not assume the parent checkout
is that branch.

| File in deployment source | Responsibility |
| --- | --- |
| `oruel/service/regional_api.py` | Registers regional account, customer and operator routes |
| `oruel/service/account_auth_routes.py` | Customer passcode/Google sign-in and session cookies |
| `oruel/service/account_boundary.py` | Authenticates requests, enforces session CSRF and permissions |
| `oruel/service/account_permissions.py` | Explicit allowlist of methods, paths and permissions |
| `oruel/service/account_routes.py` | Existing organization invitations/team and scoped QC API keys |
| `deploy/gcp/customer_edge.tf` | Same-domain HTTPS edge in front of the regional API |

The existing API has **organization** invitations and QC keys. It does not expose
project workspaces, media uploads, or arbitrary S3 bucket registration. A QC key
submits dataset references; the new local `knk_` key uploads project files.

## Add the intake route contract

The local implementation in `server/app.py` and `server/store.py` is the behavioral
reference. Port these handlers behind the deployed account boundary; do not expose
their local `X-Kanook-Service` trust mechanism on the internet.

| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST | `/workspace/projects` | List / create a project |
| GET | `/workspace/projects/{id}` | Load project, invitations and files |
| PATCH | `/workspace/projects/{id}` | Save status, requirements or free configuration |
| POST | `/workspace/projects/{id}/invitations` | Optional project invitation |
| POST | `/workspace/invitations/accept` | Accept an invitation |
| GET / POST | `/workspace/projects/{id}/files` | List files / stream one file's bytes, `?filename=...` |
| POST | `/workspace/projects/{id}/s3` | Check S3 access and index the first page |
| POST | `/workspace/projects/{id}/s3/{connection}/index` | Index the next page |
| POST | `/workspace/projects/{id}/api-keys` | Issue a project upload key |
| GET | `/workspace/projects/{id}/api-keys` | List names, IDs, expiry and last use; never secrets |

1. Add an intake route module and register it from `regional_api.py`. Extend
   `AccountBoundary`'s protected prefixes **and** `account_permissions.py`; adding
   paths to the allowlist alone will not authenticate `/workspace` requests.
   Apply the existing cookie, CSRF, rate-limit and audit behavior to every management
   route. Authorize file keys separately, with project scope and expiry.
2. Add Postgres migrations for tenant-owned projects, project memberships/invitations,
   file references and hashed upload keys. Resolve organization/member identity from
   the authenticated principal; check project membership on every operation.
   Reuse the existing account team for identity. A project invitation must not
   silently grant organization-wide access.
3. Store uploaded media in durable object storage, using project/tenant-separated
   object keys. Cloud Run's local filesystem and the local SQLite store are not the
   production persistence layer ([Cloud Run runtime contract](https://docs.cloud.google.com/run/docs/container-contract#file_system)). For large videos, use a signed/resumable direct
   upload flow with a completion endpoint that verifies the stored object; adapt
   `src/lib/workspace-api.ts` for that contract. Do not send large media through the
   QC API's metadata request-size limit.
4. Give QC workers read access to the selected storage location, enroll the storage
   connection, and generate supported dataset references before submitting QC jobs.
   A successful upload or S3 listing alone does not make files available to a worker.
5. Use Secret Manager and a least-privilege runtime service account for mail and
   storage integration secrets. Prefer short-lived/delegated S3 credentials; the
   local in-memory credential session is not shared across Cloud Run instances.
   Configure the mail sender and the public invitation origin.

## Serve the UI on the same origin

Keep `/v1/*`, `/account/v1/*`, `/operator/*`, and `/workspace/*` as API routes.
Serve the React build at `/app/` to preserve the existing `/console` and `/operator`
pages. Build with `npm run build -- --base=/app/`, include `dist/` in the deployment
image, and mount it at `/app` using FastAPI `StaticFiles(directory=..., html=True)`
([FastAPI static-file documentation](https://fastapi.tiangolo.com/reference/staticfiles/)).
Set invitation URLs to `https://kanook.oru-el.com/app/`.

Replace the frontend's demo sign-in callbacks with the existing `/account/v1/login`
or configured Google flow. Use the returned HttpOnly session, get the CSRF token
from `/account/v1/session`, and send `X-CSRF-Token` on mutations. Do not ship a shared
operator/customer passcode in the browser. In production, send QC calls to `/v1/*`
using that user's session (the current `/qc-api` prefix is a local Vite proxy).

Same-origin deployment needs no cross-origin exception. If the UI intentionally
uses another hostname, configure explicit credentialed origins and review the
existing strict cookies/origin checks; a wildcard CORS header is insufficient.

## Release checks

Verify in staging: solo project creation, invite-later, member acceptance, device
upload with matching checksum, S3 pagination, project-scoped API uploads, invalid
and expired keys, unauthorized cross-project access, refresh/restart persistence,
and truthful email failures. Confirm no operator/sample credentials occur in
`dist/`. Then deploy the tested image/branch through the existing release pipeline.

No production infrastructure, branch or deployment was modified during this task.

## Follow-up contract for analysis and billing

The UI now has Projects, guided/written requirements, Overview/Configure, Restart,
API Keys and Usage. The overview currently reports actual inventory and saved
requirements/selection, not a completed analysis. Configuration is saved with no
QC/billing request. Restart returns to requirements while retaining existing files.
The final paid submission still needs an enrolled dataset reference and validated
specification, with the resulting job/report bound to the local project ID.

Expose a project-scoped published analysis containing dataset/selection scores,
measured durations, per-section/subsection/check results, requirement targets, and
actionable gaps grounded in that report. Map visual-weight/label-balance form values
to the appropriate supported engine contract; do not forward these UI draft fields
as a QC specification blindly. Keep free configuration separate from paid execution.

`/v1/usage/runs` supplies organization-wide measured input hours, run kind and paginated
history. It explicitly has no prices. The new UI reads it and `/v1/api-keys`; add a
priced USD timeline/quote contract before enabling spend charts or paid reruns. Distinguish
job measurement time/creation time and distinguish quoted, reserved and settled spend.
Do not attribute all organization usage to whichever local project is selected.
