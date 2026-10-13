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
  for (const field of ["authors", "year", "journal", "type", "abstract", "doi", "url", "openAccess", "citations"]) {
    if (isEmpty(merged[field]) && !isEmpty(incoming[field])) merged[field] = incoming[field];
  }
  if (incoming.openAccess === true) merged.openAccess = true;
  if (Number.isFinite(incoming.citations)) merged.citations = Math.max(merged.citations || 0, incoming.citations);
  merged.sources = [...new Map([...(existing.sources || []), ...(incoming.sources || [])].map(source => [source.id, source])).values()];
  merged.provenance = { ...(incoming.provenance || {}), ...(existing.provenance || {}) };
  if (title && title !== existing.title && incoming.provenance?.title) merged.provenance.title = incoming.provenance.title;
  return merged;
}

export function deduplicateWorks(works) {
  const unique = new Map();
  for (const work of works) {
    const key = workKey(work);
    unique.set(key, unique.has(key) ? mergeWorks(unique.get(key), work) : work);
  }
  return [...unique.values()];
}
