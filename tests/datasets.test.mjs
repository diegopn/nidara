import assert from "node:assert/strict";
import { normalizeWork, searchWorks } from "../js/providers/datacite.js";
import { normalizeWork as normalizeCrossrefWork } from "../js/providers/crossref.js";
import { normalizeWork as normalizeOpenAlexWork } from "../js/providers/openalex.js";
import { filterDatasets, datasetComparisonRows, datasetFilterOptions, datasetMetadataCompletenessScore, hasRelatedPublication, rankDatasets } from "../js/core/dataset-utils.js";
import { federatedSearch } from "../js/core/federated-search.js";
import { mergeWorks } from "../js/core/work-utils.js";

const sourceRecord = {
  id: "10.5555/air.1",
  attributes: {
    doi: "10.5555/air.1",
    titles: [{ title: "Air quality observations in São Paulo" }],
    publicationYear: 2024,
    publisher: "Zenodo",
    types: { resourceTypeGeneral: "Dataset", resourceType: "Air quality measurements" },
    creators: [{
      name: "Ana Lima",
      affiliation: [{ name: "University of São Paulo" }],
      nameIdentifiers: [{ nameIdentifier: "https://orcid.org/0000-0001-2345-6789", nameIdentifierScheme: "ORCID" }]
    }],
    descriptions: [
      { descriptionType: "Abstract", description: "Hourly PM2.5 measurements collected in São Paulo." },
      { descriptionType: "Methods", description: "Sensors were calibrated before hourly sampling." },
      { descriptionType: "TechnicalInfo", description: "Each row is one hourly observation; PM2.5 is measured in µg/m³." }
    ],
    rightsList: [{
      rights: "Creative Commons Attribution 4.0",
      rightsUri: "https://creativecommons.org/licenses/by/4.0/",
      rightsIdentifier: "cc-by-4.0"
    }],
    version: "2.1",
    subjects: [{ subject: "Air pollution" }],
    formats: ["text/csv", "application/netcdf"],
    sizes: ["15 MB"],
    relatedIdentifiers: [{
      relatedIdentifier: "10.1016/example.2024.1",
      relatedIdentifierType: "DOI",
      relationType: "IsSupplementTo",
      resourceTypeGeneral: "Text"
    }],
    geoLocations: [{ geoLocationPlace: "São Paulo, Brazil" }],
    dates: [{ date: "2023-01/2024-01", dateType: "Collected" }],
    fundingReferences: [{ funderName: "FAPESP", awardNumber: "2024/12345-6" }],
    contentUrl: ["https://zenodo.org/records/123/files/air.csv"],
    url: "https://zenodo.org/records/123",
    citationCount: 12,
    downloadCount: 45,
    viewCount: 180,
    updated: "2026-01-02T00:00:00Z"
  }
};

const work = normalizeWork(sourceRecord);
assert.equal(work.type, "dataset");
assert.equal(work.title, "Air quality observations in São Paulo");
assert.equal(work.url, "https://zenodo.org/records/123");
assert.equal(work.openAccess, true);
assert.equal(work.citations, 12);
assert.equal(work.downloads, 45);
assert.equal(work.views, 180);
assert.deepEqual(work.authors, ["Ana Lima"]);
assert.deepEqual(work.datasetMetadata, {
  source: "DataCite",
  landingPage: "https://zenodo.org/records/123",
  publisher: "Zenodo",
  resourceType: "Air quality measurements",
  description: "Hourly PM2.5 measurements collected in São Paulo.",
  methods: ["Sensors were calibrated before hourly sampling."],
  technicalInfo: ["Each row is one hourly observation; PM2.5 is measured in µg/m³."],
  licenses: [{ label: "Creative Commons Attribution 4.0", identifier: "cc-by-4.0", url: "https://creativecommons.org/licenses/by/4.0/" }],
  version: "2.1",
  subjects: ["Air pollution"],
  formats: ["text/csv", "application/netcdf"],
  sizes: ["15 MB"],
  locations: ["São Paulo, Brazil"],
  periods: ["2023-01/2024-01"],
  funding: [{ funder: "FAPESP", award: "2024/12345-6", title: "", url: "" }],
  creators: [{ name: "Ana Lima", orcid: "https://orcid.org/0000-0001-2345-6789", affiliations: ["University of São Paulo"] }],
  related: [{ title: "10.1016/example.2024.1", url: "https://doi.org/10.1016/example.2024.1", relation: "IsSupplementTo", resourceType: "Text" }],
  accessUrls: ["https://zenodo.org/records/123/files/air.csv"],
  updated: "2026-01-02T00:00:00Z"
});
const methodsOnly = normalizeWork({ attributes: {
  types: { resourceTypeGeneral: "Dataset" },
  descriptions: [{ descriptionType: "Methods", description: "Repeated sensor calibration." }]
} });
assert.equal(methodsOnly.datasetMetadata.description, "", "Methods must not be mislabeled as the dataset abstract");
assert.deepEqual(methodsOnly.datasetMetadata.methods, ["Repeated sensor calibration."]);

