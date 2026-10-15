import { exportWorks } from "./core/export.js";
import { datasetComparisonRows, datasetFilterOptions, filterDatasets, rankDatasets } from "./core/dataset-utils.js";
import { federatedSearch } from "./core/federated-search.js";
import { summarizeAuthors as summarizeAuthorRecords, worksForAuthor } from "./core/author-utils.js";
import { formatNumber, getLanguage, pluralMessage, setLanguage, t } from "./core/i18n.js";
import { publicationDateRange } from "./core/period-utils.js";
import { mergeResultCounts } from "./core/result-counts.js";
import { readDatasetFilters, writeDatasetFilters } from "./core/search-url.js";
import { publicationTypeFilterVisible, searchTypeForView } from "./core/view-scope.js";
import { deduplicateWorks, normalizeDoi, safeExternalUrl, workKey } from "./core/work-utils.js";

const FAVORITES_KEY = "nidara:favorites:v1";
const MAX_FAVORITES = 250;
const MAX_DATASET_COMPARISON = 3;
const DEFAULT_SOURCES = ["openalex", "crossref", "datacite"];
const form = document.querySelector("#search-form");
const queryInput = document.querySelector("#query");
const periodInput = document.querySelector("#period-range");
const openAccessInput = document.querySelector("#open-access-only");
const customYearRange = document.querySelector("#custom-year-range");
const yearFromInput = document.querySelector("#year-from");
const yearToInput = document.querySelector("#year-to");
const sortSelect = document.querySelector("#sort");
const publicationTypeSelect = document.querySelector("#publication-type");
const publicationTypeField = document.querySelector("#publication-type-field");
const datasetFiltersPanel = document.querySelector("#dataset-filters");
const datasetRepository = document.querySelector("#dataset-repository");
const datasetFormat = document.querySelector("#dataset-format");
const datasetRelatedOnly = document.querySelector("#dataset-related-only");
const datasetLocation = document.querySelector("#dataset-location");
const datasetFiltersClear = document.querySelector("#dataset-filters-clear");
const datasetDownloadSort = document.querySelector("#dataset-download-sort");
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
const datasetCompareNote = document.querySelector("#dataset-compare-note");
const datasetCompareButton = document.querySelector("#dataset-compare-button");
const datasetComparison = document.querySelector("#dataset-comparison");
const datasetComparisonBack = document.querySelector("#dataset-comparison-back");
const datasetComparisonScroll = document.querySelector("#dataset-comparison-scroll");
const exportCount = document.querySelector("#export-count");
const exportButton = document.querySelector("#export-button");
const exportFormat = document.querySelector("#export-format");
const languageSwitcher = document.querySelector("#language-switcher");
const viewTabs = [...document.querySelectorAll(".result-tab")];
const viewNote = document.querySelector("#view-note");
const authorsScope = document.querySelector("#authors-scope");
const authorsMore = document.querySelector("#authors-more");
const authorDialog = document.querySelector("#author-dialog");
const authorDialogTitle = document.querySelector("#author-dialog-title");
const authorDialogDescription = document.querySelector("#author-dialog-description");
const authorDialogCount = document.querySelector("#author-dialog-count");
const authorDialogClose = document.querySelector("#author-dialog-close");
const authorPublications = document.querySelector("#author-publications");
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
let authorDialogTrigger = null;
let pendingDatasetFilters = null;
let selectedDatasetKeys = new Set();
let comparingDatasets = false;

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
  const savedDatasetKeys = new Set(works.filter(isDataset).map(workKey));
  selectedDatasetKeys = new Set([...selectedDatasetKeys].filter(key => savedDatasetKeys.has(key)));
  exportCount.textContent = String(works.length);
  exportButton.disabled = works.length === 0;
  referencesClear.disabled = works.length === 0;
  referencesDialogCount.textContent = pluralMessage("savedCount", works.length);
  referencesEmpty.hidden = works.length > 0 || comparingDatasets;
  referencesList.hidden = works.length === 0 || comparingDatasets;
  datasetCompareNote.hidden = comparingDatasets || !works.some(isDataset);
  datasetComparison.hidden = !comparingDatasets;
  document.querySelector(".reference-list-toolbar").hidden = comparingDatasets;
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
      (work.authors || []).length ? authorPreview(work.authors) : t("noAuthors"),
      work.year || t("noYear"),
      work.journal || t("noVenue")
    ];
    main.append(element("p", "references-item-meta", metadata.join(" · ")));

    if (isDataset(work)) {
      const compare = document.createElement("input");
      compare.type = "checkbox";
      compare.className = "dataset-compare-checkbox";
      compare.checked = selectedDatasetKeys.has(workKey(work));
      compare.setAttribute("aria-label", t("datasetCompareSelection", { title: workTitle }));
      compare.dataset.workKey = workKey(work);
      compare.addEventListener("change", () => {
        if (compare.checked && selectedDatasetKeys.size < MAX_DATASET_COMPARISON) selectedDatasetKeys.add(compare.dataset.workKey);
        else if (!compare.checked) selectedDatasetKeys.delete(compare.dataset.workKey);
        else compare.checked = false;
        updateDatasetCompareControls();
      });
      const compareChoice = element("label", "dataset-compare-choice");
      compareChoice.append(compare, element("span", null, t("datasetCompareLabel")));
      item.append(compareChoice);
    }

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

  updateDatasetCompareControls();
  if (comparingDatasets) renderDatasetComparison();
}

