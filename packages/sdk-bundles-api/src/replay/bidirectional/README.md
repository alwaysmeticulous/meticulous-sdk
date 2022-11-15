### APIs used for messages sent from the replay and record bundles to the SDK

This folder contains APIs used both for messages sent from the Meticulous SDK to the bundle, and for messages sent from the bundle to Meticulous SDK.

Since new bundles may be used by old SDKs we have to be careful of changes to these types to preserve backwards compatibility.

In particular:

- Adding new optional fields is safe.
- Adding new required fields is unsafe: the bundle cannot assume that the new fields will be present, since it may recieve messages from an old SDKs.
- Deleting fields is unsafe.
- Changing the type of a field is unsafe.

Please discuss with the Meticulous team if you do need to make a breaking change.
