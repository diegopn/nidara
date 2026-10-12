import { exportWorks } from "./core/export.js";
import { federatedSearch } from "./core/federated-search.js";
import { basePath, formatNumber, getLanguage, pluralMessage, setLanguage, t } from "./core/i18n.js";
import { deduplicateWorks, normalizeDoi, safeExternalUrl, workKey } from "./core/work-utils.js";

const FAVORITES_KEY = "nidara:favorites:v1";
const MAX_FAVORITES = 250;
const form = document.querySelector("#search-form");
const queryInput = document.querySelector("#query");
const yearFromInput = document.querySelector("#year-from");
const yearToInput = document.querySelector("#year-to");
const list = document.querySelector("#results-list");
const status = document.querySelector("#status");
const title = document.querySelector("#results-title");
const count = document.querySelector("#count");
const more = document.querySelector("#more");
const searchButton = document.querySelector("#search-button");
const savedToggle = document.querySelector("#saved-toggle");
const savedCount = document.querySelector("#saved-count");
const shareButton = document.querySelector("#share-button");
const shareFallback = document.querySelector("#share-fallback");
const shareUrl = document.querySelector("#share-url");
const exportButton = document.querySelector("#export-button");
const exportFormat = document.querySelector("#export-format");
const languageSwitcher = document.querySelector("#language-switcher");

let controller;
let requestId = 0;
let activeFilters = null;
let loadedItems = [];
let favorites = readFavorites();
let pageNumbers = {};
let providerProgress = {};
let providerTotals = {};
let savedView = false;

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value != null) node.textContent = String(value);
  return node;
}

function setStatus(message) {
  status.textContent = message;
}

function setupTheme() {
  const button = document.querySelector("#theme-toggle");
  const preference = window.matchMedia("(prefers-color-scheme: dark)");
  const isDark = () => document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark"
    : preference.matches;
  const updateButton = () => {
    const dark = isDark();
    button.setAttribute("aria-pressed", String(dark));
    button.setAttribute("aria-label", dark ? t("themeLight") : t("themeDark"));
  };

  button.addEventListener("click", () => {
    const theme = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("preferred-theme", theme); } catch {}
    updateButton();
  });
  preference.addEventListener("change", updateButton);
  updateButton();
}

function readFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    if (!Array.isArray(saved)) return new Map();
    const valid = saved.filter(work => work && typeof work.title === "string" && typeof work.url === "string").slice(-MAX_FAVORITES);
    return new Map(valid.map(work => [workKey(work), work]));
  } catch {
    return new Map();
  }
}

function persistFavorites(nextFavorites) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...nextFavorites.values()]));
    return true;
  } catch {
    return false;
  }
}

function refreshSavedCount() {
  savedCount.textContent = String(favorites.size);
  savedToggle.setAttribute("aria-pressed", String(savedView));
}

function currentItems() {
  return savedView ? [...favorites.values()] : loadedItems;
}

function renderCurrentItems() {
  const works = currentItems();
  list.replaceChildren();
  if (!works.length) {
    const empty = element("div", "empty-state");
    empty.append(
      element("h3", null, savedView ? t("favoritesEmptyTitle") : t("resultsEmptyTitle")),
      element("p", null, savedView
        ? t("favoritesEmptyText")
        : t("resultsEmptyText"))
    );
    list.append(empty);
  } else {
    const fragment = document.createDocumentFragment();
    for (const work of works) fragment.append(resultCard(work));
    list.append(fragment);
  }

  title.textContent = savedView ? t("favoritesTitle") : activeFilters ? t("resultsFor", { query: activeFilters.query }) : t("initialTitle");
  count.textContent = savedView
    ? pluralMessage("savedCount", works.length)
    : works.length ? t("loadedCount", { loaded: formatNumber(works.length), total: formatNumber(totalMatches()) }) : "";
  shareButton.disabled = !activeFilters || savedView;
  exportButton.disabled = works.length === 0;
  more.hidden = savedView || !Object.values(providerProgress).some(progress => progress.hasMore);
}

