import { describe, it, expect } from 'bun:test';
import { createDefaultRegistry } from '../src/tools/registry';

describe('ToolRegistry', () => {
  it('creates default registry with all 8 tools', () => {
    const registry = createDefaultRegistry();
    const tools = registry.list();

    expect(tools.length).toBe(8);
    expect(tools).toContain('list_files');
    expect(tools).toContain('read_file');
    expect(tools).toContain('search_files');
    expect(tools).toContain('write_file');
    expect(tools).toContain('apply_patch');
    expect(tools).toContain('run_command');
    expect(tools).toContain('git_diff');
    expect(tools).toContain('finish');
  });

  it('has() returns true for registered tools', () => {
    const registry = createDefaultRegistry();
    expect(registry.has('read_file')).toBe(true);
    expect(registry.has('finish')).toBe(true);
    expect(registry.has('nonexistent')).toBe(false);
  });

  it('execute returns error for unknown tool', async () => {
    const registry = createDefaultRegistry();
    const result = await registry.execute('bad_tool', {}, '/tmp');
    expect(result).toContain('Unknown tool');
  });

  it('finish tool returns summary', async () => {
    const registry = createDefaultRegistry();
    const result = await registry.execute('finish', { summary: 'All done!' }, '/tmp');
    expect(result).toContain('All done!');
  });

  it('git_diff runs successfully', async () => {
    const registry = createDefaultRegistry();
    const result = await registry.execute('git_diff', {}, '.');
    expect(typeof result).toBe('string');
  });
});
