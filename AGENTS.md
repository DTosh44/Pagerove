# PageRove — project and repository guardrails

## Read before making changes

Read `AGENTS.md`, `PROJECT.md`, `README.md`, and the relevant design/ingestion documentation and code. The user's latest explicit instruction overrides project notes. Inspect before rewriting; preserve working migrations, demo flows and the chosen PageRove brand.

## Product boundary

PageRove is a free, mobile-first **household-owned book library and reading-discovery** product. The distinguishing feature is one shared set of physical books with per-reader statuses and recommendations limited to books the household already owns.

Do not turn it into a public catalogue search engine, book-shopping or subscription service, social feed, lending/exchange marketplace, Kindle importer or general productivity application without a new product decision. Database columns preparing future lending, reading plans or copy tracking are not approval to build them now.

## Visual identity

Preserve the approved folded-page P in Ink `#0E2A47` with Coral `#FF685B`, warm Sand `#F9F6EF`, Sage `#6B8F7A`, Mint `#C7F4E2`, Source Serif 4 display headings and Manrope UI/wordmark. Keep book covers prominent, reading statuses simple and mobile navigation clear. [docs/design/README.md](docs/design/README.md) is the detailed implementation contract.

## Privacy, security and provider accuracy

- Production is fail-closed: `APP_MODE=locked` stays in place until verified authentication/session, ownership enforcement, household lifecycle and release checks have been implemented and passed.
- Never seed demo readers/books into a real private household or claim a shared demo is safe for real personal data.
- Enforce household membership **server-side**, using verified session identity rather than browser-supplied household/user identifiers.
- Preserve D1 migration order/data compatibility; never erase a live database casually.
- Only send photo data to an external provider when the mode is intentionally enabled, the user is informed and the relevant terms/privacy controls are satisfied.
- Real photo recognition, metadata quality, rights and paid API spend are **not** guaranteed by mock or synthetic tests.
- Book recommendation eligibility must be checked both before and after the provider: owned and unread for the selected reader, maximum three.
- Keep secrets server-only; never place them in `VITE_*` variables or committed files.

## Development and validation

Use the Node/pnpm versions and validation commands in the README. For material code changes, run format, lint, typecheck, unit/integration tests, build and relevant Playwright journeys; label tests skipped because of provider credentials or operational dependencies. Add regression checks for changed access, matching, reading-status and scan behaviour.

## Documentation is part of completion

Update `PROJECT.md` with verified changes to the working product, deployment state, next milestone, provider readiness, security or blockers. Update `README.md` when stable product, setup, styling or architecture changes. Do not present planned, mocked or unverified features as live.

## Handoff

Priority is a safe, real household trial — not additional feature breadth. Current app exists on `main` following the 17 October 2026 stacked-PR merges; production deployment is not thereby authorised.
