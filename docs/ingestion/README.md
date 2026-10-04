# Book ingestion

PageRove now supports actual photo uploads, OpenAI vision recognition, Google Books metadata, independent match scoring, confirmation and work/edition/copy reuse. Recommendations and child profiles are unchanged.

**DEVELOPMENT-SAFE:** the default is mock recognition + mock metadata, requires no keys, makes no paid API calls and uses disposable local D1. Mock mode returns three sample books regardless of the photo. The frontend uploads the selected bytes to PageRove, which discards them after processing.

**PRODUCTION-READY status:** these are deployable adapters and a bounded ingestion pipeline, not an approved consumer launch. The production API remains locked. Verified accounts/session authorization, provider/privacy agreements, Google Books commercial permission if charging, operational quotas and a credentialed accuracy/load trial are required before private households use it. Contract tests are not evidence of real shelf accuracy. No live paid provider evaluation was performed for this PR.

## Stages and contracts

```text
1–3 photos → bounded multipart upload → saved ScanSession / image references
→ BookRecognitionProvider (probable text, ISBN, legibility, image/region)
→ cross-image duplicate grouping
→ BookMetadataProvider (ISBN → title+author → title fallback)
→ independent title/author/ISBN/edition ranking → ≤3 normalized alternatives
→ confirmation: bulk confident / select alternate / edit / reject
→ one transactional work + edition + household copy claim per candidate
```

Interfaces live in `src/providers/interfaces.ts`; vendor-free records in `src/domain/ingestion.ts`. Real adapters and services are server-only under `worker/ingestion/`. Provider responses are parsed with Zod before domain use. No SDK/provider-specific response crosses to the UI. A future barcode reader can call `lookupByIsbn(isbn)` or POST `/api/metadata/lookup` with `{ "isbn": "9780735211292" }`.

`BookRecognitionProvider.recognize` processes one image; the scan orchestrator processes multiple images separately, preserving successful images when another fails. `RecognitionImage` carries generated ID, MIME type and bytes, never a public URL. `BookMetadataProvider` exposes `lookupByIsbn` and `search`, returning normalized title/subtitle/authors, ISBN-10/13, publisher/date/year, format, pages, language, subjects, plain-text description, external cover URL, source ID and provider where available. Missing metadata stays missing; binding is unknown unless the source says otherwise. Google identifies ebooks, not physical hardback/paperback binding.

The metadata fallback chain is deliberately one catalog with progressively weaker queries, followed by manual confirmation. Provider errors also preserve a manual candidate. A second catalog can implement the same interface later without introducing a silent license dependency now.

## Local configuration

Copy `.dev.vars.example` into ignored `.dev.vars`, run `pnpm db:migrate`, `pnpm db:seed`, then `pnpm dev`.

