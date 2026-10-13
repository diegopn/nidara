import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(new URL("../js/core/result-counts.js", import.meta.url));
const moduleExists = await access(modulePath).then(() => true, () => false);
assert.ok(moduleExists, "The result-count state helper must preserve tab values between searches");
const { mergeResultCounts } = await import(modulePath);

const afterPublications = mergeResultCounts(
  { publications: null, authors: null, datasets: null },
  "all",
  { publications: 15, authors: 23, datasets: 2 }
);
assert.deepEqual(afterPublications, { publications: 15, authors: 23, datasets: 2 });

const afterDatasets = mergeResultCounts(
  afterPublications,
  "dataset",
  { publications: 0, authors: 0, datasets: 8 }
);
assert.deepEqual(afterDatasets, { publications: 15, authors: 23, datasets: 8 });

const afterReturningToPublications = mergeResultCounts(
  afterDatasets,
  "all",
  { publications: 12, authors: 19, datasets: 1 }
);
assert.deepEqual(afterReturningToPublications, { publications: 12, authors: 19, datasets: 8 });

const datasetFirst = mergeResultCounts(
  { publications: null, authors: null, datasets: null },
  "dataset",
  { publications: 0, authors: 0, datasets: 3 }
);
const afterOpeningPublications = mergeResultCounts(
  datasetFirst,
  "all",
  { publications: 15, authors: 23, datasets: 2 }
);
assert.deepEqual(afterOpeningPublications, { publications: 15, authors: 23, datasets: 3 });
