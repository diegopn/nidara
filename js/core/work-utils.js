export function normalizeDoi(value) {
  if (typeof value !== "string") return "";
  const doi = value.trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/[.,;]+$/, "");
  return /^10\.\d{4,9}\/\S+$/i.test(doi) ? doi.toLowerCase() : "";
}

export function normalizePublicationYear(value) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null;
}

export function selectWorkTitle(values) {
  const candidates = (Array.isArray(values) ? values : [values])
    .map(value => typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "")
    .filter(Boolean);
  const readable = candidates.filter(title => !isCorruptedTitle(title));
  if (!readable.length) return "";

  const primary = candidates[0];
  if (!isCorruptedTitle(primary) && isMostlyLatin(primary)) return primary;
  return readable.find(isMostlyLatin) || readable[0];
}

function isMostlyLatin(title) {
  const letters = [...title].filter(character => /\p{L}/u.test(character));
  if (!letters.length) return false;
  return letters.filter(character => /\p{Script=Latin}/u.test(character)).length / letters.length >= 0.7;
}

function isCorruptedTitle(title) {
  return title.includes("\uFFFD") || /\?{3,}/u.test(title) || /^\?{2}$/u.test(title);
}

export function safeExternalUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}

export function workKey(work) {
  const doi = normalizeDoi(work.doi);
  if (doi) return "doi:" + doi;
  return String(work.id || work.providerId + ":" + work.title);
}

function isEmpty(value) {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

export function mergeWorks(existing, incoming) {
  const title = selectWorkTitle([existing.title, incoming.title]);
  const merged = { ...existing, title };
  for (const field of ["authors", "year", "journal", "type", "abstract", "doi", "url", "openAccess", "citations", "datasetMetadata"]) {
    if (isEmpty(merged[field]) && !isEmpty(incoming[field])) merged[field] = incoming[field];
  }
  merged.datasetMetadata = mergeDatasetMetadata(existing.datasetMetadata, incoming.datasetMetadata);
  merged.authors = [...new Set([...(existing.authors || []), ...(incoming.authors || [])].filter(name => typeof name === "string" && name.trim()))];
  merged.authorProfiles = mergeAuthorProfiles(existing.authorProfiles, incoming.authorProfiles);
  if (incoming.openAccess === true) merged.openAccess = true;
  if (Number.isFinite(incoming.citations)) merged.citations = Math.max(merged.citations || 0, incoming.citations);
  for (const field of ["downloads", "views"]) {
    if (Number.isFinite(incoming[field])) merged[field] = Math.max(merged[field] || 0, incoming[field]);
  }
  merged.sources = [...new Map([...(existing.sources || []), ...(incoming.sources || [])].map(source => [source.id, source])).values()];
  merged.provenance = { ...(incoming.provenance || {}), ...(existing.provenance || {}) };
  if (title && title !== existing.title && incoming.provenance?.title) merged.provenance.title = incoming.provenance.title;
  return merged;
}

function mergeDatasetMetadata(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  const merged = { ...existing };
  const preferIncoming = incoming.source === "DataCite" && existing.source !== "DataCite";
  for (const [field, value] of Object.entries(incoming)) {
    if (Array.isArray(merged[field]) && Array.isArray(value)) {
      merged[field] = mergeDatasetArray(field, merged[field], value);
    } else if (!isEmpty(value) && (preferIncoming || isEmpty(merged[field]))) {
      merged[field] = value;
    }
  }
  return merged;
}

function mergeDatasetArray(field, existing, incoming) {
  const unique = new Map();
  for (const item of [...existing, ...incoming]) {
    const key = datasetMetadataKey(field, item);
    const current = unique.get(key);
    if (!current) {
      unique.set(key, item);
      continue;
    }
    if (field === "creators") {
      unique.set(key, {
        ...current,
        ...item,
        orcid: item.orcid || current.orcid,
        affiliations: [...new Set([...(current.affiliations || []), ...(item.affiliations || [])])]
      });
    } else if (field === "related" || field === "funding" || field === "licenses") {
      unique.set(key, { ...current, ...item });
    }
  }
  return [...unique.values()];
}

function datasetMetadataKey(field, item) {
  if (typeof item === "string") return item.trim().toLocaleLowerCase();
  if (!item || typeof item !== "object") return String(item);
  const identity = field === "creators" ? item.orcid || item.name
    : field === "related" ? item.url || item.title
      : field === "funding" ? [item.funder, item.award, item.title].filter(Boolean).join("|")
        : field === "licenses" ? item.url || item.identifier || item.label
          : JSON.stringify(item);
  return String(identity || JSON.stringify(item)).trim().toLocaleLowerCase();
}


function mergeAuthorProfiles(...groups) {
  const profiles = new Map();
  for (const profile of groups.flat()) {
    if (!profile || typeof profile.name !== "string" || !profile.name.trim()) continue;
    const key = profile.name.trim().replace(/\s+/g, " ").normalize("NFKC").toLocaleLowerCase();
    const merged = profiles.get(key) || { name: profile.name.trim(), profileUrl: "", orcid: "", email: "" };
    for (const field of ["profileUrl", "orcid", "email"]) {
      if (!merged[field] && typeof profile[field] === "string" && profile[field].trim()) merged[field] = profile[field].trim();
    }
    profiles.set(key, merged);
  }
  return [...profiles.values()];
}

export function deduplicateWorks(works) {
  const unique = new Map();
  for (const work of works) {
    const key = workKey(work);
    unique.set(key, unique.has(key) ? mergeWorks(unique.get(key), work) : work);
  }
  return [...unique.values()];
}