function totalMatches() {
  return Object.values(providerTotals).reduce((sum, value) => sum + value, 0);
}

function typeLabel(type) {
  const normalized = String(type || "").toLowerCase();
  if (["article", "journal-article", "proceedings-article"].includes(normalized)) return t("typeArticle");
  if (["preprint", "posted-content"].includes(normalized)) return t("typePreprint");
  if (normalized === "dataset") return t("typeDataset");
  if (["book", "monograph", "book-chapter"].includes(normalized)) return t("typeBook");
  return t("typePublication");
}

function resultCard(work) {
  const article = element("article", "result");
  const sourceTags = element("div", "result-sources");
  for (const source of work.sources || []) sourceTags.append(element("span", "source-tag", source.label));
  sourceTags.append(element("span", "type-tag", typeLabel(work.type)));
  if (work.openAccess === true) sourceTags.append(element("span", "oa-tag", t("openAccess")));
  article.append(sourceTags);

  const headingRow = element("div", "result-heading-row");
  const heading = element("h3");
  const workTitle = work.title || t("untitled");
  const link = element("a", null, workTitle);
  const externalUrl = safeExternalUrl(work.url) || (normalizeDoi(work.doi) ? "https://doi.org/" + normalizeDoi(work.doi) : "");
  if (externalUrl) {
    link.href = externalUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  } else {
    link.removeAttribute("href");
  }
  heading.append(link);
  headingRow.append(heading);

  const key = workKey(work);
  const saved = favorites.has(key);
  const save = element("button", "save-button", saved ? t("saved") : t("save"));
  save.type = "button";
  save.setAttribute("aria-pressed", String(saved));
  save.setAttribute("aria-label", t(saved ? "removeSaved" : "saveLabel", { title: workTitle }));
  save.addEventListener("click", () => toggleFavorite(work));
  headingRow.append(save);
  article.append(headingRow);

  const details = [
    (work.authors || []).length ? work.authors.join(", ") : t("noAuthors"),
    work.year || t("noYear"),
    work.journal || t("noVenue")
  ];
  if (Number.isFinite(work.citations)) details.push(pluralMessage("citationCount", work.citations));
  article.append(element("p", "meta", details.join(" · ")));

  const doi = normalizeDoi(work.doi);
  if (doi) {
    const doiLine = element("p", "doi-line");
    const doiLink = element("a", null, "DOI: " + doi);
    doiLink.href = "https://doi.org/" + doi;
    doiLink.target = "_blank";
    doiLink.rel = "noopener noreferrer";
    doiLine.append(doiLink);
    article.append(doiLine);
  }

  if (work.abstract) article.append(element("p", "abstract", work.abstract));
  const missing = [];
  if (!(work.authors || []).length) missing.push(t("fieldAuthors"));
  if (!work.year) missing.push(t("fieldYear"));
  if (!work.abstract) missing.push(t("fieldAbstract"));
  if (!doi) missing.push(t("fieldDoi"));
  if (work.openAccess == null) missing.push(t("fieldOpenAccess"));
  if (missing.length) article.append(element("p", "missing", t("missingMetadata", { fields: missing.join(", ") })));
  return article;
}

function toggleFavorite(work) {
  const nextFavorites = new Map(favorites);
  const key = workKey(work);
  if (nextFavorites.has(key)) nextFavorites.delete(key);
  else if (nextFavorites.size >= MAX_FAVORITES) {
    setStatus(t("maxFavorites", { count: MAX_FAVORITES }));
    return;
  } else nextFavorites.set(key, work);
  const persisted = persistFavorites(nextFavorites);
  favorites = nextFavorites;
  refreshSavedCount();
  renderCurrentItems();
  if (!persisted) setStatus(t("storageFailure"));
  else if (savedView) setStatus(t("storageNote"));
}

