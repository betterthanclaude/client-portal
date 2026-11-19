# Kanook decisions

- 2026-11-19: User clarified the release target is the existing frontend host: `betterthanclaude/client-portal` on `main` for Vercel, rather than the backend's `kanook-0` branch. Prepared the current UI and regional API client changes for that branch; 22 frontend and ten local regional tests plus the production build passed. The backend release remains separate.

- 2026-11-19: Connected the regional session/API clients and prepared backend migration 16 plus project dispatch, settings, key management, generated docs and grievance support. Restored a minimal brown/beige design, local Instrument Serif and Manrope, smooth `k.` sidebar collapse and readable white/beige sidebar footer. Frontend tests/build and focused regional integration tests passed; production deployment remains pending. [Decision record](2026-11-19-kanook-portal-integration.md), [release handoff](../docs/BACKEND-CONNECTION.md).

- 2026-11-17: Added the requested interactive MVP sample workspace, darker espresso palette, more whitespace, and home typography increased by 2px. Restored left alignment for the welcome heading/subtitle at the user's follow-up request. [Decision record](2026-11-17-kanook-mvp-demo.md).

- 2026-11-17: Fixed Vercel's FastAPI misdetection by declaring the Vite framework, lockfile install, frontend build and `dist` output in `vercel.json`. The existing Vercel project also had Root Directory set to `server`, causing a missing-output error even after Vite built successfully; cleared that setting and changed its framework preset to Vite. Verified settings persisted after reload and the local production build passed. Python intake and development proxies still require a separate authenticated production backend.

- 2026-11-17: Prepared the client portal for the user-requested GitHub repository `betterthanclaude/client-portal` on `main`; excluded local credentials, uploaded data, environments, dependencies and build artifacts from source control.

- 2026-11-17: Connected Projects, requirements, dataset overview and API Keys/Usage with consistent compact styling, persistent local settings, truthful unmeasured/billing states and tested navigation. [Decision record](2026-11-17-kanook-projects-api-overview.md).

- 2026-11-17: Added persistent home-page project intake with optional invitations, device uploads, S3 reference indexing and project upload keys; configured the deployed QC proxy and documented the production account/storage integration. [Decision record](2026-11-17-kanook-home-intake.md).

- 2026-11-17: Made the sidebar explicitly collapsible (224px expanded, 64px icon rail; compact disclosure on mobile). Reduced home typography, card width, controls, and spacing; made secondary actions quieter and show the project-created label only after creation. Kept the requested dark brown sidebar and cream palette.
- 2026-11-17: Darkened the sidebar to #3b240f at the user's request; retained the first reference's #533416 buttons and cream main canvas.
- 2026-11-17: Corrected the home page reference interpretation: use the first screenshot's brown/cream palette, welcome heading, rounded form, spacing, and button copy. Use the second screenshot only for Kanook branding, navigation labels, and John Smith / Acme Corporation account content in the sidebar. Removed the conflicting monochrome layout rules.
