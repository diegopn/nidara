import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { mergeWorks } from "../js/core/work-utils.js";
import { normalizeWork as normalizeOpenAlexWork } from "../js/providers/openalex.js";
import { normalizeWork as normalizeCrossrefWork } from "../js/providers/crossref.js";
import { normalizeWork as normalizeDataCiteWork } from "../js/providers/datacite.js";

const modulePath = fileURLToPath(new URL("../js/core/author-utils.js", import.meta.url));
const moduleExists = await access(modulePath).then(() => true, () => false);
assert.ok(moduleExists, "Author utilities must collect profile links and email alongside search-matched works");
const { summarizeAuthors, worksForAuthor } = await import(modulePath);

const works = [
  {
    title: "Less cited paper", authors: ["Ana Lima"], citations: 12, year: 2022,
    authorProfiles: [{ name: "Ana Lima", profileUrl: "https://openalex.org/A1", orcid: "https://orcid.org/0000-0001-2345-6789", email: "ana@example.org" }]
  },
  {
    title: "Most cited paper", authors: ["Ana Lima"], citations: 80, year: 2020,
    authorProfiles: [{ name: "Ana Lima", profileUrl: "https://openalex.org/A1", orcid: "", email: "" }]
  },
  { title: "Different author", authors: ["Bruno Reis"], citations: 100, year: 2024 }
];

const authors = summarizeAuthors(works, "pt-BR");
assert.equal(authors[0].name, "Ana Lima");
assert.equal(authors[0].records, 2);
assert.equal(authors[0].emails[0], "ana@example.org");
assert.deepEqual(authors[0].links.map(link => link.label).sort(), ["ORCID", "OpenAlex"]);
assert.deepEqual(worksForAuthor(works, "Ana Lima").map(work => work.title), ["Most cited paper", "Less cited paper"]);

const namesakeWorks = [
  { title: "First researcher", authors: ["Alex Kim"], authorProfiles: [{ name: "Alex Kim", orcid: "https://orcid.org/0000-0001-1111-1111" }] },
  { title: "Second researcher", authors: ["Alex Kim"], authorProfiles: [{ name: "Alex Kim", orcid: "https://orcid.org/0000-0002-2222-2222" }] }
];
const namesakes = summarizeAuthors(namesakeWorks, "en");
assert.equal(namesakes.length, 2, "Distinct ORCIDs must not collapse same-name researchers into one author");
assert.deepEqual(worksForAuthor(namesakeWorks, namesakes[0], "en").map(work => work.title), ["First researcher"]);
assert.deepEqual(worksForAuthor(namesakeWorks, namesakes[1], "en").map(work => work.title), ["Second researcher"]);
assert.deepEqual(worksForAuthor([{
  title: "Record without identifiers",
  authors: ["Alex Kim"],
  authorProfiles: [{ name: "Alex Kim", orcid: "", profileUrl: "" }]
}], namesakes[0], "en").map(work => work.title), ["Record without identifiers"],
"Name matching remains available when a source does not provide an author identifier");

const manyNames = Array.from({ length: 15 }, (_, index) => ({ given: `Author${index}`, family: "Researcher" }));
assert.equal(normalizeCrossrefWork({ author: manyNames }).authors.length, 15);
assert.equal(normalizeOpenAlexWork({ authorships: manyNames.map((author, index) => ({ author: { display_name: `${author.given} ${author.family}`, id: `https://openalex.org/A${index}` } })) }).authorProfiles.length, 15);
const dataCiteManyAuthors = normalizeDataCiteWork({ attributes: {
  types: { resourceTypeGeneral: "Dataset" },
  creators: manyNames.map(author => ({ name: `${author.given} ${author.family}` }))
} });
assert.equal(dataCiteManyAuthors.authors.length, 15);
assert.equal(dataCiteManyAuthors.datasetMetadata.creators.length, 15);

const merged = mergeWorks(
  { id: "doi:10.1234/ana", authors: ["Ana Lima"], authorProfiles: [{ name: "Ana Lima", profileUrl: "https://openalex.org/A1", orcid: "", email: "" }] },
  { id: "doi:10.1234/ana", authors: ["Ana Lima"], authorProfiles: [{ name: "Ana Lima", profileUrl: "https://openalex.org/A1", orcid: "https://orcid.org/0000-0001-2345-6789", email: "ana@example.org" }] }
);
assert.equal(merged.authorProfiles.length, 1);
assert.equal(merged.authorProfiles[0].profileUrl, "https://openalex.org/A1");
assert.equal(merged.authorProfiles[0].orcid, "https://orcid.org/0000-0001-2345-6789");
assert.equal(merged.authorProfiles[0].email, "ana@example.org");

const sameNameDifferentIds = mergeWorks(
  { id: "doi:10.1234/namesake", authorProfiles: [{ name: "Alex Kim", orcid: "https://orcid.org/0000-0001-1111-1111" }] },
  { id: "doi:10.1234/namesake", authorProfiles: [{ name: "Alex Kim", orcid: "https://orcid.org/0000-0002-2222-2222" }] }
);
assert.equal(sameNameDifferentIds.authorProfiles.length, 2, "Merging provider records must retain distinct researcher IDs");

const unsafeContact = summarizeAuthors([{
  authors: ["Ana Lima"],
  authorProfiles: [{ name: "Ana Lima", profileUrl: "javascript:alert(1)", email: "not an email" }]
}]);
assert.deepEqual(unsafeContact[0].links, []);
assert.deepEqual(unsafeContact[0].emails, []);

console.log("Author profiles and relevant works passed.");
