# @alwaysmeticulous/session-filters

Validation and matching for Meticulous session filters (see `SessionFilter` in
`@alwaysmeticulous/api`), shared between the Meticulous CLI and backend so that
filter semantics cannot drift between the two.

This lives in its own package (rather than `@alwaysmeticulous/common`) because
it depends on the `re2` native addon, which must not be pulled into
webpack-bundled or browser consumers of the more widely used packages.
