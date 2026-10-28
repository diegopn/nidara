import assert from "node:assert/strict";
import { serializeWorks } from "../js/core/export.js";

const types = [
  ["article", "JOUR"],
  ["journal-article", "JOUR"],
  ["proceedings-article", "CONF"],
  ["book", "BOOK"],
  ["book-chapter", "CHAP"],
  ["dataset", "DATA"]
];
for (const [type, expected] of types) {
  assert.match(serializeWorks([{ title: "Record", type }], "ris"), new RegExp(`^TY  - ${expected}\\r\\n`));
}

const authors = Array.from({ length: 14 }, (_, index) => `Researcher ${index + 1}`);
const complete = { title: "Full authorship", type: "article", authors, year: 2026 };
const ris = serializeWorks([complete], "ris");
const bibtex = serializeWorks([complete], "bibtex");
for (const author of authors) {
  assert.ok(ris.includes(`AU  - ${author}`), `RIS must include ${author}`);
  assert.ok(bibtex.includes(author), `BibTeX must include ${author}`);
}
assert.match(bibtex, /^@article\{/);
assert.match(serializeWorks([{ title: "Chapter", type: "book-chapter" }], "bibtex"), /^@incollection\{/);
assert.match(serializeWorks([{ title: "Conference", type: "proceedings-article" }], "bibtex"), /^@inproceedings\{/);

const csv = serializeWorks([{ title: "=HYPERLINK(\"https://example.org\")", authors: ["-1+1"], year: 2026 }], "csv");
assert.ok(csv.includes("'=HYPERLINK"), "CSV cells beginning with formulas must be neutralized");
assert.ok(csv.includes("'-1+1"), "CSV cells beginning with a minus sign must be neutralized");

const dataset = {
  type: "dataset",
  title: "Air observations",
  authors: ["Ana Lima"],
  year: 2024,
  doi: "10.5555/air.1",
  url: "https://doi.org/10.5555/air.1",
  openAccess: true,
  sources: [{ label: "DataCite" }],
  datasetMetadata: {
    publisher: "Zenodo",
    landingPage: "https://zenodo.org/records/123",
    description: "Air quality measurements",
    methods: ["Hourly measurements"],
    technicalInfo: ["PM2.5 in µg/m³"],
    licenses: [{ label: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" }],
    formats: ["text/csv"],
    sizes: ["15 MB"],
    periods: ["2023–2024"],
    locations: ["São Paulo, Brazil"],
    subjects: ["Air pollution"],
    accessUrls: ["=HYPERLINK(\"https://zenodo.org/records/123/files/air.csv\")"],
    related: [{ title: "Study of air pollution", url: "https://doi.org/10.5555/study.1", resourceType: "Text", relation: "IsSupplementTo" }],
    version: "2.1",
    updated: "2026-01-02T00:00:00Z"
  }
};
const datasetCsv = serializeWorks([complete, dataset], "dataset-csv");
assert.ok(datasetCsv.startsWith("\uFEFF"), "Dataset shortlist CSV must open cleanly in spreadsheet applications");
assert.ok(datasetCsv.includes("Zenodo") && datasetCsv.includes("CC BY 4.0"));
assert.ok(datasetCsv.includes("Hourly measurements") && datasetCsv.includes("São Paulo, Brazil"));
assert.ok(datasetCsv.includes("'=HYPERLINK"), "Dataset links must keep CSV formula injection protection");
assert.ok(!datasetCsv.includes("Full authorship"), "Dataset shortlist CSV must include datasets only");
assert.throws(() => serializeWorks([complete], "dataset-csv"), /Não há registros carregados para exportar/);

console.log("Bibliographic exports passed.");
