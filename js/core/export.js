import { t } from "./i18n.js";

export function exportWorks(works, format, query = "pesquisa") {
  if (!works.length) throw new Error("Não há registros carregados para exportar.");
  const content = serializeWorks(works, format);
  const extension = format === "csv" ? "csv" : format === "ris" ? "ris" : "bib";
  const mime = format === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8";
  const fileName = (query || "pesquisa").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "pesquisa";
  const blob = new Blob([content], { type: mime });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = "nidara-" + fileName + "." + extension;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
}

export function serializeWorks(works, format) {
  if (!Array.isArray(works) || works.length === 0) throw new Error("Não há registros carregados para exportar.");
  if (format === "csv") return toCsv(works);
  if (format === "ris") return toRis(works);
  if (format === "bibtex") return toBibtex(works);
  throw new Error("Formato de exportação não reconhecido.");
}

function toCsv(works) {
  const headers = ["csvTitle", "csvAuthors", "csvYear", "csvJournal", "csvType", "csvDoi", "csvCitations", "csvOpenAccess", "csvSources", "csvAbstract", "csvUrl"].map(key => t(key));
  const rows = works.map(work => [
    work.title,
    (work.authors || []).join("; "),
    work.year ?? "",
    work.journal,
    work.type,
    work.doi,
    work.citations ?? "",
    work.openAccess === true ? t("csvYes") : work.openAccess === false ? t("csvNo") : t("csvUnknown"),
    (work.sources || []).map(source => source.label).join("; "),
    work.abstract,
    work.url
  ]);
  return "\uFEFF" + [headers, ...rows].map(row => row.map(csvField).join(",")).join("\r\n");
}

function csvField(value) {
  const field = String(value ?? "").replace(/"/g, '""').replace(/[\r\n]+/g, " ");
  const protectedField = /^[\s\u0000-\u001f]*[=+@-]/.test(field) ? "'" + field : field;
  return '"' + protectedField + '"';
}

function toRis(works) {
  return works.map(work => {
    const lines = ["TY  - " + risType(work.type), "TI  - " + risField(work.title)];
    for (const author of work.authors || []) lines.push("AU  - " + risField(author));
    if (work.year) lines.push("PY  - " + work.year);
    if (work.journal) lines.push("JO  - " + risField(work.journal));
    if (work.doi) lines.push("DO  - " + work.doi);
    if (work.abstract) lines.push("AB  - " + risField(work.abstract));
    if (work.url) lines.push("UR  - " + work.url);
    lines.push("ER  - ");
    return lines.join("\r\n");
  }).join("\r\n\r\n");
}

function risType(type) {
  const normalized = String(type || "").toLowerCase().replace(/_/g, "-");
  if (normalized === "dataset") return "DATA";
  if (["book", "monograph"].includes(normalized)) return "BOOK";
  if (["book-chapter", "book-section"].includes(normalized)) return "CHAP";
  if (["proceedings-article", "conference-paper", "conferencepaper"].includes(normalized)) return "CONF";
  if (["article", "journal-article"].includes(normalized)) return "JOUR";
  return "GEN";
}

function risField(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function toBibtex(works) {
  return works.map((work, index) => {
    const firstAuthor = (work.authors?.[0] || "nidara").split(/\s+/).at(-1);
    const key = (firstAuthor + (work.year || "") + (index + 1)).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
    const type = String(work.type || "").toLowerCase().replace(/_/g, "-");
    const entryType = ["book", "monograph"].includes(type) ? "book"
      : ["book-chapter", "book-section"].includes(type) ? "incollection"
        : ["proceedings-article", "conference-paper", "conferencepaper"].includes(type) ? "inproceedings"
          : ["article", "journal-article"].includes(type) ? "article" : "misc";
    const fields = [
      ["title", work.title],
      ["author", (work.authors || []).join(" and ")],
      ["year", work.year],
      ["journal", work.journal],
      ["doi", work.doi],
      ["url", work.url]
    ].filter(([, value]) => value !== "" && value != null).map(([name, value]) => "  " + name + " = {" + bibtexField(value) + "}");
    return "@" + entryType + "{" + (key || "nidara" + (index + 1)) + ",\n" + fields.join(",\n") + "\n}";
  }).join("\n\n");
}

function bibtexField(value) {
  const escapes = { "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "#": "\\#", "$": "\\$", "%": "\\%", "&": "\\&", "_": "\\_" };
  return String(value ?? "").replace(/[\\{}#$%&_]/g, character => escapes[character]).replace(/[\r\n]+/g, " ").trim();
}
