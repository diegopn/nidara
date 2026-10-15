import { normalizeDoi, normalizePublicationYear, safeExternalUrl, selectWorkTitle } from "../core/work-utils.js";

const ENDPOINT = "https://api.crossref.org/v1/works";
const PAGE_SIZE = 15;
const TYPES = {
  article: ["journal-article", "proceedings-article"],
  preprint: ["posted-content"],
  dataset: ["dataset"],
  book: ["book", "monograph", "book-chapter"]
};
const FIELDS = "DOI,URL,title,author,issued,published,container-title,publisher,subject,is-referenced-by-count,abstract,type,license";

export async function searchWorks({ query, yearFrom, yearTo, fromDate, toDate, type = "all", openAccessOnly = false, sort = "relevance", page = 1, signal }) {
  const typeValues = TYPES[type] || [];
  const requestedTypes = typeValues.length ? typeValues : [""];
  const rows = typeValues.length ? Math.floor(PAGE_SIZE / typeValues.length) : PAGE_SIZE;
  const results = await Promise.all(requestedTypes.map(async typeValue => {
    const offset = (page - 1) * rows;
    const url = new URL(ENDPOINT);
    url.searchParams.set("query", query);
    url.searchParams.set("rows", String(rows));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("select", FIELDS);

    const filters = [];
    if (fromDate || yearFrom) filters.push("from-pub-date:" + (fromDate || yearFrom + "-01-01"));
    if (toDate || yearTo) filters.push("until-pub-date:" + (toDate || yearTo + "-12-31"));
    if (openAccessOnly) filters.push("has-license:true");
    if (typeValue) filters.push("type:" + typeValue);
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
    const rawItems = Array.isArray(message.items) ? message.items : [];
    return {
      total,
      offset,
      rows,
      items: rawItems.map(normalizeWork),
      hasMore: offset + rawItems.length < Math.min(total, 10000) && rawItems.length > 0
    };
  }));

  const items = results.flatMap(result => result.items.filter(work => !openAccessOnly || work.openAccess === true));
  return {
    total: openAccessOnly ? null : results.reduce((sum, result) => sum + result.total, 0),
    items,
    hasMore: results.some(result => result.hasMore)
  };
}

export function normalizeWork(work) {
  const doi = normalizeDoi(work.DOI);
  const doiUrl = doi ? "https://doi.org/" + doi : "";
  const url = doiUrl || safeExternalUrl(work.URL);
  const publicationDate = work.published?.["date-parts"]?.[0] || work.issued?.["date-parts"]?.[0];
  const authors = (work.author || []).map(author => [author.given, author.family].filter(Boolean).join(" ").trim()).filter(Boolean);
  const authorProfiles = (work.author || []).map(author => {
    const name = [author.given, author.family].filter(Boolean).join(" ").trim();
    if (!name) return null;
    return {
      name,
      profileUrl: safeExternalUrl(author.URL),
      orcid: safeExternalUrl(author.ORCID),
      email: typeof author.email === "string" ? author.email.trim().slice(0, 254) : ""
    };
  }).filter(Boolean);
  const type = typeof work.type === "string" ? work.type : "";
  const abstract = stripMarkup(work.abstract || "").slice(0, 8000);
  const authorProfilesForDataset = (work.author || []).map(author => ({
    name: [author.given, author.family].filter(Boolean).join(" ").trim(),
    orcid: safeExternalUrl(author.ORCID),
    affiliations: (Array.isArray(author.affiliation) ? author.affiliation : []).map(affiliation => typeof affiliation === "string" ? affiliation : affiliation?.name).filter(Boolean)
  })).filter(creator => creator.name);
  const datasetMetadata = type.toLowerCase() === "dataset" ? {
    source: "Crossref",
    landingPage: safeExternalUrl(work.URL),
    publisher: typeof work.publisher === "string" ? work.publisher.trim() : "",
    resourceType: "Dataset",
    description: abstract,
    licenses: (work.license || []).map(entry => {
      const url = safeExternalUrl(entry.URL || "");
      return { label: crossrefLicenseLabel(url), identifier: "", url };
    }).filter(license => license.label || license.url),
    version: "",
    subjects: [...new Set((work.subject || []).filter(value => typeof value === "string" && value.trim()).map(value => value.trim()))],
    formats: [],
    sizes: [],
    locations: [],
    periods: [],
    funding: [],
    creators: authorProfilesForDataset,
    related: [],
    accessUrls: [],
    updated: ""
  } : undefined;

  return {
    id: doi || safeExternalUrl(work.URL),
    providerId: "crossref",
    title: selectWorkTitle((Array.isArray(work.title) ? work.title : []).map(stripMarkup)),
    authors,
    authorProfiles,
    year: normalizePublicationYear(publicationDate?.[0]),
    journal: Array.isArray(work["container-title"]) ? work["container-title"][0] || "" : "",
    type,
    citations: Number.isFinite(work["is-referenced-by-count"]) ? work["is-referenced-by-count"] : null,
    doi,
    url: url || "https://www.crossref.org/",
    openAccess: type.toLowerCase() === "dataset" ? hasOpenDatasetLicense(work.license) : hasOpenLicense(work.license),
    abstract: abstract.slice(0, 900),
    datasetMetadata,
    sources: [{ id: "crossref", label: "Crossref" }],
    provenance: { title: "Crossref", authors: "Crossref", year: "Crossref", journal: "Crossref", citations: "Crossref" }
  };
}

function hasOpenDatasetLicense(licenses) {
  return (licenses || []).some(entry => {
    const url = safeExternalUrl(entry.URL || "");
    return /creativecommons\.org\/(?:publicdomain\/zero|licenses\/by(?:-sa)?\/\d)/i.test(url);
  }) ? true : null;
}

function crossrefLicenseLabel(url) {
  const match = url.match(/creativecommons\.org\/licenses\/([^/]+)\/(\d+(?:\.\d+)?)/i);
  if (match) return `CC ${match[1].replace(/-/g, " ").toUpperCase()} ${match[2]}`;
  if (/creativecommons\.org\/publicdomain\/zero\/(\d+(?:\.\d+)?)/i.test(url)) return "CC0";
  return url;
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
    return active && /creativecommons\.org\/(?:licenses\/|publicdomain\/zero\/)/i.test(licenseUrl);
  }) ? true : null;
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
