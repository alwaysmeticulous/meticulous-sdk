### APIs used for messages sent from the SDK to the replay and record bundles

This folder contains APIs used for messages sent from the SDK to the bundle.

Since new bundles may be used by old SDKs we have to be careful of changes to these types to preserve backwards compatibility.

In particular:

- Adding new optional fields is safe.
- Adding new required fields is unsafe: the bundle cannot assume that the new fields will be present, since it may recieve messages from an old SDKs.
- Deleting fields is safe, as long as you remove the usage of them in the bundle first, and publish a new bundle.
- Changing the type of a field is unsafe.

Please discuss with the Meticulous team if you do need to make a breaking change.
