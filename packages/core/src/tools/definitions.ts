import type { ToolDefinition, ToolName } from '../types/index';

/**
 * Tool definitions for the agent runtime.
 * These are shared across all providers — the adapter
 * converts them to provider-native format.
 *
 * Based on SPEC.md §9: 8 tools, identical across providers.
 */

export const TOOL_DEFINITIONS: Record<ToolName, ToolDefinition> = {
  list_files: {
    name: 'list_files',
    description: 'List files and directories in a given path.',
    parameters: {
      path: {
        type: 'string',
        description: 'Directory path to list (relative to repo root).',
        required: true,
      },
      recursive: { type: 'boolean', description: 'Whether to list recursively.' },
    },
  },
  read_file: {
    name: 'read_file',
    description: 'Read the contents of a file.',
    parameters: {
      path: {
        type: 'string',
        description: 'File path to read (relative to repo root).',
        required: true,
      },
      offset: { type: 'number', description: 'Line number to start reading from (1-indexed).' },
      limit: { type: 'number', description: 'Maximum number of lines to read.' },
    },
  },
  search_files: {
    name: 'search_files',
    description: 'Search for files by name or content using regex.',
    parameters: {
      pattern: { type: 'string', description: 'Regex pattern to search for.', required: true },
      path: { type: 'string', description: 'Directory to search in.' },
      fileTypes: {
        type: 'string',
        description: 'Comma-separated file extensions (e.g., ".ts,.json").',
      },
      outputMode: {
        type: 'string',
        enum: ['content', 'files_with_matches', 'count'],
        description: 'Output mode.',
      },
    },
  },
  write_file: {
    name: 'write_file',
    description: 'Write content to a file. Creates the file if it does not exist.',
    parameters: {
      path: { type: 'string', description: 'File path (relative to repo root).', required: true },
      content: { type: 'string', description: 'File content to write.', required: true },
    },
  },
  apply_patch: {
    name: 'apply_patch',
    description: 'Apply a unified diff patch to files.',
    parameters: {
      patch: { type: 'string', description: 'Unified diff patch content.', required: true },
    },
  },
  run_command: {
    name: 'run_command',
    description: 'Execute a shell command in the repository.',
    parameters: {
      command: { type: 'string', description: 'The shell command to execute.', required: true },
      timeout: { type: 'number', description: 'Timeout in seconds.' },
    },
  },
  git_diff: {
    name: 'git_diff',
    description: 'Show changes in the working tree.',
    parameters: {
      staged: { type: 'boolean', description: 'Show staged changes only.' },
    },
  },
  finish: {
    name: 'finish',
    description: 'Signal that the task is complete. Provide a summary of changes.',
    parameters: {
      summary: { type: 'string', description: 'Summary of what was done.', required: true },
    },
  },
};

/** Get tool definitions as an array for provider requests. */
export function getToolDefinitions(): readonly ToolDefinition[] {
  return Object.values(TOOL_DEFINITIONS);
}

/** Get a single tool definition by name. */
export function getToolDefinition(name: ToolName): ToolDefinition {
  return TOOL_DEFINITIONS[name];
}
