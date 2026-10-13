import * as openalex from "./openalex.js";
import * as crossref from "./crossref.js";
import * as datacite from "./datacite.js";

export const providers = [
  { id: "openalex", label: "OpenAlex", search: openalex.searchWorks },
  { id: "crossref", label: "Crossref", search: crossref.searchWorks },
  { id: "datacite", label: "DataCite", supports: ["dataset"], search: datacite.searchWorks }
];
