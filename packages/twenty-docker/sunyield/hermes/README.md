# Sunyield WhatsApp notifications

A dedicated private Railway service runs the pinned Hermes WhatsApp bridge and an outbound notification worker. No AI model or conversational gateway is used. The bridge remains on loopback; only fixed authenticated control, read-only monitoring and ledger-backup operations are available over Railway private networking.

## Current deployment mode

Production sending is disabled through `HERMES_SENDING_ENABLED=false`. The persistent ledger remains paused and has no activation timestamp. The marketing account is paired for the authorized tests; real salesperson recipients have not been populated. Opening the admin page, pairing a device or adding a number does not enable production delivery. The explicit admin test actions operate separately.

Admins open **Settings → WhatsApp notifications** in Sunyield. The page supports connection status, QR pairing, cancellation, pause, paginated queue review, acknowledged retry and linked-device revocation. Salespeople and other workspaces cannot use these routes. Every request checks live membership and the built-in Admin role server-side. Pairing material is never placed in ordinary logs or backups.

## Admin self-test

With the marketing account paired and connected, an admin can click **Send dummy lead to connected number** in WhatsApp notifications. It sends fixed, clearly labeled synthetic lead details to that connected account itself. No CRM record, salesperson mapping or normal notification job is created. Production sending stays disabled and the persistent pause stays on.

The server validates the actual sender against the number displayed when clicked. It accepts no arbitrary recipient or message. Test attempts are persisted separately with request deduplication and a global one-minute cooldown. A submitted test is not confirmed delivered until a receipt arrives. Uncertain submissions and interrupted attempts never automatically retry and block further self-tests pending operator review. Tests appear separately from the normal lead queue and their ledger is included in the existing SQLite snapshot; device keys remain excluded.

## Single-lead automatic assignment test

An admin can arm a new synthetic lead UUID in Settings → WhatsApp notifications while production sending is disabled and paused. This grants one ten-minute test lease; it does not activate the production observer or populate salesperson recipients. Create the lead only after arming, with that exact UUID, Source Facebook (Meta Ads), Residential/New and the fixed marker fields shown in the panel. The name is `QA ASSIGNMENT NOTIFICATION TEST <UUID>`, Raw phone is `TEST ONLY — no real phone`, Area is `QA test only — no real customer`, and Electricity bill response is `RM 500 (dummy test)`.

The existing workflow assigns the lead in its ordinary rotation. Hermes observes only the armed UUID and sends one clearly labeled notification containing its actual assigned salesperson to the connected marketing account itself. This routing override exists only for validated new synthetic records; production recipient/member guards remain unchanged. It consumes one normal rotation turn and creates one marked QA record. Preserve its audit history; do not rewind rotation state.

Only one lease can be active. Arm requests and lead IDs are deduplicated durably. Cancel, Pause sending and linked-device revocation stop pending and in-flight arming requests. Expiry, sender changes, enabled/unpaused production gates or invalid synthetic fields stop the test before transport. Restarting preserves an unexpired waiting lease; interrupted submission becomes uncertain and never retries automatically. Submission is distinct from receipt and handset confirmation. Test state is stored separately from regular jobs and included in the normal SQLite ledger snapshot.

New CRM leads derive type from Source: Facebook (Meta Ads) is Residential; Google Ads is Commercial. Other or missing sources remain Unknown, unassigned and Needs review. Use the matching ad Source for these marked synthetic tests; Demo Lead no longer qualifies for automatic assignment. Existing test histories are retained.

## Recipient setup

Open **Salespeople** and configure each eligible salesperson’s Workspace member and WhatsApp number. Set Active on and give every active salesperson a unique positive integer Rotation order. Gaps are allowed; inactive people are excluded. New active people join the configured Sunyield rotation without editing its old fixed candidate list. Empty pools or duplicate, missing and invalid orders fail safely before selecting anyone. Use international WhatsApp numbers with an explicit plus country code. Every active member of the ordered pool must have a distinct valid number and a unique active member mapping before activation or Resume. The QA salesperson is inactive and retains its existing account mapping.

The WhatsApp field is nullable and admin-managed through existing Salesperson object permissions. Adding or mapping a number does not change a lead, its owner, its assignment or the rotation pool. Active and Rotation order control future selections in the existing Sunyield Residential rotation step. Existing assignments and already selected in-flight work are not backfilled or rerouted. The native atomic counter is retained; edits change the ordered pool it indexes. Native cache flush/recovery semantics are unchanged, and exact last-person continuity during pool changes is not promised. This integration is scoped to the existing Sunyield step; recreating that step requires retaining its integration.

## Pairing

The marketing-number holder must be available. An admin clicks Begin pairing and the holder scans it from WhatsApp → Linked devices → Link a device. Only the initiating admin can retrieve that pairing session's QR. It expires after two minutes; a new session can then be started. A role change denies subsequent QR retrieval immediately. QR images already disclosed are credentials; cancellation or expiry stops the pending bridge session, so do not copy or share them.

The QR-linked transport is unofficial. Device sessions can disconnect or need re-pairing following WhatsApp changes, and account restrictions are possible. Pairing grants linked-device account access, although this application ignores unrelated inbound messages, disables history/media intake and read receipts, and never launches an AI agent.

The page shows the actual connected sender. Confirm it is the intended marketing number before configuring EXPECTED_SENDER. Device revocation calls the remote logout operation first; if logout cannot be confirmed, it preserves local keys for recovery and reports failure. In that case the holder can revoke the device from the phone's Linked devices screen. Do not confuse local key removal with confirmed remote revocation.

