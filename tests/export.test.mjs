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

console.log("Bibliographic exports passed.");