function updateDatasetCompareControls() {
  const hasSavedDataset = referencesList.querySelector(".dataset-compare-checkbox") !== null;
  datasetCompareButton.hidden = !hasSavedDataset;
  datasetCompareButton.textContent = t("datasetCompareButton", {
    count: formatNumber(selectedDatasetKeys.size),
    max: formatNumber(MAX_DATASET_COMPARISON)
  });
  datasetCompareButton.disabled = selectedDatasetKeys.size < 2;
  for (const checkbox of referencesList.querySelectorAll(".dataset-compare-checkbox")) {
    checkbox.disabled = !checkbox.checked && selectedDatasetKeys.size >= MAX_DATASET_COMPARISON;
  }
}

function renderDatasetComparison() {
  const works = [...selectedDatasetKeys].map(key => favorites.get(key)).filter(work => work && isDataset(work));
  if (works.length < 2) {
    comparingDatasets = false;
    datasetComparison.hidden = true;
    return;
  }

  const table = document.createElement("table");
  table.className = "dataset-comparison-table";
  table.append(element("caption", null, t("datasetCompareCaption")));
  const header = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const rowLabel = element("th", "dataset-comparison-label", t("datasetDataProfile"));
  rowLabel.scope = "col";
  headerRow.append(rowLabel);
  for (const work of works) {
    const cell = document.createElement("th");
    cell.scope = "col";
    const recordUrl = work.datasetMetadata?.landingPage || work.url;
    cell.append(externalLink(recordUrl, work.title || t("untitled")));
    headerRow.append(cell);
  }
  header.append(headerRow);
  table.append(header);

  const body = document.createElement("tbody");
  for (const row of datasetComparisonRows(works)) {
    const rowElement = document.createElement("tr");
    const label = document.createElement("th");
    label.scope = "row";
    label.textContent = t(row.key);
    rowElement.append(label);
    row.values.forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = datasetComparisonValue(row.key, value);
      rowElement.append(cell);
    });
    body.append(rowElement);
  }
  table.append(body);
  datasetComparisonScroll.replaceChildren(table);
}

function datasetComparisonValue(key, value) {
  if (key === "datasetFileAvailability") return value ? t("datasetFilesReported", { count: formatNumber(value.count) }) : t("datasetFileLinksMissing");
  if (key === "datasetLicenseStatus") return t(value === "open" ? "datasetOpenLicense"
    : value === "restricted" ? "datasetRestrictedLicense"
      : value === "other" ? "datasetLicenseOther" : "datasetLicenseUnknown");
  if (key === "datasetLicense") return value || t("datasetNoLicense");
  if (key === "datasetUpdated") return formatDatasetDate(value) || t("datasetNotReported");
  if (key === "datasetRelated") {
    return value?.map(record => [record.title || record.url, record.resourceType && relatedKindLabel(record.resourceType), record.relation && relationLabel(record.relation)]
      .filter(Boolean).join(" · ")).join("; ") || t("datasetNotReported");
  }
  const text = String(value || "");
  if (!text) return t("datasetNotReported");
  return ["datasetDescription", "datasetDataMethods", "datasetTechnicalInfo"].includes(key) && text.length > 220 ? text.slice(0, 220).trimEnd() + "…" : text;
}

function authorPreview(authors, limit = 4) {
  const names = Array.isArray(authors) ? authors.filter(name => typeof name === "string" && name.trim()) : [];
  if (names.length <= limit) return names.join(", ");
  return `${names.slice(0, limit).join(", ")} ${t("andMoreAuthors", { count: formatNumber(names.length - limit) })}`;
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
  return summarizeAuthorRecords(works, getLanguage());
}

