export function mergeResultCounts(current, queryType, next) {
  const counts = { ...current };
  if (queryType === "dataset") {
    counts.datasets = next.datasets;
    return counts;
  }

  counts.publications = next.publications;
  counts.authors = next.authors;
  if (counts.datasets == null) counts.datasets = next.datasets;
  return counts;
}
