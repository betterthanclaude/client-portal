# client-portal

Kanook client portal with a compact brown/cream interface. The current MVP opens
directly into a sample workspace with projects, files, team members, API keys,
usage charts, and illustrative dataset scorecards. It works on Vercel without a backend.

Demo changes persist in this browser under `kanook-mvp-workspace-v1`, separately
from real workspace data. Device intake saves names and sizes only; S3 imports,
invitations, keys, scores, and costs are simulated. Nothing is uploaded, emailed,
or billed. To restore the sample workspace, remove that demo storage entry and
`kanook-demo-project` from the browser's local storage.

Set `VITE_DEMO_MODE=false` and rebuild to use the existing real API integrations.
This is an explicit mode, not a fallback when production services fail.

- [Run the frontend and intake service](server/README.md)
- [Connect to the deployed DATA-INGEST branch](docs/deployment-handoff.md)
- [Implementation decisions](docs-magan/README.md)

The current sign-in UI and local workspace trust are development-only. Production
account integration and durable cloud storage are described in the deployment handoff.

## Deploy the frontend on Vercel

Import this repository with **Root Directory set to the repository root** (leave
the field empty), not `server/`. The checked-in `vercel.json` selects Vite, installs
the lockfile with `npm ci`, runs `npm run build`, and publishes `dist/`. This overrides
FastAPI framework detection. Navigation uses URL hashes, so no SPA catch-all rewrite
is needed.

This deployment serves the frontend. The local Python intake service and Vite's
`/workspace` and `/qc-api` development proxies are not deployed with static files.
When disabling demo mode, connect an authenticated production backend using the
[deployment handoff](docs/deployment-handoff.md) before expecting real uploads,
projects or QC calls to work on the hosted frontend. Do
not add local service keys or QC credentials to `VITE_` environment variables.

## Frontend template

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