## Activation requires a separate authorized go-live step

Before activation: confirm the sender identity, configure all active real recipients, designate and authorize a synthetic test recipient, and verify the controlled delivery. Keep live intake disconnected during that check if necessary.

Only after authorization configure both `HERMES_SENDING_ENABLED=true` and `HERMES_ACTIVATION_CONFIRMED=true`, with the confirmed E.164 EXPECTED_SENDER. The startup worker still refuses initial activation unless the bridge is connected to that sender and the read-only CRM feed confirms the active ordered recipient pool. It then sets a current activation cutoff and releases the initial pause once. It does not replay pre-activation leads. This code never releases an existing operator pause automatically. An admin can use the guarded Resume control after the required production configuration is already enabled.

Existing leads are not automatically notified. Post-activation leads wait for valid assignment metadata and recipient mapping. One initial notification is created per lead. Changes to Status do not create another notification. Reassignment/recipient changes before send cancel the old pending notification for admin review. The first valid assignment observed is used; polling cannot reconstruct an assignment changed before observation. There is no automatic reassignment notification.

## Single-lead Commercial admin test

In the single-lead test panel, select **Commercial admin alert**, enter a fresh synthetic UUID and click **Arm Commercial admin test**. Create the Source Google Ads, Commercial/New only after arming, with the exact marker fields shown in the panel and no assigned salesperson. The name is `QA COMMERCIAL NOTIFICATION TEST <UUID>`.

This uses the production Commercial eligibility resolver and formatter, sends one clearly labeled test to the connected marketing account, and retains the same ten-minute expiry, cooldown, shared unresolved-test limit and durable submission tracking as the assignment test. An assigned, reclassified, old or non-synthetic lead is rejected. The test does not activate ordinary sending, create normal notification jobs, change rotation or reset activation. Check WhatsApp before any further attempt if delivery is uncertain.

## Pinned upstream build source

`upstream.tar.gz` contains the seven production bridge files from the unchanged commit in `upstream.json`. The build extracts each expected file to stdout and verifies its SHA-256 before writing or installing dependencies. The existing bridge patch and upstream license remain in place. This removes the raw GitHub download dependency after HTTP429 build failures; locked npm dependencies still use the normal installation step. Updating the pin requires regenerating and verifying the bundle against the new manifest.

## Admin Pause and Resume

Pause sending persists the pause and cancels pending synthetic test leases. Resume sending requires an explicit acknowledgment and fresh verification of the deployment flag, existing activation cutoff, active ordered recipient pool and connected configured marketing sender. It cannot enable a disabled Railway flag or create/reset the activation cutoff. The page displays the blocking reason; Resume remains disabled in the current production-off deployment. Successful Resume releases only the pause, preserving submitted, uncertain and other job history. Pause and device changes fence in-flight Resume requests; overlapping device changes are rejected. Invalid pairing cancellation is rejected before changing pause state.

## Delivery and failure handling

The worker observes every feed page, preserving PostgreSQL cursor precision. Notification state is in a persistent SQLite ledger. Sends are serialized with at least two seconds between submissions. Known pre-submission failures retry after 30 seconds, two minutes and ten minutes, then remain held. Missing-recipient holds can become ready after configuration; exhausted transport holds require manual release.

A bridge message ID means submitted, not delivered. Receipts promote it to delivered when available. Timeouts, crashes during submission and otherwise ambiguous outcomes become delivery-unknown and never auto-retry. An admin may explicitly retry after acknowledging possible duplication. Exactly-once delivery is not promised by this transport. Pause is checked again immediately before claiming a send; a message already submitted cannot be recalled.

## Credentials and recovery

Use deployment-specific project, environment, server and worker IDs from your private configuration. Always specify the environment explicitly.

Use separate Railway secrets for the admin control connection, the read-only Twenty feed and backup/monitor access. The fixed feed endpoint is /sunyield-integration/lead-feed with X-Sunyield-Feed-Key, outside Twenty’s user-authenticated REST middleware; it only projects the required Sunyield lead/salesperson fields. Never expose these to the frontend. Linked-device keys are on the private volume and excluded from ordinary CRM/R2 snapshots; device loss requires re-pairing.

The existing Operations service checks Hermes and backs up a consistent SQLite snapshot daily under hermes-ledger/YYYY-MM-DD/ in the private R2 bucket, retaining 30 daily copies. The manifest is published after upload verification. It contains notification state and recipient snapshots, not message bodies or device keys. Disable sending and reconcile potentially sent jobs before restoring an older ledger; uncertain intervals must never automatically replay. CRM database/file backup paths and retention remain separate.

Alerts go to operations@example.com. Unpaired/disconnected setup is expected while disabled. Active disconnection, unknown/failed jobs or work overdue by ten minutes produces an incident. Railway-wide outages may stop the monitor too.

## Build and verification

`npm ci` and `npm test` run the service suite; the loopback HTTP tests need local networking permission. The source provenance manifest pins the upstream commit and hashes. Docker fetches and verifies that source, installs its lockfile and applies a small reviewed patch for inbound privacy, sender identity and fixed remote logout. Run container acceptance without network access before deployment, then verify live admin/sales/anonymous route boundaries, disabled/unpaired status, ledger backup and preserved CRM/Locus-T baselines. Never click Begin pairing or send a real test as part of a routine automated verification.
