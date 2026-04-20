# Contributing to SmartStadium AI

Thank you for your interest in improving SmartStadium AI! To maintain high code quality and consistency, please follow these guidelines.

## Code Style
- **JavaScript**: Use `use strict` at the top of files. Prefer `const` and `let` over `var`.
- **Modularity**: Logic should be extracted into the `server/middleware` or `server/services` directories. `server/index.js` should remain a configuration entry point.
- **JSDoc**: Every exported function must have a JSDoc block with `@param`, `@returns`, and `@throws` where applicable.
- **Constants**: DO NOT use magic numbers. All thresholds, capacities, and limits must be added to `server/constants.js`.

## Workflow
1.  **Branching**: Use descriptive branch names (`feat/`, `fix/`, `perf/`).
2.  **Linting**: Run `npm run lint` before committing. Ensure zero warnings.
3.  **Testing**: Every change must maintain 100% pass rate on existing tests. Run `npm test` to verify.
4.  **Documentation**: Update `ARCHITECTURE.md` if any system-level changes are made.

## Performance Requirements
- All new API endpoints must return appropriate `Cache-Control` headers.
- Expensive calculations should be moved to helper utilities in `server/utils` and unit tested.
- Large frontend libraries must be lazy-loaded using `google.maps.importLibrary` or equivalent.
