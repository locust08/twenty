# Sunyield release overlay

Build twenty-front from this branch after building its shared, SDK, UI and renderer dependencies. Create a release context containing this Dockerfile, railway.json, the compiled twenty-server dist directory named server, and the compiled twenty-front build directory named build. Twenty serves these assets from /app/packages/twenty-server/dist/front. Verify the live index asset hash matches the built index.html after deployment.

For the worker, use worker.Dockerfile as Dockerfile and worker.railway.json as railway.json in a separate context. Include the compiled server directory in that context. No frontend assets are required there.

Compile the server with `npx nest build --path ./tsconfig.build.json` from twenty-server, then copy twenty-client-sdk's package.json and dist into dist/assets/twenty-client-sdk as specified by the server build target. Do not substitute a bare SWC invocation: Nest supplies the CommonJS, decorator metadata and path-alias settings required at runtime. Before upload, require the compiled Sunyield service in the production image with reflect-metadata loaded to catch module-format or alias failures.

Use deployment-specific project, environment, server and worker IDs from your private configuration. Always specify the environment explicitly.

Use railway up with --path-as-root and explicit -p, -e and -s. Retain existing service variables, storage and database. Before a backend version change, rehearse migrations on a restored backup, take a quiet-state backup, and verify migration logs rather than relying only on health. Do not downgrade a migrated database by changing only the image.

Admins manage mappings through Salespeople → Workspace member. The transactional server endpoint reads that saved relation on each Status write; no code changes are needed for new sales members. Deploy the matching fallback application, which delegates as the user and has no privileged writer role. Test own/other lead access and mapping revocation before enabling real accounts.

New Residential rotation requires Active=true plus a valid, unique Workspace member mapping to a current Sunyield workspace account. Unmapped, deleted or duplicate mappings are excluded before Rotation order validation and counter advancement. Eligible members need distinct positive integer orders. If nobody qualifies, the new lead stays unassigned/Pending and its workflow fails with an explicit mapping diagnostic; fix the mapping and handle the pending lead through admin management. Existing assignments are preserved, and fixing a mapping does not automatically retry failed workflow runs. Inactive mapped salespeople retain access to their existing leads.

WhatsApp readiness remains independently conservative: every active recipient must have a valid mapping, order and distinct valid phone number before sending could be resumed. This safeguard does not enable sending or change that readiness policy.

See [operations/README.md](operations/README.md) for email, backup, monitoring and restore operations.

Before a production frontend build, run Lingui extraction and compilation in twenty-front (`npx lingui extract`, then `npx lingui compile`) so new labels and English fallbacks are included. Do not commit regenerated translation catalogs with feature changes; the i18n pipeline maintains them. A direct Vite-only build can otherwise display message IDs.

## Operational feature cleanup

SunYield navigation focuses on Leads, Tasks, Salespeople, Dashboards and Workflows. Optional AI/chat, mailbox/calendar settings and composing commands are hidden in this workspace without changing roles or other workspaces. Native Status editing remains available; the legacy command stays suppressed while its extension and Sales role are retained. WhatsApp operator tests are under a collapsed Operator tests disclosure; opening it performs no send. Pairing, pause, queue review and audit remain available to authorized admins, with production sending still disabled.

Existing explicitly labelled QA/demo leads, linked test follow-ups and inactive test salespeople are retained in native QA archive views. Operational views and dashboard widgets exclude the reviewed record IDs, preserving previous filters and ownership restrictions. New records are included normally; new QA fixtures require explicit archive review. Archive filters are presentation configuration, not authorization. Public workspace invitation links are disabled; admin email invitations and Resend account mail remain available. Monitoring and backup emails remain disabled while scheduled backups and restore verification continue.

The unused PostgreSQL 18 deployment was stopped after a private read-only inspection found no user tables or other clients. Its service, volume and settings remain retained. The CRM and Operations continue using Postgres-7Wdn; Redis, the worker, Hermes and Operations are unchanged.