function updateViewControls(publications, authors, datasets) {
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
  }[activeView]) + (activeView === "datasets" && activeFilters && activeFilters.period !== "all" ? " " + t("datasetYearPrecision") : "");
  authorsScope.hidden = activeView !== "authors";
  authorsScope.textContent = t("authorScope", {
    count: formatNumber(publications.length)
  });
  publicationTypeField.hidden = !publicationTypeFilterVisible(activeView);
  datasetFiltersPanel.hidden = activeView !== "datasets" || !activeFilters || !datasets.length;
  updateDatasetFilterControls(datasets);
  datasetDownloadSort.hidden = activeView !== "datasets";
  datasetDownloadSort.disabled = activeView !== "datasets";
  const loadMoreLabel = more.querySelector("[data-i18n]");
  if (loadMoreLabel) loadMoreLabel.textContent = t(activeView === "authors" ? "loadMoreAuthors" : "loadMore");
}

function updateDatasetFilterControls(datasets) {
  const options = datasetFilterOptions(datasets);
  const selected = pendingDatasetFilters || currentDatasetFilters();
  setDatasetFilterOptions(datasetRepository, options.repositories, "datasetAllRepositories", selected.repository);
  setDatasetFilterOptions(datasetFormat, options.formats, "datasetAllFormats", selected.format);
  if (pendingDatasetFilters) {
    datasetRelatedOnly.checked = pendingDatasetFilters.hasRelated;
    datasetLocation.value = pendingDatasetFilters.location;
    pendingDatasetFilters = null;
  }
  datasetFiltersClear.disabled = !datasetFiltersActive();
}

function setDatasetFilterOptions(select, values, allKey, preferredValue = "") {
  const restoreFocus = document.activeElement === select;
  const selected = preferredValue || select.value;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = t(allKey);
  select.replaceChildren(placeholder);
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
  if (selected && !values.includes(selected)) {
    const option = document.createElement("option");
    option.value = selected;
    option.textContent = selected;
    select.append(option);
  }
  select.disabled = values.length === 0 && !selected;
  select.value = selected;
  if (restoreFocus) select.focus({ preventScroll: true });
}

function currentDatasetFilters() {
  return {
    repository: datasetRepository.value,
    format: datasetFormat.value,
    hasRelated: datasetRelatedOnly.checked,
    location: datasetLocation.value
  };
}

function datasetFiltersActive() {
  const filters = currentDatasetFilters();
  return Boolean(filters.repository || filters.format || filters.hasRelated || filters.location.trim());
}

function resetDatasetFilters() {
  pendingDatasetFilters = null;
  datasetRepository.value = "";
  datasetFormat.value = "";
  datasetRelatedOnly.checked = false;
  datasetLocation.value = "";
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
    const contact = element("div", "author-contact");
    for (const email of author.emails) {
      const link = element("a", "author-email", email);
      link.href = "mailto:" + email;
      contact.append(link);
    }
    for (const profile of author.links) {
      const labelKey = profile.label === "ORCID" ? "authorOrcid" : profile.label === "OpenAlex" ? "authorOpenAlex" : "authorProfile";
      const link = element("a", "author-profile", t(labelKey));
      link.href = profile.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      contact.append(link);
    }
    if (contact.childElementCount) card.append(contact);
    const records = pluralMessage("authorWorkCount", author.records);
    const citations = author.citationRecords
      ? pluralMessage("citationCount", author.citations)
      : t("citationUnavailable");
    card.append(element("p", "author-metrics", `${records} · ${citations}`));
    const button = element("button", "author-results", t("openAuthorResults"));
    button.type = "button";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", "author-dialog");
    button.addEventListener("click", () => openAuthorDialog(author, button));
    card.append(button);
    grid.append(card);
  }
  list.append(grid);
  return true;
}

