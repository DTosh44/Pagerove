# PageRove

**Your family’s intelligent library.** A free, mobile-first home-library app that helps a household enjoy the books it already owns. This is the MVP foundation, with a working demo journey rather than a finished consumer service.

Create a household → add adult and child reading profiles → add owned books → assign reading history → browse and filter → get up to three suggestions from unread books already at home.

## Local setup

Use Node **24 LTS** and pnpm **11.19.0** (the `packageManager` field pins the version). TypeScript 6 is used because the ESLint parser does not yet support TypeScript 7.

```sh
corepack enable
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open http://127.0.0.1:5173. The React app and Worker API run together through the Cloudflare Vite plugin; D1 is local SQLite under `.wrangler/state`. No Cloudflare account or external API keys are needed for local development. `esbuild` and `workerd` installation scripts are explicitly permitted in `pnpm-workspace.yaml`.

The seed contains **24 books, four readers, 96 independent reading records and ratings**. Running `db:seed` again is safe: it uses `INSERT OR IGNORE`, so it will not overwrite edits. Seed data lives in `db/`, outside migrations, and is never deployed automatically. `scripts/generate-seed.ts` regenerates it with `node --experimental-strip-types scripts/generate-seed.ts`.

To try onboarding, start with a fresh local D1 database, run migrations, and **skip seeding**. Local data is disposable: stop the dev server before intentionally clearing `.wrangler/state` to reset it. Never seed a real household database.

## Checks

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
# Or all checks:
pnpm check

# Browser journey (uses the seeded local database and adds test books):
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:pwa # production preview; run after pnpm build
```

Tests cover per-profile reading state, strict unread eligibility, provider output filtering, input validation, household isolation, bulk-update atomicity, real migration SQL, and idempotent scan confirmation. API tests execute the same repository SQL against in-memory SQLite using Node’s SQLite API. Playwright covers the real React/Worker/D1 journey and mobile overflow. GitHub Actions runs all these checks on each PR; browser fixtures use a disposable local database.

## Architecture

```text
src/app/             React shell, shared controls, API client and individual route screens
src/domain/          Shared types, validation, reading rules and recommendation eligibility
src/providers/       Recognition, metadata and recommendation interfaces + mock adapters
worker/              Same-origin JSON API and household-scoped D1 repository
migrations/          Versioned D1 schema only
 db/seed.sql         Optional demo fixtures (not a migration)
scripts/             Seed generation
tests/               Domain, SQLite-backed API and browser tests
public/              PWA manifest, icons, service worker and offline notice
```

React + Vite is a small SPA with React Router, deployed alongside a Worker API using Workers Static Assets. It follows [Cloudflare’s React + Vite guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/) and avoids server rendering and unnecessary infrastructure. TypeScript and Zod are shared between the browser and API. Repository code owns SQL; components do not.

All API reads and writes resolve household ownership on the server. Account-to-household membership is a join table; the initial journey selects one household without putting that assumption into the schema. Children are household profiles, never independent accounts, and no birth dates are collected.

A `Book` is a conceptual work, a `BookEdition` is its format/ISBN, and a `HouseholdBook` is an owned copy. Independent reading records and ratings point to that copy and profile. Composite foreign keys prevent cross-household relationships. Batch writes are transactional. Manual and scanned additions now match existing works/editions and reuse household copies, unless another owned copy is explicitly confirmed.

The schema also includes book locations, scan sessions/images/candidates, recommendation sessions/results and reading plans. Visibility/lendability/exchangeability/current-holder/acquisition-date columns prepare the owned-copy model for later work but are not exposed as unfinished features.

Recommendation eligibility is enforced **before and after** the provider: only household-owned copies with `unread` status for the selected profile qualify. Missing reading records count as unread; `reading`, `read` and `want_to_read` do not qualify. Results are deduplicated and capped at three, then persisted with their explanation and provider identifier. Deterministic keyword/category/preference matching is the initial provider. It does not infer a child’s age suitability; review choices with young readers.

Scanning now supports one to three actual photos, separate recognition and metadata adapters, independent confidence scoring, alternate editions, bulk acceptance and resumable correction. Defaults stay mock and return three sample books; opt-in real adapters use OpenAI vision and Google Books. Photos are uploaded through the backend and discarded after processing; real mode sends them to OpenAI. ISBN lookup and manual entry use the same matching/persistence service. See [ingestion architecture, privacy, provider terms and readiness](docs/ingestion/README.md) before enabling external calls.

## Routes and API

