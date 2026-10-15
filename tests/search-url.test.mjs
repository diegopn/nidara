import assert from "node:assert/strict";
import { readDatasetFilters, writeDatasetFilters } from "../js/core/search-url.js";

const params = new URLSearchParams("q=climate&view=datasets&repo=Zenodo&format=text%2Fcsv&related=1&location=Sao+Paulo");
assert.deepEqual(readDatasetFilters(params), {
  repository: "Zenodo",
  format: "text/csv",
  hasRelated: true,
  location: "Sao Paulo"
});

writeDatasetFilters(params, { repository: "", format: "application/netcdf", hasRelated: false, location: "  Kyoto  " });
assert.equal(params.get("q"), "climate", "Unrelated search parameters must survive a filter update");
assert.equal(params.get("view"), "datasets");
assert.equal(params.has("repo"), false);
assert.equal(params.get("format"), "application/netcdf");
assert.equal(params.has("related"), false);
assert.equal(params.get("location"), "Kyoto");
assert.deepEqual(readDatasetFilters(params), {
  repository: "",
  format: "application/netcdf",
  hasRelated: false,
  location: "Kyoto"
});

console.log("Shared dataset filters passed.");
