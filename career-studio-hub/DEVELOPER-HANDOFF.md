# Career Studio Hub continuation handoff

Live app: [career-studio-hub.vercel.app](https://career-studio-hub.vercel.app). Last verified READY deployment: `dpl_9MxTnkXYwV1QFyNPs2rc8NUF55ZH`, project `career-studio-hub`. See [HUB-DEPLOYMENT.md](HUB-DEPLOYMENT.md) for the detailed verification record.

## Current working state

- The owner migration completed: **1,598 records and 280 original PDFs** transferred directly between cloud runtimes. The recorded resulting workspace had 278 jobs, 279 resume versions and 279 PDF references; one unreferenced original PDF was retained privately. The master resume, reviews and historical applications are restored. Temporary migration access was removed, the old private source remains frozen, and its hourly collector is paused. Do not rerun initialization/import as a setup step.
- Claude is connected through the Production server Secret and was tested live for writing, separate factual review, exact-version approval and scoring. The approved Rippling test scored **82/100 heuristic ATS alignment**, with Strong evidence readiness and **no interview-probability claim**. This is not an employer ATS result or a guaranteed outcome. OpenAI is unconfigured. The default daily AI allowance is **five budgeted requests per tenant**, resetting at midnight UTC; `AI_DAILY_LIMIT` controls that limit.
- Google OAuth is **In production**, with the last observed unverified-user count **1/100**. The user chose to keep the free Vercel address and deliberately leave public Gmail verification pending; no domain will be purchased. DNS Domain-property ownership remains unresolved, branding is not approved, and the real demonstration video/scope review/assigned security assessment remain pending. URL-prefix HTML-tag proof alone was insufficient. Details: [Google verification notes](scripts/GOOGLE-VERIFICATION.md).
- The owner connected Gmail: 20 message headers and one unsent draft were verified. **No email or employer application was sent.** Gmail send requires review of the exact saved draft. Employer applications use reviewed packets and manual external submission; there is no automatic job-submission bot.
- Managed Vercel Queues completed a saved 37-source discovery run while its initiating tab was closed. Daily maintenance is bounded; source access blocks, partial coverage and retries remain visible. Defaults focus on Seattle/nearby and Washington-eligible remote roles, maximum required experience six years, all seniorities/dates and Amazon excluded.

## Continuing from another account

Source repository: [github.com/bhavithat21/career-studio-hub](https://github.com/bhavithat21/career-studio-hub). The application is in the repository's **`career-studio-hub/` subfolder**. Prior local snapshot: `b8e9f6f`. The GitHub import has separate commit IDs; continue from its `main` branch.

Git carries source and documentation, not cloud permissions or personal workspace access. The new account needs separate authorized access to the existing Vercel team/project, Google Cloud OAuth project, Neon database and other connected services/plugins. Signing into the app with a different Google account creates a separate tenant; it does not inherit the original owner's resumes, Gmail grant or history. Do not remap owner records or add a shared candidate seed.

Credentials remain in server environments. Never commit keys, OAuth tokens, `.env*`, browser state or deployment-tool authentication. Local production-secret export was not approved. Reconnect services or obtain project invitations through their supported access controls; do not export secrets to Git or a laptop to continue work. Keep the existing `BETTER_AUTH_SECRET` stable. Temporary migration flags/tokens must stay disabled.

Every record/PDF operation requires a verified tenant context. AI may edit only enabled Summary, Skills and Responsibilities sections; companies, titles, dates and education remain locked. Preserve factual evidence, immutable versions, candidate approvals and exact application packets. Record external submission history honestly as candidate-reported unless independently verified.

## Local commands

Use Node 22. Clone from a directory of your choice and enter the application subfolder:

```powershell
git clone https://github.com/bhavithat21/career-studio-hub.git career-studio-workspace
Set-Location career-studio-workspace/career-studio-hub
npm ci
npm run typecheck
npm test
npm run dev -- --port 3100
```

`npm run build` builds native Next.js. Leave `HUB_INITIALIZE_DATABASE` absent: the online schema already exists. Link only to the authorized existing project before any future deployment. Storage is PostgreSQL plus private Vercel Blob, not local files or browser storage. See [database setup](scripts/HUB-DATABASE-SETUP.md) and [migration audit](scripts/HUB-LEGACY-MIGRATION.md) for context.

## Reference work not integrated

The recent Dossier reference was reviewed only; none of its features or APIs were integrated. Suggested JSearch and Adzuna integrations require separate provider keys and are not configured. Do not describe them as connected job sources or assume access transfers with this repository.
