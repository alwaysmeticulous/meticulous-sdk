### APIs used for messages sent from the replay and record bundles to the SDK

This folder contains APIs used for messages sent from the Meticulous SDK to the bundle.

Since new bundles may be used by old SDKs we have to be careful of changes to these types to preserve backwards compatibility.

In particular:

- Adding new optional fields is safe.
- Adding new required fields is safe: first update the bundle to produce the new field, then push the type update here.
- Deleting fields is unsafe.
- Changing the type of a field is unsafe.

Please discuss with the Meticulous team if you do need to make a breaking change.
