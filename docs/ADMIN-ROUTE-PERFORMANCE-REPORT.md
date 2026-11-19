# Admin route performance investigation

**Date:** November 18, 2026

**Branch:** `codex/globalpay-hackathon-dashboard`

**Status:** Fix implemented locally; authenticated timing verification still pending
**Scope:** Admin identity, company workspace loading, and client-side route transitions

## Executive summary

Admin route changes felt slow because the application repeatedly rebuilt the signed-in user's company workspace. The admin identity request was already cached for the lifetime of the loaded browser application, but the company tree request was not reused reliably between route mounts. Several shared layout components use the company workspace, and the Branches and Team pages also made their own company-tree requests.

That repeated request is expensive. `GET /api/sancus/companies/me` reads companies and memberships, loads payment deductions, loads every company wallet, and asks the Arc network for each wallet's live USDC and local-token balances. Wallet balances are currently resolved one wallet at a time, with a six-second timeout per USDC lookup. A duplicate request can therefore add visible delay even when the database itself is fast.

The local fix introduces one shared in-memory company-workspace store with request deduplication and a 60-second freshness window. Client route changes reuse the last confirmed workspace immediately. The app refreshes the workspace after a mutation or after the cached result becomes stale. Signing in or out clears both the account and company caches.

The shell also acknowledges navigation immediately. Internal link clicks mark the destination as pending and place a lightweight themed transition layer over the main content while keeping the header and sidebar visible. A route-level loading fallback covers programmatic navigation and route chunk loading. This feedback does not make a slow request faster, but it removes the dead-click feeling while the destination becomes ready.

This improves navigation without weakening authorization. The client cache decides what to display quickly; each protected API route still authenticates and authorizes the current request on the server.

## User-reported behavior

The reported symptoms were:

- The application appeared to check the database again on every route to determine whether the user was an admin.
- Moving between routes such as Home, Branches, Team, Settings, and Pay felt much slower than expected.
- Loading indicators appeared even when the same account and company data had just been shown on the previous route.

The intended behavior is:

1. Resolve the signed-in account once during the loaded app session.
2. Keep showing the last confirmed role, navigation, company tree, and balances during client-side navigation.
3. Revalidate shared data in the background when it becomes stale or after an action changes it.
4. Continue enforcing authorization on every server request.

## What was already working

The signed-in account hook already had module-level caching:

- `cached` stores the last account result.
- `inflight` deduplicates concurrent requests.
- New hook instances initialize from the cached account.
- `resetAccountCache()` clears the result after an authentication change.

This means the app was not normally refetching `GET /api/sancus/accounts/me` on every client-side route transition. The account response includes the account type, permissions, navigation access, scopes, and display name. Keeping it in memory is appropriate because the server remains the authority for protected operations.

The cache is intentionally not stored in `localStorage`. A browser-persisted `isAdmin` flag could remain after a role change or be edited by a user. The in-memory value is a presentation optimization, not an authorization credential. A full page reload starts a new app session and confirms the account again.

## Root cause

### 1. Company workspace data was fetched again after route mounts

`useWorkspace()` depends on `useCompanies()`, and the workspace hook is used by the application shell and several pages and components. The previous company hook retained a result but still called its refresh path when a consumer mounted. It only deduplicated requests that were in progress at exactly the same time.

Once a request completed, a later route mount could start another `GET /api/sancus/companies/me` request even though the previous result was still current.

### 2. Branches and Team bypassed the shared workspace state

The Branches page maintained a second copy of company state and fetched the company-tree endpoint directly. It also contained retry behavior around authentication.

The Team page fetched the full company tree before fetching the selected company's members. The company tree had already been loaded by the shell through `useWorkspace()`, so this added another expensive request before the page could become ready.

### 3. The company-tree endpoint performs network-bound aggregation

`GET /api/sancus/companies/me` does more than read one database row. It:

1. Loads all company nodes.
2. Loads memberships for those nodes.
3. Filters the nodes through inherited role rules.
4. Loads company wallets.
5. Reads live Arc balances for the wallets.
6. Reads optional local mock-token balances.
7. Loads pending payment deductions and FX inputs.
8. Builds role-aware capabilities and rolled-up balances for the company tree.

The balance resolver currently loops through wallets sequentially. Each USDC lookup can wait up to six seconds before it is treated as unavailable. This does not prove that every slow navigation hit the timeout, but it explains why unnecessary duplicate workspace requests have a large worst-case cost.

### 4. Development mode adds route compilation time

The local development server compiles a route the first time it is opened. That cost is separate from the application data requests and can make the first visit to a page slower than later visits. The production build successfully pre-generated the application routes, so development compilation should not be mistaken for a production data-cache failure.

