# Career Studio Hub

Next.js on Node 22 with Google sign-in, isolated user workspaces, PostgreSQL records and private Vercel Blob resume PDFs. Optional Gmail access is separate from login and requires explicit consent; follow-up messages require review of the saved recipient, subject and body.

Install the committed dependency lock with `npm ci`, then use `npm run dev`, `npm run typecheck`, `npm test` and `npm run build`. The active development session uses port 3100: `npm run dev -- --port 3100`.

See [HUB-DEPLOYMENT.md](HUB-DEPLOYMENT.md) for deployment requirements and public Google verification blockers, and [scripts/HUB-DATABASE-SETUP.md](scripts/HUB-DATABASE-SETUP.md) for schema and migration order. Configure secrets securely on the server. New users have no default resume or shared candidate data.

The original single-user application remains in the separate `career-studio` folder. This Hub uses native Next.js deployment and does not use its Worker, Vite, Wrangler, D1 or R2 configuration.
