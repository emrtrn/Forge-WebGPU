# Layer violation fixture

A tiny copy of the repo layout with deliberate boundary violations. It is the
self-test of the layer gate: `npm run verify:layers` cruises this folder with
the repo's `.dependency-cruiser.cjs` and requires the violations it finds to
equal `expected.json` exactly. A missed violation or an extra one fails the gate.

Each violating file uses a different import form (multi-line, type-only,
`export * from`, dynamic `import()`, side-effect import), because the regex
scanner this gate replaces missed some of those. The `allowed*` and `render`
files are controls and must not be reported.

Nothing here is compiled, tested or bundled. When a rule is added to
`.dependency-cruiser.cjs`, plant a violation for it here and list it in
`expected.json`.
