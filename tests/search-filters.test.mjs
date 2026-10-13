import assert from "node:assert/strict";
import { searchWorks as searchOpenAlex } from "../js/providers/openalex.js";
import { normalizeWork as normalizeCrossrefWork, searchWorks as searchCrossref } from "../js/providers/crossref.js";
import { federatedSearch } from "../js/core/federated-search.js";

const originalFetch = globalThis.fetch;
try {
  let openAlexUrl;
  globalThis.fetch = async input => {
    openAlexUrl = new URL(input);
    return { ok: true, json: async () => ({ meta: { count: 1 }, results: [{
      id: "https://openalex.org/W1", display_name: "Climate paper", authorships: [{ author: {
        id: "https://openalex.org/A1", display_name: "Ana Lima", orcid: "https://orcid.org/0000-0001-2345-6789"
      } }]
    }] }) };
  };
  const openAlexResult = await searchOpenAlex({ query: "climate", openAccessOnly: true, type: "article" });
  assert.match(openAlexUrl.searchParams.get("filter"), /open_access\.is_oa:true/);
  assert.deepEqual(openAlexResult.items[0].authorProfiles, [{
    name: "Ana Lima", profileUrl: "https://openalex.org/A1", orcid: "https://orcid.org/0000-0001-2345-6789", email: ""
  }]);

  const crossrefUrls = [];
  globalThis.fetch = async input => {
    const url = new URL(input);
    crossrefUrls.push(url);
    const type = url.searchParams.get("filter").match(/type:([^,]+)/)?.[1];
    return {
      ok: true,
      json: async () => ({ message: {
        "total-results": 1,
        items: [{ DOI: `10.1234/${type}`, title: [type], type, author: [{
          given: "Ana", family: "Lima", ORCID: "https://orcid.org/0000-0001-2345-6789", email: "ana@example.org"
        }], license: [{ URL: "https://creativecommons.org/licenses/by/4.0/" }] }]
      } })
    };
  };
  const crossrefResults = await searchCrossref({ query: "climate", type: "article", openAccessOnly: true });
  assert.equal(crossrefUrls.length, 2, "Each Crossref article type must be queried separately so OR types are not combined as AND filters");
  assert.deepEqual(crossrefUrls.map(url => url.searchParams.get("filter")).sort(), [
    "has-license:true,type:journal-article",
    "has-license:true,type:proceedings-article"
  ]);
  assert.ok(crossrefResults.items.every(work => work.openAccess === true));
  assert.equal(crossrefResults.items[0].authorProfiles[0].orcid, "https://orcid.org/0000-0001-2345-6789");
  assert.equal(crossrefResults.items[0].authorProfiles[0].email, "ana@example.org");
  assert.equal(crossrefResults.total, null, "Crossref license presence does not establish an exact open-access count");

  assert.equal(normalizeCrossrefWork({ DOI: "10.1234/unknown", license: [] }).openAccess, null);
  assert.equal(normalizeCrossrefWork({ DOI: "10.1234/cc0", license: [{ URL: "https://creativecommons.org/publicdomain/zero/1.0/" }] }).openAccess, true);

  let cachedFetchCount = 0;
  globalThis.fetch = async input => {
    cachedFetchCount += 1;
    return { ok: true, json: async () => ({ meta: { count: 0 }, results: [] }) };
  };
  const common = { query: "open access cache check", type: "all", sort: "relevance" };
  await federatedSearch({ filters: { ...common, openAccessOnly: false }, pages: { openalex: 1 }, sourceIds: ["openalex"] });
  const filtered = await federatedSearch({ filters: { ...common, openAccessOnly: true }, pages: { openalex: 1 }, sourceIds: ["openalex"] });
  assert.equal(cachedFetchCount, 2, "Search cache entries must distinguish the open-access filter");
  assert.equal(filtered.total, 0);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Open access and publication type filters passed.");
