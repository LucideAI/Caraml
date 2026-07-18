# Changelog

All notable changes to Caraml are documented here. The project follows semantic versioning.

## [1.0.0] - 2026-07-18

### Added

- Full Monaco-based multi-file OCaml IDE.
- Custom TypeScript lexer, parser, evaluator, and memory visualization.
- Native OCaml, Merlin, and OCamlFormat integration with browser fallback.
- Authentication, SQLite project persistence, public sharing, and forking.
- Learn OCaml exercise browsing, synchronization, and grading support.
- Account-free interactive guest playground with local browser persistence.
- Cross-platform automated tests and GitHub Actions CI.
- Reproducible non-root Docker deployment.

### Security

- Native execution is opt-in in production.
- User programs receive a minimal environment without application secrets.
- Anonymous execution is rate-limited and code payload size is bounded.
