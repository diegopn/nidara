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
    if (filters.hasRelated && !(metadata.related || []).length) return false;
    if (filters.openLicenseOnly && work.openAccess !== true) return false;
    if (location && !(metadata.locations || []).some(value => normalize(value).includes(location))) return false;
    return true;
  });
}

function normalize(value) {
  return String(value || "").trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
}