const restricted = normalizeWork({ id: "10.5555/closed.1", attributes: {
  doi: "10.5555/closed.1",
  titles: [{ title: "Restricted observations" }],
  types: { resourceTypeGeneral: "Dataset" },
  rightsList: [{ rights: "All rights reserved" }]
} });
const unknownLicense = normalizeWork({ id: "10.5555/unknown.1", attributes: {
  doi: "10.5555/unknown.1",
  titles: [{ title: "Undeclared license" }],
  types: { resourceTypeGeneral: "Dataset" }
} });
assert.equal(restricted.openAccess, false);
assert.equal(unknownLicense.openAccess, null);
const unclearLicense = { ...unknownLicense, id: "unclear-license", datasetMetadata: {
  ...unknownLicense.datasetMetadata,
  licenses: [{ label: "CC BY-NC 4.0" }]
} };

const crossrefDataset = normalizeCrossrefWork({
  DOI: "10.5555/crossref.1",
  URL: "https://datadryad.org/stash/dataset/1",
  title: ["Forest measurements"],
  type: "dataset",
  publisher: "Dryad",
  subject: ["Forestry", "Ecology"],
  abstract: "Measurements of forest growth.",
  license: [{ URL: "https://creativecommons.org/licenses/by/4.0/" }]
});
assert.equal(crossrefDataset.datasetMetadata.publisher, "Dryad");
assert.equal(crossrefDataset.datasetMetadata.description, "Measurements of forest growth.");
assert.deepEqual(crossrefDataset.datasetMetadata.subjects, ["Forestry", "Ecology"]);
assert.equal(crossrefDataset.datasetMetadata.licenses[0].url, "https://creativecommons.org/licenses/by/4.0/");

const openAlexDataset = normalizeOpenAlexWork({
  id: "https://openalex.org/W1",
  doi: "https://doi.org/10.5555/openalex.1",
  display_name: "Forest measurements from OpenAlex",
  type: "dataset",
  publication_year: 2023,
  open_access: { is_oa: true },
  primary_location: { landing_page_url: "https://figshare.com/articles/dataset/1", source: { display_name: "Figshare" } },
  authorships: [{
    author: { display_name: "Rita Costa", orcid: "https://orcid.org/0000-0002-1234-5678" },
    institutions: [{ display_name: "Federal University" }]
  }],
  abstract_inverted_index: { Forest: [0], measurements: [1] }
});
assert.equal(openAlexDataset.datasetMetadata.publisher, "Figshare");
assert.equal(openAlexDataset.openAccess, null, "OpenAlex read access does not declare a dataset reuse license");
assert.equal(openAlexDataset.datasetMetadata.description, "Forest measurements");
assert.deepEqual(openAlexDataset.datasetMetadata.accessUrls, [], "A repository landing page must not be presented as a direct data file");
assert.deepEqual(openAlexDataset.datasetMetadata.creators[0].affiliations, ["Federal University"]);
const openAlexFile = normalizeOpenAlexWork({
  id: "https://openalex.org/W2",
  display_name: "Downloadable dataset",
  type: "dataset",
  primary_location: { landing_page_url: "https://figshare.com/datasets/2", pdf_url: "https://figshare.com/files/data.csv" }
});
assert.deepEqual(openAlexFile.datasetMetadata.accessUrls, [], "A PDF link is not reliable evidence of a direct dataset file");

