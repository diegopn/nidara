import { normalizeDoi, normalizePublicationYear, safeExternalUrl, selectWorkTitle } from "../core/work-utils.js";

const ENDPOINT = "https://api.datacite.org/dois";
const PAGE_SIZE = 15;

export async function searchWorks({ query, yearFrom, yearTo, fromDate, toDate, type = "all", openAccessOnly = false, sort = "relevance", page = 1, signal }) {
  if (type !== "dataset") return { total: 0, items: [], hasMore: false };

  const url = new URL(ENDPOINT);
  url.searchParams.set("resource-type-id", "dataset");
  url.searchParams.set("query", buildQuery(query, yearFrom, yearTo, fromDate, toDate));
  url.searchParams.set("page[size]", String(PAGE_SIZE));
  url.searchParams.set("page[number]", String(page));
  url.searchParams.set("sort", sort === "newest" ? "-published" : sort === "cited" ? "-citation-count" : sort === "downloads" ? "-download-count" : "relevance");
  url.searchParams.set("disable-facets", "true");
  url.searchParams.set("affiliation", "true");

  const response = await fetch(url, { signal, headers: { Accept: "application/vnd.api+json" } });
  if (!response.ok) {
    const error = new Error("DataCite retornou HTTP " + response.status + ".");
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const rawItems = Array.isArray(data.data) ? data.data : [];
  const total = Number.isFinite(data.meta?.total) ? data.meta.total : null;
  const items = rawItems.map(normalizeWork).filter(work => !openAccessOnly || work.openAccess === true);
  const hasMore = Number.isFinite(data.meta?.totalPages)
    ? page < data.meta.totalPages
    : Number.isFinite(total) ? page * PAGE_SIZE < total : rawItems.length === PAGE_SIZE;

  return { total: openAccessOnly ? null : total, items, hasMore };
}

export function normalizeWork(record) {
  const attributes = record?.attributes || {};
  const doi = normalizeDoi(attributes.doi || record?.id);
  const creators = Array.isArray(attributes.creators) ? attributes.creators : [];
  const licenses = normalizeLicenses(attributes.rightsList);
  const abstract = descriptionFrom(attributes.descriptions);
  const url = safeExternalUrl(attributes.url) || (doi ? "https://doi.org/" + doi : "");
  const type = String(attributes.types?.resourceTypeGeneral || "Dataset").toLowerCase();
  const citationCount = metric(attributes.citationCount);
  const datasetMetadata = {
    source: "DataCite",
    landingPage: safeExternalUrl(attributes.url),
    publisher: publisherName(attributes.publisher),
    resourceType: String(attributes.types?.resourceType || "").trim(),
    description: abstract,
    methods: methodsFrom(attributes.descriptions),
    technicalInfo: technicalInfoFrom(attributes.descriptions),
    licenses,
    version: String(attributes.version || "").trim(),
    subjects: uniqueStrings(asArray(attributes.subjects).map(subject => subject?.subject)),
    formats: uniqueStrings(attributes.formats),
    sizes: uniqueStrings(attributes.sizes),
    locations: normalizeLocations(attributes.geoLocations),
    periods: normalizePeriods(attributes.dates),
    funding: normalizeFunding(attributes.fundingReferences),
    creators: normalizeCreators(creators),
    related: normalizeRelated(attributes.relatedIdentifiers, attributes.relatedItems),
    accessUrls: normalizeUrls(attributes.contentUrl),
    updated: String(attributes.updated || "").trim()
  };

  return {
    id: doi || url,
    providerId: "datacite",
    title: selectWorkTitle(asArray(attributes.titles).map(title => cleanText(title?.title))),
    authors: creators.map(creator => cleanText(creator?.name)).filter(Boolean),
    authorProfiles: normalizeCreators(creators).map(creator => ({
      name: creator.name,
      profileUrl: creator.orcid,
      orcid: creator.orcid,
      email: ""
    })),
    year: normalizePublicationYear(attributes.publicationYear),
    journal: datasetMetadata.publisher,
    type: type === "dataset" ? "dataset" : type,
    citations: citationCount,
    downloads: metric(attributes.downloadCount),
    views: metric(attributes.viewCount),
    doi,
    url: url || "https://datacite.org/",
    openAccess: licenseStatus(licenses),
    abstract,
    datasetMetadata,
    sources: [{ id: "datacite", label: "DataCite" }],
    provenance: { title: "DataCite", authors: "DataCite", year: "DataCite", journal: "DataCite", citations: "DataCite" }
  };
}

function buildQuery(query, yearFrom, yearTo, fromDate, toDate) {
  const text = String(query || "").trim();
  const from = yearFrom || String(fromDate || "").slice(0, 4);
  const to = yearTo || String(toDate || "").slice(0, 4);
  const fromYear = normalizePublicationYear(from);
  const toYear = normalizePublicationYear(to);
  if (!fromYear && !toYear) return text;
  const range = `publicationYear:[${fromYear || "*"} TO ${toYear || "*"}]`;
  return text ? `(${text}) AND ${range}` : range;
}

function descriptionFrom(descriptions) {
  const entries = Array.isArray(descriptions) ? descriptions : [];
  const abstract = entries.find(entry => String(entry?.descriptionType || "").toLowerCase() === "abstract");
  const other = entries.find(entry => entry?.description && !["methods", "technicalinfo"].includes(String(entry?.descriptionType || "").toLowerCase()));
  return cleanText(abstract?.description || other?.description || "").slice(0, 8000);
}

function methodsFrom(descriptions) {
  return descriptionsOfType(descriptions, "methods");
}

function technicalInfoFrom(descriptions) {
  return descriptionsOfType(descriptions, "technicalinfo");
}

function descriptionsOfType(descriptions, type) {
  return uniqueStrings((Array.isArray(descriptions) ? descriptions : [])
    .filter(entry => String(entry?.descriptionType || "").toLowerCase() === type)
    .map(entry => entry?.description));
}

function normalizeLicenses(rightsList) {
  const entries = Array.isArray(rightsList) ? rightsList : [];
  return entries.map(rights => ({
    label: cleanText(rights?.rights || rights?.rightsIdentifier || rights?.rightsUri || ""),
    identifier: String(rights?.rightsIdentifier || "").trim(),
    url: safeExternalUrl(rights?.rightsUri)
  })).filter(rights => rights.label || rights.identifier || rights.url);
}

function licenseStatus(licenses) {
  if (licenses.some(license => isOpenLicense(license))) return true;
  if (licenses.some(license => /all rights reserved|restricted|proprietary|closed access/i.test(license.label))) return false;
  return null;
}

function isOpenLicense(license) {
  const value = `${license.identifier} ${license.label} ${license.url}`.toLowerCase();
  return /\bcc0(?:-1\.0)?\b|\bcc-by(?:-sa)?(?:-|\s)\d(?:\.\d+)?\b|creative commons attribution(?:-sharealike| share alike)?\s+\d(?:\.\d+)?|creativecommons\.org\/(?:publicdomain\/zero|licenses\/by(?:-sa)?\/)|public domain dedication|\bmit license\b|apache license/i.test(value);
}

function normalizeCreators(creators) {
  return creators.map(creator => {
    const identifiers = Array.isArray(creator?.nameIdentifiers) ? creator.nameIdentifiers : [];
    const orcidEntry = identifiers.find(item => /orcid/i.test(item?.nameIdentifierScheme || "")) || identifiers.find(item => /orcid\.org/i.test(item?.nameIdentifier || ""));
    const rawOrcid = String(orcidEntry?.nameIdentifier || "").trim();
    const orcid = safeExternalUrl(rawOrcid) || (rawOrcid && /orcid/i.test(orcidEntry?.nameIdentifierScheme || "")
      ? safeExternalUrl("https://orcid.org/" + rawOrcid.replace(/^orcid:/i, ""))
      : "");
    return {
      name: cleanText(creator?.name),
      orcid,
      affiliations: uniqueStrings(asArray(creator?.affiliation).map(affiliation => typeof affiliation === "string" ? affiliation : affiliation?.name))
    };
  }).filter(creator => creator.name);
}

function normalizeRelated(relatedIdentifiers, relatedItems) {
  const identifiers = (Array.isArray(relatedIdentifiers) ? relatedIdentifiers : []).map(item => {
    const raw = String(item?.relatedIdentifier || "").trim();
    const url = identifierUrl(raw);
    return {
      title: cleanText(raw),
      url,
      relation: String(item?.relationType || "").trim(),
      resourceType: String(item?.resourceTypeGeneral || "").trim()
    };
  });
  const items = (Array.isArray(relatedItems) ? relatedItems : []).map(item => {
    const identifier = item?.relatedItemIdentifier || {};
    const raw = String(identifier.relatedItemIdentifier || "").trim();
    const title = cleanText((item?.titles || []).find(entry => entry?.title)?.title || raw);
    return {
      title,
      url: identifierUrl(raw),
      relation: String(item?.relationType || "").trim(),
      resourceType: String(item?.relatedItemType || "").trim()
    };
  });
  const unique = new Map();
  for (const item of [...identifiers, ...items]) {
    if (!item.title && !item.url) continue;
    unique.set(item.url || item.title, item);
  }
  return [...unique.values()].slice(0, 12);
}

function normalizeLocations(geoLocations) {
  const locations = (Array.isArray(geoLocations) ? geoLocations : []).map(location => {
    if (location?.geoLocationPlace) return cleanText(location.geoLocationPlace);
    const point = location?.geoLocationPoint;
    if (Number.isFinite(point?.pointLatitude) && Number.isFinite(point?.pointLongitude)) {
      return `${point.pointLatitude}, ${point.pointLongitude}`;
    }
    return "";
  });
  return uniqueStrings(locations);
}

function normalizeFunding(references) {
  return (Array.isArray(references) ? references : []).map(reference => ({
    funder: cleanText(reference?.funderName),
    award: cleanText(reference?.awardNumber),
    title: cleanText(reference?.awardTitle),
    url: safeExternalUrl(reference?.awardUri)
  })).filter(reference => reference.funder || reference.award || reference.title).slice(0, 8);
}

function normalizePeriods(dates) {
  return uniqueStrings(asArray(dates)
    .filter(entry => /collected/i.test(entry?.dateType || ""))
    .map(entry => entry?.date));
}

function normalizeUrls(values) {
  const entries = Array.isArray(values) ? values : values ? [values] : [];
  return uniqueStrings(entries.map(value => safeExternalUrl(typeof value === "string" ? value : value?.contentUrl || value?.url)));
}

function identifierUrl(value) {
  const doi = normalizeDoi(value);
  return doi ? "https://doi.org/" + doi : safeExternalUrl(value);
}

function publisherName(value) {
  return cleanText(typeof value === "string" ? value : value?.name || "");
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => cleanText(value)).filter(Boolean))];
}

function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function cleanText(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/gu, " ").trim();
}

function metric(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}
