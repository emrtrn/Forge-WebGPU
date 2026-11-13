// The SDK version game projects are written against (architecture §4.8, A8).
// Bump it with every change to the SDK surface and add an entry to
// src/sdk/CHANGELOG.md. Before 1.0 every minor version may break: a project
// written for 0.1 does not open on 0.2. It lives in core so that Node tools
// (forge check, check:projects) read the same constant the SDK exports.
export const SDK_VERSION = "0.1.3";
