import { authorIdentityKey, safeExternalUrl, sameAuthorIdentity } from "./work-utils.js";

export function summarizeAuthors(works, locale = "en") {
  const authors = [];
  const authorIndex = new Map();

  for (const work of works) {
    const profiles = Array.isArray(work.authorProfiles) && work.authorProfiles.length
      ? work.authorProfiles
      : (work.authors || []).map(name => ({ name }));
    const seenInWork = new Set();

    for (const profile of profiles) {
      const name = typeof profile?.name === "string" ? profile.name.trim().replace(/\s+/g, " ") : "";
      if (!name) continue;
      const identity = { ...profile, name };
      const keys = authorLookupKeys(identity, locale);
      let author;
      for (const key of keys) {
        const candidate = authorIndex.get(key);
        if (candidate && sameAuthorIdentity(candidate.identity, identity, locale)) {
          author = candidate;
          break;
        }
      }
      if (!author) {
        author = { name, identity, records: 0, citations: 0, citationRecords: 0, emails: [], links: [] };
        authors.push(author);
      }
      for (const field of ["orcid", "profileUrl"]) {
        if (!author.identity[field] && typeof identity[field] === "string" && identity[field].trim()) author.identity[field] = identity[field].trim();
      }
      for (const key of keys) {
        const indexed = authorIndex.get(key);
        if (!indexed || sameAuthorIdentity(indexed.identity, identity, locale)) authorIndex.set(key, author);
      }
      const email = safeEmail(profile.email);
      if (email && !author.emails.some(value => value.toLowerCase() === email.toLowerCase())) author.emails.push(email);

      addAuthorLink(author, profile.orcid, "ORCID");
      const profileUrl = safeExternalUrl(profile.profileUrl);
      if (profileUrl) {
        const host = new URL(profileUrl).hostname.toLowerCase();
        const label = host.endsWith("orcid.org") ? "ORCID" : host.endsWith("openalex.org") ? "OpenAlex" : "Profile";
        addAuthorLink(author, profileUrl, label);
      }

      if (!seenInWork.has(author)) {
        author.records += 1;
        if (Number.isFinite(work.citations)) {
          author.citations += work.citations;
          author.citationRecords += 1;
        }
        seenInWork.add(author);
      }
    }
  }

  return [...authors.values()].sort((a, b) =>
    b.records - a.records || b.citations - a.citations || a.name.localeCompare(b.name, locale));
}

function authorLookupKeys(profile, locale) {
  return [...new Set([
    authorIdentityKey(profile, locale),
    profile.orcid ? authorIdentityKey({ orcid: profile.orcid }, locale) : "",
    profile.profileUrl ? authorIdentityKey({ profileUrl: profile.profileUrl }, locale) : ""
  ].filter(Boolean))];
}

export function worksForAuthor(works, author, locale = "en") {
  const target = typeof author === "string" ? { name: author } : author?.identity || author;
  return works
    .filter(work => {
      const profiles = work.authorProfiles || [];
      if (typeof author === "string") {
        const nameKey = authorIdentityKey(author, locale);
        return profiles.some(profile => authorIdentityKey(profile, locale).startsWith("name:")
          ? authorIdentityKey(profile, locale) === nameKey
          : sameAuthorIdentity(profile, target, locale))
          || (work.authors || []).some(value => authorIdentityKey(value, locale) === nameKey);
      }
      if (profiles.some(profile => sameAuthorIdentity(profile, target, locale))) return true;
      const name = normalizedAuthorName(target?.name, locale);
      const sameNameProfiles = profiles.filter(profile => normalizedAuthorName(profile.name, locale) === name);
      if (sameNameProfiles.length) return sameNameProfiles.some(profile => authorIdentityKey(profile, locale).startsWith("name:"));
      return (work.authors || []).some(value => normalizedAuthorName(value, locale) === name);
    })
    .sort((a, b) =>
      (b.citations ?? -1) - (a.citations ?? -1)
      || (b.year ?? 0) - (a.year ?? 0)
      || String(a.title || "").localeCompare(String(b.title || ""), locale));
}

function normalizedAuthorName(value, locale) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").normalize("NFKC").toLocaleLowerCase(locale) : "";
}

function safeEmail(value) {
  if (typeof value !== "string") return "";
  const email = value.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email) ? email : "";
}

function addAuthorLink(author, value, label) {
  const url = safeExternalUrl(value);
  if (url && !author.links.some(link => link.url === url)) author.links.push({ url, label });
}
