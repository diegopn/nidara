const PUBLICATION_RESOURCE_TYPES = new Set([
  "text", "article", "journalarticle", "book", "bookchapter", "conferencepaper",
  "preprint", "dissertation", "thesis", "report", "peerreview"
]);

export function datasetComparisonRows(works) {
  const entries = [
    ["datasetRepository", work => work.datasetMetadata?.publisher || work.journal],
    ["datasetDataType", work => work.datasetMetadata?.resourceType],
    ["datasetCreators", work => {
      const creators = work.datasetMetadata?.creators?.length ? work.datasetMetadata.creators : work.authors || [];
      return creators.map(creator => typeof creator === "string" ? creator : creator.name).filter(Boolean).join(", ");
    }],
    ["datasetDescription", work => work.datasetMetadata?.description || work.abstract],
    ["datasetDataMethods", work => (work.datasetMetadata?.methods || []).join(" · ")],
    ["datasetTechnicalInfo", work => (work.datasetMetadata?.technicalInfo || []).join(" · ")],
    ["datasetCollectionPeriod", work => (work.datasetMetadata?.periods || []).join(" · ")],
    ["datasetCoverage", work => (work.datasetMetadata?.locations || []).join(" · ")],
    ["datasetSubjects", work => (work.datasetMetadata?.subjects || []).join(" · ")],
    ["datasetFormats", work => (work.datasetMetadata?.formats || []).join(" · ")],
    ["datasetSizes", work => (work.datasetMetadata?.sizes || []).join(" · ")],
    ["datasetFileAvailability", work => {
      const count = (work.datasetMetadata?.accessUrls || []).length;
      return count ? { count } : null;
    }],
    ["datasetLicense", work => (work.datasetMetadata?.licenses || []).map(license => license.label || license.identifier || license.url).filter(Boolean).join(" · ")],
    ["datasetLicenseStatus", work => work.openAccess === true ? "open" : work.openAccess === false ? "restricted" : work.datasetMetadata?.licenses?.length ? "other" : "unknown"],
    ["datasetRelated", work => work.datasetMetadata?.related?.length ? work.datasetMetadata.related : null],
    ["datasetVersion", work => work.datasetMetadata?.version],
    ["datasetUpdated", work => work.datasetMetadata?.updated],
    ["datasetPublishedYear", work => work.year],
    ["datasetDoi", work => work.doi]
  ];
  return entries.map(([key, read]) => ({ key, values: works.map(work => read(work) || null) }))
    .filter(row => ["datasetFileAvailability", "datasetLicenseStatus"].includes(row.key) || row.values.some(Boolean));
}

export function datasetFilterOptions(works) {
  const repositories = new Set();
  const formats = new Set();
  for (const work of works) {
    const metadata = work.datasetMetadata || {};
    if (metadata.publisher?.trim()) repositories.add(metadata.publisher.trim());
    for (const format of metadata.formats || []) {
      if (typeof format === "string" && format.trim()) formats.add(format.trim());
    }
  }
  const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  return {
    repositories: [...repositories].sort(collator.compare),
    formats: [...formats].sort(collator.compare)
  };
}

export function filterDatasets(works, filters = {}) {
  const repository = normalize(filters.repository);
  const format = normalize(filters.format);
  const location = normalize(filters.location);
  return works.filter(work => {
    const metadata = work.datasetMetadata || {};
    if (repository && normalize(metadata.publisher) !== repository) return false;
    if (format && !(metadata.formats || []).some(value => normalize(value) === format)) return false;
    if (filters.hasRelated && !hasRelatedPublication(metadata)) return false;
    if (filters.openLicenseOnly && work.openAccess !== true) return false;
    if (location && !(metadata.locations || []).some(value => normalize(value).includes(location))) return false;
    return true;
  });
}

export function hasRelatedPublication(metadata = {}) {
  return (metadata.related || []).some(record => PUBLICATION_RESOURCE_TYPES.has(normalize(record?.resourceType).replace(/[^a-z]/g, "")));
}

export function rankDatasets(works, sort = "relevance") {
  if (sort !== "relevance") return works;
  return works.map((work, index) => ({ work, index, score: datasetReadinessScore(work) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(entry => entry.work);
}

export function datasetReadinessScore(work) {
  const metadata = work.datasetMetadata || {};
  let score = 0;
  if ((metadata.accessUrls || []).some(value => typeof value === "string" && value.trim())) score += 4;
  if (work.openAccess === true) score += 3;
  else if ((metadata.licenses || []).some(license => license?.label || license?.identifier || license?.url)) score += 1;
  if ((metadata.formats || []).some(value => typeof value === "string" && value.trim())) score += 2;
  if (String(metadata.description || work.abstract || "").trim()) score += 1;
  if (hasRelatedPublication(metadata)) score += 1;
  return score;
}

function normalize(value) {
  return String(value || "").trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
}
