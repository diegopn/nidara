import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { mergeWorks } from "../js/core/work-utils.js";

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

const merged = mergeWorks(
  { id: "doi:10.1234/ana", authors: ["Ana Lima"], authorProfiles: [{ name: "Ana Lima", profileUrl: "https://openalex.org/A1", orcid: "", email: "" }] },
  { id: "doi:10.1234/ana", authors: ["Ana Lima"], authorProfiles: [{ name: "Ana Lima", profileUrl: "", orcid: "https://orcid.org/0000-0001-2345-6789", email: "ana@example.org" }] }
);
assert.equal(merged.authorProfiles.length, 1);
assert.equal(merged.authorProfiles[0].profileUrl, "https://openalex.org/A1");
assert.equal(merged.authorProfiles[0].orcid, "https://orcid.org/0000-0001-2345-6789");
assert.equal(merged.authorProfiles[0].email, "ana@example.org");

const unsafeContact = summarizeAuthors([{
  authors: ["Ana Lima"],
  authorProfiles: [{ name: "Ana Lima", profileUrl: "javascript:alert(1)", email: "not an email" }]
}]);
assert.deepEqual(unsafeContact[0].links, []);
assert.deepEqual(unsafeContact[0].emails, []);

console.log("Author profiles and relevant works passed.");
