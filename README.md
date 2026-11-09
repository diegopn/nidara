<p align="center">
  <img src="assets/nidara-mark.svg" alt="Nidara mark" width="112" />
</p>

<h1 align="center">Nidara</h1>

<p align="center">Find publications, authors, and research datasets across open academic catalogs.</p>

<p align="center">
  <a href="https://diegopn.github.io/nidara/">Open Nidara</a> ·
  <a href="https://diegopn.github.io/nidara/en/">English</a> ·
  <a href="https://diegopn.github.io/nidara/es/">Spanish</a>
</p>

<p align="center">
  <a href="https://developer.mozilla.org/en-US/docs/Web/HTML"><img alt="HTML5" src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white"></a>
  <a href="https://developer.mozilla.org/en-US/docs/Web/CSS"><img alt="CSS3" src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white"></a>
  <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript"><img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=111111"></a>
  <a href="https://www.python.org/"><img alt="Python" src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white"></a>
</p>

Nidara is a static web app for research discovery. It brings together public metadata from OpenAlex, Crossref, and DataCite to help researchers explore publications, authors, and datasets.

## Explore research

| Find | Refine | Keep and export |
| --- | --- | --- |
| Search publications and authors in OpenAlex and Crossref, or search datasets in DataCite. | Filter by year and publication type, sort results, and move through pages. | Save records in this browser and export BibTeX, RIS, or CSV files. |

Dataset results show license, access, documentation, and related publications when the source provides those details. The interface supports light and dark themes and adapts to small screens.

## Sources and limits

| Source | Records |
| --- | --- |
| [OpenAlex](https://docs.openalex.org/) | Publications and authors |
| [Crossref](https://www.crossref.org/documentation/retrieve-metadata/rest-api/) | Registered scholarly works and authors |
| [DataCite](https://support.datacite.org/docs/api) | Research datasets and their metadata |

Coverage and metadata quality vary by source, so a search can return partial results. Nidara deduplicates records by DOI when possible; similar titles alone are not enough to combine records. Completeness sorting measures available metadata, not scientific relevance. Licenses, access, and file links are shown only when supplied by the source; verify them with the original record before reuse.

Saved records remain in the browser's local storage.

## Publishing

GitHub Actions verifies pull requests to `develop` and `main`. After a pull request is merged into `main`, the workflow rebuilds the Portuguese, English, and Spanish routes and deploys them to GitHub Pages. Set the Pages source to **GitHub Actions**.

## Support

If Nidara is useful in your research, you can support its continued development.

<p align="left">
  <a href="https://github.com/sponsors/diegopn"><img alt="Sponsor Nidara" src="https://img.shields.io/badge/Sponsor_Nidara-EA4AAA?style=for-the-badge&logo=githubsponsors&logoColor=white"></a>
</p>

## Community

Read the [contribution guidelines](CONTRIBUTING.md), [Code of Conduct](CODE_OF_CONDUCT.md), and [security policy](SECURITY.md) before participating.

## License

Nidara is distributed under the [MIT License](LICENSE).
