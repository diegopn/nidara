# Contributing

Bug reports, ideas, documentation, and code contributions are welcome. By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). For security issues, use the private process in [SECURITY.md](SECURITY.md).

## Before opening a contribution

- Search existing issues and pull requests so the same work is not duplicated.
- For a bug report, include the page, browser, steps to reproduce, and what you expected to happen. Remove personal information and private search details from screenshots or examples.
- For a proposed feature, describe the research task it supports and discuss larger changes in an issue before implementing them.

## Branches and pull requests

`develop` is the integration branch. Maintainers may push directly to it; contributors can propose changes with a pull request targeting `develop`. `main` is the publication branch and accepts changes through pull requests. Merging into `main` triggers the GitHub Pages deployment.

Keep each pull request focused. Describe the user-visible change, list the checks you ran, and mention any limits in source metadata or API behavior. Do not include credentials, personal data, or search records from other people.

## Documentation and interface text

Write Markdown documentation in English. User-facing text belongs in `js/core/translations.json` and must be kept consistent in Brazilian Portuguese, English, and Spanish. Avoid committing generated site output from `dist/`.

## Verify changes

Run the project checks before opening a pull request:

```sh
python3 -m unittest discover -s tests -v
python3 scripts/build_site.py --output /tmp/nidara-dist
```

The test suite runs JavaScript checks when Node.js is available. Review the generated Portuguese, English, and Spanish routes when changing pages, translations, or publishing behavior.
