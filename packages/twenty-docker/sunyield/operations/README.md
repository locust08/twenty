# Sunyield operations

This Railway service provides database and uploaded-file backups to the private `YOUR_BACKUP_BUCKET` R2 bucket, plus incident/recovery email to `operations@example.com`. It does not modify CRM records. Only the Sunyield environment is deployed.

## Schedule and retention

- Database slots: 02:00, 08:00, 14:00 and 20:00 Malaysia time (UTC+8), every six hours.
- Uploaded-file slot: 02:00 Malaysia time daily.
- The scheduler checks due slots every 15 minutes. Actual start can be up to 15 minutes after a boundary; startup catches up the current slot, not every missed slot.
- Keep all verified snapshots for 30 days, plus the first retained snapshot from each of the last three available completed calendar months. Always keep the latest verified snapshot. Monthly history accumulates over time.
- Each database dump is restored into a new temporary PostgreSQL 16 cluster before publication. Uploaded objects are downloaded again and SHA-256 checked. A complete manifest is published last.
- Monthly verification downloads and restores the latest database snapshot and verifies every object in the latest files snapshot. The isolated cluster has no TCP listener and cannot target production.
- Retention only deletes objects in this backup bucket. Failed current snapshots are cleaned up; orphaned partial snapshots older than 24 hours are cleaned on a successful backup cycle.

## Monitoring

Checks run approximately every 60–90 seconds: CRM HTTP health, PostgreSQL, Redis, a real worker queue probe, R2 connectivity, database backup age (seven hours) and files backup age (26 hours). Backup/restore failures also generate incident transitions. Alerts and recoveries are deduplicated with state mirrored in R2 and Redis. Monitoring runs independently of backup processing.

Set `MONITORING_ENABLED=false` to disable the recurring monitoring checks and their incident/recovery alerts while retaining scheduled backups, restore verification and backup/restore failure alerts. Monitoring defaults to enabled when this variable is absent. `/healthz` exposes this flag and remains available for Railway deployment health when monitoring is disabled.

Set `BACKUP_ALERTS_ENABLED=false` to suppress database, file, WhatsApp-ledger and restore-verification incident/recovery emails. Backups, verification, retention, logs and incident-state persistence continue. This flag defaults to enabled and does not affect CRM account email. Both flags are currently disabled for Sunyield at the user's request.

`/healthz` reports whether this monitor is running and can persist alert state. Railway uses it for deployment health. No public domain is needed. Do not assume a runtime health failure automatically restarts the service: Railway's configured restart policy applies to process exits.

This monitor shares Railway with the CRM. A Railway-wide outage or suspension can stop both the CRM and the monitor, preventing an email alert. Resend failure can also prevent delivery. This is the accepted tradeoff of Railway-only monitoring; no external heartbeat provider is configured.

## Credentials and deployment

Use deployment-specific project, environment and service IDs from your private configuration. Always specify the environment explicitly and preserve other environments.

Limit the Resend key to your verified sending domain. The R2 key has object read/write access only to `YOUR_BACKUP_BUCKET`; it cannot administer buckets. It is a user-owned Cloudflare token because account-token creation requires an unavailable Super Administrator permission. Removing that user's access can invalidate backups; rotate to a suitable service/account token before removing the user.

Secrets are Railway environment variables, never source files. Required variables are validated in `src/main.mjs`. The source database/storage credentials are specific to Sunyield. `OPERATIONS_ENABLED=true` enables recurring work. `OPERATIONS_ACCEPTANCE=false` is the normal production setting; the acceptance mode is a one-time setup check and sends labelled test emails.

The server and worker both require the matching compiled backend overlay. Configure `EMAIL_DRIVER=RESEND`, sensitive `EMAIL_RESEND_API_KEY`, `EMAIL_FROM_ADDRESS=crm@example.com`, and `EMAIL_FROM_NAME=Sunyield CRM` on both. The HTTPS driver avoids SMTP port restrictions. This enables system email; it does not connect users' Google mailboxes or calendars.

Deploy this directory as the build root using its Dockerfile and railway.json. Keep one replica. Pin dependencies through package-lock.json. Run `npm ci` and `npm test` before deployment.

## Restore procedure

1. Pause imports and other writes only when planning an actual cutover. A verification restore needs no production changes.
2. Select verified `snapshots/database/<id>/manifest.json` and the appropriate `snapshots/files/<id>/manifest.json`. Database and files are separate schedules, not an atomic application-wide snapshot.
3. Download the listed objects through the scoped R2 credentials and validate sizes and SHA-256 values against the manifests. Never treat an object without a successful manifest as a backup.
4. Use `restoreDatabase` from `src/database.mjs` to validate the dump in isolation, or restore to a newly provisioned PostgreSQL 16 database with `pg_restore --exit-on-error --no-owner --no-acl`. Do not point restore tools at an existing production database.
5. Restore file objects to a new private bucket using each manifest item's original `sourceKey`. Provision a separate Twenty environment using the matching server/worker release, storage and required secrets. Keep workers and outbound email disabled during recovery validation.
6. Verify login, counts, attachments, mappings, ownership rules and lead rotation. Switch traffic only after a reviewed cutover and keep the previous environment intact for rollback.

Database dumps contain sensitive CRM and authentication data; restrict backup access accordingly. R2 encryption at rest and TLS protect storage and transfer; separate client-side encryption is not configured. Railway configuration/secrets and Redis queue contents are not included in the database dump. Preserve deployment configuration separately in an approved secret-management process.

The current single-object upload limit is 5 GB, and commands have a five-minute timeout. Revisit multipart uploads, timeouts and capacity before the CRM grows beyond these limits. File backups provide a daily recovery point; database recovery points are six-hourly. Healthy jobs do not send routine emails.