function readFiltersFromForm() {
  const query = queryInput.value.trim();
  const yearFrom = yearFromInput.value.trim();
  const yearTo = yearToInput.value.trim();
  const sourceIds = [...form.querySelectorAll('input[name="sources"]:checked')].map(input => input.value);

  queryInput.setCustomValidity(query.length < 2 ? t("queryMin") : "");
  yearFromInput.setCustomValidity("");
  yearToInput.setCustomValidity("");
  if (yearFrom && yearTo && Number(yearFrom) > Number(yearTo)) {
    yearToInput.setCustomValidity(t("yearOrder"));
  }
  if (!sourceIds.length) queryInput.setCustomValidity(t("sourceRequired"));
  if (!form.reportValidity()) return null;

  return {
    query,
    yearFrom,
    yearTo,
    type: document.querySelector("#resource-type").value,
    sort: document.querySelector("#sort").value,
    sourceIds
  };
}

function updateShareUrl(filters) {
  const url = new URL(location.href);
  url.hash = "";
  for (const key of ["q", "from", "to", "type", "sort", "sources"]) url.searchParams.delete(key);
  url.searchParams.set("q", filters.query);
  if (filters.yearFrom) url.searchParams.set("from", filters.yearFrom);
  if (filters.yearTo) url.searchParams.set("to", filters.yearTo);
  if (filters.type !== "all") url.searchParams.set("type", filters.type);
  if (filters.sort !== "relevance") url.searchParams.set("sort", filters.sort);
  url.searchParams.set("sources", filters.sourceIds.join(","));
  url.searchParams.delete("lang");
  history.replaceState(null, "", url);
  shareFallback.hidden = true;
}

function filtersFromUrl() {
  const url = new URL(location.href);
  const query = url.searchParams.get("q");
  if (!query) return;
  queryInput.value = query.slice(0, 250);
  yearFromInput.value = validYear(url.searchParams.get("from")) ? url.searchParams.get("from") : "";
  yearToInput.value = validYear(url.searchParams.get("to")) ? url.searchParams.get("to") : "";
  const type = url.searchParams.get("type");
  if (["article", "preprint", "dataset", "book"].includes(type)) document.querySelector("#resource-type").value = type;
  const sort = url.searchParams.get("sort");
  if (["newest", "cited"].includes(sort)) document.querySelector("#sort").value = sort;
  const sourceParam = url.searchParams.get("sources");
  if (sourceParam) {
    const selected = sourceParam.split(",").filter(value => ["openalex", "crossref"].includes(value));
    for (const input of form.querySelectorAll('input[name="sources"]')) input.checked = selected.includes(input.value);
    if (!selected.length) for (const input of form.querySelectorAll('input[name="sources"]')) input.checked = true;
  }
  form.requestSubmit();
}

function validYear(value) {
  return /^\d{4}$/.test(value || "") && Number(value) >= 1900 && Number(value) <= 2100;
}

function errorMessage(error) {
  if (error?.name === "AbortError") return "";
  if (error?.code === "api-key-required") return t("apiLimit");
  if (error?.status === 429) return t("rateLimit");
  if (error instanceof TypeError) return t("networkError");
  return error?.status ? t("httpError", { status: error.status }) : t("sourceError");
}

function resultStatus(result, append) {
  const available = result.sources.filter(source => source.result).map(source => source.label);
  const failed = result.sources.filter(source => source.error && source.error.name !== "AbortError");
  if (!available.length && failed.length) {
    const details = failed.map(source => source.label + ": " + errorMessage(source.error)).join("; ");
    setStatus(t("sourcesFailed", { details }));
  } else if (failed.length) {
    const details = failed.map(source => source.label + ": " + errorMessage(source.error)).join("; ");
    setStatus(t("partialResponse", { available: available.join(getLanguage() === "en" ? " and " : getLanguage() === "es" ? " y " : " e "), details }));
  } else if (!loadedItems.length) {
    setStatus(t("noResults"));
  } else {
    const sources = available.join(getLanguage() === "en" ? " and " : getLanguage() === "es" ? " y " : " e ");
    setStatus(t(append ? "moreLoaded" : "sourcesConsulted", { sources }));
  }
}

