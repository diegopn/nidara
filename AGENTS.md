# Project Guidance

## Project overview

Nidara is a static web platform for open scientific discovery. It helps researchers find publications, authors, and datasets in public academic catalogs.

Brazilian Portuguese is the default language. English and Spanish are served at `/en/` and `/es/`. Publication and author searches use OpenAlex and Crossref; dataset searches use DataCite. Coverage and metadata quality vary by source, so results can be partial.

## Behaviors to preserve

- Keep the three result categories, dedicated dataset search, filters, pagination, and sorting.
- Preserve the in-browser saved-record list across searches and retain BibTeX, RIS, general CSV, and dataset CSV exports.
- Preserve queries and filters in shareable links, and keep the Portuguese, English, and Spanish routes and translations aligned.
- Deduplicate records by DOI when possible; do not combine publications only because their titles are similar.
- Treat licenses, data links, documentation, and related records as information supplied by the source. Do not infer that a record is open, available, or suitable for a study when the metadata does not say so.
- Completeness sorting measures metadata presence; do not describe it as relevance or scientific quality.
- Preserve accessibility, keyboard navigation, loading states, and small-screen layouts.

## Project structure

- `index.html`: Brazilian Portuguese base page and interface structure.
- `css/style.css`: styles, themes, and responsive rules.
- `js/app.js`: application startup, interface interactions, and search coordination.
- `js/core/`: reusable search, author, dataset, filter, URL, translation, export, and normalization logic.
- `js/providers/`: requests and response normalization for OpenAlex, Crossref, and DataCite.
- `js/core/translations.json`: interface text. Every key must exist in `pt-BR`, `en`, and `es`.
- `assets/`: icons and other static assets.
- `scripts/build_site.py`: builds static routes and files in `dist/` from source files.
- `tests/`: Python checks and JavaScript behavior tests.
- `.github/workflows/pages.yml`: checks pull requests to `develop` and `main`, and publishes after a push to `main`.
- `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md`: license and project policies; update them only when relevant to the requested work.

## Change guidelines

- Make the smallest complete change and reuse existing functions before adding new layers or dependencies.
- Put every new user-visible string in `translations.json` in all three languages; Brazilian Portuguese remains the default.
- Treat external responses as untrusted data. Insert text with safe DOM APIs, validate external URLs, and never interpret metadata as HTML.
- Edit source files, not generated output in `dist/`.
- Write Markdown documentation in English.
- Keep the README focused on public project information; do not add local setup instructions there.
- Preserve the copyright and notices in `LICENSE`.

## Verification guidance

- The publication workflow runs `python3 -m unittest discover -s tests -v`. JavaScript checks are skipped by the suite when Node.js is unavailable; report that limitation when relevant.
- After changing pages, routes, or publication assets, generate the site with `python3 scripts/build_site.py --output dist` and check the main, `/en/`, and `/es/` routes.
- Review the diff before completion and confirm that the changes preserve the behaviors listed above.
