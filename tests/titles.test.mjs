import assert from "node:assert/strict";
import { mergeWorks } from "../js/core/work-utils.js";

const utilities = await import("../js/core/work-utils.js");
assert.equal(typeof utilities.selectWorkTitle, "function", "Work titles need script-aware fallback selection");
const { selectWorkTitle } = utilities;

assert.equal(selectWorkTitle(["数据集标题", "A study of open research data"]), "A study of open research data");
assert.equal(selectWorkTitle(["???"]), "");
assert.equal(selectWorkTitle(["A title with � invalid encoding"]), "");
assert.equal(selectWorkTitle(["日本語の題名"]), "日本語の題名");

const merged = mergeWorks(
  { doi: "10.1234/example", title: "数据集标题", provenance: { title: "OpenAlex" } },
  { doi: "10.1234/example", title: "A study of open research data", provenance: { title: "Crossref" } }
);
assert.equal(merged.title, "A study of open research data");
assert.equal(merged.provenance.title, "Crossref");
