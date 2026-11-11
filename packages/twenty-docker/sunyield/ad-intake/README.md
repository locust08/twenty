# SunYield Meta and Google Ads intake

> Source and tests are included. Configure provider accounts and perform acceptance in your own environment. WhatsApp sending must remain disabled until separately authorized.

These native-form connectors receive leads on the existing CRM host. Website forms need their own integration; ad traffic reaching a website does not reach these endpoints automatically. WhatsApp sending must remain disabled until separately authorized.

| Platform | Endpoint | Authentication |
| --- | --- | --- |
| Meta Instant Forms | `https://crm.example.com/webhooks/sunyield/meta` | GET verification token; POST HMAC-SHA256 using the real Meta App Secret |
| Google Ads lead forms | `https://crm.example.com/webhooks/sunyield/google-ads` | Confidential `google_key` plus configured form ID |

The Meta verification token and Google webhook key are generated privately during preparation. They are different secrets. Generate and retain these values in your approved secret manager, not in source files. No advertising credentials belong in Git.

## Server and worker configuration

Set identical values on the SunYield **server and worker**, in the SunYield Railway environment only. Preserve all existing variables, especially Hermes `HERMES_SENDING_ENABLED=false`. The connector does not use or modify the WhatsApp configuration.

`SUNYIELD_META_LEAD_CONFIG` is a sensitive JSON string. The verification-only prepared value contains the generated `verifyToken`. To enable delivery, retain that token and complete this shape:

```json
{
  "verifyToken": "KEEP_THE_GENERATED_META_VERIFY_TOKEN",
  "appSecret": "ACTUAL_META_APP_SECRET",
  "graphApiVersion": "VERSION_FROM_THE_META_APP_DASHBOARD",
  "pages": [
    {
      "pageId": "ACTUAL_NUMERIC_PAGE_ID",
      "accessToken": "ACTUAL_PAGE_ACCESS_TOKEN",
      "forms": [
        {
          "formId": "ACTUAL_NUMERIC_FORM_ID",
          "fields": {
            "area": "EXACT_META_AREA_QUESTION_NAME",
            "electricityBillResponse": "EXACT_META_BILL_QUESTION_NAME"
          }
        }
      ]
    }
  ]
}
```

The version must have the form `v<number>.<number>` and be supported for the actual App; choose it from that App's dashboard. Each Page has its own authorized access token and explicit forms. The App Secret signs deliveries; the Page access token retrieves answers. The verification token performs only the callback challenge and cannot replace either credential. Configure one Meta App per receiver configuration.

`SUNYIELD_GOOGLE_ADS_LEAD_CONFIG` is also a sensitive JSON string. Retain the generated key and add actual saved form IDs:

```json
{
  "key": "KEEP_THE_GENERATED_GOOGLE_WEBHOOK_KEY",
  "forms": [
    {
      "formId": "ACTUAL_NUMERIC_FORM_ID",
      "fields": {
        "area": "CITY",
        "electricityBillResponse": "EXACT_GOOGLE_BILL_COLUMN_ID"
      }
    }
  ]
}
```

All Page/form identifiers should be quoted strings. Configuration accepts multiple allowed forms and rejects duplicate IDs. Omit `fields` if standard name/phone/city/postcode fields are sufficient; specify custom questions by exact provider identifiers. The `testOnly` setting is supported only for Google; supplying it for a Meta form makes POST configuration invalid. A Google form may optionally use `"testOnly": true`, which rejects every delivery without `is_test:true`; remove this restriction only when that form is ready for real leads. The temporary rollout QA form is removed after testing.

Missing/incomplete credentials or empty allowlists keep POST delivery unavailable with HTTP 503. Unknown Pages/forms and invalid credentials are rejected, never silently classified as trusted intake. The existing ordinary CRM creation policy still holds unexpected Source submissions for admin review.

## Meta account steps

1. Identify the SunYield Facebook Page and each Instant Form. Record their numeric Page/form IDs and the exact custom question names used for area and electricity bill.
2. In the Meta developer App associated with that business, obtain the actual App Secret and a Page access token authorized to retrieve the relevant Page's leads. Configure the complete JSON above on both SunYield services.
3. Ensure the App/user/system user has the required lead-retrieval and Page-subscription access. `leads_retrieval` is needed to retrieve answers; Page subscription normally uses `pages_manage_metadata`. Additional permission/access-level, business-verification or App Review requirements depend on the actual App/account. Confirm them in the App dashboard and grant the CRM App access in the business's Leads Access settings where applicable.
4. In the App's Webhooks configuration, select the **Page** object. Set the callback URL to the Meta endpoint above and the verify token to the generated Meta verification token. Verify and save; the endpoint returns the plain hub challenge.
5. Subscribe the App's Page webhook to **leadgen**, and install/subscribe the App on the actual Page. Configuring the App-level callback alone is insufficient. The Page Graph edge is `/{PAGE_ID}/subscribed_apps` with `subscribed_fields=leadgen`, authorized by the Page token.
6. Use Meta's [Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing/) with that Page and saved form. Create a clearly marked test submission and check delivery status plus the CRM record. Test on a form without an existing test lead; do not delete a real lead to make room for a test.
7. Confirm Source Facebook, Residential/New, one Lead and one linked **Meta Ads submission** note, then automatic assignment to the Active rotation pool. Repeat delivery to verify no duplicate record or note. Leave WhatsApp disabled.

