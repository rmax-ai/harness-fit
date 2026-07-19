import type { PatchQualityMetrics } from './scorer';

/**
 * Measures patch quality using deterministic proxies.
 *
 * Metrics:
 * - Line count (size penalty)
 * - Duplication detection
 * - New lint violations
 */
export interface PatchQualityAnalyzer {
  analyze(repoPath: string, patch: string): Promise<PatchQualityMetrics>;
}

export class BunPatchQualityAnalyzer implements PatchQualityAnalyzer {
  async analyze(repoPath: string, patch: string): Promise<PatchQualityMetrics> {
    const lineCount = patch
      .split('\n')
      .filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;

    // Check for obvious duplication (consecutive identical added lines)
    const addedLines = patch
      .split('\n')
      .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
      .map((l) => l.slice(1));

    let newDuplicationDetected = false;
    const seen = new Set<string>();
    for (const line of addedLines) {
      if (line.trim().length > 0 && seen.has(line.trim())) {
        newDuplicationDetected = true;
        break;
      }
      seen.add(line.trim());
    }

    // Count new lint violations by running biome
    let newLintViolations = 0;
    try {
      const proc = Bun.spawnSync({
        cmd: ['bunx', 'biome', 'lint', '.', '--reporter', 'json'],
        cwd: repoPath,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const output = JSON.parse(proc.stdout.toString());
      if (output && typeof output === 'object' && 'diagnostics' in output) {
        newLintViolations = (output as { diagnostics: unknown[] }).diagnostics.length;
      }
    } catch {
      // biome not available — skip
    }

    return { lineCount, newDuplicationDetected, newLintViolations };
  }
}

export function createPatchQualityAnalyzer(): PatchQualityAnalyzer {
  return new BunPatchQualityAnalyzer();
}
