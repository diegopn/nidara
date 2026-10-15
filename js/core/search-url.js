const FILTERS = ["repo", "format", "related", "location"];

export function readDatasetFilters(searchParams) {
  return {
    repository: clean(searchParams.get("repo"), 160),
    format: clean(searchParams.get("format"), 100),
    hasRelated: searchParams.get("related") === "1",
    location: clean(searchParams.get("location"), 200)
  };
}

export function writeDatasetFilters(searchParams, filters = {}) {
  for (const key of FILTERS) searchParams.delete(key);
  const values = [
    ["repo", clean(filters.repository, 160)],
    ["format", clean(filters.format, 100)],
    ["related", filters.hasRelated ? "1" : ""],
    ["location", clean(filters.location, 200)]
  ];
  for (const [key, value] of values) {
    if (value) searchParams.set(key, value);
  }
  return searchParams;
}

function clean(value, limit) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ").slice(0, limit);
}