function visibleWorks(works) {
  const matchingType = activeView === "datasets" ? datasetItems(works) : publicationItems(works);
  return activeView === "datasets"
    ? rankDatasets(filterDatasets(matchingType, currentDatasetFilters()), sortSelect.value)
    : activeView === "authors"
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
  const datasets = datasetItems(items);
  list.replaceChildren();
  updateViewControls(publications, authors, datasets);
  const works = visibleWorks(items);
  authorsMore.hidden = true;

  if (activeView === "authors") {
    if (!renderAuthors(authors)) {
      renderEmpty("authorsEmptyTitle", "resultsEmptyText");
    }
  } else if (!works.length) {
    const filteredDatasets = activeFilters && activeView === "datasets" && datasetFiltersActive();
    const emptyTitle = filteredDatasets ? "datasetFiltersEmptyTitle" : activeFilters && activeView === "datasets" ? "datasetsEmptyTitle" : "resultsEmptyTitle";
    const emptyText = filteredDatasets ? "datasetFiltersEmptyText" : "resultsEmptyText";
    renderEmpty(emptyTitle, emptyText);
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
  const total = totalMatches();
  count.textContent = selectedAuthor
      ? t("authorWorksCount", { name: selectedAuthor, count: formatNumber(works.length) })
      : activeView === "authors"
        ? t("authorResultsCount", { authors: formatNumber(authors.length), records: formatNumber(publications.length) })
        : activeView === "datasets" && datasetFiltersActive()
          ? t("datasetFilteredCount", { shown: formatNumber(works.length), loaded: formatNumber(datasets.length) })
        : works.length
          ? Number.isFinite(total)
            ? t("loadedCount", { loaded: formatNumber(works.length), total: formatNumber(total) })
            : t("showingCountOnly", { loaded: formatNumber(works.length) })
          : "";
  exportButton.disabled = favorites.size === 0;
  more.hidden = !Object.values(providerProgress).some(progress => progress.hasMore);
}

function totalMatches() {
  const totals = Object.values(providerTotals);
  return totals.length && totals.every(Number.isFinite) ? totals.reduce((sum, value) => sum + value, 0) : null;
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
  if (String(work.type || "").toLowerCase() === "dataset") return datasetCard(work);
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
  save.dataset.workKey = key;
  save.addEventListener("click", () => {
    toggleFavorite(work, save);
    if (authorDialog.open) {
      const isSaved = favorites.has(key);
      save.textContent = isSaved ? t("inCart") : t("addToCart");
      save.setAttribute("aria-pressed", String(isSaved));
      save.setAttribute("aria-label", t(isSaved ? "removeFromCart" : "addToCartLabel", { title: workTitle }));
    }
  });
  article.append(headingRow);

  const details = [
    (work.authors || []).length ? authorPreview(work.authors) : t("noAuthors"),
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

function openAuthorDialog(author, trigger) {
  const works = worksForAuthor(publicationItems(loadedItems), author, getLanguage());
  const visibleWorks = works.slice(0, 10);
  authorDialogTrigger = trigger;
  authorDialogTitle.textContent = t("worksByAuthor", { name: author.name });
  authorDialogDescription.textContent = activeFilters
    ? t("authorPapersFor", { query: activeFilters.query })
    : t("authorPapersGeneral");
  authorDialogCount.textContent = t("authorPapersCount", {
    shown: formatNumber(visibleWorks.length),
    count: formatNumber(works.length)
  });
  authorPublications.replaceChildren();

  if (visibleWorks.length) {
    for (const work of visibleWorks) authorPublications.append(resultCard(work));
  } else {
    authorPublications.append(element("p", "author-papers-empty", t("authorPapersEmpty")));
  }

  authorDialog.showModal();
  authorDialogClose.focus();
}

function toggleFavorite(work, focusButton = null) {
  const nextFavorites = new Map(favorites);
  const key = workKey(work);
  const restoreResultFocus = !authorDialog.open && focusButton && document.activeElement === focusButton;
  const removing = nextFavorites.has(key);
  if (removing) nextFavorites.delete(key);
  else if (nextFavorites.size >= MAX_FAVORITES) {
    setStatus(t("maxFavorites", { count: MAX_FAVORITES }));
    return;
  } else nextFavorites.set(key, work);
  const persisted = persistFavorites(nextFavorites);
  favorites = nextFavorites;
  refreshSavedCount();
  if (!authorDialog.open) {
    renderCurrentItems();
    if (restoreResultFocus) {
      const focusTarget = [...list.querySelectorAll(".save-button")].find(button => button.dataset.workKey === key);
      focusTarget?.focus();
    }
  }
  if (!persisted) setStatus(t("storageFailure"));
  else setStatus(t(removing ? "removedFromCart" : "addedToCart"));
}

function datasetCard(work) {
  const metadata = work.datasetMetadata || {};
  const article = element("article", "result dataset-card");
  const badges = element("div", "result-badges");
  badges.append(element("span", "type-tag", t("typeDataset")));
  if (metadata.resourceType) badges.append(element("span", "type-tag dataset-resource-type", metadata.resourceType));
  if (work.openAccess === true) badges.append(element("span", "oa-tag", t("datasetOpenLicense")));
  else if (work.openAccess === false) badges.append(element("span", "oa-tag dataset-restricted", t("datasetRestrictedLicense")));
  else badges.append(element("span", "type-tag", metadata.licenses?.length ? t("datasetLicenseOther") : t("datasetLicenseUnknown")));
  article.append(badges);

  const heading = element("h3");
  const title = work.title || t("untitled");
  const landingPage = metadata.landingPage || work.url || (normalizeDoi(work.doi) ? "https://doi.org/" + normalizeDoi(work.doi) : "");
  const link = externalLink(landingPage, title);
  heading.append(link);
  article.append(heading);

  const summary = [metadata.publisher || work.journal, work.year || t("noYear")];
  if (Number.isFinite(work.citations)) summary.push(pluralMessage("citationCount", work.citations));
  article.append(element("p", "meta dataset-summary", summary.filter(Boolean).join(" · ") || t("noVenue")));
  if (safeExternalUrl(metadata.landingPage)) {
    const recordLink = element("p", "dataset-record-link");
    recordLink.append(externalLink(metadata.landingPage, t("datasetOpenRepository")));
    article.append(recordLink);
  }

  const creators = metadata.creators?.length ? metadata.creators : (work.authors || []).map(name => ({ name, affiliations: [] }));
  if (creators.length) {
    const creatorSection = element("section", "dataset-section dataset-creators");
    creatorSection.append(element("h4", null, t("datasetCreators")));
    const creatorList = document.createElement("ul");
    for (const creator of creators.slice(0, 8)) {
      const item = document.createElement("li");
      item.append(externalLink(creator.orcid, creator.name));
      if (creator.affiliations?.length) item.append(element("span", "dataset-affiliation", creator.affiliations.join(" · ")));
      creatorList.append(item);
    }
    if (creators.length > 8) creatorList.append(element("li", "dataset-creator-more", t("andMoreAuthors", { count: formatNumber(creators.length - 8) })));
    creatorSection.append(creatorList);
    article.append(creatorSection);
  }

  const description = metadata.description || work.abstract || "";
  if (description) {
    const descriptionSection = element("section", "dataset-section dataset-description");
    descriptionSection.append(element("h4", null, t("datasetDescription")));
    if (description.length > 520) {
      descriptionSection.append(element("p", null, description.slice(0, 520).trimEnd() + "…"));
      const expanded = document.createElement("details");
      expanded.append(element("summary", null, t("datasetShowDescription")), element("p", null, description));
      descriptionSection.append(expanded);
    } else {
      descriptionSection.append(element("p", null, description));
    }
    article.append(descriptionSection);
  }

  const profileFacts = document.createElement("dl");
  profileFacts.className = "dataset-facts dataset-profile-facts";
  appendDatasetFact(profileFacts, "datasetDataType", metadata.resourceType);
  appendDatasetFact(profileFacts, "datasetSubjects", metadata.subjects?.slice(0, 4).join(" · "));
  appendDatasetFact(profileFacts, "datasetCollectionPeriod", metadata.periods?.join(" · "));
  appendDatasetFact(profileFacts, "datasetCoverage", metadata.locations?.join(" · "));
  appendDatasetFact(profileFacts, "datasetFormats", metadata.formats?.join(" · "));
  appendDatasetFact(profileFacts, "datasetSizes", metadata.sizes?.join(" · "));
  appendDatasetFact(profileFacts, "datasetDataMethods", shortDatasetText((metadata.methods || []).join(" · "), 260));
  appendDatasetFact(profileFacts, "datasetTechnicalInfo", shortDatasetText((metadata.technicalInfo || []).join(" · "), 260));
  if (profileFacts.childElementCount) {
    const profile = element("section", "dataset-section dataset-profile");
    profile.append(element("h4", null, t("datasetDataProfile")), profileFacts);
    article.append(profile);
  }

  const reuseSection = element("section", "dataset-section dataset-reuse");
  reuseSection.append(element("h4", null, t("datasetReuse")));
  const reuseFacts = document.createElement("dl");
  reuseFacts.className = "dataset-facts dataset-reuse-facts";
  appendDatasetLicenseFact(reuseFacts, metadata.licenses || [], work.openAccess);
  appendDatasetFact(reuseFacts, "datasetFileAvailability", metadata.accessUrls?.length
    ? t("datasetFilesReported", { count: formatNumber(metadata.accessUrls.length) })
    : t("datasetFileLinksMissing"));
  reuseSection.append(reuseFacts);
  if (metadata.accessUrls?.length) {
    const files = element("div", "dataset-files");
    for (const [index, url] of metadata.accessUrls.slice(0, 6).entries()) {
      files.append(externalLink(url, t("datasetOpenFile", { number: formatNumber(index + 1) })));
    }
    reuseSection.append(files);
  }
  article.append(reuseSection);

  if (metadata.related?.length) {
    const relatedSection = element("section", "dataset-section dataset-related");
    relatedSection.append(element("h4", null, t("datasetRelated")));
    const relatedList = document.createElement("ul");
    for (const record of metadata.related.slice(0, 5)) {
      const item = document.createElement("li");
      item.append(externalLink(record.url, record.title || record.url || t("datasetRelatedRecord")));
      if (record.resourceType) item.append(element("span", "dataset-relation", relatedKindLabel(record.resourceType)));
      if (record.relation) item.append(element("span", "dataset-relation", relationLabel(record.relation)));
      relatedList.append(item);
    }
    relatedSection.append(relatedList);
    article.append(relatedSection);
  }

  const additionalDetails = document.createElement("details");
  additionalDetails.className = "dataset-additional-details";
  additionalDetails.append(element("summary", null, t("datasetMoreDetails")));
  const detailSections = [];
  const versionFacts = document.createElement("dl");
  versionFacts.className = "dataset-facts dataset-extra-facts";
  appendDatasetFact(versionFacts, "datasetVersion", metadata.version);
  appendDatasetFact(versionFacts, "datasetUpdated", formatDatasetDate(metadata.updated));
  if (versionFacts.childElementCount) detailSections.push(versionFacts);
  if (metadata.subjects?.length > 4) detailSections.push(datasetTagSection("datasetSubjects", metadata.subjects.slice(4)));
  if (metadata.funding?.length) {
    const funding = metadata.funding.map(entry => [entry.funder, entry.award && `${t("datasetAward")} ${entry.award}`, entry.title].filter(Boolean).join(" · ")).filter(Boolean);
    if (funding.length) detailSections.push(datasetTagSection("datasetFunding", funding));
  }

  const usage = [];
  if (Number.isFinite(work.downloads)) usage.push(t("datasetDownloads", { count: formatNumber(work.downloads) }));
  if (Number.isFinite(work.views)) usage.push(t("datasetViews", { count: formatNumber(work.views) }));
  if (usage.length) detailSections.push(element("p", "dataset-usage", usage.join(" · ")));

  const gaps = [];
  if (!description) gaps.push(t("datasetFieldDescription"));
  if (!metadata.licenses?.length) gaps.push(t("datasetFieldLicense"));
  if (!metadata.formats?.length) gaps.push(t("datasetFieldFormat"));
  if (!metadata.accessUrls?.length) gaps.push(t("datasetFieldFile"));
  if (gaps.length) detailSections.push(element("p", "dataset-gaps", t("datasetMetadataGaps", { fields: gaps.join(", ") })));
  if (detailSections.length) {
    for (const section of detailSections) additionalDetails.append(section);
    article.append(additionalDetails);
  }

  const doi = normalizeDoi(work.doi);
  if (doi) {
    const doiLine = element("p", "doi-line");
    doiLine.append(externalLink("https://doi.org/" + doi, "DOI: " + doi));
    article.append(doiLine);
  }

  const key = workKey(work);
  const saved = favorites.has(key);
  const save = element("button", "save-button", saved ? t("inCart") : t("addToCart"));
  save.type = "button";
  save.setAttribute("aria-pressed", String(saved));
  save.setAttribute("aria-label", t(saved ? "removeFromCart" : "addToCartLabel", { title }));
  save.dataset.workKey = key;
  save.addEventListener("click", () => {
    toggleFavorite(work, save);
    if (authorDialog.open) {
      const isSaved = favorites.has(key);
      save.textContent = isSaved ? t("inCart") : t("addToCart");
      save.setAttribute("aria-pressed", String(isSaved));
      save.setAttribute("aria-label", t(isSaved ? "removeFromCart" : "addToCartLabel", { title }));
    }
  });
  const actions = element("div", "result-actions");
  actions.append(save);
  article.append(actions);
  return article;
}

function shortDatasetText(value, limit) {
  const text = String(value || "").trim();
  return text.length > limit ? text.slice(0, limit).trimEnd() + "…" : text;
}

function externalLink(url, label) {
  const safeUrl = safeExternalUrl(url);
  if (!safeUrl) return element("span", null, label);
  const link = element("a", null, label);
  link.href = safeUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function appendDatasetFact(list, labelKey, value) {
  if (!value) return;
  const fact = document.createElement("div");
  fact.className = "dataset-fact";
  fact.append(element("dt", null, t(labelKey)), element("dd", null, value));
  list.append(fact);
}

function appendDatasetLicenseFact(list, licenses, status) {
  const fact = document.createElement("div");
  fact.className = "dataset-fact";
  fact.append(element("dt", null, t("datasetLicense")));
  const value = document.createElement("dd");
  if (!licenses.length) {
    value.textContent = t("datasetNoLicense");
  } else {
    for (const [index, license] of licenses.slice(0, 3).entries()) {
      if (index) value.append(document.createTextNode(" · "));
      value.append(externalLink(license.url, license.label || license.identifier || t("datasetLicenseTerms")));
    }
    value.append(element("span", "dataset-license-status", t(
      status === true ? "datasetOpenLicense" : status === false ? "datasetRestrictedLicense" : "datasetLicenseOther"
    )));
  }
  fact.append(value);
  list.append(fact);
}

function datasetTagSection(labelKey, values) {
  const section = element("section", "dataset-section dataset-tag-section");
  section.append(element("h4", null, t(labelKey)));
  const tags = document.createElement("ul");
  for (const value of values.slice(0, 10)) tags.append(element("li", null, value));
  section.append(tags);
  return section;
}

function formatDatasetDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(getLanguage(), { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function relationLabel(relation) {
  const translations = {
    iscitedby: "datasetRelationCitedBy",
    isreferencedby: "datasetRelationReferencedBy",
    cites: "datasetRelationCites",
    references: "datasetRelationReferences",
    issupplementto: "datasetRelationSupplementTo",
    issupplementedby: "datasetRelationSupplementedBy"
  };
  return t(translations[String(relation || "").toLowerCase()] || "datasetRelatedRelation", { relation });
}

function relatedKindLabel(resourceType) {
  const type = String(resourceType || "").toLowerCase().replace(/[^a-z]/g, "");
  if (type === "dataset" || type.includes("dataset")) return t("datasetRelatedDataset");
  if (["text", "article", "journalarticle", "book", "bookchapter", "conferencepaper", "preprint", "dissertation", "thesis", "report"].includes(type)) {
    return t("datasetRelatedPublication");
  }
  return t("datasetRelatedResource");
}

function clearReferenceList() {
  if (favorites.size === 0) return;
  const nextFavorites = new Map();
  const persisted = persistFavorites(nextFavorites);
  favorites = nextFavorites;
  selectedDatasetKeys.clear();
  comparingDatasets = false;
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
    openAccessOnly: openAccessInput.checked,
    publicationType: publicationTypeSelect.value,
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
  for (const key of ["q", "from", "to", "period", "type", "pubType", "oa", "sort", "sources", "view", "author"]) url.searchParams.delete(key);
  url.searchParams.set("q", filters.query);
  if (filters.period !== "all") url.searchParams.set("period", filters.period);
  if (filters.period === "custom" && filters.yearFrom) url.searchParams.set("from", filters.yearFrom);
  if (filters.period === "custom" && filters.yearTo) url.searchParams.set("to", filters.yearTo);
  if (activeView === "publications" && filters.publicationType !== "all") url.searchParams.set("pubType", filters.publicationType);
  if (filters.openAccessOnly) url.searchParams.set("oa", "1");
  if (filters.sort !== "relevance") url.searchParams.set("sort", filters.sort);
  if (activeView !== "publications") url.searchParams.set("view", activeView);
  if (selectedAuthor) url.searchParams.set("author", selectedAuthor);
  writeDatasetFilters(url.searchParams, pendingDatasetFilters || currentDatasetFilters());
  url.searchParams.delete("lang");
  history.replaceState(null, "", url);
}

function filtersFromUrl() {
  const url = new URL(location.href);
  const query = url.searchParams.get("q");
  if (!query) return;
  pendingDatasetFilters = readDatasetFilters(url.searchParams);
  queryInput.value = query.slice(0, 250);
  yearFromInput.value = validYear(url.searchParams.get("from")) ? url.searchParams.get("from") : "";
  yearToInput.value = validYear(url.searchParams.get("to")) ? url.searchParams.get("to") : "";
  const period = url.searchParams.get("period");
  periodInput.value = ["all", "1", "2", "5", "10", "custom"].includes(period)
    ? period
    : yearFromInput.value || yearToInput.value ? "custom" : "all";
  updateCustomYearRange();
  const publicationType = url.searchParams.get("pubType");
  publicationTypeSelect.value = ["all", "article", "preprint", "book"].includes(publicationType) ? publicationType : "all";
  openAccessInput.checked = url.searchParams.get("oa") === "1";
  const view = url.searchParams.get("view");
  activeView = ["publications", "authors", "datasets"].includes(view)
    ? view
    : url.searchParams.get("type") === "dataset" ? "datasets" : "publications";
  selectedAuthor = activeView === "publications" ? (url.searchParams.get("author") || "").slice(0, 250) : "";
  const sort = url.searchParams.get("sort");
  if (["newest", "cited"].includes(sort) || (sort === "downloads" && activeView === "datasets")) sortSelect.value = sort;
  form.requestSubmit();
}

function clearSearchFromUrlOnReload() {
  const navigation = performance.getEntriesByType("navigation")[0];
  if (navigation?.type !== "reload") return false;
  queryInput.value = "";
  const url = new URL(location.href);
  for (const key of ["q", "from", "to", "period", "type", "pubType", "oa", "sort", "sources", "view", "author", "repo", "format", "related", "location"]) url.searchParams.delete(key);
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
  } else if (!loadedItems.length && activeFilters?.openAccessOnly && Object.values(providerProgress).some(progress => progress.hasMore)) {
    setStatus(t("openAccessMoreToCheck"));
  } else if (!loadedItems.length) {
    setStatus(t("noResults"));
  } else {
    const sources = available.join(getLanguage() === "en" ? " and " : getLanguage() === "es" ? " y " : " e ");
    setStatus(t(append ? "moreLoaded" : "sourcesConsulted", { sources }));
  }
}

function selectView(view) {
  if (!["publications", "authors", "datasets"].includes(view) || activeView === view) return;
  const previousSearchType = activeFilters ? searchTypeForView(activeView, activeFilters.publicationType) : null;
  if (view !== "datasets" && sortSelect.value === "downloads") sortSelect.value = "relevance";
  activeView = view;
  selectedAuthor = "";
  showAllAuthors = false;
  updateShareUrl(activeFilters);
  if (activeFilters && previousSearchType !== searchTypeForView(activeView, activeFilters.publicationType)) runSearch();
  else renderCurrentItems();
}

async function runSearch(append = false) {
  if (!activeFilters) return;
  if (controller) controller.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const currentRequest = ++requestId;
  const searchFilters = { ...activeFilters, type: searchTypeForView(activeView, activeFilters.publicationType) };

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
  const datasetScopeChanged = !activeFilters || ["query", "fromDate", "toDate", "openAccessOnly"].some(key => activeFilters[key] !== filters[key]);
  if (datasetScopeChanged && !pendingDatasetFilters) resetDatasetFilters();
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
function updateDatasetRefinements() {
  updateShareUrl(activeFilters);
  renderCurrentItems();
}

datasetRepository.addEventListener("change", updateDatasetRefinements);
datasetFormat.addEventListener("change", updateDatasetRefinements);
datasetRelatedOnly.addEventListener("change", updateDatasetRefinements);
datasetLocation.addEventListener("input", updateDatasetRefinements);
datasetFiltersClear.addEventListener("click", () => {
  resetDatasetFilters();
  updateShareUrl(activeFilters);
  renderCurrentItems();
});
publicationTypeSelect.addEventListener("change", () => {
  if (activeFilters) form.requestSubmit();
});
openAccessInput.addEventListener("change", () => {
  if (activeFilters) form.requestSubmit();
});
periodInput.addEventListener("change", updateCustomYearRange);
savedToggle.addEventListener("click", openReferencesDialog);
referencesClear.addEventListener("click", clearReferenceList);
datasetCompareButton.addEventListener("click", () => {
  if (selectedDatasetKeys.size < 2) return;
  comparingDatasets = true;
  renderSavedReferences();
  datasetComparisonBack.focus();
});
datasetComparisonBack.addEventListener("click", () => {
  comparingDatasets = false;
  renderSavedReferences();
  datasetCompareButton.focus();
});
referencesDialogClose.addEventListener("click", () => referencesDialog.close());
referencesDialog.addEventListener("close", () => {
  savedToggle.setAttribute("aria-expanded", "false");
  savedToggle.focus();
});
authorDialogClose.addEventListener("click", () => authorDialog.close());
authorDialog.addEventListener("close", () => {
  if (authorDialogTrigger?.isConnected) authorDialogTrigger.focus();
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
