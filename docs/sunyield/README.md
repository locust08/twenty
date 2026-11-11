# SunYield customizations

This branch publishes the SunYield implementation as one sanitized commit on its original Twenty base. The complete local development history and private production evidence are retained locally. It is not rebased onto the fork's newer main branch.

The implementation includes assigned-lead access controls, admin-managed salesperson mapping, guarded native editing and activity management, source classification, authenticated Meta and Google Ads lead intake, mapping-aware Residential rotation, a Resend email driver, backup operations, a disabled-by-default WhatsApp integration and simplified SunYield navigation.

Source classification maps Meta/Facebook to Residential and Google Ads to Commercial. Unexpected sources remain unassigned for admin review. Residential rotation requires an active salesperson with a valid, unique workspace-member mapping. Existing assignments are preserved. WhatsApp production sending remains a separate, explicitly authorized step.

## Setup and validation

Use the root repository development instructions. See `packages/twenty-docker/sunyield/README.md` for the release overlay, `packages/twenty-docker/sunyield/ad-intake/README.md` for provider configuration, and the Hermes and Operations READMEs for their services. The fallback status extension is under `extensions/sunyield-status-action`.

Workspace, application and schema identifiers embedded in the scoped integration are non-secret deployment metadata; configure the corresponding CRM metadata before deploying elsewhere. Credentials are supplied through environment variables and secret management. Example tokens and contact values in unit tests are synthetic. Configure actual team membership and recipient mappings through the CRM.

The publication excludes production reports/screenshots, customer/QA record exports, backups, runtime state, ad-account credentials, CLI authentication and the private live API test. It retains source, unit tests, dependency locks, upstream licenses and the checksummed Hermes source bundle. Operational view/dashboard configuration remains in the existing CRM database and backups rather than an exported customer dataset.

Do not commit runtime `.env` files, database dumps, lead exports, WhatsApp pairing/session files or local `tmp` evidence. Keep `HERMES_SENDING_ENABLED=false` during setup and validation. Publishing this branch does not redeploy production or change CRM records.

Continue public development from this sanitized branch. Do not merge the private production-history branch into it; that would reintroduce excluded reports and fixtures through commit history.
