# Meticulous API

This packages contains type definitions that are persisted in the database or S3 and also used in the SDK.

Types that are both stored in the database and sent from the bundle to the SDK or
from the SDK to the bundle live in the sdk-bundle-api sub-folder. This folder is split into three sub-folders:

- The sdk-to-bundle sub-folder contains types sent from the SDK to the bundle
- The bundle-to-sdk sub-folder contains types sent from the bundle to the SDK
- The bidirectional folder contains types that are sent from the SDK to the bundle AND from the bundle to the SDK

Types that are persisted in the database but not used in the SDK should live in the main meticulous repo,
not this package. Types that are sent between the SDK and bundle but not stored in the database should
live in @alwaysmeticulous/sdk-bundles-api.

### What changes are safe to make?

For all types backwards compatibility must be preserved, since newer versions of our code may read data
saved under an old schema in the database. In particular that means adding new optional fields is safe,
and pretty much everything else is unsafe:

- Adding new required fields is unsafe.
- Deleting fields is unsafe if the field is used in the SDK/CLI. An old version of the CLI may read the data
  (from the database, or sent from the bundle) expecting the field to exist when it doesn't. If the field is not
  used in the SDK/CLI then it's safe to delete, but you must make sure to remove any usages of the field in the
  main meticulous repo before deleting the field.
- Changing the type of a field is unsafe.
