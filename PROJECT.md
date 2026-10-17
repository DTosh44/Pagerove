# PageRove — project status

Last reviewed: 17 October 2026

## Purpose

**Your family’s intelligent library:** help a household organise owned physical books and help different readers find what to read next from books already on their shelves. Keep the core experience free, warm, mobile-first and centred on household reading.

## Current state

PRs #1 (household MVP foundation), #2 (approved book-led design) and #3 (book/photo ingestion) were merged into `main` on 17 October 2026 after successful PR checks. The repository now contains an executable demo and a configurable real recognition/metadata pipeline.

**No verified public production deployment or private-account release.** Default real-production API mode is `APP_MODE=locked`; no real user authentication or private household provisioning exists yet. Do not confuse merge success with a customer launch.

## Implemented / tested repository workflows

- Local setup, household and adult/child reader profiles.
- Owned works, editions/copies, cover-first searchable household library.
- Individual reading statuses, ratings and history, including bulk updates.
- Up to three mood-based suggestions from household-owned unread books.
- Mobile navigation and editorial Ink/Coral/Sand/Sage/Mint brand system.
- One-to-three photo ingestion/review flow, with editable candidate matches and idempotent confirmation.
- Mock provider path by default; opt-in OpenAI vision and Google Books metadata adapters require setup, privacy and licensing review.
- Source-controlled D1 migrations, accessibility checks, integration/browser tests and CI.

## Brand / UX decisions

Folded-page **P** in Ink `#0E2A47` with Coral `#FF685B`, warm Sand `#F9F6EF`, Sage `#6B8F7A`, Mint `#C7F4E2`; Source Serif 4 headings, Manrope wordmark/UI. Cover-first, uncluttered layouts. On mobile: Home, Library, Recommend, Family, More. Full detail and screenshots: [design notes](docs/design/README.md).

## Current milestone

**Make a small authenticated household trial safe:** verified sign-in/session lifecycle, household-bound access on every private read/write, account/household provisioning, profile editing, deletion and retention controls. Then live-test representative shelf photos, corrections and trusted catalogue metadata before enabling production processing.

## Blockers / unknowns

- No production auth provider/session and membership implementation or verification.
- No configured live D1 production environment and no proof of released account functionality.
- External provider terms, permission to use catalogue assets commercially, image-data disclosures, live accuracy/costs and retention/deletion workflows require review.
- Intended launch priority and release timing not yet assigned in the wider portfolio.
- Future capabilities such as reading plans, household switching and book lending/exchange are not approved for the current core milestone.

## Next actions

1. Review app/API ownership boundaries and choose the authentication/session implementation.
2. Verify household isolation and account/profile lifecycle, including deletion.
3. Review source/image rights and explicit disclosures; run a small real-shelf recognition trial when authorised.
4. Confirm the minimum private-beta launch criteria and deployment/rollback procedure.
5. Do not disable production lock mode without passing those checks.

## Handoff

Start with [README.md](README.md), [AGENTS.md](AGENTS.md), [visual design rules](docs/design/README.md) and [recognition/metadata notes](docs/ingestion/README.md). Update this file when a milestone, blocker or live-evidence state changes. Keep implemented/demo, needs verification and deployed distinct.
