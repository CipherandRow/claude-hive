import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// =============================================================================
// Hive Prompt Compliance Tests
// =============================================================================
// These tests validate the ACTUAL SKILL FILE (hive.md), not just the math.
// They parse the prompt that Claude reads at runtime and verify it contains
// all required sections, mechanisms, formulas, thresholds, and instructions.
// If someone edits hive.md and accidentally breaks the prompt, these catch it.
// =============================================================================

let hivePrompt: string;
let srcCode: string;

beforeAll(() => {
  hivePrompt = readFileSync(join(__dirname, '..', 'hive.md'), 'utf-8');
  srcCode = readFileSync(join(__dirname, '..', 'src', 'hive-mechanisms.ts'), 'utf-8');
});

// =============================================================================
// Structure: Required sections exist in the correct order
// =============================================================================

describe('Prompt Structure', () => {
  const requiredSteps = [
    'Step 1: Mode Detection',
    'Step 2: Parallelism Tier Detection',
    'Step 3: Exclusion Check',
    'Step 4: Checkpoint Resume',
    'Step 5: Strategy',
    'Step 6: Plan',
    'Step 7: Pre-Flight',
    'Step 8: Execute',
    'Step 9: Synthesize',
    'Step 10: Learn',
  ];

  it('contains all 10 required steps', () => {
    for (const step of requiredSteps) {
      expect(hivePrompt).toContain(step);
    }
  });

  it('steps appear in correct order', () => {
    let lastIndex = -1;
    for (const step of requiredSteps) {
      const index = hivePrompt.indexOf(step);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it('contains Arguments section with all flags', () => {
    expect(hivePrompt).toContain('$ARGUMENTS');
    expect(hivePrompt).toContain('--resume');
    expect(hivePrompt).toContain('--isolate');
    expect(hivePrompt).toContain('--dry-run');
    expect(hivePrompt).toContain('--verbose');
  });

  it('contains Guidelines section', () => {
    expect(hivePrompt).toContain('## Guidelines');
  });
});

// =============================================================================
// All 16 mechanisms referenced in the architecture table
// =============================================================================

describe('Mechanism Coverage', () => {
  const mechanisms = [
    { num: 1, name: 'Pheromone Evaporation' },
    { num: 2, name: 'Self-Validation Gates' },
    { num: 3, name: 'Reasoning Tree Conflicts' },
    { num: 4, name: 'Stigmergy' },
    { num: 5, name: 'Completion Velocity' },
    { num: 6, name: 'Semantic Quorum' },
    { num: 7, name: 'Scout Retirement' },
    { num: 8, name: 'Decision Protocols' },
    { num: 9, name: 'Swarm Playbook' },
    { num: 10, name: 'Ready-Up Signal' },
    { num: 11, name: 'Cross-Inhibition' },
    { num: 12, name: 'Inspector Agents' },
    { num: 13, name: 'Assembly Line QC' },
    { num: 14, name: 'Checkpoint/Resume' },
    { num: 15, name: 'Adaptive Mode' },
    { num: 16, name: 'Worktree Isolation' },
  ];

  it('architecture table lists exactly 16 mechanisms', () => {
    // Count rows in the mechanism table (lines starting with | N |)
    const tableRows = hivePrompt.match(/^\| \d+ \|/gm);
    expect(tableRows).not.toBeNull();
    expect(tableRows!.length).toBe(16);
  });

  for (const mech of mechanisms) {
    it(`mechanism ${mech.num} (${mech.name}) is in the architecture table`, () => {
      expect(hivePrompt).toContain(mech.name);
    });
  }
});

// =============================================================================
// Critical thresholds and formulas are present
// =============================================================================

describe('Thresholds and Formulas', () => {
  it('pheromone decay formula is specified', () => {
    expect(hivePrompt).toContain('0.95 ^ days');
  });

  it('confidence scale is defined with all three levels', () => {
    expect(hivePrompt).toContain('HIGH');
    expect(hivePrompt).toContain('MEDIUM');
    expect(hivePrompt).toContain('LOW');
    expect(hivePrompt).toContain('0.93');
    expect(hivePrompt).toContain('0.85');
    expect(hivePrompt).toContain('0.70');
  });

  it('chain confidence threshold is 0.65', () => {
    expect(hivePrompt).toContain('0.65');
  });

  it('context ceiling thresholds are defined', () => {
    expect(hivePrompt).toContain('< 50%');
    expect(hivePrompt).toContain('50-70%');
    expect(hivePrompt).toContain('70-85%');
    expect(hivePrompt).toContain('> 85%');
  });

  it('mode detection thresholds match (1-3, 4-8, 9+)', () => {
    expect(hivePrompt).toContain('1-3');
    expect(hivePrompt).toContain('4-8');
    expect(hivePrompt).toContain('9+');
  });

  it('parallelism tier thresholds are defined', () => {
    expect(hivePrompt).toContain('ratio < 0.3');
    expect(hivePrompt).toContain('ratio 0.3-0.6');
    expect(hivePrompt).toContain('ratio > 0.6');
  });

  it('reserve pool is ~25%', () => {
    expect(hivePrompt).toContain('25%');
  });

  it('backpressure threshold is >20', () => {
    expect(hivePrompt).toContain('>20');
  });

  it('TTL formula references history_avg_duration * 2.5', () => {
    expect(hivePrompt).toContain('history_avg_duration * 2.5');
  });

  it('auto-pin requires 3 consecutive 8.0+ runs', () => {
    expect(hivePrompt).toContain('8.0+');
    expect(hivePrompt).toContain('3 consecutive');
  });

  it('auto-unpin triggers on 2 consecutive sub-6.0 runs', () => {
    expect(hivePrompt).toContain('below 6.0');
    expect(hivePrompt).toContain('2 consecutive');
  });

  it('Opus escalation threshold is 0.7', () => {
    expect(hivePrompt).toMatch(/[Cc]onfidence\s*[<>]=?\s*0\.7/);
  });

  it('max agents confirmation threshold is >8', () => {
    expect(hivePrompt).toContain('>8 agents');
  });
});

// =============================================================================
// Agent prompt template requirements
// =============================================================================

describe('Agent Prompt Template', () => {
  it('self-validation block is specified', () => {
    expect(hivePrompt).toContain('Before Returning Your Result');
    expect(hivePrompt).toContain('CONFIDENCE:');
    expect(hivePrompt).toContain('FINDINGS:');
    expect(hivePrompt).toContain('RESULT:');
  });

  it('stigmergy instructions are specified', () => {
    expect(hivePrompt).toContain('Shared Context');
    expect(hivePrompt).toContain('SHARED_FINDINGS');
  });

  it('response budget instruction is specified', () => {
    expect(hivePrompt).toContain('Budget:');
    expect(hivePrompt).toContain('words max');
  });
});

// =============================================================================
// Error handling completeness
// =============================================================================

describe('Error Handling', () => {
  it('covers rate limit (429)', () => {
    expect(hivePrompt).toContain('429');
  });

  it('covers TTL expiry', () => {
    expect(hivePrompt).toContain('TTL expired');
  });

  it('covers agent errors', () => {
    expect(hivePrompt).toContain('Agent error');
  });

  it('covers consecutive failures', () => {
    expect(hivePrompt).toContain('3+ consecutive failures');
  });

  it('covers conflict resolution', () => {
    expect(hivePrompt).toContain('Reasoning Tree');
  });

  it('TTL enforcement is honest about limitations', () => {
    expect(hivePrompt).toContain('cannot hard-kill');
  });
});

// =============================================================================
// Strategy and protocol tables are complete
// =============================================================================

describe('Strategy and Protocol Coverage', () => {
  const strategies = ['wide-parallel', 'deep-pipeline', 'fan-out-gather', 'hybrid', 'iterative'];
  const protocols = ['Vote', 'Consensus', 'AAD'];

  for (const strategy of strategies) {
    it(`strategy "${strategy}" is defined`, () => {
      expect(hivePrompt).toContain(strategy);
    });
  }

  for (const protocol of protocols) {
    it(`protocol "${protocol}" is defined`, () => {
      expect(hivePrompt).toContain(protocol);
    });
  }
});

// =============================================================================
// Cross-reference: src/ exports match hive.md mechanisms
// =============================================================================

describe('Cross-Reference: src/ ↔ hive.md', () => {
  it('pheromone scoring is in both src and prompt', () => {
    expect(srcCode).toContain('pheromoneScore');
    expect(hivePrompt).toContain('pheromone');
  });

  it('confidence parsing is in both src and prompt', () => {
    expect(srcCode).toContain('parseConfidence');
    expect(hivePrompt).toContain('CONFIDENCE');
  });

  it('mode detection is in both src and prompt', () => {
    expect(srcCode).toContain('selectMode');
    expect(hivePrompt).toContain('Mode Detection');
  });

  it('worktree isolation is in both src and prompt', () => {
    expect(srcCode).toContain('shouldIsolate');
    expect(hivePrompt).toContain('Worktree Isolation');
  });

  it('conflict resolution is in both src and prompt', () => {
    expect(srcCode).toContain('resolveConflict');
    expect(hivePrompt).toContain('Reasoning Tree');
  });

  it('backpressure is in both src and prompt', () => {
    expect(srcCode).toContain('checkBackpressure');
    expect(hivePrompt).toContain('Backpressure');
  });

  it('cross-inhibition is in both src and prompt', () => {
    expect(srcCode).toContain('crossInhibit');
    expect(hivePrompt).toContain('Cross-Inhibition');
  });

  it('auto-pin is in both src and prompt', () => {
    expect(srcCode).toContain('shouldAutoPin');
    expect(hivePrompt).toContain('Auto-Pin');
  });

  it('auto-unpin is in both src and prompt', () => {
    expect(srcCode).toContain('shouldAutoUnpin');
    expect(hivePrompt).toContain('Auto-Unpin');
  });

  it('read-only heuristic is in both src and prompt', () => {
    expect(srcCode).toContain('isReadOnly');
    expect(hivePrompt).toContain('Read-only heuristic');
  });
});

// =============================================================================
// Worktree isolation instructions
// =============================================================================

describe('Worktree Isolation Instructions', () => {
  it('activation conditions are documented', () => {
    expect(hivePrompt).toContain('Standard/Full mode');
    expect(hivePrompt).toContain('--isolate');
  });

  it('merge decision criteria are documented', () => {
    expect(hivePrompt).toContain('auto-merge');
    expect(hivePrompt).toContain('manual review');
  });

  it('conflict resolution order is documented', () => {
    expect(hivePrompt).toContain('Higher confidence agent wins');
  });

  it('fallback for non-git repos is documented', () => {
    expect(hivePrompt).toContain('not in a git repo');
  });
});

// =============================================================================
// Security: credentials never in agent prompts
// =============================================================================

describe('Security', () => {
  it('explicitly forbids passing credentials', () => {
    expect(hivePrompt).toContain('NEVER pass API keys');
  });
});
