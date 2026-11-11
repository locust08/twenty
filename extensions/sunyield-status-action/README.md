# Sunyield Status action

This app supplies the fallback Update Status command and restricted Sales role on Sunyield's customized Twenty 2.52 deployment. It uses the transactional `/rest/sunyield/status` server endpoint. Deploy the matching backend before this app. No Organization plan is required for this scoped action.

The native Status editor is the primary SunYield interface. The legacy command remains stored and is suppressed by the SunYield frontend. Keep this extension installed because it supplies the Sales role; removing the duplicate interface does not require uninstalling its role or backend route.

## Admin workflow

Open **Salespeople**, open a salesperson, and select their existing **Workspace member**. Clear that field to revoke their Status access. Map each member to one salesperson only; duplicates deny updates and show a correction message. The four placeholders remain unmapped until real accounts are ready. Active continues to govern lead rotation, not Status authorization.

Sales members can read their assigned SunYield leads and permitted linked activities. Only the uniquely mapped owner can update a lead's Status. Admins manage assignments through the SunYield management controls. Mapping edits do not alter existing lead assignments, Owner or the rotation pool.

## Authorization

The app route forwards with user credentials. Its service role has read access only and cannot write lead fields. The server validates the user/workspace, live membership, unique mapping, lead ownership and displayed version under database locks, then writes Status through Twenty's ORM with normal attribution/events. No application token is exposed to the browser. There are no automatic write retries.

The previous standalone authorization and compare-and-set helpers remain unused by the route; the backend is the sole authorization implementation.

## Build and rollout

Run `npm ci`, `npm test`, `npm run typecheck`, and `npm run build` with Node 24. SDK/client remain pinned to 2.45.0; compatibility is checked against the customized 2.52 server. Authored definitions use named exports; the build script stages the default exports required by Twenty's extractor under ignored `.twenty` output.

Use the explicit `sunyield` CLI remote. Preview with `plan --no-delete`; this rollout updates only the route checksum and removes the old service-role object/audit-field write permissions. Preserve the existing application IDs, Sales role and CRM metadata. Never deploy to Locus-T.

Take a database/files/configuration backup before rollout. Verify native and fallback own/other Status, stale records, mapping removal/restoration and existing-record reconciliation. On rollback, disable the action or retain the new transactional backend; restoring the old privileged writer would restore obsolete hardcoded authorization.