async function runSearch(append = false) {
  if (!activeFilters) return;
  if (controller) controller.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const currentRequest = ++requestId;

  if (!append) {
    loadedItems = [];
    pageNumbers = Object.fromEntries(activeFilters.sourceIds.map(id => [id, 1]));
    providerProgress = Object.fromEntries(activeFilters.sourceIds.map(id => [id, { hasMore: false }]));
    providerTotals = {};
    renderCurrentItems();
  }

  const sourceIds = append
    ? activeFilters.sourceIds.filter(id => providerProgress[id]?.hasMore)
    : activeFilters.sourceIds;
  const pages = Object.fromEntries(sourceIds.map(id => [id, pageNumbers[id] || 1]));
  if (!sourceIds.length) return;

  list.setAttribute("aria-busy", "true");
  searchButton.disabled = true;
  more.disabled = true;
  more.hidden = !append;
  setStatus(append ? t("loadingMore") : t("searching"));

  try {
    const result = await federatedSearch({ filters: activeFilters, pages, sourceIds, signal });
    if (signal.aborted || currentRequest !== requestId) return;

    for (const source of result.sources) {
      if (source.result) {
        providerTotals[source.id] = source.result.total;
        pageNumbers[source.id] = (pages[source.id] || 1) + 1;
        providerProgress[source.id] = { hasMore: source.result.hasMore };
      } else {
        providerProgress[source.id] = { hasMore: false };
      }
    }
    loadedItems = deduplicateWorks([...loadedItems, ...result.items]);
    renderCurrentItems();
    resultStatus(result, append);
  } catch (error) {
    if (signal.aborted || error?.name === "AbortError") return;
    setStatus(t("searchFailed", { reason: errorMessage(error) }));
  } finally {
    if (!signal.aborted && currentRequest === requestId) {
      list.setAttribute("aria-busy", "false");
      searchButton.disabled = false;
      more.disabled = false;
      renderCurrentItems();
    }
  }
}

async function shareSearch() {
  if (!activeFilters) return;
  const url = new URL(location.href);
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Área de transferência indisponível");
    await navigator.clipboard.writeText(url.href);
    shareFallback.hidden = true;
    setStatus(t("shareCopied"));
  } catch {
    shareUrl.value = url.href;
    shareFallback.hidden = false;
    shareUrl.focus();
    shareUrl.select();
    setStatus(t("shareCopyFailed"));
  }
}

function toggleSavedView() {
  savedView = !savedView;
  if (controller) controller.abort();
  requestId += 1;
  list.setAttribute("aria-busy", "false");
  searchButton.disabled = false;
  more.disabled = false;
  refreshSavedCount();
  renderCurrentItems();
  setStatus(savedView ? t("storageNote") : activeFilters ? t("searchResultsStatus") : t("searchOpenSources"));
}

form.addEventListener("submit", event => {
  event.preventDefault();
  const filters = readFiltersFromForm();
  if (!filters) return;
  savedView = false;
  refreshSavedCount();
  activeFilters = filters;
  updateShareUrl(filters);
  runSearch();
});

more.addEventListener("click", () => runSearch(true));
savedToggle.addEventListener("click", toggleSavedView);
shareButton.addEventListener("click", shareSearch);
exportButton.addEventListener("click", () => {
  try {
    exportWorks(currentItems(), exportFormat.value, savedView ? t("favoritesTitle") : activeFilters?.query);
    setStatus(t("exportReady"));
  } catch (error) {
    setStatus(t("exportError"));
  }
});

function setupLanguage() {
  setLanguage(document.documentElement.lang);
  languageSwitcher.addEventListener("change", () => {
    const base = basePath();
    const nextPath = languageSwitcher.value === "pt-BR" ? base : base + languageSwitcher.value.toLowerCase() + "/";
    const nextUrl = new URL(location.href);
    nextUrl.pathname = nextPath;
    nextUrl.searchParams.delete("lang");
    window.location.assign(nextUrl.href);
  });
}

setupLanguage();
setupTheme();
refreshSavedCount();
renderCurrentItems();
filtersFromUrl();
