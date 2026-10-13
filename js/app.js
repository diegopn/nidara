import { exportWorks } from "./core/export.js";
import { federatedSearch } from "./core/federated-search.js";
import { formatNumber, getLanguage, pluralMessage, setLanguage, t } from "./core/i18n.js";
import { deduplicateWorks, normalizeDoi, safeExternalUrl, workKey } from "./core/work-utils.js";

const FAVORITES_KEY = "nidara:favorites:v1";
const MAX_FAVORITES = 250;
const DEFAULT_SOURCES = ["openalex", "crossref"];
const form = document.querySelector("#search-form");
const queryInput = document.querySelector("#query");
const yearFromInput = document.querySelector("#year-from");
const yearToInput = document.querySelector("#year-to");
const sortSelect = document.querySelector("#sort");
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
const viewTabs = [...document.querySelectorAll(".result-tab")];
const viewNote = document.querySelector("#view-note");
const authorsScope = document.querySelector("#authors-scope");
const authorsMore = document.querySelector("#authors-more");
const viewCounts = {
  publications: document.querySelector("#publications-count"),
  authors: document.querySelector("#authors-count"),
  datasets: document.querySelector("#datasets-count")
};

let controller;
let requestId = 0;
let activeFilters = null;
let loadedItems = [];
let favorites = readFavorites();
let pageNumbers = {};
let providerProgress = {};
let providerTotals = {};
let savedView = false;
let activeView = "publications";
let selectedAuthor = "";
let showAllAuthors = false;

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

function isDataset(work) {
  return String(work.type || "").toLowerCase() === "dataset";
}

function publicationItems(works) {
  return works.filter(work => !isDataset(work));
}

function datasetItems(works) {
  return works.filter(isDataset);
}

function authorKey(name) {
  return name.trim().replace(/\s+/g, " ").normalize("NFKC").toLocaleLowerCase(getLanguage());
}

function summarizeAuthors(works) {
  const authors = new Map();
  for (const work of works) {
    const namesInWork = new Set();
    for (const rawName of work.authors || []) {
      const name = typeof rawName === "string" ? rawName.trim().replace(/\s+/g, " ") : "";
      const key = authorKey(name);
      if (!key || namesInWork.has(key)) continue;
      namesInWork.add(key);
      const author = authors.get(key) || { name, records: 0, citations: 0, citationRecords: 0 };
      author.records += 1;
      if (Number.isFinite(work.citations)) {
        author.citations += work.citations;
        author.citationRecords += 1;
      }
      authors.set(key, author);
    }
  }
  return [...authors.values()].sort((a, b) =>
    b.records - a.records || b.citations - a.citations || a.name.localeCompare(b.name, getLanguage()));
}