Real Meta delivery remains pending until the App Secret, supported version, Page token, IDs, permissions and subscriptions are configured. The receiver cannot retrieve answers from a signed notification using only the verify token.

References: [Meta-maintained retrieval setup checker](https://github.com/facebookincubator/catalogue-of-api-solutions/blob/main/solutions/leads/leads-retrieval-set-up-checker.md), [lead retrieval guide](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving/), [Graph webhook setup](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/). Meta's developer guides were rate-limited during implementation research; confirm account-specific permission/version requirements in the live dashboard.

## Google Ads account steps

1. Open **Campaigns → Assets → Lead form** in the correct Google Ads account, select the form and record its numeric form ID. Save the form first so tests use its real ID; an unsaved form may use a dummy ID.
2. Add that saved form ID and any exact custom `column_id` mappings to the Google JSON on both SunYield services. Preserve the generated key.
3. Edit the lead form and expand **Export leads from Google Ads → Other data integration options → Webhook integration**.
4. Set **Webhook URL** to the Google endpoint above and **Webhook key** to the generated Google webhook key. No Google Ads API developer token or account password is required by this webhook receiver.
5. Select **Send test data**. A successful queue acceptance returns HTTP 200. Also check the CRM: one **QA GOOGLE ADS TEST** Lead, Source Google Ads, Commercial/New, Pending and unassigned, with a linked **Google Ads submission** note. The green Google status alone does not verify field mapping or worker completion.
6. Check name, raw phone, area, postcode, original bill response and retained answers. Correct mappings, then repeat using the same lead ID to check deduplication. Keep WhatsApp disabled.
7. Save the form configuration. Enable real lead collection only after actual source/team acceptance.

Google does not need an active paid campaign for its configured form's webhook test. Google `is_test:true` creates an explicitly marked QA record; no bill amount or phone number is invented when its sample omits a field.

References: [Google setup](https://support.google.com/google-ads/answer/16729613), [webhook testing](https://developers.google.com/google-ads/webhook/docs/testing), [payload and retry contract](https://developers.google.com/google-ads/webhook/docs/implementation).

## Mapping, retries and provenance

| CRM field | Meta default field name | Google default column_id |
| --- | --- | --- |
| Name | `full_name`, otherwise first/last name | `FULL_NAME`, otherwise FIRST_NAME/LAST_NAME |
| Raw phone | `phone_number` | `PHONE_NUMBER` |
| Area | `city` | `CITY` |
| Postcode | `zip_code` | `POSTAL_CODE` |
| Electricity bill response | Explicit per-form mapping | Explicit per-form mapping |

Fields can override any target in this table using `name`, `rawPhone`, `area`, `postcode` and `electricityBillResponse` keys. The original valid provider Source is set by the connector: Meta is FACEBOOK and Google is GOOGLE_ADS. Posted answer fields cannot select a CRM workspace, lead type, salesperson, assignment state or status. The existing creation boundary derives the lead type.

All selected provider answers, including email and unmapped custom answers, are retained in the linked provenance note. The current Lead object has no email field. Google optional new payload properties are tolerated; only supported metadata and answer fields are retained. Submission identity is namespaced by provider (and Meta Page), hashed into submissionId and mapped to stable record IDs. Retrying never edits an existing/soft-deleted Lead or adds another note.

Authentication and the full Meta batch are validated before queue acceptance. Google numeric identifiers are preserved exactly from the raw JSON. Invalid raw UTF-8 is rejected before decoding. Queue acceptance is bounded to five seconds; timeout or missing persistence returns retryable 503. A timed-out command may complete later, so provider replay still uses the same idempotent identity; each accepted lead is processed asynchronously with eight retries using exponential backoff starting at 30 seconds. Never treat HTTP 200 alone as proof of CRM creation. Inspect the native webhook queue/worker failures and CRM record during acceptance.

Jobs retain normal platform limits: completed jobs for up to 4 hours/1,000 jobs; failed jobs for up to 7 days/1,000 jobs. Review/replay failures before expiry, including expired Page credentials, removed allowlists or unavailable Graph/database connections. Queue retries use current credentials and allowlists. Correct the configuration, then use the provider's supported test/redelivery mechanism; resubmitting the same provider lead ID remains idempotent. Reusing Google test controls may create a new provider lead ID and therefore a separate marked QA Lead.

Lead, note and link commit together in one native workspace transaction. The assignment guard ignores only the deterministic, unchanged, SYSTEM-created Meta provenance note/link during the first Residential assignment. Any edited provenance, added customer note/task or prior assignment retains existing management protections.

Existing CRM creation events are dispatched after commit. The platform logs an after-commit dispatch failure rather than rolling back the committed Lead; duplicate intake does not re-emit creation events. This receiver does not add a transactional event outbox. If a saved Residential lead remains unassigned after a native event failure, review it through existing admin assignment controls; do not manufacture duplicate leads or rewind rotation.
