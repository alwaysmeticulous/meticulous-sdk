// Sidecar stand-in that exits during its first launch but behaves like the
// fake sidecar if relaunched, for restart-during-startup tests. The marker
// file (path via METICULOUS_TEST_FLAKY_MARKER) records that the first launch
// happened.
const fs = require("fs");

const marker = process.env.METICULOUS_TEST_FLAKY_MARKER;
if (!marker) {
  console.error("flaky sidecar: METICULOUS_TEST_FLAKY_MARKER not set");
  process.exit(2);
}
if (!fs.existsSync(marker)) {
  fs.writeFileSync(marker, "started-once");
  console.error("flaky sidecar: dying on first start");
  process.exit(1);
}
require("./fake-sidecar.cjs");
