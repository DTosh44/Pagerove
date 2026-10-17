# PageRove visual design

This design branch builds on PR #1, keeping its domain rules, schema, API contracts and production security settings intact. It translates the approved brand board into a responsive consumer reading app.

## Brand and components

The folded-page P is a native, scalable SVG: a bold Ink silhouette with a Coral page fold. The standalone mark, horizontal wordmark and app/favicons live in `public/brand` and `public/icon*`. The interface renders the mark alongside live Manrope text, keeping the complete wordmark consistently sans-serif. The exported SVG wordmark uses Manrope with an Arial fallback. Regenerate PNG icons with `node scripts/generate-brand-icons.mjs` (requires Playwright Chromium).

`src/app/tokens.css` defines the palette, font families, spacing scale, radii and shadows. The layout stylesheet replaces the previous sage theme. Shared components include Brand, Avatar, Cover, BookCard, BookRow, StatusBadge, SectionHeading, buttons, pills and navigation. There is no new component-library dependency or backend infrastructure.

- **Ink `#0E2A47`** anchors headings, navigation, buttons and the wordmark.
- **Coral `#FF685B`** highlights reading-list actions, page folds and selection accents. Darker Coral text `#B43A30` keeps small active labels and icons legible against white.
- **Sand `#F9F6EF`** gives the app its warm background; white panels keep the hierarchy clear.
- **Sage `#6B8F7A`** and related accessible shades support profiles, reading states and book-stack artwork.
- **Mint `#C7F4E2`** provides positive family and confirmation accents.
- **Charcoal `#1F2937`** supports longer text. Secondary text uses `#626C79`.

**Source Serif 4** provides readable, confident editorial headlines; **Manrope** handles the clean wordmark, UI and body copy. Both are loaded through Google Fonts, with Georgia/system fallbacks. Display typography is intentionally separated from the sans-serif brand mark. The app avoids strong gradients, excessive category metadata and dashboard-style metrics.

## Screen decisions

| Screen                       | Design                                                                                                                                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Welcome/onboarding           | Approved headline and supporting copy, a book-stack illustration, clear Get started CTA, and existing household setup. The account link explains that sign-in is not available in this preview. `/welcome` lets an existing demo household review the welcome screen.      |
| Home                         | Continue reading, a mood-discovery card, recently added books, household reading activity and scan access. All content comes from the existing library state.                                                                                                              |
| Our Library                  | Alphabetical cover-first grid, rounded reading-state filters, discreet search and two columns on phones. Title, author and a small personal state replace dense metadata.                                                                                                  |
| Recommendations              | Large mood headline, soft prompt pills and a compact natural-language field. One Coral-accented primary suggestion with a full-width mobile reading-list action, followed by up to two smaller suggestions. The existing endpoint still returns at most three suggestions. |
| Our People                   | Personal avatar selection, a focused reader card, books read/currently reading, recent reading and favourite genres. Initials avoid inventing identities or collecting photos. No school-style charts.                                                                     |
| Scan                         | A visual shelf/camera zone and a local preview of the selected photo. Actual candidate counts and confident/review colours lead into the existing accept/edit/reject controls. Mock recognition remains explicit.                                                          |
| Book details                 | A large cover, clear title/description, format/genres and household history with avatars and simple states. Personal rating/date/status controls remain intact.                                                                                                            |
| More/history/manual addition | Existing functionality using the shared typography, cards, controls and spacing. More gives mobile readers access to scan, add and bulk history.                                                                                                                           |

Phones use a fixed **Home / Library / Recommend / Family / More** bottom navigation with safe-area spacing, visible current-page labels and 44px+ targets. Desktop keeps a coordinated left navigation. Layout checks cover 390, 430, 768 and 1440px; the compact layout applies through 760px.

## Covers and photo previews

The existing edition `coverUrl` takes precedence. The original demo works have a presentation-only map of 21 curated Open Library cover URLs, verified against their public Books API. This does not modify seed data, call the metadata provider or enrich new entries. Three titles have no verified cover reference; these and failed image requests use quiet editorial placeholders. These jackets represent the work for visual review, not a verified match to an owned edition.

Cover URLs point directly to Open Library, following their [cover-display guidance](https://openlibrary.org/dev/docs/api/covers/). The footer credits Open Library. Jacket artwork is not downloaded into the repository, scraped from commercial websites, or presented as PageRove-owned artwork. External network availability affects cover and font rendering.

Selected shelf photos use temporary object URLs and are revoked when replaced or when leaving the screen. The browser CSP allows `blob:` images for this local preview. No image bytes are uploaded or persisted, and reopening a saved scan cannot restore its original photo. The existing scan/provider boundary is unchanged.

“Add to my reading list” calls the existing history endpoint with `want_to_read`. It preserves ratings/dates and excludes the saved book from the next request under the unchanged strict-unread rule. It does not introduce reading-plan storage or change recommendation eligibility.

## Validation and screenshots

The browser suite checks existing workflows, reading-list persistence and exclusion, local photo preview, failed-cover fallbacks, truthful onboarding copy, responsive overflow, touch targets and navigation. Axe audits cover all main routes, the populated recommendation card and photo-upload state. Focus outlines, labels, keyboard navigation, reduced motion and semantic structure remain part of the design.

The committed screenshots below are review artifacts, not pixel baselines. Exact screenshot comparisons would be brittle across operating systems, live cover images and remote fonts. Responsive and accessibility checks run in CI; visual artifacts are reviewed separately. Regenerate them with the seeded app running at port 5173:

```sh
node scripts/capture-design.mjs
```

The capture script filters test-created books out of the screenshot-only library response, retaining the original 24 demo titles and their current reading state. It does not mutate the application or database. The recommendations capture uses Sam and the Funny prompt against the real endpoint.

| Screen          | Mobile · 390px                                       | Desktop · 1440px                                      |
| --------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| Welcome         | [Screenshot](screenshots/mobile-onboarding.png)      | [Screenshot](screenshots/desktop-onboarding.png)      |
| Home            | [Screenshot](screenshots/mobile-home.png)            | [Screenshot](screenshots/desktop-home.png)            |
| Library         | [Screenshot](screenshots/mobile-library.png)         | [Screenshot](screenshots/desktop-library.png)         |
| Recommendations | [Screenshot](screenshots/mobile-recommendations.png) | [Screenshot](screenshots/desktop-recommendations.png) |
| Our People      | [Screenshot](screenshots/mobile-people.png)          | [Screenshot](screenshots/desktop-people.png)          |
| Scan            | [Screenshot](screenshots/mobile-scan.png)            | [Screenshot](screenshots/desktop-scan.png)            |
| Book details    | [Screenshot](screenshots/mobile-book.png)            | [Screenshot](screenshots/desktop-book.png)            |

## Next visual work

Review the flows on physical phones, refine the exported wordmark into outlined/licensed artwork if needed, and choose a long-term cover/font asset strategy. A real household trial can inform profile editing and scanning improvements in later work. Authentication, real recognition/AI, lending, exchanges, commerce and payments are outside this design branch.
