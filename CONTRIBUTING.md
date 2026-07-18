# Contributing to Caraml

Contributions are welcome, especially focused interpreter tests, Learn OCaml compatibility fixes, accessibility improvements, and documentation.

## Local setup

```bash
npm install
npm run dev:no-ocaml
```

The browser interpreter works without an OCaml installation. Run `npm run setup:ocaml` only when testing the optional native toolchain.

## Quality checks

Before opening a pull request:

```bash
npm run check
```

Add a regression test for interpreter or layout behavior whenever practical. Keep pull requests focused and document user-visible changes in `CHANGELOG.md`.

## Pull requests

- Explain the problem and the chosen solution.
- Include screenshots for interface changes.
- Do not commit databases, build output, opam switches, or environment files.
- Treat execution endpoints as security-sensitive and preserve their limits.
