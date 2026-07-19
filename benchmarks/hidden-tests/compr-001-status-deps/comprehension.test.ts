/**
 * Hidden acceptance tests for compr-001-status-deps.
 * These are reference answers, not executable tests.
 * The evaluator checks agent output against expected answers.
 */
export const expectedAnswers = {
  q1: {
    question: 'Which modules directly reference TaskStatus?',
    files: ['src/types.ts', 'src/store.ts', 'src/cli.ts', 'src/validation.ts'],
    note: 'types.ts defines it. store.ts uses it for filtering and initialization. cli.ts uses string literals in help text and argument parsing. validation.ts should validate status values.',
  },
  q2: {
    question: 'If adding status "review", what files change?',
    changes: [
      { file: 'src/types.ts', change: 'Add REVIEW to TaskStatus const object and type union' },
      { file: 'src/cli.ts', change: 'Add "review" to help text status list' },
      {
        file: 'src/validation.ts',
        change: 'Add "review" to list of valid status values if a validator exists',
      },
      {
        file: 'tests/store.test.ts',
        change: 'Tests may need updating for countsByStatus expectations',
      },
    ],
  },
  q3: {
    question: 'Relationship between validation.ts and cli.ts?',
    answer:
      'validation.ts provides reusable validators (validateCreateTask, validateTaskId). cli.ts calls store.create() and store.update() — store.create() internally calls validateCreateTask() from validation.ts. The CLI itself should delegate to validation.ts for update field validation rather than doing inline checks.',
  },
  q4: {
    question: 'Is TaskStore coupled to CLI?',
    answer:
      'No. TaskStore is a standalone class with no CLI dependencies. It accepts typed inputs and returns typed outputs. The CLI (TaskCli) depends on TaskStore, not the reverse. TaskStore can be used programmatically without the CLI.',
  },
};
