# Career Studio Hub — Google OAuth verification preparation

Updated October 28, 2026. This records observed configuration and remaining work; it does not claim branding/scope review submission or approval.

## Application identity

- App name: **Career Studio Hub**
- Google Cloud project ID: `career-studio-hub`
- OAuth web client: **CareerStudioHubWeb**; public client ID: `592778390845-cbr8jhvovvcjtfkah4doa8h7lij9frei.apps.googleusercontent.com`
- Public production origin/homepage: https://career-studio-hub.vercel.app
- OAuth redirect URI: https://career-studio-hub.vercel.app/api/auth/callback/google
- Privacy policy: https://career-studio-hub.vercel.app/privacy
- Terms: https://career-studio-hub.vercel.app/terms
- Approved support/developer contact: bhavitha0621@gmail.com
- Vercel destination: `prj_M6nlI9M1e8ymlaT0wnpREjUEVokS`, team `team_ZgJ4fGY86KMJtQh8UV5Z9vCM`.

Do not include OAuth client secrets, access tokens, refresh tokens, or production environment values in this document, a video, or a verification response.

## Current status and remaining work

The public homepage and deployed privacy/terms pages identify the support/deletion contact, precise Google identity and Gmail fields, recipient and hosting-provider sharing, retention, disconnection, revocation, and Limited Use. These policy revisions are already deployed.

Google Search Console confirmed ownership of the URL-prefix property `https://career-studio-hub.vercel.app/` using the deployed public HTML meta tag on October 28, 2026. That result remains valid, but the subsequent Branding **Verify** attempt was rejected for homepage ownership. Google's current remediation requires a DNS-verified **Domain property**, verified by an account that is a **Project Owner** of this Google Cloud project; the URL-prefix HTML-tag proof does not satisfy that requirement. Keep the existing tag deployed, but do not treat it as completed OAuth domain verification. [Google domain-verification remediation](https://support.google.com/cloud/answer/13804266?hl=en).

The user explicitly approved **Push to production**, the operator clicked **Confirm**, and Google Auth Platform now shows **In production**, with **1 / 100** unverified users. This completed audience-publication action is separate from brand and sensitive/restricted-scope verification. No further production-confirmation dialog is pending.

**Blocked:** Branding has not been submitted for human review, approved or published. Its ownership check instructs the operator to verify ownership and then wait 24 hours. Correct DNS Domain-property verification must come first; waiting alone will not repair the rejected URL-prefix-only proof. Data Access **Prepare** is disabled until the branding prerequisite is resolved.

**Not completed:** correct DNS Domain-property verification; a real demonstration video and reviewer-accessible URL; brand/scope review submission and approval; a Google-assigned security assessment and any required Letter of Validation. Do not use a placeholder video URL. Production publication, Google API policy acceptance and Cloud terms acceptance do not satisfy these requirements.

**User decision:** keep the free `career-studio-hub.vercel.app` address and leave verification pending. **No domain will be bought.** The Vercel team has zero owned domains, and the checked Cloudflare Domain overview shows **No data available**; no existing controlled domain was found. The October 28 quote for `careerstudiohub.com` was **USD 11.25 base for one year**, auto-renew off, tax/fees extra, but it was not approved or purchased. Purchase approval and registrant details are no longer being pursued. OAuth remains In production; branding and public Gmail review remain pending because the required DNS ownership proof is unresolved.

## Scopes and submission text

Basic Google sign-in requests `openid`, `email`, and `profile` to create an account and private workspace. It does not connect Gmail. The optional Gmail connection separately requests both scopes below.

### `https://www.googleapis.com/auth/gmail.readonly` — restricted

Career Studio Hub optionally searches the signed-in user's mailbox for recent application-related subjects using `users.messages.list` with the `q` parameter. It retrieves selected message headers and identifiers to display application conversations and prepare replies. It does not import received message bodies or attachments. The narrower `gmail.metadata` scope cannot use the `q` search parameter, so it cannot support this targeted search. No mailbox modification permission is requested.

Current implementation searches the last 90 days, excluding spam/trash, and stores sender, reply-to, subject, dates, message/thread IDs and reply references. It retains at most 200 imported message records after each completed sync. The search window is not a 90-day deletion policy. Imported data is not sent to resume AI providers or used for general-purpose model training.

### `https://www.googleapis.com/auth/gmail.send` — sensitive

Career Studio Hub sends an application follow-up through `users.messages.send` only after the user reviews and explicitly confirms the exact saved recipient, subject and message. Drafts are stored within the app; it does not require Gmail draft-management, mailbox-modification, or deletion permissions. Automatic background sending is disabled. The recipient receives only the message the user approves.

## Demonstration outline — recording still required

Use the deployed app, English consent-screen language, and controlled test accounts/data. Show the browser address and the real app name. Never show secrets or unrelated personal mail.

1. Open the public homepage and show privacy/terms links and support contact.
2. Sign in with Google and show the separate private workspace.
3. Open Connected accounts, show the Gmail data-use disclosure, explicitly opt in, and show the complete Google consent flow with both actual requested scopes.
4. Sync test application-related messages. Show the metadata-only list and a selected conversation; explain that received bodies and attachments are not imported.
5. Create/edit a follow-up. Show the saved recipient, subject and body, then the explicit review confirmation. Demonstrate sending to a controlled recipient and the resulting status. Sending is a real external action and must be authorized for the test recipient.
6. Disconnect Gmail and show cleared app copies/drafts and the Google connections revocation fallback when applicable.

Host an actual reviewer-accessible recording and enter its real URL in the Google verification submission. No recording has been generated by this preparation work.

