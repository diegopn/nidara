import { normalizeDoi, normalizePublicationYear, safeExternalUrl, selectWorkTitle } from "../core/work-utils.js";

const ENDPOINT = "https://api.openalex.org/works";
const PAGE_SIZE = 15;
const TYPES = { article: "article", preprint: "preprint", dataset: "dataset", book: "book" };

export async function searchWorks({ query, yearFrom, yearTo, fromDate, toDate, type = "all", openAccessOnly = false, sort = "relevance", page = 1, signal }) {
  const url = new URL(ENDPOINT);
  url.searchParams.set("search", query);
  url.searchParams.set("per_page", String(PAGE_SIZE));
  url.searchParams.set("page", String(page));
  url.searchParams.set("select", "id,doi,display_name,publication_year,authorships,primary_location,cited_by_count,open_access,abstract_inverted_index,type");

  const filters = [];
  if (fromDate || yearFrom) filters.push("from_publication_date:" + (fromDate || yearFrom + "-01-01"));
  if (toDate || yearTo) filters.push("to_publication_date:" + (toDate || yearTo + "-12-31"));
  if (TYPES[type]) filters.push("type:" + TYPES[type]);
  if (openAccessOnly) filters.push("open_access.is_oa:true");
  if (filters.length) url.searchParams.set("filter", filters.join(","));
  if (sort === "newest") url.searchParams.set("sort", "publication_date:desc");
  if (sort === "cited") url.searchParams.set("sort", "cited_by_count:desc");

  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (response.status === 409) {
    const error = new Error("O acesso público do OpenAlex atingiu o limite sem chave de API.");
    error.code = "api-key-required";
    throw error;
  }
  if (!response.ok) {
    const error = new Error("OpenAlex retornou HTTP " + response.status + ".");
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const total = Number(data.meta?.count) || 0;
  const items = (Array.isArray(data.results) ? data.results : []).map(normalizeWork);
  return { total, items, hasMore: page * PAGE_SIZE < total && items.length > 0 };
}

export function normalizeWork(work) {
  const doi = normalizeDoi(work.doi);
  const openAlexUrl = safeExternalUrl(work.id);
  const url = doi
    ? "https://doi.org/" + doi
    : safeExternalUrl(work.primary_location?.landing_page_url) || openAlexUrl;
  const authors = (work.authorships || []).map(entry => entry.author?.display_name).filter(Boolean);
  const authorProfiles = (work.authorships || []).map(entry => {
    const author = entry.author || {};
    const name = typeof author.display_name === "string" ? author.display_name.trim() : "";
    if (!name) return null;
    return {
      name,
      profileUrl: safeExternalUrl(author.id),
      orcid: safeExternalUrl(author.orcid || entry.raw_orcid),
      email: ""
    };
  }).filter(Boolean);
  const journal = work.primary_location?.source?.display_name || "";
  const abstract = abstractFromIndex(work.abstract_inverted_index);
  const isDataset = String(work.type || "").toLowerCase() === "dataset";
  const datasetMetadata = isDataset ? {
    source: "OpenAlex",
    landingPage: safeExternalUrl(work.primary_location?.landing_page_url),
    publisher: journal,
    resourceType: "Dataset",
    description: abstract,
    licenses: [],
    version: "",
    subjects: [],
    formats: [],
    sizes: [],
    locations: [],
    periods: [],
    funding: [],
    creators: (work.authorships || []).map(entry => ({
      name: entry.author?.display_name || "",
      orcid: safeExternalUrl(entry.author?.orcid || entry.raw_orcid),
      affiliations: (entry.institutions || []).map(institution => institution.display_name).filter(Boolean)
    })).filter(creator => creator.name),
    related: [],
    accessUrls: [safeExternalUrl(work.primary_location?.pdf_url)].filter(Boolean),
    updated: ""
  } : undefined;

  return {
    id: openAlexUrl || doi,
    providerId: "openalex",
    title: selectWorkTitle(work.display_name),
    authors,
    authorProfiles,
    year: normalizePublicationYear(work.publication_year),
    journal,
    type: typeof work.type === "string" ? work.type : "",
    citations: Number.isFinite(work.cited_by_count) ? work.cited_by_count : null,
    doi,
    url: url || openAlexUrl || "https://openalex.org/",
    openAccess: isDataset ? null : (typeof work.open_access?.is_oa === "boolean" ? work.open_access.is_oa : null),
    abstract,
    datasetMetadata,
    sources: [{ id: "openalex", label: "OpenAlex" }],
    provenance: { title: "OpenAlex", authors: "OpenAlex", year: "OpenAlex", journal: "OpenAlex", citations: "OpenAlex" }
  };
}

function abstractFromIndex(index) {
  if (!index || typeof index !== "object") return "";
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      if (Number.isSafeInteger(position) && position >= 0 && position < 10000) words.push([position, word]);
    }
  }
  words.sort((a, b) => a[0] - b[0]);
  return words.map(entry => entry[1]).join(" ").slice(0, 900);
}
