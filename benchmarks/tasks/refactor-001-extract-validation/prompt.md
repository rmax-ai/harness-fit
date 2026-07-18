# Extract Validation Logic

## Repository

You are working in the `task-service` repository at `benchmarks/repositories/task-service/`.

## Task

The `src/cli.ts` file contains inline validation logic in `handleUpdate` — it checks whether status and priority values are valid before passing them to `store.update()`. This validation should be centralized in `src/validation.ts` alongside the existing validators.

## Requirements

1. Create a `validateStatus(value: unknown)` function in `src/validation.ts` that validates a status string
2. Create a `validatePriority(value: unknown)` function in `src/validation.ts` that validates a priority string
3. Export these from `src/index.ts`
4. Update `src/cli.ts` to use the new validators instead of inline checks
5. The behavior must be identical — same inputs produce same outputs

## Constraints

- Do NOT modify any test files
- Do NOT change the public API (TaskStore, TaskCli methods, types)
- Do NOT change the CLI output format
- All existing tests must still pass
- Run `bun test` before finishing

## Success

Validation logic is centralized in `src/validation.ts`. No inline validation remains in CLI. All tests pass.
