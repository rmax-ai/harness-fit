# Fix Status Filter Bug

## Repository

You are working in the `task-service` repository at `benchmarks/repositories/task-service/`.

Run tests with: `bun test`

## Problem

The `list --status <status>` command does not work correctly. It returns all tasks regardless of the status filter value.

For example:
```
$ bun run src/cli.ts add "Task A" "Description"
$ bun run src/cli.ts add "Task B" "Description"  
$ bun run src/cli.ts update <id-of-Task-A> --status done
$ bun run src/cli.ts list --status done
# Expected: shows only Task A (status=done)
# Actual: shows both Task A and Task B
```

## Task

Find and fix the bug in the TaskStore's `list` method that causes the status filter to be ignored.

## Constraints

- Do NOT modify any test files
- Do NOT change the public API of TaskStore
- Do NOT introduce `any` types
- All existing tests must still pass
- Run `bun test` before finishing to verify

## Success

The `list --status` command correctly filters by status.
