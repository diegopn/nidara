import assert from "node:assert/strict";
import { publicationTypeFilterVisible, searchTypeForView } from "../js/core/view-scope.js";

assert.equal(publicationTypeFilterVisible("publications"), true);
assert.equal(publicationTypeFilterVisible("authors"), false);
assert.equal(publicationTypeFilterVisible("datasets"), false);
assert.equal(searchTypeForView("publications", "article"), "article");
assert.equal(searchTypeForView("authors", "article"), "all");
assert.equal(searchTypeForView("datasets", "article"), "dataset");

console.log("View-specific publication filters passed.");