| Variable                    | Default              | Purpose                                                                                                                                   |
| --------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_MODE`                  | `locked` in Wrangler | Local `.dev.vars` uses `demo`; real production remains closed until authentication exists.                                                |
| `BOOK_RECOGNITION_PROVIDER` | `mock`               | `mock` or `openai`; typos fail, never silently select another vendor.                                                                     |
| `BOOK_METADATA_PROVIDER`    | `mock`               | `mock` or `google-books`.                                                                                                                 |
| `INGESTION_ALLOW_EXTERNAL`  | false                | Must be literal `true` to enable either external provider. This is an operator opt-in, not production authentication.                     |
| `OPENAI_API_KEY`            | absent               | Server-only secret, required for OpenAI.                                                                                                  |
| `OPENAI_VISION_MODEL`       | `gpt-4.1-mini`       | Explicit vision-capable Responses model; evaluate any replacement against the fixture and real shelves.                                   |
| `GOOGLE_BOOKS_API_KEY`      | absent               | Server-only key; public-volume queries can work without one for development. Use a restricted project key/quota for a controlled rollout. |
| `INGESTION_RATE_LIMIT`      | no binding           | Optional Cloudflare-compatible `limit({key})` binding, in addition to the shared D1 window.                                               |

For a **local integration trial only**, choose `openai` and `google-books`, add the keys and `INGESTION_ALLOW_EXTERNAL=true`, and restart the dev server. Do not enable paid keys on the publicly shared demo. Remote secrets use Wrangler secret bindings; never use `VITE_*` keys or commit `.dev.vars`. Model availability, credentials, billing and regional policy must be checked in the operator's account. Tests never require them.

## Confidence and duplicate policy

- ISBN checksums are validated; ISBN-10 is converted to its ISBN-13 identity. Hyphens, spaces and an ISBN prefix are normalized.
- Title matching removes accents/case/punctuation and an explicit colon subtitle. Author comparison tolerates punctuation and reversed name order. Levenshtein similarity preserves different sequels and different authors. Two conflicting colon subtitles/volume names remain distinct; a plain title may still match its fuller subtitle form.
- Score = 0.68 × title similarity + 0.30 × author similarity. A checksum-valid exact ISBN starts at 0.99. Known year/language/format agreement adds 0.005 per signal; disagreement subtracts 0.15. Visible text conflicting with ISBN caps the result below HIGH.
- Title-only, missing authors, unclear OCR, and ebook/audio editions inferred from a physical shelf are capped below HIGH. Different plausible works within 0.08 trigger ambiguity review.
- HIGH ≥ 0.90; MEDIUM ≥ 0.65; LOW < 0.65. Raw recognition confidence is retained separately and can lower trust, never manufacture a catalog match. This is a deterministic heuristic, **not a statistically calibrated probability**. UI percentages communicate match strength.
- Up to three editions are offered, with cover, author, year/publisher/format/ISBN. Bulk accept only claims pending HIGH candidates. Each candidate is its own transaction so a failed candidate does not roll back other reviewed books. Editing title/author clears stale cover/ISBN metadata; searching again and choosing an alternate uses persisted server candidates.
- Work reuse requires title similarity ≥ 0.94 and author similarity ≥ 0.88, or an existing exact ISBN edition. Normalized deterministic IDs and unique identity indexes protect concurrent new work/edition inserts. Existing legacy rows are matched without rewriting histories.
- Editions reuse a normalized ISBN; without ISBN, identity uses work/format/year/language/publisher where known. Legacy ISBN-less editions with compatible format and no conflicting known year/language/publisher are reused instead of creating another owned copy. Their existing bibliographic fields are preserved; users should verify ISBN/year when it matters. Same-work different valid ISBNs remain separate editions.
- Default copy insertion reuses an existing **household-scoped** edition copy. Cross-image duplicates are combined before review and retain source-image provenance. Selecting “I own another copy of this edition” explicitly creates a second copy. Retry/repeated acceptance still makes only one claim per candidate.

Work matching currently examines catalog rows; this is intentionally simple for the initial household scale. Add indexed normalized lookup/search and catalog reconciliation before a large rollout. Near-but-distinct titles can still confuse a heuristic; user confirmation remains essential. Simultaneously inserted fuzzy variants whose normalized identities differ may need later reconciliation. ISBN-less shelf photos cannot prove exact editions or physical copy counts.

## Photos, privacy and retention

**Before upload**, the UI reads `/api/ingestion/config` and discloses whether OpenAI receives images. Mock uploads go to PageRove only; real vision uploads go browser → PageRove Worker → OpenAI Responses as inline base64 with `store:false`. No Files API, public URLs, R2 bucket or disk image store is used. Bytes live in request/worker memory only and are discarded after processing; PageRove cannot recover them for a retry. Re-upload the failed photo. Browser blob previews are revoked on replacement/unmount.

OpenAI receives the entire selected photo, including any incidental private content and embedded image metadata. Crop/redact before uploading; EXIF removal is not implemented. `store:false` disables response application-state storage; it does **not** promise zero retention. OpenAI's default abuse-monitoring retention is generally up to 30 days, with exceptions (including image safety review); organization controls vary. Read the current [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data) and configure the appropriate contract/region before launch.

Google receives probable/manual book titles, authors and ISBN searches, along with normal request/network/key context. It does not receive shelf photos, household IDs, profile histories or ratings. Loading external cover URLs in the browser also reveals normal network/request information to the cover host. No cover files are copied to PageRove.

D1 retains scan IDs, generated photo labels (original filenames are discarded), type/size, image processing states, normalized recognized text/confidence/optional regions, alternatives and provider/source provenance, user decisions and resulting library records. This permits session resume without retaining photographs. Records currently remain until the database is deleted; account deletion and a scan-metadata retention job must be added before private launch. Existing `storage_key` is unused/null. If storage is introduced later, use a private bucket, scoped generated keys, signed access and enforced expiry/cleanup.

Logs contain only event, random scan ID, provider/error code and aggregate counts. They omit image bytes, filenames, titles, user/profile IDs, keys, provider payloads and URLs containing keys. Unexpected errors return generic messages.

## Metadata rights and covers

Google Books was chosen for its documented public volume/search API and ISBN/title/author fields, rather than scraping. **It is not an unrestricted commercial catalog license.** The [Google Books API terms](https://developers.google.com/books/terms) include a restriction on charging users without separate agreement or written permission and obligations concerning infringing content. The [general Google API terms](https://developers.google.com/terms) also govern use. Operators must review caching/retention, attribution, copyright contact/removal and their intended business model before production. This integration is suitable for development evaluation; commercial suitability has not been approved. PageRove displays a Google Books source link on returned matches and retains source provenance; final branding/attribution compliance still needs review.

Metadata, descriptions and jacket images can carry third-party rights. A returned URL is not a license to redistribute jacket artwork. Only normalized identifiers/URLs and returned metadata are stored, with safe HTTPS Google cover hosts and graceful placeholders. Covers can disappear, change, fail CORS/network policies or be incorrect; PageRove cannot guarantee perpetual access. No Amazon or Goodreads scraping, downloading or mirroring is used. Existing curated Open Library demo covers remain separate fictional-demo references.

Source contracts: [Google volume fields](https://developers.google.com/books/docs/v1/reference/volumes), [Google search syntax](https://developers.google.com/books/docs/v1/using), [OpenAI vision inputs](https://developers.openai.com/api/docs/guides/images-vision), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Bounds, failures and costs

- 1–3 JPEG/PNG/WebP images, ≤8 MiB each, ≤25 MiB streamed multipart request. MIME and magic-byte checks; SVG/HEIC rejected. Convert unsupported phone formats first. Phone resolution and orientations are passed through; no lossy frontend resizing. A malformed image with a valid signature may still be rejected by the provider.
- 60 candidates per scan, metadata worker pool of three, 60-second scheduling budget across the scan; queued books beyond it become manual review. An in-flight lookup may finish after the scheduling budget. Google call timeout 8 seconds; vision call timeout 45 seconds. No automatic paid retry. Completed partial results persist image by image.
- Shared atomic D1 hourly windows: 10 scan attempts and 120 lookup attempts per household. Invalid attempts count; retries count; each scan can make up to three vision calls and each candidate up to three metadata queries. Optional binding allows additional provider/platform limits. Configure project spend caps and Cloudflare WAF limits before exposing the authenticated service.
- Real-provider processing keeps the upload request open until processing ends, so it does not depend on Worker's short post-response `waitUntil` lifetime. Mock jobs can return a saved session immediately and UI polls. Results are persisted image by image and recent sessions remain discoverable if a tab closes. Lost/terminated requests may leave unfinished photos; a five-minute stale-processing check permits re-upload/resume without deleting reviewed candidates. No photo retention means retries need the original bytes. For larger shelves and reliable processing across disconnects, use a durable queue with private temporary assets before rollout. No automatic paid retry or charge guarantee after interruption.
- Provider rate limits, timeout, malformed/refused/truncated responses and upload errors have safe messages. Metadata failures preserve unresolved candidates. No-books detection leaves a saved review with manual entry guidance. Failed images can be retried without removing accepted/rejected candidates. Bulk failures leave candidate progress pending.
- Vision cost varies with model, image resolution/detail, number of photos, output tokens and retries. The adapter uses `high` image detail and ≤6000 output tokens per image; overlapping images still incur recognition cost. Calculate against the current [OpenAI pricing](https://developers.openai.com/api/docs/pricing) and [image cost guide](https://developers.openai.com/api/docs/guides/images-vision); no fixed per-shelf price is promised. Google quota/terms/project restrictions must be checked in the operator console; no paid metadata cost assumption is built in.

## API and verification

| API                                         | Purpose                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| `GET /api/ingestion/config`                 | Public provider labels/privacy flags, no keys                                   |
| `POST /api/metadata/lookup`                 | ISBN or title/author ranked search; later barcode entrypoint                    |
| `POST /api/scans`                           | Multipart `photos` (one to three); saved session                                |
| `GET /api/scans`                            | Ten recent household sessions                                                   |
| `GET /api/scans/:id`                        | Processing/review, per-image errors and saved choices                           |
| `POST /api/scans/:id/images/:imageId/retry` | Re-upload one unfinished/failed image                                           |
| `POST /api/scans/:id/candidates/:id/search` | Refresh alternatives without accepting                                          |
| `POST /api/scans/:id/accept-confident`      | Pending HIGH only, resumable individual transactions                            |
| `PUT /api/scans/:id/candidates/:id`         | Accept/reject; optional persisted `metadataId`, corrections or `additionalCopy` |
| `POST /api/books`                           | Same matching/persistence for manual confirmation                               |

All routes remain server-resolved household scoped and fail closed in locked mode. Mutations reject cross-origin requests. Client-supplied candidate/source/metadata IDs cannot bypass household lookups. The compatibility JSON `/api/scans` path works only with mock recognition; external vision requires uploaded bytes.

`pnpm check`, `pnpm test:e2e`, `pnpm test:pwa`, and `pnpm exec wrangler deploy --dry-run` verify formatting, lint, types, domain/API/contract tests, browsers, axe, build, offline assets and bundle configuration. CI never calls live third-party APIs. Contract stubs assert exact provider request/response shapes, sanitized failures and timeouts. Tests use every migration against real SQLite, not mocked persistence.

`tests/fixtures/synthetic-shelf.png` has 24 named synthetic books, rotations/upside-down text, mixed typography, stacked books and obscured portions. No private imagery or reproduced jackets. SVG/expected labels and `scripts/generate-shelf-fixture.mjs` make it reproducible. The stubbed integration test verifies 24 candidates → 22 confident → 2 reviews, failed-image preservation and repeat ingestion. It does not verify a vision model's OCR accuracy. Use this image plus varied, consented real shelves to evaluate recognition recall, false confident matches and correction time before beta.

## Visual review

Updated screens preserve PR #2's type, colors, covers and navigation. These captures use explicit mock response fixtures and the synthetic shelf, without writing to the library. Regenerate with `node scripts/capture-ingestion.mjs` against the local dev server.

| Screen           | Mobile                                | Desktop                                |
| ---------------- | ------------------------------------- | -------------------------------------- |
| Photo selection  | [View](screenshots/mobile-upload.png) | [View](screenshots/desktop-upload.png) |
| Candidate review | [View](screenshots/mobile-review.png) | [View](screenshots/desktop-review.png) |
