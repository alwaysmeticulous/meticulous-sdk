## replay-orchestrator bundles API

Workflow when making a break:

- Open SDK PR to bump the `maxSemanticVersionSupported` on the API, make the API changes, and update the SDK to work with both the new and old API version. Release SDK and report-diffs-action.
- Open main repo PR to update it to the new version of these typings, and to throw when maxSemanticVersionSupported < the new version number. Merge & release.
- Open SDK PR to remove support for the old version.

Read the README.md files in the sub-folders to understand exactly what constitutes a 'break'. It's different for the files in each sub-folder.