## Submission and assessment

Verification remains pending under the user's decision to keep the free address. If the user later resumes it, confirm the project/client, redirect URI, app identity, contacts and deployed policies, then have the GCP Project Owner verify an authorized DNS Domain property with Google's TXT record. Resolve the ownership finding before the stated 24-hour wait and branding retry. Once Google enables Data Access **Prepare**, provide the real video and scope justifications and submit review. The existing **In production** audience status does not bypass these gates; no domain acquisition or review submission is currently being pursued.

Gmail read access is restricted even when this app retrieves only metadata. Because restricted-scope data is transmitted through and stored on app servers, the security assessment requirement applies. Google initiates the assessment stage after other review requirements; follow its assigned CASA process and annual revalidation requirements. No assessment was purchased, completed or approved here. If a required assessor/service introduces a fee, obtain approval for that concrete charge first.

Maintain a working account-deletion procedure covering account/database records and private resume files; the published policy provides a manual request channel. Keep the verification tag and policy links live. Changes to scopes or data use may require review again.

## Official references

- [Google verification requirements](https://support.google.com/cloud/answer/13464321?hl=en)
- [Submitting an app for verification](https://support.google.com/cloud/answer/13461325?hl=en)
- [Gmail scope classifications](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [messages.list: q is unavailable with gmail.metadata](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
- [Search Console ownership verification](https://support.google.com/webmasters/answer/9008080?hl=en)
- [OAuth domain remediation: Project Owner and DNS Domain property](https://support.google.com/cloud/answer/13804266?hl=en)
- [Restricted-scope security assessment](https://support.google.com/cloud/answer/13465431?hl=en)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)



## Live ownership result — October 28, 2026
Google Search Console's HTML-tag URL-prefix verification remains confirmed. OAuth audience publication is now **In production** after explicit user approval, with **1 / 100** unverified users. Branding's homepage-ownership check rejected the current proof; correct DNS Domain-property verification by the GCP Project Owner is still required before the stated 24-hour wait and retry. Branding has not been submitted for human review, approved or published; Data Access **Prepare** remains disabled. Public Gmail verification and the real video/security-assessment work remain pending.

## Suggested scene narration and evidence

The timings below are an outline, not recorded footage. Record the actual interface and observed results; do not narrate a successful action if it fails.

| Scene | Show on screen | Suggested narration |
| --- | --- | --- |
| 1 — Purpose | Live homepage, origin, policy links | “Career Studio Hub organizes job discovery, resumes and application follow-ups. These are our public privacy and support details.” |
| 2 — Basic login | Google sign-in and returned workspace | “Basic sign-in creates my workspace. It does not connect my mailbox.” |
| 3 — Optional permission | Connected accounts disclosure and complete English Google consent | “I separately choose Gmail read and send permissions. Read access supports targeted application-message searches; send access supports a follow-up I review.” |
| 4 — Read feature | Real sync and controlled message headers | “The app searches recent application subjects and imports headers and identifiers. Received bodies and attachments are not imported. Matches need my review.” |
| 5 — Send feature | Edit/save draft; review recipient, subject, body; explicit Send; actual result | “This exact saved draft is sent only after I approve it. The app does not automatically send follow-ups.” |
| 6 — Disconnect | Disconnect action and resulting empty app copies/disconnected state | “Disconnect clears stored Gmail credentials, imported headers, drafts and delivery records. It attempts Google revocation; Google Account connections is the fallback if revocation cannot be confirmed.” |

Pause credential entry without skipping the required consent screens. If recording from a previously connected account, do not represent an already-granted shortcut as the complete grant flow. Obtain consent for any real mailbox change or test email required by the demonstration.

## Security and data facts for reviewer questions

- OAuth access/refresh credentials are stored server-side with Better Auth token encryption enabled. No claim of an external audit, certification, or completed CASA is made.
- API routes require a signed-in tenant and enforce account ownership. Optional Gmail linking is restricted to the same Google account.
- Vercel hosts the app and private resume files; Neon PostgreSQL stores account/workspace data and encrypted OAuth credentials. Gmail copies are separate from resume AI requests.
- Sync requests fetch at most 20 messages per step, with a one-minute cooldown, and retain at most 200 imported records after a completed sync. The UI may show a smaller subset.
- Follow-up approval binds the exact saved recipient, subject and body. Changed drafts require review again. Uncertain send results are not blindly retried.
- Disconnect deletes app-side Gmail records and attempts token revocation. Revoking at Google alone does not delete app copies; delivered emails remain with recipients.
- Account deletion is currently requested through the published support email. Do not present a self-service account-deletion UI that does not exist.

## Recording capability check

No dedicated screen/video recording API was exposed in the discovered tool catalog, and no existing local recording script was found in this project's scripts/package configuration. The available remote browser automation service is not a recorder of this local authenticated Chrome session and must not be substituted for it. No recording was started or created.

An honest practical option is Windows Snipping Tool's native video capture, operated by the user or through the approved native CUA interface while all browser interactions remain in CUA. Microsoft documents Record → New (or Windows+Shift+R), selecting the visible browser region, Start and Stop. Availability on this machine has not been verified; inspect the actual native UI before proceeding. Include the browser address bar and consent windows, avoid unrelated applications/notifications, save the real resulting video, then review it before sharing a reviewer-accessible URL. Do not synthesize a video from mock screens or claim that screenshots prove the full flow.

[Microsoft Snipping Tool recording instructions](https://support.microsoft.com/en-us/windows/apps/use-snipping-tool-to-capture-screenshots)
