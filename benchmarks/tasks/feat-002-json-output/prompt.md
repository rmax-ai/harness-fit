# Add JSON Output Flag

## Repository

You are working in the `task-service` repository at `benchmarks/repositories/task-service/`.

## Feature Request

Add a `--json` flag to the CLI that outputs task data as valid JSON instead of human-readable text. The flag should work with:

- `list` — outputs array of tasks as JSON
- `get <id>` — outputs single task as JSON
- `stats` — outputs stats object as JSON

Without `--json`, output format must remain unchanged (backward compatible).

## Example

```
$ bun run src/cli.ts list --json
[{"id":"abc123","title":"Task A","status":"todo",...},...]

$ bun run src/cli.ts get abc123 --json
{"id":"abc123","title":"Task A","status":"todo",...}

$ bun run src/cli.ts stats --json
{"total":5,"byStatus":{"todo":3,"done":2},"byPriority":{"high":1,"low":4}}
```

## Constraints

- Do NOT modify test files
- Text output without --json must work exactly as before
- JSON output must be valid, parseable JSON
- All existing tests must still pass
- Run `bun test` before finishing

## Success

`--json` flag produces valid JSON for list, get, and stats commands.
