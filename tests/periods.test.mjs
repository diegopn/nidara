import assert from "node:assert/strict";
import { publicationDateRange } from "../js/core/period-utils.js";

const today = new Date("2024-02-29T12:00:00.000Z");
assert.deepEqual(publicationDateRange("all", "", "", today), { fromDate: "", toDate: "" });
assert.deepEqual(publicationDateRange("1", "", "", today), { fromDate: "2023-02-28", toDate: "2024-02-29" });
assert.deepEqual(publicationDateRange("2", "", "", today), { fromDate: "2022-02-28", toDate: "2024-02-29" });
assert.deepEqual(publicationDateRange("5", "", "", today), { fromDate: "2019-02-28", toDate: "2024-02-29" });
assert.deepEqual(publicationDateRange("10", "", "", today), { fromDate: "2014-02-28", toDate: "2024-02-29" });
assert.deepEqual(publicationDateRange("custom", "2010", "2015", today), { fromDate: "2010-01-01", toDate: "2015-12-31" });
assert.deepEqual(publicationDateRange("custom", "2010", "", today), { fromDate: "2010-01-01", toDate: "" });

console.log("Publication period date ranges passed.");