const options = datasetFilterOptions([work, restricted, unknownLicense]);
assert.deepEqual(options.repositories, ["Zenodo"]);
assert.deepEqual(options.formats, ["application/netcdf", "text/csv"]);
assert.deepEqual(filterDatasets([work, restricted, unknownLicense], { repository: "Zenodo" }), [work]);
assert.deepEqual(filterDatasets([work, restricted, unknownLicense], { format: "text/csv" }), [work]);
assert.deepEqual(filterDatasets([work, restricted, unknownLicense], { hasRelated: true }), [work]);
assert.equal(hasRelatedPublication({ related: [{ resourceType: "Text", relation: "IsSupplementTo" }] }), true);
assert.equal(hasRelatedPublication({ related: [{ resourceType: "Dataset", relation: "IsVersionOf" }] }), false,
  "Related datasets must not satisfy the publication filter");
assert.equal(filterDatasets([
  work,
  { ...work, id: "related-dataset", datasetMetadata: { ...work.datasetMetadata, related: [{ resourceType: "Dataset" }] } }
], { hasRelated: true }).length, 1);
assert.deepEqual(filterDatasets([work, restricted, unknownLicense], { location: "são paulo" }), [work]);
assert.equal(filterDatasets([work, restricted, unknownLicense], { openLicenseOnly: true }).length, 1);
const comparison = datasetComparisonRows([work, restricted, unknownLicense, unclearLicense]);
assert.deepEqual(comparison.find(row => row.key === "datasetFileAvailability")?.values, [{ count: 1 }, null, null, null]);
assert.deepEqual(comparison.find(row => row.key === "datasetLicenseStatus")?.values, ["open", "restricted", "unknown", "other"]);
assert.equal(comparison.find(row => row.key === "datasetRelated")?.values[0][0].relation, "IsSupplementTo");
assert.equal(comparison.find(row => row.key === "datasetDataMethods")?.values[0], "Sensors were calibrated before hourly sampling.");
assert.equal(comparison.find(row => row.key === "datasetTechnicalInfo")?.values[0], "Each row is one hourly observation; PM2.5 is measured in µg/m³.");
const lowReadiness = { id: "missing-metadata", datasetMetadata: { accessUrls: [], licenses: [], formats: [], description: "" } };
const highReadiness = { id: "ready-to-use", datasetMetadata: { accessUrls: ["https://repo.org/data.csv"], licenses: [{ identifier: "cc-by-4.0" }], formats: ["text/csv"], description: "Documented data" } };
assert.deepEqual(rankDatasets([lowReadiness, highReadiness], "relevance"), [highReadiness, lowReadiness]);
const listedRestrictedLicense = { id: "listed-license", openAccess: null, datasetMetadata: { licenses: [{ label: "Terms listed" }] } };
const explicitlyOpenLicense = { id: "open-license", openAccess: true, datasetMetadata: { licenses: [{ label: "CC BY 4.0" }] } };
assert.equal(datasetMetadataCompletenessScore(listedRestrictedLicense), datasetMetadataCompletenessScore(explicitlyOpenLicense),
  "Metadata completeness must not treat an open license as more complete than another listed license");
assert.deepEqual(rankDatasets([listedRestrictedLicense, explicitlyOpenLicense], "relevance"), [listedRestrictedLicense, explicitlyOpenLicense],
  "Ties in metadata completeness must keep their existing order");
assert.deepEqual(rankDatasets([lowReadiness, highReadiness], "newest"), [lowReadiness, highReadiness],
  "Explicit user sorts must keep their source order");

const merged = mergeWorks({ ...work, datasetMetadata: {
  ...work.datasetMetadata,
  source: "OpenAlex",
  description: "Short description",
  creators: [{ name: "Ana Lima", orcid: "https://orcid.org/0000-0001-2345-6789", affiliations: [] }]
} }, {
  ...work,
  datasetMetadata: { ...work.datasetMetadata, description: "Full authoritative description" }
});
assert.equal(merged.datasetMetadata.description, "Full authoritative description");
assert.equal(merged.datasetMetadata.related.length, 1);
assert.equal(merged.datasetMetadata.creators.length, 1, "A DOI match should combine creator metadata without repeating the same ORCID");

const openAlexReadAccess = { ...openAlexDataset, doi: unknownLicense.doi };
assert.equal(
  mergeWorks(unknownLicense, openAlexReadAccess).openAccess,
  null,
  "OpenAlex read access must not imply a reusable license when DataCite has none"
);
assert.equal(
  mergeWorks(openAlexReadAccess, unknownLicense).openAccess,
  null,
  "DataCite's unknown reuse license must remain unknown regardless of provider order"
);
assert.equal(
  mergeWorks(restricted, { ...openAlexReadAccess, doi: restricted.doi }).openAccess,
  false,
  "OpenAlex read access must not override DataCite's explicit reuse restriction"
);

