// Sidecar stand-in that fails on startup, for error-path tests.
console.error("fake sidecar: refusing to start");
process.exit(1);
