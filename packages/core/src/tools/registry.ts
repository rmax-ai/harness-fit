import type { ToolName, Result } from '../types/index';
import { getToolDefinition } from './definitions';

/**
 * Tool execution interface.
 * Each tool implementation receives arguments and returns a result string.
 */
export type ToolExecutor = (args: Record<string, unknown>, cwd: string) => Promise<string>;

/**
 * Tool registry maps tool names to their executors.
 * The agent runtime calls executeTool, which dispatches to the registered executor.
 */
export class ToolRegistry {
  private executors = new Map<ToolName, ToolExecutor>();

  /** Register a tool executor. */
  register(name: ToolName, executor: ToolExecutor): void {
    this.executors.set(name, executor);
  }

  /** Execute a tool call. Returns the result string or error. */
  async execute(
    name: string,
    args: Record<string, unknown>,
    cwd: string,
  ): Promise<string> {
    const toolName = name as ToolName;
    const executor = this.executors.get(toolName);

    if (!executor) {
      return `Error: Unknown tool '${name}'. Available: ${[...this.executors.keys()].join(', ')}`;
    }

    try {
      return await executor(args, cwd);
    } catch (err) {
      return `Error executing tool '${name}': ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  /** Check if a tool is registered. */
  has(name: string): boolean {
    return this.executors.has(name as ToolName);
  }

  /** List registered tool names. */
  list(): readonly ToolName[] {
    return [...this.executors.keys()];
  }
}

/**
 * Create a default tool registry with Bun shell-based executors.
 * These are the real implementations that the agent will use.
 */
export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register('list_files', async (args, cwd) => {
    const path = (args.path as string) || '.';
    const recursive = args.recursive as boolean | undefined;
    const flags = recursive ? '-R' : '';
    const proc = Bun.spawnSync({
      cmd: ['ls', '-la', flags, path].filter(Boolean),
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return proc.stdout.toString() || proc.stderr.toString() || '(empty)';
  });

  registry.register('read_file', async (args, cwd) => {
    const path = (args.path as string) || '';
    const file = Bun.file(`${cwd}/${path}`);
    if (!(await file.exists())) return `Error: File not found: ${path}`;
    const text = await file.text();
    const lines = text.split('\n');
    const offset = (args.offset as number) || 1;
    const limit = (args.limit as number) || 500;
    return lines.slice(offset - 1, offset - 1 + limit).join('\n');
  });

  registry.register('search_files', async (args, cwd) => {
    const pattern = (args.pattern as string) || '';
    const searchPath = (args.path as string) || '.';
    const proc = Bun.spawnSync({
      cmd: ['grep', '-rn', '--include=*.ts', '--include=*.json', '--include=*.md', pattern, searchPath],
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const out = proc.stdout.toString();
    return out || 'No matches found.';
  });

  registry.register('write_file', async (args, cwd) => {
    const path = (args.path as string) || '';
    const content = (args.content as string) || '';
    await Bun.write(`${cwd}/${path}`, content);
    return `Wrote ${content.split('\n').length} lines to ${path}`;
  });

  registry.register('apply_patch', async (args, cwd) => {
    const patch = (args.patch as string) || '';
    const tmpFile = `${cwd}/.harnessfit-patch-${Date.now()}.diff`;
    await Bun.write(tmpFile, patch);
    const proc = Bun.spawnSync({
      cmd: ['patch', '-p1', '-i', tmpFile],
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    // Clean up temp file
    try { await Bun.file(tmpFile).delete(); } catch { /* ok */ }
    return proc.stdout.toString() || proc.stderr.toString() || 'Patch applied.';
  });

  registry.register('run_command', async (args, cwd) => {
    const command = (args.command as string) || '';
    const timeout = (args.timeout as number) || 30;
    const proc = Bun.spawnSync({
      cmd: ['sh', '-c', command],
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: timeout * 1000,
    });
    const out = proc.stdout.toString();
    const err = proc.stderr.toString();
    return [`Exit: ${proc.exitCode}`, out, err ? `STDERR: ${err}` : ''].filter(Boolean).join('\n');
  });

  registry.register('git_diff', async (args, cwd) => {
    const staged = args.staged as boolean | undefined;
    const cmd = staged ? ['git', 'diff', '--staged'] : ['git', 'diff'];
    const proc = Bun.spawnSync({
      cmd,
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return proc.stdout.toString() || 'No changes.';
  });

  registry.register('finish', async (args) => {
    return `Task complete. Summary: ${args.summary || '(no summary provided)'}`;
  });

  return registry;
}
