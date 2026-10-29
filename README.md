# Career Studio workspace

The active application is [Career Studio Hub](https://career-studio-hub.vercel.app), deployed on Vercel. Start with [the developer handoff](career-studio-hub/DEVELOPER-HANDOFF.md), then [the deployment record](career-studio-hub/HUB-DEPLOYMENT.md).

## Continue from another account

Source repository: [bhavithat21/career-studio-hub](https://github.com/bhavithat21/career-studio-hub). Application source lives in the **`career-studio-hub/` subfolder**, alongside this root README.

Clone the repository and enter the application folder:

```powershell
git clone https://github.com/bhavithat21/career-studio-hub.git career-studio-workspace
Set-Location career-studio-workspace/career-studio-hub
npm ci
npm run typecheck
npm test
npm run dev -- --port 3100
```

Development authentication and cloud features require separately provisioned server environment variables. Git does not contain production secrets, local CLI authentication, private resumes, mailbox data, screenshots, or migration exports. Existing production data remains in Neon PostgreSQL and private Vercel Blob storage. Signing in to the app with a different Google account creates a separate workspace; it does not transfer the current owner's records.

Vercel, Google Cloud, and other provider permissions do not move with a Git commit or a different coding-assistant account. Continue using the existing project with appropriately authorized provider access; do not create replacement databases, rotate working credentials, or rerun the completed migration by default. Google public Gmail verification is intentionally pending: the owner chose to keep the free Vercel address.

The prior local source snapshot is `b8e9f6f`. The GitHub import retains the repository's initial commit and has separate commit IDs from that local snapshot; use GitHub's `main` branch to continue. Public source can be cloned without inheriting repository write permissions or any cloud-service access.

## Legacy application

The sibling `career-studio` directory is a separate Git repository for the original Sites application. Its latest saved source commit is `648ca5f592c51ead7f0580c2167723e4a4c1afe2`. It is intentionally excluded from this repository to avoid an unusable nested Git link. Its cloud data was migrated to the Hub, its discovery schedule is paused, and its temporary migration credentials are disabled. Preserve it as a rollback reference, not as a second active production pipeline.

Local `output/` and `tmp/` directories are excluded because they contain private working artifacts. Portable source backups, if generated, also live in `output/` and are not recursively committed.