| Screen                            | Route                    |
| --------------------------------- | ------------------------ |
| Home                              | `/home`                  |
| More                              | `/more`                  |
| Welcome preview                   | `/welcome`               |
| Household setup                   | `/onboarding`            |
| Household library                 | `/library`               |
| Profiles                          | `/members`               |
| Manual addition                   | `/books/new`             |
| Book details and personal history | `/books/:bookId`         |
| Bulk reading history              | `/history`               |
| Recommendations                   | `/recommendations`       |
| Scan preview and confirmation     | `/scan`, `/scan/:scanId` |

| API                                 | Purpose                                              |
| ----------------------------------- | ---------------------------------------------------- |
| `GET /api/state`                    | Current household, profiles and library              |
| `POST /api/households`              | Create household and initial adult profile           |
| `POST /api/members`                 | Add reading profile/preferences                      |
| `POST /api/books`                   | Match/reuse work, edition and owned copy             |
| `PUT /api/history`                  | Transactional per-profile bulk history/rating update |
| `POST /api/recommendations`         | Generate/persist owned-unread suggestions            |
| `POST /api/scans`                   | Create photo recognition session                     |
| `GET /api/scans/:id`                | Resume confirmation                                  |
| `PUT /api/scans/:id/candidates/:id` | Accept/edit or reject a candidate                    |

## Cloudflare deployment

The configuration is deployable after supplying your own D1 database ID. This task does not create cloud resources or publish a live site.

1. Authenticate with `pnpm exec wrangler login`.
2. Create D1 with `pnpm exec wrangler d1 create pagerove` and put the returned ID in `wrangler.jsonc`.
3. Apply schema with `pnpm exec wrangler d1 migrations apply pagerove --remote`.
4. Run `pnpm deploy` to build and publish one Worker with static assets and the D1 binding.

**Production defaults to `APP_MODE=locked`: every API route fails closed with 503.** The foundation does not implement real sign-in. Add a verified authentication/session adapter, replace the fixed demo identity with a verified user ID, and enforce memberships before enabling private accounts. Never trust a client-supplied user or household ID. Test CSRF/session expiry and household access before private beta.

For an intentionally public, fictional-data preview, use the separate `demo` environment: create `pagerove-demo`, replace its ID in `env.demo.d1_databases`, apply migrations with `--env demo --remote`, optionally execute `db/seed.sql` against `pagerove-demo --env demo --remote`, then build/deploy using `CLOUDFLARE_ENV=demo pnpm build` and `pnpm exec wrangler deploy --env demo`. Everyone shares one writable demo account; do not enter private information. Protect or reset a public demo as needed. The default environment stays locked.

Local settings/secrets live in ignored `.dev.vars`; remote secrets use `pnpm exec wrangler secret put NAME`. Never place secrets in `VITE_*` variables, which are public browser configuration. No external credentials are needed in default mock mode. Real-provider configuration is documented in the ingestion guide. Built outputs (including local runtime files) are ignored and must not be committed. Deploy via Wrangler rather than uploading the build directory indiscriminately.

## PWA and accessibility

The app has an install manifest, 192/512px icons and a production service worker. The service worker provides a small offline notice on navigation failure; household data and API responses are **not cached**, and edits require connectivity. Service worker installation is disabled during development. Offline library editing/synchronisation is not part of this foundation.

Responsive layouts support narrow mobile screens, keyboard focus, labelled controls, a skip link and live save/error messages. Automated axe checks cover the seven main screens for WCAG A/AA violations; these complement, rather than replace, manual keyboard and assistive-technology review. The brand uses a native folded-page P mark, Manrope UI/wordmark typography and Source Serif 4 headings. Existing edition cover URLs take precedence; 21 original demo works have curated Open Library jacket references, with restrained local placeholders for missing/failed images. Google Fonts and external covers have graceful fallbacks. See [the design notes and mobile/desktop screenshots](docs/design/README.md) for the visual system and its limitations.

## Known limitations and next steps

- Real account sign-in and private household provisioning are the first production prerequisite; current functionality runs in explicit shared demo mode only.
- Real adapters require an explicit local opt-in and provider credentials/terms review. Live accuracy, provider retention agreements and commercial metadata rights remain rollout prerequisites. Recommendations retain deterministic matching.
- ISBN-less editions and fuzzy work identities can remain ambiguous; confirmation is required. Large scans need durable queued processing.
- Profiles support creation and preferences at creation; editing/removal, household switching and account lifecycle are future work.
- Reading plans exist in the schema only. Catalog indexing/pagination, broader abuse controls, metadata retention/deletion and operational monitoring should precede a larger rollout.
- Reading status is per owned copy. A future work-level reading view may aggregate multiple editions/copies without losing copy ownership.
- No social network, borrowing, exchange, postage, commerce, Kindle integration or paywalls are implemented.

The core product remains free. The next usable milestone should focus on verified accounts, household/profile editing, and a small private trial of the manual-library journey with a credentialed shelf-recognition trial.
