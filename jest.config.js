const tsJestDefaults = require("ts-jest/jest-preset");

/**
 * Jest Setup for Meticulous
 * -------------------------
 *
 * 1. Packages with the default setup define their config in their package.json using:
 *
 * ```json
 * "jest": {
 *   "preset": "../../jest.config.js"
 * }
 * ```
 *
 * This avoids having to have a seperate jest.config.js file in each package.
 *
 * When running tests inside vscode, vscode ignores the jest config in the package.json file,
 * but that's OK since it falls back to the jest.config.js at the root (which is identical).
 *
 * 2. Packages with custom setup can define their own jest.config.js file, instead of defining
 * the jest config in their package.json.
 *
 * This means that when running tests in vscode the Jest extension will pick up the correct config for the package.
 */

module.exports = {
  // We need to spread the ts-jest defaults instead of using jest's preset functionality since you can't
  // have chained presets and the jest config's in the package.jsons already use `'preset': '../../jest.config.js'`.
  ...tsJestDefaults,
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  testRegex: ".*\\.spec\\.(ts|tsx)$",
  testEnvironment: "node",
};
