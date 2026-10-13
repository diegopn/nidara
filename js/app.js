import { exportWorks } from "./core/export.js";
import { federatedSearch } from "./core/federated-search.js";
import { formatNumber, getLanguage, pluralMessage, setLanguage, t } from "./core/i18n.js";
import { publicationDateRange } from "./core/period-utils.js";
import { mergeResultCounts } from "./core/result-counts.js";
import { deduplicateWorks, normalizeDoi, safeExternalUrl, workKey } from "./core/work-utils.js";

const FAVORITES_KEY = "nidara:favorites:v1";
const MAX_FAVORITES = 250;
const DEFAULT_SOURCES = ["openalex", "crossref"];
const form = document.querySelector("#search-form");
const queryInput = document.querySelector("#query");
const periodInput = document.querySelector("#period-range");
const customYearRange = document.querySelector("#custom-year-range");
const yearFromInput = document.querySelector("#year-from");
const yearToInput = document.querySelector("#year-to");
const sortSelect = document.querySelector("#sort");
const listingToolbar = document.querySelector("#listing-toolbar");
const list = document.querySelector("#results-list");
const status = document.querySelector("#status");
const title = document.querySelector("#results-title");
const count = document.querySelector("#count");
const more = document.querySelector("#more");
const searchButton = document.querySelector("#search-button");
const savedToggle = document.querySelector("#saved-toggle");
const savedCount = document.querySelector("#saved-count");
const referencesDialog = document.querySelector("#references-dialog");
const referencesDialogClose = document.querySelector("#references-dialog-close");
const referencesDialogCount = document.querySelector("#references-count");
const referencesEmpty = document.querySelector("#references-empty");
const referencesList = document.querySelector("#references-list");
const referencesClear = document.querySelector("#references-clear");
const exportCount = document.querySelector("#export-count");
const resultTabs = document.querySelector("#result-tabs");
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
let viewResultCounts = { publications: null, authors: null, datasets: null };
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

