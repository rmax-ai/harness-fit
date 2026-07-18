# Add Priority Filtering to List Command

## Repository

You are working in the `task-service` repository at `benchmarks/repositories/task-service/`.

## Feature Request

The `list` command currently supports `--status` filtering but not `--priority`. The underlying `TaskStore.list()` method already accepts a `priority` field in its filter — but the CLI handler doesn't pass it through.

## Required Changes

1. Add `--priority <low|medium|high|critical>` option parsing to `handleList` in `src/cli.ts`
2. Pass the priority value into the filter passed to `store.list()`
3. Update the help text to document the new option

## Acceptance

```
$ bun run src/cli.ts add "Critical bug" "Fix it" --priority critical
$ bun run src/cli.ts add "Minor thing" "Later" --priority low
$ bun run src/cli.ts list --priority critical
# Should show only "Critical bug"
$ bun run src/cli.ts list --priority low
# Should show only "Minor thing"
$ bun run src/cli.ts list --status todo --priority low
# Should show only "Minor thing" (combining filters)
```

## Constraints

- Do NOT modify any test files
- Do NOT change the TaskStore API
- All existing tests must still pass
- Run `bun test` before finishing

## Success

CLI supports `--priority` filter, both alone and combined with `--status`.