function updateViewControls(works, publications, authors) {
  const datasets = datasetItems(works);
  viewCounts.publications.textContent = formatNumber(publications.length);
  viewCounts.authors.textContent = formatNumber(authors.length);
  viewCounts.datasets.textContent = formatNumber(datasets.length);
  for (const tab of viewTabs) {
    const selected = tab.dataset.view === activeView;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  list.setAttribute("aria-labelledby", `${activeView}-tab`);
  viewNote.textContent = t({
    publications: "publicationViewNote",
    authors: "authorViewNote",
    datasets: "datasetViewNote"
  }[activeView]);
  authorsScope.hidden = activeView !== "authors";
  authorsScope.textContent = t(savedView ? "authorScopeSaved" : "authorScope", {
    count: formatNumber(publications.length)
  });
  const loadMoreLabel = more.querySelector("[data-i18n]");
  if (loadMoreLabel) loadMoreLabel.textContent = t(activeView === "authors" ? "loadMoreAuthors" : "loadMore");
}

function renderAuthors(authors) {
  authorsMore.hidden = authors.length <= 12 || showAllAuthors;
  authorsMore.textContent = t("showAllAuthors", { count: formatNumber(authors.length) });
  if (!authors.length) return false;

  const grid = element("div", "author-grid");
  const visibleAuthors = showAllAuthors ? authors : authors.slice(0, 12);
  for (const [index, author] of visibleAuthors.entries()) {
    const card = element("article", "author-card");
    card.append(element("span", "author-rank", String(index + 1).padStart(2, "0")));
    card.append(element("h3", null, author.name));
    const records = pluralMessage("authorWorkCount", author.records);
    const citations = author.citationRecords
      ? pluralMessage("citationCount", author.citations)
      : t("citationUnavailable");
    card.append(element("p", "author-metrics", `${records} · ${citations}`));
    const button = element("button", "author-results", t("openAuthorResults"));
    button.type = "button";
    button.addEventListener("click", () => {
      selectedAuthor = author.name;
      activeView = "publications";
      showAllAuthors = false;
      updateShareUrl(activeFilters);
      renderCurrentItems();
      setStatus(t("searchResultsStatus"));
      title.focus?.();
    });
    card.append(button);
    grid.append(card);
  }
  list.append(grid);
  return true;
}

function visibleWorks(works) {
  const matchingType = activeView === "datasets" ? datasetItems(works) : publicationItems(works);
  return activeView === "authors"
    ? []
    : selectedAuthor
      ? matchingType.filter(work => (work.authors || []).some(name => authorKey(name) === authorKey(selectedAuthor)))
      : matchingType;
}

function renderEmpty(titleKey, textKey) {
  const empty = element("div", "empty-state");
  empty.append(element("h3", null, t(titleKey)), element("p", null, t(textKey)));
  list.append(empty);
}

function renderCurrentItems() {
  const items = savedView ? [...favorites.values()] : loadedItems;
  sortSelect.disabled = savedView;
  const publications = publicationItems(items);
  const authors = summarizeAuthors(publications);
  const works = visibleWorks(items);
  list.replaceChildren();
  updateViewControls(items, publications, authors);
  authorsMore.hidden = true;

  if (activeView === "authors") {
    if (!renderAuthors(authors)) {
      renderEmpty("authorsEmptyTitle", savedView ? "favoritesEmptyText" : "resultsEmptyText");
    }
  } else if (!works.length) {
    const emptyTitle = savedView
      ? "favoritesEmptyTitle"
      : activeFilters && activeView === "datasets" ? "datasetsEmptyTitle" : "resultsEmptyTitle";
    renderEmpty(emptyTitle, savedView ? "favoritesEmptyText" : "resultsEmptyText");
  } else {
    const fragment = document.createDocumentFragment();
    for (const work of works) fragment.append(resultCard(work));
    list.append(fragment);
  }

  title.textContent = savedView
    ? t("favoritesTitle")
    : selectedAuthor
      ? t("worksByAuthor", { name: selectedAuthor })
      : !activeFilters
        ? t("initialTitle")
        : t({ publications: "publicationsFor", authors: "authorsFor", datasets: "datasetsFor" }[activeView], { query: activeFilters.query });
  count.textContent = savedView
    ? pluralMessage("savedCount", items.length)
    : selectedAuthor
      ? t("authorWorksCount", { name: selectedAuthor, count: formatNumber(works.length) })
      : activeView === "authors"
        ? t("authorResultsCount", { authors: formatNumber(authors.length), records: formatNumber(publications.length) })
        : works.length
          ? t("loadedCount", { loaded: formatNumber(works.length), total: formatNumber(totalMatches()) })
          : "";
  shareButton.disabled = !activeFilters || savedView;
  exportButton.disabled = works.length === 0 || activeView === "authors";
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
  queryInput.setCustomValidity(query.length < 2 ? t("queryMin") : "");
  yearFromInput.setCustomValidity("");
  yearToInput.setCustomValidity("");
  if (yearFrom && yearTo && Number(yearFrom) > Number(yearTo)) {
    yearToInput.setCustomValidity(t("yearOrder"));
  }
  if (!form.reportValidity()) return null;

  return {
    query,
    yearFrom,
    yearTo,
    sort: sortSelect.value,
    sourceIds: [...DEFAULT_SOURCES]
  };
}

function updateShareUrl(filters) {
  if (!filters) return;
  const url = new URL(location.href);
  url.hash = "";
  for (const key of ["q", "from", "to", "type", "sort", "sources", "view", "author"]) url.searchParams.delete(key);
  url.searchParams.set("q", filters.query);
  if (filters.yearFrom) url.searchParams.set("from", filters.yearFrom);
  if (filters.yearTo) url.searchParams.set("to", filters.yearTo);
  if (filters.sort !== "relevance") url.searchParams.set("sort", filters.sort);
  if (activeView !== "publications") url.searchParams.set("view", activeView);
  if (selectedAuthor) url.searchParams.set("author", selectedAuthor);
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
  const view = url.searchParams.get("view");
  activeView = ["publications", "authors", "datasets"].includes(view)
    ? view
    : url.searchParams.get("type") === "dataset" ? "datasets" : "publications";
  selectedAuthor = activeView === "publications" ? (url.searchParams.get("author") || "").slice(0, 250) : "";
  const sort = url.searchParams.get("sort");
  if (["newest", "cited"].includes(sort)) sortSelect.value = sort;
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

function selectView(view) {
  if (!["publications", "authors", "datasets"].includes(view) || activeView === view) return;
  const previousType = activeView === "datasets";
  activeView = view;
  selectedAuthor = "";
  showAllAuthors = false;
  refreshSavedCount();
  updateShareUrl(activeFilters);
  if (savedView) renderCurrentItems();
  else if (activeFilters && previousType !== (activeView === "datasets")) runSearch();
  else renderCurrentItems();
}

async function runSearch(append = false) {
  if (!activeFilters) return;
  if (controller) controller.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const currentRequest = ++requestId;
  const searchFilters = { ...activeFilters, type: activeView === "datasets" ? "dataset" : "all" };

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
    const result = await federatedSearch({ filters: searchFilters, pages, sourceIds, signal });
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
  selectedAuthor = "";
  showAllAuthors = false;
  refreshSavedCount();
  activeFilters = filters;
  updateShareUrl(filters);
  runSearch();
});

more.addEventListener("click", () => runSearch(true));
authorsMore.addEventListener("click", () => {
  showAllAuthors = true;
  renderCurrentItems();
});
for (const tab of viewTabs) {
  tab.addEventListener("click", () => selectView(tab.dataset.view));
  tab.addEventListener("keydown", event => {
    const currentIndex = viewTabs.indexOf(tab);
    const nextIndex = event.key === "ArrowRight" ? (currentIndex + 1) % viewTabs.length
      : event.key === "ArrowLeft" ? (currentIndex - 1 + viewTabs.length) % viewTabs.length
        : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    viewTabs[nextIndex].focus();
    viewTabs[nextIndex].click();
  });
}
sortSelect.addEventListener("change", () => {
  if (activeFilters && !savedView) form.requestSubmit();
});
savedToggle.addEventListener("click", toggleSavedView);
shareButton.addEventListener("click", shareSearch);
exportButton.addEventListener("click", () => {
  try {
    exportWorks(visibleWorks(savedView ? [...favorites.values()] : loadedItems), exportFormat.value, savedView ? t("favoritesTitle") : activeFilters?.query);
    setStatus(t("exportReady"));
  } catch (error) {
    setStatus(t("exportError"));
  }
});

function setupLanguage() {
  setLanguage(document.documentElement.lang);
  languageSwitcher.addEventListener("click", event => {
    const link = event.target.closest("a[data-locale]");
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const nextUrl = new URL(link.href);
    nextUrl.search = location.search;
    nextUrl.hash = location.hash;
    nextUrl.searchParams.delete("lang");
    event.preventDefault();
    window.location.assign(nextUrl.href);
  });
}

setupLanguage();
setupTheme();
refreshSavedCount();
renderCurrentItems();
filtersFromUrl();