## Request flow

### Before the fix

```text
Open route
  |
  +-> App shell -> useWorkspace -> useCompanies -> GET /companies/me
  |
  +-> Route components -> useWorkspace -> useCompanies -> GET /companies/me again
  |
  +-> Branches or Team -> direct GET /companies/me
  |
  +-> Team -> GET /companies/:id/members

GET /companies/me
  -> database company and membership queries
  -> wallet list
  -> sequential Arc balance reads
  -> payment deduction queries
  -> role-aware company tree
```

Concurrent requests could share one promise, but later route mounts could repeat the whole operation.

### After the fix

```text
First route in the loaded app
  -> shared company store
  -> one GET /companies/me
  -> publish one confirmed snapshot to every subscriber

Next route within 60 seconds
  -> render from the shared snapshot immediately
  -> no company-tree request

Route after the snapshot becomes stale
  -> keep showing the confirmed snapshot
  -> revalidate once
  -> publish only if a new response arrives

Company mutation
  -> force one refresh
  -> publish the updated snapshot

Sign-in or sign-out
  -> clear account cache
  -> clear company cache
  -> resolve the new user's state
```

## Implemented changes

| File | Change | Result |
| --- | --- | --- |
| `app/lib/sancus/use-companies.ts` | Replaced per-hook state with a shared `useSyncExternalStore` store | Every mounted consumer reads the same company snapshot |
| `app/lib/sancus/use-companies.ts` | Added a 60-second freshness window | Normal client-side route changes do not repeat the company-tree request |
| `app/lib/sancus/use-companies.ts` | Kept one shared in-flight promise | Concurrent consumers cannot start duplicate company-tree requests |
| `app/lib/sancus/use-companies.ts` | Added forced refresh and reset paths | Mutations can revalidate immediately; authentication changes can discard user-specific data |
| `app/lib/sancus/use-account.ts` | Reset the company cache when the account cache resets | A second user cannot inherit the first user's company snapshot |
| `app/app/(sancus)/branches/page.tsx` | Removed its direct company-tree request and local duplicate state | Branches renders from the already loaded workspace and refreshes only after changes |
| `app/app/(sancus)/team/page.tsx` | Derives the company list from `useWorkspace()` | Team only requests members for the selected company |
| `app/tests/sancus-companies-cache.test.ts` | Added cache behavior tests | Protects fresh-result reuse and explicit refresh behavior |
| `app/components/sancus-ui/app-shell.tsx` | Added immediate internal-link transition feedback | Clicks visibly register before the destination commits |
| `app/app/(sancus)/loading.tsx` | Added a shared route loading fallback | Programmatic and route-level loading use the same product language |
| `app/styles/sancus/app.css` | Added themed pending, progress, and reduced-motion styles | The shell stays stable while main content loads |

## Cache behavior and invalidation

The company cache is process-local browser memory. It survives Next.js client-side route transitions, but it does not survive a hard reload, a new browser tab, or a browser restart.

| Event | Behavior |
| --- | --- |
| First company consumer mounts | Fetch and publish the company workspace |
| Another consumer mounts while the request is running | Reuse the same promise |
| Another route mounts within 60 seconds | Reuse the confirmed snapshot without fetching |
| A route mounts after 60 seconds | Keep the snapshot visible and revalidate |
| A branch or company mutation completes | Call `refresh()` to force revalidation |
| Sign-in or sign-out resets the account | Clear the account and company snapshots |
| The refresh request fails | Keep the last confirmed snapshot when one exists |

The 60-second window limits repeated network work without making workspace changes invisible for a long period. Explicit mutation refreshes remain the primary correctness mechanism. The time window is a fallback for changes made elsewhere, such as another tab or an administrative database update.

## Security boundary

The cache does not grant access. It only helps the interface decide what to render while navigating.

- `GET /api/sancus/accounts/me` still authenticates the session on the server.
- `GET /api/sancus/companies/me` still filters visible companies by effective membership.
- Company and member mutation endpoints still authorize their own requests.
- Client-side `can(...)` and navigation checks remain convenience and presentation checks.
- Signing in or out clears user-specific cached company data.

If a role changes while a tab remains open, the interface can show the previous role until refresh or revalidation. A protected server action must still reject an unauthorized request immediately. This is why the client cache must never replace endpoint authorization.

## Verification evidence

The implementation was checked at three levels:

1. **Cache regression tests**
   - Two fresh `loadCompanies()` calls issue one network request.
   - A forced refresh issues a second request.

