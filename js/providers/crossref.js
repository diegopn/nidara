import { normalizeDoi, normalizePublicationYear, safeExternalUrl, selectWorkTitle } from "../core/work-utils.js";

const ENDPOINT = "https://api.crossref.org/v1/works";
const PAGE_SIZE = 15;
const TYPES = {
  article: ["journal-article", "proceedings-article"],
  preprint: ["posted-content"],
  dataset: ["dataset"],
  book: ["book", "monograph", "book-chapter"]
};
const FIELDS = "DOI,URL,title,author,issued,published,container-title,is-referenced-by-count,abstract,type,license";

export async function searchWorks({ query, yearFrom, yearTo, type = "all", sort = "relevance", page = 1, signal }) {
  const url = new URL(ENDPOINT);
  const offset = (page - 1) * PAGE_SIZE;
  url.searchParams.set("query", query);
  url.searchParams.set("rows", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("select", FIELDS);

  const filters = [];
  if (yearFrom) filters.push("from-pub-date:" + yearFrom + "-01-01");
  if (yearTo) filters.push("until-pub-date:" + yearTo + "-12-31");
  for (const value of TYPES[type] || []) filters.push("type:" + value);
  if (filters.length) url.searchParams.set("filter", filters.join(","));
  if (sort === "newest") url.searchParams.set("sort", "published");
  else if (sort === "cited") url.searchParams.set("sort", "is-referenced-by-count");
  else url.searchParams.set("sort", "score");
  if (sort !== "relevance") url.searchParams.set("order", "desc");

  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) {
    const error = new Error("Crossref retornou HTTP " + response.status + ".");
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  const message = data.message || {};
  const total = Number(message["total-results"]) || 0;
  const items = (Array.isArray(message.items) ? message.items : []).map(normalizeWork);
  return { total, items, hasMore: offset + items.length < Math.min(total, 10000) && items.length > 0 };
}

function normalizeWork(work) {
  const doi = normalizeDoi(work.DOI);
  const doiUrl = doi ? "https://doi.org/" + doi : "";
  const url = doiUrl || safeExternalUrl(work.URL);
  const publicationDate = work.published?.["date-parts"]?.[0] || work.issued?.["date-parts"]?.[0];
  const authors = (work.author || []).slice(0, 8).map(author => [author.given, author.family].filter(Boolean).join(" ").trim()).filter(Boolean);
  const type = typeof work.type === "string" ? work.type : "";

  return {
    id: doi || safeExternalUrl(work.URL),
    providerId: "crossref",
    title: selectWorkTitle((Array.isArray(work.title) ? work.title : []).map(stripMarkup)),
    authors,
    year: normalizePublicationYear(publicationDate?.[0]),
    journal: Array.isArray(work["container-title"]) ? work["container-title"][0] || "" : "",
    type,
    citations: Number.isFinite(work["is-referenced-by-count"]) ? work["is-referenced-by-count"] : null,
    doi,
    url: url || "https://www.crossref.org/",
    openAccess: hasOpenLicense(work.license),
    abstract: stripMarkup(work.abstract || "").slice(0, 900),
    sources: [{ id: "crossref", label: "Crossref" }],
    provenance: { title: "Crossref", authors: "Crossref", year: "Crossref", journal: "Crossref", citations: "Crossref" }
  };
}

function hasOpenLicense(licenses) {
  return (licenses || []).some(entry => {
    const licenseUrl = safeExternalUrl(entry.URL || "");
    const start = entry.start?.["date-parts"]?.[0];
    const current = new Date();
    const startYear = Number(start?.[0]);
    const startMonth = Number(start?.[1] || 1);
    const startDay = Number(start?.[2] || 1);
    const active = !Number.isInteger(startYear) || new Date(startYear, startMonth - 1, startDay) <= current;
    return active && /creativecommons\.org\/licenses\//i.test(licenseUrl);
  });
}

function stripMarkup(value) {
  return String(value)
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Math.min(Number(code), 0x10ffff)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Math.min(parseInt(code, 16), 0x10ffff)))
    .replace(/\s+/g, " ")
    .trim();
}
