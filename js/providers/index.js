import * as openalex from "./openalex.js";
import * as crossref from "./crossref.js";

export const providers = [
  { id: "openalex", label: "OpenAlex", search: openalex.searchWorks },
  { id: "crossref", label: "Crossref", search: crossref.searchWorks }
];