2. **Project validation**
   - Targeted linting passed for the changed files.
   - During implementation, the full Vitest run passed: 32 test files and 218 tests.
   - The production build passed and generated 115 application pages.

   A later documentation-time rerun did not execute the tests because Vitest failed while loading its configuration with `ERR_REQUIRE_ESM` in `std-env`. This is a test-runner/dependency startup problem, not a failing application assertion. It should be resolved before the next merge so the successful run can be reproduced from the current environment.

3. **Browser verification attempt**
   - A production server was started on a temporary port for route testing.
   - The local production environment had demo login disabled, so the authenticated admin flow could not be timed end to end.
   - The temporary server and browser session were stopped after the attempt.

The code-level behavior and build are verified. A measured before-and-after authenticated route-navigation result is still missing.

## Remaining limitations

### First load still performs the full workspace request

The cache removes repeated work after the first successful load. It does not make the initial company aggregation cheaper.

### Wallet balance reads remain sequential

`withBalances()` reads wallets one at a time. A company with several wallets can wait on several remote calls in sequence. Parallelism with a safe concurrency limit would reduce first-load latency and contain pressure on the Arc RPC.

### The cache is not shared across tabs or reloads

This is a deliberate security and freshness trade-off. Persisting the full role-aware company tree would require versioning, user-scoped storage, expiry, schema migration, and careful clearing on every authentication transition.

### Some route-specific data still loads on navigation

The Team page still loads members for the selected company. Other routes load their own payments, approvals, balances, or collections. Those requests may also need shared caching, but they should be measured before being changed.

### No authenticated timing baseline exists yet

The current evidence verifies request-count behavior, not the actual time a signed-in admin waits. Production-like authenticated measurements are needed before assigning a final performance result.

## Recommended follow-up

### P0: Measure the signed-in experience

Capture the following for Home -> Branches -> Team -> Home in a production build with a working authenticated account:

- Navigation duration for each transition.
- Number of `/api/sancus/accounts/me` requests.
- Number of `/api/sancus/companies/me` requests.
- Time to first company snapshot.
- Time spent inside wallet balance resolution.

Acceptance target: one account request and one company-tree request for the sequence when all transitions occur inside the freshness window.

### P1: Reduce first-load company aggregation time

Change wallet balance resolution from an unbounded sequential loop to limited parallel reads. Record per-wallet timing and timeouts so a slow RPC can be distinguished from a slow database query.

### P1: Separate structure from volatile balances

The company hierarchy, roles, and capabilities change infrequently. Wallet balances change more often and depend on remote RPC calls. Splitting them into a fast company-structure response and a balance projection would let navigation render the organization immediately while balances revalidate independently.

### P1: Add request timing on the server

Log timing for company query, membership query, wallet list, wallet balances, deductions, and tree construction. This will show which part of the first request deserves optimization.

### P2: Standardize shared server-state caching

The project already depends on TanStack Query. Migrating account, company, members, payments, and approvals to one query-cache policy could replace custom stores with consistent freshness, invalidation, retries, and developer tooling. This is not required for the current fix and should follow measurement rather than block the hackathon flow.

## Acceptance criteria

The issue is complete when all of the following are true:

- [x] Admin account data is reused during client-side navigation.
- [x] Company workspace data is shared across consumers.
- [x] Concurrent company requests are deduplicated.
- [x] Fresh company data is reused for 60 seconds.
- [x] Branches no longer makes its own company-tree request.
- [x] Team no longer fetches the company tree before members.
- [x] Sign-in and sign-out clear user-specific company data.
- [x] Server-side authorization remains unchanged.
- [x] Internal route clicks show immediate pending feedback.
- [x] A shared route-level loading fallback exists.
- [x] Reduced-motion users do not receive looping transition animation.
- [x] Cache regression tests and the full suite passed during implementation.
- [ ] Restore a reproducible Vitest startup in the current environment.
- [x] Production build passes.
- [ ] Authenticated before-and-after route timings are recorded.
- [ ] First-load wallet balance performance is measured and, if needed, optimized.

## Related implementation

- [`use-account.ts`](../app/lib/sancus/use-account.ts)
- [`use-companies.ts`](../app/lib/sancus/use-companies.ts)
- [`use-workspace.ts`](../app/lib/sancus/use-workspace.ts)
- [`companies/me` route](../app/app/api/sancus/companies/me/route.ts)
- [`company-wallets.ts`](../app/lib/sancus/company-wallets.ts)
- [`branches/page.tsx`](<../app/app/(sancus)/branches/page.tsx>)
- [`team/page.tsx`](<../app/app/(sancus)/team/page.tsx>)
- [`sancus-companies-cache.test.ts`](../app/tests/sancus-companies-cache.test.ts)
- [`app-shell.tsx`](../app/components/sancus-ui/app-shell.tsx)
- [`loading.tsx`](<../app/app/(sancus)/loading.tsx>)
