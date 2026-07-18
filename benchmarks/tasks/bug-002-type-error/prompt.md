# Fix Type Error in Task Update

## Repository

You are working in the `task-service` repository at `benchmarks/repositories/task-service/`.

Type check with: `bun run typecheck`

## Problem

The project fails type checking. Running `tsc --noEmit` reveals a type error in `src/cli.ts` in the `handleUpdate` method. The method extracts string values from command-line arguments and passes them directly to `store.update()`, but some fields expect specific string literal types (`TaskStatus`, `TaskPriority`), not just `string`.

## Task

Fix the type error by properly narrowing the types before passing to `store.update()`. You may need to add a type guard or validation check.

## Constraints

- Do NOT modify any test files
- Do NOT introduce `any` types
- Do NOT weaken the UpdateTaskInput type definition
- All existing tests must still pass
- `bun run typecheck` must pass after your fix

## Success

`tsc --noEmit` exits with zero errors.
