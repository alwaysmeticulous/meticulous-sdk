## Adding Dependencies on 3rd Party GitHub Actions

All true third-party GitHub actions should use a precise SHA version rather than a tag, with the major version number appended in a comment (this is parsed out by `bump-workflow-action-hash`): 'pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320 # v4' instead of 'pnpm/action-setup@v4'. This is done to minimize supply chain risk.

You can run `bump-workflow-action-hash` to bump these to the latest release for the given major version tag in the comment appended to each line.