function renderSavedReferences() {
  const works = [...favorites.values()];
  exportCount.textContent = String(works.length);
  exportButton.disabled = works.length === 0;
  referencesClear.disabled = works.length === 0;
  referencesDialogCount.textContent = pluralMessage("savedCount", works.length);
  referencesEmpty.hidden = works.length > 0;
  referencesList.hidden = works.length === 0;
  referencesList.replaceChildren();

  for (const work of works) {
    const item = element("li", "references-item");
    const main = element("div", "references-item-main");
    const heading = element("h3");
    const workTitle = work.title || t("untitled");
    const link = element("a", null, workTitle);
    const externalUrl = safeExternalUrl(work.url) || (normalizeDoi(work.doi) ? "https://doi.org/" + normalizeDoi(work.doi) : "");
    if (externalUrl) {
      link.href = externalUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    heading.append(link);
    main.append(heading);
    const metadata = [
      (work.authors || []).length ? work.authors.join(", ") : t("noAuthors"),
      work.year || t("noYear"),
      work.journal || t("noVenue")
    ];
    main.append(element("p", "references-item-meta", metadata.join(" · ")));

    const remove = element("button", "references-remove", t("removeReference"));
    remove.type = "button";
    remove.setAttribute("aria-label", t("removeFromCart", { title: workTitle }));
    remove.addEventListener("click", () => {
      const index = [...favorites.keys()].indexOf(workKey(work));
      toggleFavorite(work);
      const remaining = referencesList.querySelectorAll(".references-remove");
      (remaining[Math.min(index, remaining.length - 1)] || referencesDialogClose).focus();
    });
    item.append(main, remove);
    referencesList.append(item);
  }
}

function refreshSavedCount() {
  savedCount.textContent = String(favorites.size);
  savedToggle.setAttribute("aria-label", t("selectionCartCount", { count: formatNumber(favorites.size) }));
  renderSavedReferences();
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

function updateViewControls(publications, authors) {
  for (const view of Object.keys(viewCounts)) {
    viewCounts[view].textContent = formatNumber(viewResultCounts[view] ?? 0);
  }
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
  authorsScope.textContent = t("authorScope", {
    count: formatNumber(publications.length)
  });
  const loadMoreLabel = more.querySelector("[data-i18n]");
  if (loadMoreLabel) loadMoreLabel.textContent = t(activeView === "authors" ? "loadMoreAuthors" : "loadMore");
}

function updateResultCounts(queryType, works) {
  const publications = publicationItems(works);
  viewResultCounts = mergeResultCounts(viewResultCounts, queryType, {
    publications: publications.length,
    authors: summarizeAuthors(publications).length,
    datasets: datasetItems(works).length
  });
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
  const items = loadedItems;
  const publications = publicationItems(items);
  const authors = summarizeAuthors(publications);
  const works = visibleWorks(items);
  list.replaceChildren();
  updateViewControls(publications, authors);
  authorsMore.hidden = true;

  if (activeView === "authors") {
    if (!renderAuthors(authors)) {
      renderEmpty("authorsEmptyTitle", "resultsEmptyText");
    }
  } else if (!works.length) {
    const emptyTitle = activeFilters && activeView === "datasets" ? "datasetsEmptyTitle" : "resultsEmptyTitle";
    renderEmpty(emptyTitle, "resultsEmptyText");
  } else {
    const fragment = document.createDocumentFragment();
    for (const work of works) fragment.append(resultCard(work));
    list.append(fragment);
  }

  title.textContent = selectedAuthor
      ? t("worksByAuthor", { name: selectedAuthor })
      : !activeFilters
        ? t("initialTitle")
        : t({ publications: "publicationsFor", authors: "authorsFor", datasets: "datasetsFor" }[activeView], { query: activeFilters.query });
  count.textContent = selectedAuthor
      ? t("authorWorksCount", { name: selectedAuthor, count: formatNumber(works.length) })
      : activeView === "authors"
        ? t("authorResultsCount", { authors: formatNumber(authors.length), records: formatNumber(publications.length) })
        : works.length
          ? t("loadedCount", { loaded: formatNumber(works.length), total: formatNumber(totalMatches()) })
          : "";
  exportButton.disabled = favorites.size === 0;
  more.hidden = !Object.values(providerProgress).some(progress => progress.hasMore);
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
  const badges = element("div", "result-badges");
  badges.append(element("span", "type-tag", typeLabel(work.type)));
  if (work.openAccess === true) badges.append(element("span", "oa-tag", t("openAccess")));
  article.append(badges);

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
  const save = element("button", "save-button", saved ? t("inCart") : t("addToCart"));
  save.type = "button";
  save.setAttribute("aria-pressed", String(saved));
  save.setAttribute("aria-label", t(saved ? "removeFromCart" : "addToCartLabel", { title: workTitle }));
  save.addEventListener("click", () => toggleFavorite(work));
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

  const missing = [];
  if (!(work.authors || []).length) missing.push(t("fieldAuthors"));
  if (!work.year) missing.push(t("fieldYear"));
  if (!doi) missing.push(t("fieldDoi"));
  if (work.openAccess == null) missing.push(t("fieldOpenAccess"));
  if (missing.length) article.append(element("p", "missing", t("missingMetadata", { fields: missing.join(", ") })));
  const actions = element("div", "result-actions");
  actions.append(save);
  article.append(actions);
  return article;
}

function toggleFavorite(work) {
  const nextFavorites = new Map(favorites);
  const key = workKey(work);
  const removing = nextFavorites.has(key);
  if (removing) nextFavorites.delete(key);
  else if (nextFavorites.size >= MAX_FAVORITES) {
    setStatus(t("maxFavorites", { count: MAX_FAVORITES }));
    return;
  } else nextFavorites.set(key, work);
  const persisted = persistFavorites(nextFavorites);
  favorites = nextFavorites;
  refreshSavedCount();
  renderCurrentItems();
  if (!persisted) setStatus(t("storageFailure"));
  else setStatus(t(removing ? "removedFromCart" : "addedToCart"));
}

function clearReferenceList() {
  if (favorites.size === 0) return;
  const nextFavorites = new Map();
  const persisted = persistFavorites(nextFavorites);
  favorites = nextFavorites;
  refreshSavedCount();
  renderCurrentItems();
  referencesDialogClose.focus();
  if (!persisted) setStatus(t("storageFailure"));
}

function openReferencesDialog() {
  renderSavedReferences();
  referencesDialog.showModal();
  savedToggle.setAttribute("aria-expanded", "true");
  referencesDialogClose.focus();
}

function readFiltersFromForm() {
  const query = queryInput.value.trim();
  const period = periodInput.value;
  const isCustomPeriod = period === "custom";
  const yearFrom = isCustomPeriod ? yearFromInput.value.trim() : "";
  const yearTo = isCustomPeriod ? yearToInput.value.trim() : "";
  queryInput.setCustomValidity(query.length < 2 ? t("queryMin") : "");
  yearFromInput.setCustomValidity("");
  yearToInput.setCustomValidity("");
  if (yearFrom && yearTo && Number(yearFrom) > Number(yearTo)) {
    yearToInput.setCustomValidity(t("yearOrder"));
  }
  if (!form.reportValidity()) return null;

  return {
    query,
    period,
    yearFrom,
    yearTo,
    ...publicationDateRange(period, yearFrom, yearTo),
    sort: sortSelect.value,
    sourceIds: [...DEFAULT_SOURCES]
  };
}

function updateCustomYearRange() {
  const isCustomPeriod = periodInput.value === "custom";
  customYearRange.hidden = !isCustomPeriod;
  yearFromInput.disabled = !isCustomPeriod;
  yearToInput.disabled = !isCustomPeriod;
  yearFromInput.setCustomValidity("");
  yearToInput.setCustomValidity("");
}

function updateShareUrl(filters) {
  if (!filters) return;
  const url = new URL(location.href);
  url.hash = "";
  for (const key of ["q", "from", "to", "period", "type", "sort", "sources", "view", "author"]) url.searchParams.delete(key);
  url.searchParams.set("q", filters.query);
  if (filters.period !== "all") url.searchParams.set("period", filters.period);
  if (filters.period === "custom" && filters.yearFrom) url.searchParams.set("from", filters.yearFrom);
  if (filters.period === "custom" && filters.yearTo) url.searchParams.set("to", filters.yearTo);
  if (filters.sort !== "relevance") url.searchParams.set("sort", filters.sort);
  if (activeView !== "publications") url.searchParams.set("view", activeView);
  if (selectedAuthor) url.searchParams.set("author", selectedAuthor);
  url.searchParams.delete("lang");
  history.replaceState(null, "", url);
}

function filtersFromUrl() {
  const url = new URL(location.href);
  const query = url.searchParams.get("q");
  if (!query) return;
  queryInput.value = query.slice(0, 250);
  yearFromInput.value = validYear(url.searchParams.get("from")) ? url.searchParams.get("from") : "";
  yearToInput.value = validYear(url.searchParams.get("to")) ? url.searchParams.get("to") : "";
  const period = url.searchParams.get("period");
  periodInput.value = ["all", "1", "2", "5", "10", "custom"].includes(period)
    ? period
    : yearFromInput.value || yearToInput.value ? "custom" : "all";
  updateCustomYearRange();
  const view = url.searchParams.get("view");
  activeView = ["publications", "authors", "datasets"].includes(view)
    ? view
    : url.searchParams.get("type") === "dataset" ? "datasets" : "publications";
  selectedAuthor = activeView === "publications" ? (url.searchParams.get("author") || "").slice(0, 250) : "";
  const sort = url.searchParams.get("sort");
  if (["newest", "cited"].includes(sort)) sortSelect.value = sort;
  form.requestSubmit();
}

function clearSearchFromUrlOnReload() {
  const navigation = performance.getEntriesByType("navigation")[0];
  if (navigation?.type !== "reload") return false;
  queryInput.value = "";
  const url = new URL(location.href);
  for (const key of ["q", "from", "to", "period", "type", "sort", "sources", "view", "author"]) url.searchParams.delete(key);
  history.replaceState(null, "", url);
  return true;
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
  updateShareUrl(activeFilters);
  if (activeFilters && previousType !== (activeView === "datasets")) runSearch();
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
    if (result.sources.some(source => source.result)) updateResultCounts(searchFilters.type, loadedItems);
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

form.addEventListener("submit", event => {
  event.preventDefault();
  const filters = readFiltersFromForm();
  if (!filters) return;
  selectedAuthor = "";
  showAllAuthors = false;
  activeFilters = filters;
  viewResultCounts = { publications: null, authors: null, datasets: null };
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
    const availableTabs = viewTabs.filter(candidate => !candidate.hidden);
    const currentIndex = availableTabs.indexOf(tab);
    const nextIndex = event.key === "ArrowRight" ? (currentIndex + 1) % availableTabs.length
      : event.key === "ArrowLeft" ? (currentIndex - 1 + availableTabs.length) % availableTabs.length
      : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    availableTabs[nextIndex].focus();
    availableTabs[nextIndex].click();
  });
}
sortSelect.addEventListener("change", () => {
  if (activeFilters) form.requestSubmit();
});
periodInput.addEventListener("change", updateCustomYearRange);
savedToggle.addEventListener("click", openReferencesDialog);
referencesClear.addEventListener("click", clearReferenceList);
referencesDialogClose.addEventListener("click", () => referencesDialog.close());
referencesDialog.addEventListener("close", () => {
  savedToggle.setAttribute("aria-expanded", "false");
  savedToggle.focus();
});
exportButton.addEventListener("click", () => {
  try {
    exportWorks([...favorites.values()], exportFormat.value, t("favoritesTitle"));
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
updateCustomYearRange();
refreshSavedCount();
renderCurrentItems();
const reloaded = clearSearchFromUrlOnReload();
if (!reloaded) filtersFromUrl();
queryInput.focus({ preventScroll: true });
