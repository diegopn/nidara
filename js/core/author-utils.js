import { safeExternalUrl } from "./work-utils.js";

export function summarizeAuthors(works, locale = "en") {
  const authors = new Map();

  for (const work of works) {
    const profiles = Array.isArray(work.authorProfiles) && work.authorProfiles.length
      ? work.authorProfiles
      : (work.authors || []).map(name => ({ name }));
    const seenInWork = new Set();

    for (const profile of profiles) {
      const name = typeof profile?.name === "string" ? profile.name.trim().replace(/\s+/g, " ") : "";
      const key = authorKey(name, locale);
      if (!key) continue;

      const author = authors.get(key) || { name, records: 0, citations: 0, citationRecords: 0, emails: [], links: [] };
      const email = safeEmail(profile.email);
      if (email && !author.emails.some(value => value.toLowerCase() === email.toLowerCase())) author.emails.push(email);

      addAuthorLink(author, profile.orcid, "ORCID");
      const profileUrl = safeExternalUrl(profile.profileUrl);
      if (profileUrl) {
        const host = new URL(profileUrl).hostname.toLowerCase();
        const label = host.endsWith("orcid.org") ? "ORCID" : host.endsWith("openalex.org") ? "OpenAlex" : "Profile";
        addAuthorLink(author, profileUrl, label);
      }

      if (!seenInWork.has(key)) {
        author.records += 1;
        if (Number.isFinite(work.citations)) {
          author.citations += work.citations;
          author.citationRecords += 1;
        }
        seenInWork.add(key);
      }
      authors.set(key, author);
    }
  }

  return [...authors.values()].sort((a, b) =>
    b.records - a.records || b.citations - a.citations || a.name.localeCompare(b.name, locale));
}

export function worksForAuthor(works, name, locale = "en") {
  const key = authorKey(name, locale);
  return works
    .filter(work => {
      const profiles = work.authorProfiles || [];
      return profiles.some(profile => authorKey(profile.name, locale) === key)
        || (work.authors || []).some(author => authorKey(author, locale) === key);
    })
    .sort((a, b) =>
      (b.citations ?? -1) - (a.citations ?? -1)
      || (b.year ?? 0) - (a.year ?? 0)
      || String(a.title || "").localeCompare(String(b.title || ""), locale));
}

function authorKey(name, locale) {
  return typeof name === "string" ? name.trim().replace(/\s+/g, " ").normalize("NFKC").toLocaleLowerCase(locale) : "";
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
