const ENDPOINT = "https://api.openalex.org/works";
export async function searchWorks({ query, year, sort = "relevance", page = 1, signal }) {
  const url = new URL(ENDPOINT);
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", "15");
  url.searchParams.set("page", String(page));
  url.searchParams.set("select", "id,doi,display_name,publication_year,authorships,primary_location,cited_by_count,open_access,abstract_inverted_index");
  if (year) url.searchParams.set("filter", "from_publication_date:" + year + "-01-01");
  if (sort === "newest") url.searchParams.set("sort", "publication_date:desc");
  if (sort === "cited") url.searchParams.set("sort", "cited_by_count:desc");
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("OpenAlex retornou HTTP " + response.status);
  const data = await response.json();
  return { total: data.meta?.count ?? 0, items: (data.results ?? []).map(normalizeWork) };
}
function abstractFromIndex(index) {
  if (!index) return "";
  const words = [];
  for (const [word, positions] of Object.entries(index)) for (const position of positions) words[position] = word;
  return words.join(" ").slice(0, 520);
}
function normalizeWork(work) {
  return {
    id: work.id,
    title: work.display_name || "Sem título",
    year: work.publication_year,
    authors: (work.authorships ?? []).slice(0, 5).map(a => a.author?.display_name).filter(Boolean),
    journal: work.primary_location?.source?.display_name ?? "",
    citations: work.cited_by_count ?? 0,
    url: work.doi || work.primary_location?.landing_page_url || work.id,
    openAccess: !!work.open_access?.is_oa,
    abstract: abstractFromIndex(work.abstract_inverted_index),
    provider: "OpenAlex"
  };
}