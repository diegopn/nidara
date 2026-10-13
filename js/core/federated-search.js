import { providers } from "../providers/index.js";
import { deduplicateWorks, mergeWorks, workKey } from "./work-utils.js";

const CACHE_TTL = 5 * 60 * 1000;
const responseCache = new Map();

export async function federatedSearch({ filters, pages, sourceIds, signal }) {
  const active = providers.filter(provider => sourceIds.includes(provider.id));
  const settled = await Promise.allSettled(active.map(async provider => ({
    provider,
    result: await cachedSearch(provider, { ...filters, page: pages[provider.id] || 1 }, signal)
  })));

  const sources = settled.map((entry, index) => {
    const provider = active[index];
    if (entry.status === "rejected") return { id: provider.id, label: provider.label, error: entry.reason };
    return { id: provider.id, label: provider.label, result: entry.value.result };
  });
  const successful = sources.filter(source => source.result);
  const rawItems = successful.flatMap(source => source.result.items);
  const items = orderWorks(successful, filters.sort);

  return {
    sources,
    items,
    total: successful.reduce((sum, source) => sum + source.result.total, 0),
    hasMore: successful.some(source => source.result.hasMore),
    rawCount: rawItems.length
  };
}

async function cachedSearch(provider, filters, signal) {
  const key = JSON.stringify({ provider: provider.id, query: filters.query, fromDate: filters.fromDate, toDate: filters.toDate, type: filters.type, sort: filters.sort, page: filters.page });
  const now = Date.now();
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) responseCache.delete(key);

  const result = await provider.search({ ...filters, signal });
  responseCache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL });
  if (responseCache.size > 80) responseCache.delete(responseCache.keys().next().value);
  return result;
}

function orderWorks(sources, sort) {
  const unique = new Map();
  for (const source of sources) {
    for (const work of source.result.items) {
      const key = workKey(work);
      unique.set(key, unique.has(key) ? mergeWorks(unique.get(key), work) : work);
    }
  }

  const works = [...unique.values()];
  if (sort === "newest") {
    return works.sort((a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title));
  }
  if (sort === "cited") {
    return works.sort((a, b) => (b.citations ?? -1) - (a.citations ?? -1) || a.title.localeCompare(b.title));
  }

  const byKey = new Map(works.map(work => [workKey(work), work]));
  const output = [];
  const length = Math.max(0, ...sources.map(source => source.result.items.length));
  for (let index = 0; index < length; index += 1) {
    for (const source of sources) {
      const candidate = source.result.items[index];
      if (!candidate) continue;
      const key = workKey(candidate);
      const work = byKey.get(key);
      if (work && !output.includes(work)) output.push(work);
    }
  }
  return deduplicateWorks(output);
}
