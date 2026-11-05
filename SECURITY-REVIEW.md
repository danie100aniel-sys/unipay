# Deployment Security Review

Review date: 2026-11-04

## Findings

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🔴 CRITICAL | — | — | No critical findings reported | — |
| 2 | 🟠 HIGH | src/routes/auth.js | 300-318 | Unauthenticated admin account creation, including arbitrary role elevation | 10/10 |
| 3 | 🟠 HIGH | src/routes/auth.js | 36-108 | Passkey registration can target another operator and replace/add credentials | 9/10 |
| 4 | 🟡 MEDIUM | src/routes/auth.js | 237 | Password login has no server-side throttling or lockout | 9/10 |
| 5 | 🟡 MEDIUM | src/routes/admin.js, src/workers/callbackWorker.js | 244-270, 23 | Authenticated merchant setup accepts callback URLs; callback delivery may enable SSRF | 9/10 |

Severity-level notes: the HIGH findings should block deployment. The no critical finding row is added to show the requested review format; it is not a vulnerability.

## Recommended fixes

1. Remove public admin creation or require an existing authenticated superadmin. Never accept a privileged role from the request body.
2. Bind passkey challenge and verification exclusively to the authenticated administrator; prohibit registration for another account unless separately authorized and re-authenticated.
3. Add account-level throttling, lockout, rate limiting, and security event alerts for password login.
4. Restrict callback URLs to public destinations, validate DNS results against private and reserved ranges, and revalidate redirect targets.

## Remediation status

- ✅ Admin account creation now requires a valid superadmin session and forces the `admin` role.
- ✅ Passkey registration is bound to the authenticated administrator.
- ✅ Password login now applies an in-memory 10-attempt per 15-minute throttle.
- ✅ Merchant callback creation is restricted to superadmins and rejects non-public callback destinations.
- ✅ Callback delivery revalidates destinations, disables redirects, and has a fixed retry update bug.
- ✅ Admin root and login routes both return HTTP 200.
- ✅ Admin production build passes.

## End-to-end checks performed

- Database migrations: passed.
- Payment service syntax checks: passed.
- Payment service health endpoint: returned HTTP 200.
- Widget bundle `GET /widget.js`: returned HTTP 200 and JavaScript content.
- Unauthenticated merchant API request: returned HTTP 401.
- Payment service process and worker: started successfully.
- Admin Next.js production build: passed with route prerendering.
- Admin lint: failed with 44 errors and 9 warnings, primarily explicit `any`, React effect state updates, and unused imports.
- Admin login route: returned HTTP 200 in the smoke test.
- Admin root route: returned HTTP 404 in the smoke test and should be investigated before deployment.

## Remaining deployment checks

- HIGH authentication and authorization findings have been remediated, but retain a code review and production verification step.
- The admin root 404 was rechecked and is fixed.
- Lint still reports 43 errors and 13 warnings (mostly explicit `any` types and React effect patterns); production build currently passes.
- Configure production secrets, exact HTTPS origins, provider credentials, public callback URL, WebAuthn RP settings, and secure callback/merchant controls.
