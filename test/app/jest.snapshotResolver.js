/**
 * Resolves path for snapshot files from __snapshots__ directory to component directory
 */

module.exports = {
  testPathForConsistencyCheck: "some/example.test.js",

  resolveSnapshotPath: (testPath, snapshotExtension) =>
    testPath.replace(/\.spec\.([tj]sx?)/, `.spec${snapshotExtension}.$1`),

  resolveTestPath: (snapshotFilePath, snapshotExtension) =>
    snapshotFilePath.replace(snapshotExtension, ".spec"),
};