const originalFetch = globalThis.fetch;
try {
  let requestUrl;
  globalThis.fetch = async input => {
    requestUrl = new URL(input);
    return {
      ok: true,
      json: async () => ({
        meta: { total: 31, totalPages: 3, page: 2 },
        data: [sourceRecord]
      })
    };
  };

  const result = await searchWorks({
    query: "air quality",
    type: "dataset",
    fromDate: "2020-01-01",
    toDate: "2024-12-31",
    sort: "newest",
    page: 2
  });
  assert.equal(requestUrl.origin, "https://api.datacite.org");
  assert.equal(requestUrl.pathname, "/dois");
  assert.equal(requestUrl.searchParams.get("resource-type-id"), "dataset");
  assert.match(requestUrl.searchParams.get("query"), /air quality/);
  assert.match(requestUrl.searchParams.get("query"), /publicationYear:\[2020 TO 2024\]/);
  assert.equal(requestUrl.searchParams.get("page[number]"), "2");
  assert.equal(requestUrl.searchParams.get("page[size]"), "15");
  assert.equal(requestUrl.searchParams.get("sort"), "-published");
  assert.equal(requestUrl.searchParams.get("disable-facets"), "true");
  assert.equal(requestUrl.searchParams.get("affiliation"), "true");
  assert.equal(result.total, 31);
  assert.equal(result.hasMore, true);
  assert.equal(result.items[0].downloads, 45);

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ meta: { total: 80, totalPages: 6 }, data: [sourceRecord, {
      id: "10.5555/nonopen.1",
      attributes: {
        doi: "10.5555/nonopen.1",
        titles: [{ title: "Non-open data" }],
        types: { resourceTypeGeneral: "Dataset" },
        rightsList: [{ rights: "CC BY-NC 4.0", rightsIdentifier: "cc-by-nc-4.0" }]
      }
    }] })
  });
  const openResults = await searchWorks({ query: "air", type: "dataset", openAccessOnly: true, page: 1 });
  assert.equal(openResults.total, null);
  assert.deepEqual(openResults.items.map(item => item.title), ["Air quality observations in São Paulo"]);

  let unsupportedTypeFetch = false;
  globalThis.fetch = async () => { unsupportedTypeFetch = true; throw new Error("should not query for publications"); };
  const unsupportedType = await federatedSearch({
    filters: { query: "air", type: "article", sort: "relevance" },
    pages: { datacite: 1 },
    sourceIds: ["datacite"]
  });
  assert.deepEqual(unsupportedType.sources, []);
  assert.equal(unsupportedTypeFetch, false);

  globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.hostname === "api.datacite.org") {
      const downloads = url.searchParams.get("sort") === "-download-count" ? [
        { doi: "10.5555/data-low", title: "Lower downloads", downloadCount: 10 },
        { doi: "10.5555/data-high", title: "Higher downloads", downloadCount: 100 }
      ] : [];
      return { ok: true, json: async () => ({ meta: { total: downloads.length, totalPages: 1 }, data: downloads.map(item => ({
        id: item.doi,
        attributes: { doi: item.doi, titles: [{ title: item.title }], types: { resourceTypeGeneral: "Dataset" }, downloadCount: item.downloadCount }
      })) }) };
    }
    return { ok: true, json: async () => ({ meta: { count: 1 }, results: [{
      id: "https://openalex.org/Wdataset",
      doi: "10.5555/data-openalex",
      display_name: "Dataset without download metrics",
      type: "dataset"
    }] }) };
  };
  const downloadSorted = await federatedSearch({
    filters: { query: "dataset downloads", type: "dataset", sort: "downloads" },
    pages: { openalex: 1, datacite: 1 },
    sourceIds: ["openalex", "datacite"]
  });
  assert.deepEqual(downloadSorted.items.map(item => item.title), [
    "Higher downloads", "Lower downloads", "Dataset without download metrics"
  ]);

  let skippedFetch = false;
  globalThis.fetch = async () => { skippedFetch = true; throw new Error("should not query for non-datasets"); };
  const nonDatasetResults = await searchWorks({ query: "air", type: "article" });
  assert.deepEqual(nonDatasetResults, { total: 0, items: [], hasMore: false });
  assert.equal(skippedFetch, false);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Dataset metadata, filters, and DataCite search passed.");
