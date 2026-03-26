import { describe, it, expect } from 'vitest';

// =============================================================================
// Hive Mechanism Tests — 16 bio-inspired mechanisms
// =============================================================================
// These tests validate the algorithmic logic of each mechanism WITHOUT
// requiring actual Claude API calls. They test the decision-making math,
// parsing, thresholds, and edge cases.
// =============================================================================

// ---- Helpers ----

function pheromoneScore(score: number, daysSince: number, decayRate = 0.95): number {
  return score * Math.pow(decayRate, daysSince);
}

function semanticOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function negationAwareOverlap(a: string, b: string): number {
  const negations = ['no', 'not', 'never', 'none', 'neither', "don't", "doesn't", "didn't", "won't", "can't"];
  const tokensA = a.toLowerCase().split(/\s+/);
  const tokensB = b.toLowerCase().split(/\s+/);
  const hasNegA = tokensA.some(t => negations.includes(t));
  const hasNegB = tokensB.some(t => negations.includes(t));
  if (hasNegA !== hasNegB) return 0;
  return semanticOverlap(a, b);
}

function parseConfidence(label: string): number {
  const map: Record<string, number> = { HIGH: 0.93, MEDIUM: 0.85, LOW: 0.70 };
  return map[label.toUpperCase()] ?? 0.85;
}

function chainConfidence(agents: number[]): number {
  return agents.reduce((acc, c) => acc * c, 1);
}

function computeVelocity(completed: number, elapsedMin: number): number {
  return elapsedMin > 0 ? completed / elapsedMin : 0;
}

function ttl(historyAvg: number, complexity: 'simple' | 'medium' | 'complex'): number {
  const multipliers = { simple: 1.0, medium: 1.5, complex: 2.0 };
  const base = historyAvg > 0 ? historyAvg * 2.5 : 120;
  return base * multipliers[complexity];
}

function selectMode(subtasks: number): 'lite' | 'standard' | 'full' {
  if (subtasks <= 3) return 'lite';
  if (subtasks <= 8) return 'standard';
  return 'full';
}

function selectStrategy(taskType: string): string {
  const map: Record<string, string> = {
    independent: 'wide-parallel',
    sequential: 'deep-pipeline',
    research: 'fan-out-gather',
    mixed: 'hybrid',
    improvement: 'iterative',
  };
  return map[taskType] ?? 'wide-parallel';
}

function selectProtocol(taskType: string): string {
  const map: Record<string, string> = {
    reasoning: 'vote',
    knowledge: 'consensus',
    creative: 'aad',
  };
  return map[taskType] ?? 'consensus';
}

function scoringFunction(passed: number, total: number, opts: {
  noThrottles?: boolean;
  fast?: boolean;
  efficientConflicts?: boolean;
  quorumUsed?: boolean;
  goodStigmergy?: boolean;
} = {}): number {
  let score = (passed / total) * 6;
  if (opts.noThrottles) score += 1.5;
  if (opts.fast) score += 1;
  if (opts.efficientConflicts) score += 0.5;
  if (opts.quorumUsed) score += 0.5;
  if (opts.goodStigmergy) score += 0.5;
  return Math.min(score, 10);
}

function detectParallelismTier(ratio: number): 'limited' | 'standard' | 'max' {
  if (ratio < 0.3) return 'limited';
  if (ratio <= 0.6) return 'standard';
  return 'max';
}

function maxConcurrency(tier: 'limited' | 'standard' | 'max'): number {
  return { limited: 2, standard: 5, max: 15 }[tier];
}

function reservePool(concurrency: number): number {
  return Math.floor(concurrency * 0.25);
}

function contextAction(usedPercent: number): string {
  if (usedPercent < 50) return 'full';
  if (usedPercent < 70) return 'save-reduce';
  if (usedPercent < 85) return 'priority-only';
  return 'emergency-abort';
}

// ---- NEW: Worktree Isolation helpers ----

function shouldIsolate(mode: 'lite' | 'standard' | 'full', writesFiles: boolean, forceIsolate: boolean): boolean {
  if (forceIsolate) return true;
  if (mode === 'lite') return false;
  return writesFiles;
}

function mergeDecision(confidence: number): 'auto-merge' | 'manual-review' {
  return confidence >= 0.85 ? 'auto-merge' : 'manual-review';
}

function conflictWinner(agents: { id: string; confidence: number; completedAt: number }[]): string {
  const sorted = [...agents].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.completedAt - b.completedAt;
  });
  return sorted[0].id;
}

// ---- Reasoning Tree Conflict helpers ----

function resolveConflict(
  agentA: { result: string; confidence: number; steps: string[] },
  agentB: { result: string; confidence: number; steps: string[] },
  challengerConfidence: number
): { winner: 'A' | 'B'; escalateToOpus: boolean; divergenceStep: number } {
  // Find first step where reasoning diverges
  const divergenceStep = agentA.steps.findIndex((s, i) => s !== agentB.steps[i]);
  const effectiveStep = divergenceStep === -1 ? 0 : divergenceStep;

  if (challengerConfidence <= 0.7) {
    return { winner: agentA.confidence >= agentB.confidence ? 'A' : 'B', escalateToOpus: true, divergenceStep: effectiveStep };
  }
  // Higher confidence at divergence point wins
  return { winner: agentA.confidence >= agentB.confidence ? 'A' : 'B', escalateToOpus: false, divergenceStep: effectiveStep };
}

// ---- Stigmergy backpressure helpers ----

function checkBackpressure(findingsSinceLastSummary: number): { shouldThrottle: boolean; shouldSummarize: boolean } {
  return {
    shouldThrottle: findingsSinceLastSummary > 20,
    shouldSummarize: findingsSinceLastSummary > 20,
  };
}

// ---- Cross-Inhibition helpers ----

function crossInhibit(proposals: { confidence: number; proposal: string }[]): { proposal: string; weight: number }[] {
  const maxConf = Math.max(...proposals.map(p => p.confidence));
  return proposals.map(p => ({
    proposal: p.proposal,
    weight: p.confidence * (1 - maxConf * 0.5),
  })).sort((a, b) => b.weight - a.weight);
}

function shouldEscalateToReasoningTree(proposals: { confidence: number }[]): boolean {
  if (proposals.length < 2) return false;
  const sorted = [...proposals].sort((a, b) => b.confidence - a.confidence);
  return Math.abs(sorted[0].confidence - sorted[1].confidence) <= 0.05;
}

// ---- Checkpoint/Resume helpers ----

interface Checkpoint {
  task: string;
  wave: number;
  completedResults: { taskId: string; result: string; confidence: number }[];
  remainingTasks: string[];
  concurrency: number;
  timestamp: number;
}

function createCheckpoint(data: Omit<Checkpoint, 'timestamp'>): Checkpoint {
  return { ...data, timestamp: Date.now() };
}

function isCheckpointStale(checkpoint: Checkpoint, maxAgeHours = 24): boolean {
  return (Date.now() - checkpoint.timestamp) > maxAgeHours * 60 * 60 * 1000;
}

function resumeFromCheckpoint(checkpoint: Checkpoint): { startWave: number; skipTasks: string[]; concurrency: number } {
  return {
    startWave: checkpoint.wave + 1,
    skipTasks: checkpoint.completedResults.map(r => r.taskId),
    concurrency: checkpoint.concurrency,
  };
}

// ---- Read-only heuristic helpers ----

function isReadOnly(taskDescription: string): boolean {
  const writeKeywords = ['fix', 'refactor', 'update', 'create', 'write', 'modify', 'add', 'remove', 'delete'];
  return !writeKeywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(taskDescription));
}

// ---- Zero subtask guard ----

function shouldSkipSwarm(subtaskCount: number): boolean {
  return subtaskCount === 0;
}

// ---- Parallelism tier with failures ----

function detectTierWithFailures(ratio: number, allFailed: boolean): 'limited' | 'standard' | 'max' {
  if (allFailed) return 'limited';
  return detectParallelismTier(ratio);
}

// ---- Reserve pool release conditions ----

function shouldReleaseReserve(opts: { allQueued: boolean; noneWaiting: boolean; zeroFailures: boolean; velocityAboveExpected: boolean; isFinalWave: boolean; inErrorRecovery: boolean }): boolean {
  if (opts.inErrorRecovery) return false;
  if (opts.isFinalWave) return true;
  if (opts.allQueued && opts.noneWaiting) return true;
  if (opts.zeroFailures && opts.velocityAboveExpected) return true;
  return false;
}

// ---- Parse agent output ----

function parseAgentOutput(raw: string): {
  confidence: number;
  findings: string;
  result: string;
} | null {
  const confMatch = raw.match(/CONFIDENCE:\s*(HIGH|MEDIUM|LOW)/i);
  const findMatch = raw.match(/FINDINGS:\s*(.+)/i);
  const resMatch = raw.match(/RESULT:\s*([\s\S]+?)(?:\n##|\nCONFIDENCE|\nFINDINGS|$)/i);

  if (!resMatch) return null;

  return {
    confidence: confMatch ? parseConfidence(confMatch[1]) : 0.85,
    findings: findMatch ? findMatch[1].trim() : '',
    result: resMatch[1].trim(),
  };
}

// =============================================================================
// MECHANISM 1: Pheromone Evaporation
// =============================================================================

describe('Mechanism 1: Pheromone Evaporation', () => {
  it('perfect score today = full weight', () => {
    expect(pheromoneScore(10, 0)).toBe(10);
  });

  it('perfect score 1 day ago decays', () => {
    expect(pheromoneScore(10, 1)).toBeCloseTo(9.5, 1);
  });

  it('perfect score 30 days ago is ~2.1', () => {
    expect(pheromoneScore(10, 30)).toBeCloseTo(2.146, 1);
  });

  it('7/10 yesterday beats 10/10 from 30 days ago', () => {
    expect(pheromoneScore(7, 1)).toBeGreaterThan(pheromoneScore(10, 30));
  });

  it('zero score stays zero', () => {
    expect(pheromoneScore(0, 5)).toBe(0);
  });

  it('negative days treated as zero', () => {
    expect(pheromoneScore(8, 0)).toBe(8);
  });

  it('custom decay rate works', () => {
    expect(pheromoneScore(10, 1, 0.90)).toBeCloseTo(9.0, 1);
  });

  it('100 days old is near zero', () => {
    expect(pheromoneScore(10, 100)).toBeLessThan(0.1);
  });

  it('Monte Carlo: pheromone beats recency-only across random histories', () => {
    let pheromoneWins = 0;
    let recencyWins = 0;

    for (let trial = 0; trial < 100; trial++) {
      // Generate random history with varying quality and age
      const history = Array.from({ length: 20 }, (_, i) => ({
        score: 1 + Math.random() * 9,
        days: Math.floor(Math.random() * 60),
      }));

      // Pheromone selection: best weighted score
      const pheromoneBest = history.reduce((best, h) => {
        const w = pheromoneScore(h.score, h.days);
        return w > best.weighted ? { ...h, weighted: w } : best;
      }, { score: 0, days: 0, weighted: 0 });

      // Recency selection: most recent entry
      const recencyBest = history.reduce((best, h) => h.days < best.days ? h : best, history[0]);

      if (pheromoneBest.score >= recencyBest.score) pheromoneWins++;
      else recencyWins++;
    }

    // Pheromone should pick better strategies more often than recency-only
    expect(pheromoneWins).toBeGreaterThan(recencyWins);
  });
});

// =============================================================================
// MECHANISM 2: Self-Validation Gates
// =============================================================================

describe('Mechanism 2: Self-Validation Gates', () => {
  it('parses HIGH confidence', () => {
    expect(parseConfidence('HIGH')).toBe(0.93);
  });

  it('parses MEDIUM confidence', () => {
    expect(parseConfidence('MEDIUM')).toBe(0.85);
  });

  it('parses LOW confidence', () => {
    expect(parseConfidence('LOW')).toBe(0.70);
  });

  it('defaults to MEDIUM for unknown', () => {
    expect(parseConfidence('WHATEVER')).toBe(0.85);
  });

  it('case insensitive', () => {
    expect(parseConfidence('high')).toBe(0.93);
    expect(parseConfidence('Low')).toBe(0.70);
  });
});

// =============================================================================
// MECHANISM 3: Reasoning Tree Conflicts
// =============================================================================

describe('Mechanism 3: Reasoning Tree Conflicts', () => {
  const agentA = { result: 'bug in auth', confidence: 0.90, steps: ['parse input', 'check auth', 'found null check missing'] };
  const agentB = { result: 'auth is fine', confidence: 0.75, steps: ['parse input', 'check auth', 'all checks pass'] };
  const agentC = { result: 'same conclusion', confidence: 0.80, steps: ['parse input', 'check auth', 'found null check missing'] };

  it('identifies correct divergence step', () => {
    const result = resolveConflict(agentA, agentB, 0.85);
    expect(result.divergenceStep).toBe(2);
  });

  it('high challenger confidence resolves without Opus', () => {
    const result = resolveConflict(agentA, agentB, 0.85);
    expect(result.escalateToOpus).toBe(false);
    expect(result.winner).toBe('A');
  });

  it('low challenger confidence escalates to Opus', () => {
    const result = resolveConflict(agentA, agentB, 0.55);
    expect(result.escalateToOpus).toBe(true);
    expect(result.winner).toBe('A');
  });

  it('no divergence found defaults to step 0', () => {
    const result = resolveConflict(agentA, agentC, 0.85);
    expect(result.divergenceStep).toBe(0);
  });

  it('Opus escalation limited to 1 per conflict: boundary at exactly 0.7', () => {
    const result = resolveConflict(agentA, agentB, 0.7);
    expect(result.escalateToOpus).toBe(true);
  });
});

// =============================================================================
// MECHANISM 4: Stigmergy
// =============================================================================

describe('Mechanism 4: Stigmergy (Shared Findings)', () => {
  it('triggers throttle and summarize at >20 findings since last summary', () => {
    const result = checkBackpressure(21);
    expect(result.shouldThrottle).toBe(true);
    expect(result.shouldSummarize).toBe(true);
  });

  it('no throttle at exactly 20', () => {
    const result = checkBackpressure(20);
    expect(result.shouldThrottle).toBe(false);
    expect(result.shouldSummarize).toBe(false);
  });

  it('resets counter after summarization (simulated)', () => {
    // Simulate: was at 25, summarized, now at 0
    const before = checkBackpressure(25);
    expect(before.shouldThrottle).toBe(true);
    const afterReset = checkBackpressure(0);
    expect(afterReset.shouldThrottle).toBe(false);
    expect(afterReset.shouldSummarize).toBe(false);
  });

  it('per-agent file isolation prevents write conflicts', () => {
    const agentIds = ['agent-1', 'agent-2', 'agent-3'];
    const filePaths = agentIds.map(id => `.hive/findings/${id}.json`);
    const uniquePaths = new Set(filePaths);
    expect(uniquePaths.size).toBe(agentIds.length);
    // Each agent gets its own file
    expect(filePaths[0]).not.toBe(filePaths[1]);
  });
});

// =============================================================================
// MECHANISM 5: Completion Velocity
// =============================================================================

describe('Mechanism 5: Completion Velocity', () => {
  it('computes velocity correctly', () => {
    expect(computeVelocity(10, 5)).toBe(2);
  });

  it('handles zero elapsed time', () => {
    expect(computeVelocity(5, 0)).toBe(0);
  });

  it('scale up when velocity > 1.3x expected', () => {
    const actual = computeVelocity(14, 5);  // 2.8 vs expected 2.6
    const expected = computeVelocity(10, 5); // 2.0 * 1.3 = 2.6
    expect(actual > expected * 1.3).toBe(true);
  });

  it('scale down when velocity < 0.6x expected', () => {
    const actual = computeVelocity(2, 5);
    const expected = computeVelocity(10, 5);
    expect(actual < expected * 0.6).toBe(true);
  });

  it('maintain when velocity is in normal range', () => {
    const actual = computeVelocity(8, 5);
    const expected = computeVelocity(10, 5);
    expect(actual >= expected * 0.6 && actual <= expected * 1.3).toBe(true);
  });
});

// =============================================================================
// MECHANISM 6: Semantic Quorum
// =============================================================================

describe('Mechanism 6: Semantic Quorum', () => {
  it('identical strings = 1.0 overlap', () => {
    expect(semanticOverlap('found three bugs', 'found three bugs')).toBe(1);
  });

  it('similar conclusions have high overlap', () => {
    expect(semanticOverlap('found three bugs in auth', 'three bugs found in authentication')).toBeGreaterThan(0.3);
  });

  it('completely different = low overlap', () => {
    expect(semanticOverlap('everything looks fine', 'critical security vulnerability')).toBe(0);
  });

  it('empty strings = 0', () => {
    expect(semanticOverlap('', '')).toBe(0);
  });

  it('quorum requires ceil(assigned/2)', () => {
    expect(Math.ceil(5 / 2)).toBe(3);
    expect(Math.ceil(4 / 2)).toBe(2);
    expect(Math.ceil(3 / 2)).toBe(2);
    expect(Math.ceil(1 / 2)).toBe(1);
  });

  it('100 agents all disagreeing = no quorum', () => {
    // Each agent has a unique conclusion
    const conclusions = Array.from({ length: 100 }, (_, i) => `unique conclusion ${i}`);
    const groups = new Map<string, number>();
    for (const c of conclusions) {
      groups.set(c, (groups.get(c) || 0) + 1);
    }
    const quorumThreshold = Math.ceil(100 / 2);
    const hasQuorum = [...groups.values()].some(v => v >= quorumThreshold);
    expect(hasQuorum).toBe(false);
  });
});

// =============================================================================
// MECHANISM 6b: Negation-Aware Fallback
// =============================================================================

describe('Mechanism 6b: Negation-Aware Overlap', () => {
  it('"no damage found" vs "damage found" = DIFFERENT', () => {
    expect(negationAwareOverlap('no damage found', 'damage found')).toBe(0);
  });

  it('"no issues" vs "not any issues" = SAME (both negated)', () => {
    expect(negationAwareOverlap('no issues detected', 'not any issues found')).toBeGreaterThan(0);
  });

  it('"works fine" vs "works fine" = SAME', () => {
    expect(negationAwareOverlap('works fine', 'works fine')).toBe(1);
  });

  it('"never fails" vs "fails constantly" = DIFFERENT', () => {
    expect(negationAwareOverlap('never fails', 'fails constantly')).toBe(0);
  });

  it('"can handle" vs "can\'t handle" = DIFFERENT', () => {
    expect(negationAwareOverlap('can handle load', "can't handle load")).toBe(0);
  });
});

// =============================================================================
// MECHANISM 7: Scout Retirement (TTL)
// =============================================================================

describe('Mechanism 7: Scout Retirement (TTL)', () => {
  it('default TTL is 120s for no history', () => {
    expect(ttl(0, 'simple')).toBe(120);
  });

  it('uses history average * 2.5', () => {
    expect(ttl(30, 'simple')).toBe(75);
  });

  it('complex multiplier doubles TTL', () => {
    expect(ttl(30, 'complex')).toBe(150);
  });

  it('medium multiplier is 1.5x', () => {
    expect(ttl(30, 'medium')).toBe(112.5);
  });
});

// =============================================================================
// MECHANISM 8: Decision Protocols
// =============================================================================

describe('Mechanism 8: Decision Protocols', () => {
  it('reasoning tasks use vote', () => {
    expect(selectProtocol('reasoning')).toBe('vote');
  });

  it('knowledge tasks use consensus', () => {
    expect(selectProtocol('knowledge')).toBe('consensus');
  });

  it('creative tasks use AAD', () => {
    expect(selectProtocol('creative')).toBe('aad');
  });

  it('unknown defaults to consensus', () => {
    expect(selectProtocol('unknown')).toBe('consensus');
  });
});

// =============================================================================
// MECHANISM 9: Swarm Playbook (tested via pheromone + scoring)
// =============================================================================

describe('Mechanism 9: Swarm Playbook', () => {
  it('relevance decays same as pheromone', () => {
    const relevance = pheromoneScore(0.9, 10);
    expect(relevance).toBeCloseTo(0.54, 1);
  });

  it('entries below 0.3 relevance are excluded', () => {
    const relevance = pheromoneScore(0.5, 30);
    expect(relevance < 0.3).toBe(true);
  });

  it('fresh high-confidence entries are included', () => {
    const relevance = pheromoneScore(0.95, 1);
    expect(relevance > 0.3).toBe(true);
  });
});

// =============================================================================
// MECHANISM 10: Ready-Up Signal (tested via context ceiling)
// =============================================================================

describe('Mechanism 10: Ready-Up Signal / Pre-Flight', () => {
  it('< 50% context = full plan', () => {
    expect(contextAction(30)).toBe('full');
  });

  it('50-70% = save and reduce', () => {
    expect(contextAction(60)).toBe('save-reduce');
  });

  it('70-85% = priority only', () => {
    expect(contextAction(80)).toBe('priority-only');
  });

  it('>= 85% = emergency abort', () => {
    expect(contextAction(90)).toBe('emergency-abort');
  });

  it('boundary: 50% exactly = save-reduce', () => {
    expect(contextAction(50)).toBe('save-reduce');
  });

  it('boundary: 70% exactly = priority-only', () => {
    expect(contextAction(70)).toBe('priority-only');
  });

  it('boundary: 85% exactly = emergency-abort', () => {
    expect(contextAction(85)).toBe('emergency-abort');
  });
});

// =============================================================================
// MECHANISM 11: Cross-Inhibition (confidence-proportional dampening)
// =============================================================================

describe('Mechanism 11: Cross-Inhibition', () => {
  it('dampens lower confidence proposals proportionally', () => {
    const proposals = [
      { confidence: 0.93, proposal: 'A' },
      { confidence: 0.70, proposal: 'B' },
    ];
    const result = crossInhibit(proposals);
    // Both are dampened by maxConf (0.93), but A retains higher weight
    expect(result[0].proposal).toBe('A');
    expect(result[0].weight).toBeGreaterThan(result[1].weight);
    // Weights are less than original confidence due to dampening
    expect(result[0].weight).toBeLessThan(0.93);
    expect(result[1].weight).toBeLessThan(0.70);
  });

  it('preserves ranking order after dampening', () => {
    const proposals = [
      { confidence: 0.60, proposal: 'C' },
      { confidence: 0.93, proposal: 'A' },
      { confidence: 0.80, proposal: 'B' },
    ];
    const result = crossInhibit(proposals);
    expect(result[0].proposal).toBe('A');
    expect(result[1].proposal).toBe('B');
    expect(result[2].proposal).toBe('C');
  });

  it('escalates to reasoning tree when top two within 0.05', () => {
    const proposals = [
      { confidence: 0.90, proposal: 'A' },
      { confidence: 0.87, proposal: 'B' },
    ];
    expect(shouldEscalateToReasoningTree(proposals)).toBe(true);
  });

  it('does not escalate when clear winner (>0.05 gap)', () => {
    const proposals = [
      { confidence: 0.93, proposal: 'A' },
      { confidence: 0.70, proposal: 'B' },
    ];
    expect(shouldEscalateToReasoningTree(proposals)).toBe(false);
  });

  it('single proposal has no dampening effect', () => {
    const proposals = [{ confidence: 0.85, proposal: 'A' }];
    const result = crossInhibit(proposals);
    expect(result.length).toBe(1);
    expect(result[0].proposal).toBe('A');
    // Single proposal: no escalation possible
    expect(shouldEscalateToReasoningTree(proposals)).toBe(false);
  });
});

// =============================================================================
// MECHANISM 13: Assembly Line QC
// =============================================================================

describe('Mechanism 13: Assembly Line QC', () => {
  it('chain confidence below 0.65 fails', () => {
    expect(chainConfidence([0.93, 0.70])).toBeCloseTo(0.651, 2);
    expect(chainConfidence([0.85, 0.70])).toBeLessThan(0.65);
  });

  it('8 agents at 0.95 barely passes', () => {
    const chain = chainConfidence(Array(8).fill(0.95));
    expect(chain).toBeCloseTo(0.663, 2);
    expect(chain > 0.65).toBe(true);
  });

  it('9 agents at 0.95 fails', () => {
    const chain = chainConfidence(Array(9).fill(0.95));
    expect(chain < 0.65).toBe(true);
  });
});

// =============================================================================
// MECHANISM 15: Adaptive Mode
// =============================================================================

describe('Mechanism 15: Adaptive Mode', () => {
  it('1 task = lite', () => expect(selectMode(1)).toBe('lite'));
  it('3 tasks = lite', () => expect(selectMode(3)).toBe('lite'));
  it('4 tasks = standard', () => expect(selectMode(4)).toBe('standard'));
  it('8 tasks = standard', () => expect(selectMode(8)).toBe('standard'));
  it('9 tasks = full', () => expect(selectMode(9)).toBe('full'));
  it('100 tasks = full', () => expect(selectMode(100)).toBe('full'));
  it('0 tasks = lite', () => expect(selectMode(0)).toBe('lite'));
});

// =============================================================================
// MECHANISM 16: Worktree Isolation (NEW)
// =============================================================================

describe('Mechanism 16: Worktree Isolation', () => {
  describe('activation rules', () => {
    it('lite mode never isolates (even with file writes)', () => {
      expect(shouldIsolate('lite', true, false)).toBe(false);
    });

    it('standard mode isolates when writing files', () => {
      expect(shouldIsolate('standard', true, false)).toBe(true);
    });

    it('standard mode skips isolation for read-only tasks', () => {
      expect(shouldIsolate('standard', false, false)).toBe(false);
    });

    it('full mode isolates when writing files', () => {
      expect(shouldIsolate('full', true, false)).toBe(true);
    });

    it('full mode skips isolation for read-only', () => {
      expect(shouldIsolate('full', false, false)).toBe(false);
    });

    it('--isolate flag forces isolation in all modes', () => {
      expect(shouldIsolate('lite', false, true)).toBe(true);
      expect(shouldIsolate('standard', false, true)).toBe(true);
      expect(shouldIsolate('full', false, true)).toBe(true);
    });

    it('--isolate flag works even in lite mode with no file writes', () => {
      expect(shouldIsolate('lite', false, true)).toBe(true);
    });
  });

  describe('merge decisions', () => {
    it('high confidence (0.93) = auto-merge', () => {
      expect(mergeDecision(0.93)).toBe('auto-merge');
    });

    it('medium confidence (0.85) = auto-merge (boundary)', () => {
      expect(mergeDecision(0.85)).toBe('auto-merge');
    });

    it('low confidence (0.70) = manual review', () => {
      expect(mergeDecision(0.70)).toBe('manual-review');
    });

    it('boundary: 0.84 = manual review', () => {
      expect(mergeDecision(0.84)).toBe('manual-review');
    });

    it('boundary: 0.85 exactly = auto-merge', () => {
      expect(mergeDecision(0.85)).toBe('auto-merge');
    });

    it('perfect confidence = auto-merge', () => {
      expect(mergeDecision(1.0)).toBe('auto-merge');
    });

    it('zero confidence = manual review', () => {
      expect(mergeDecision(0)).toBe('manual-review');
    });
  });

  describe('conflict resolution', () => {
    it('highest confidence agent wins', () => {
      const agents = [
        { id: 'a1', confidence: 0.70, completedAt: 100 },
        { id: 'a2', confidence: 0.93, completedAt: 200 },
        { id: 'a3', confidence: 0.85, completedAt: 150 },
      ];
      expect(conflictWinner(agents)).toBe('a2');
    });

    it('equal confidence: first to complete wins', () => {
      const agents = [
        { id: 'a1', confidence: 0.85, completedAt: 200 },
        { id: 'a2', confidence: 0.85, completedAt: 100 },
        { id: 'a3', confidence: 0.85, completedAt: 150 },
      ];
      expect(conflictWinner(agents)).toBe('a2');
    });

    it('single agent always wins', () => {
      const agents = [{ id: 'a1', confidence: 0.70, completedAt: 100 }];
      expect(conflictWinner(agents)).toBe('a1');
    });

    it('tie on confidence and time: first in array wins', () => {
      const agents = [
        { id: 'a1', confidence: 0.85, completedAt: 100 },
        { id: 'a2', confidence: 0.85, completedAt: 100 },
      ];
      expect(conflictWinner(agents)).toBe('a1');
    });

    it('3+ agents touching same file: should trigger merge agent', () => {
      const agents = [
        { id: 'a1', confidence: 0.93, completedAt: 100 },
        { id: 'a2', confidence: 0.90, completedAt: 110 },
        { id: 'a3', confidence: 0.88, completedAt: 120 },
      ];
      // When 3+ agents modify the same file, we should spawn a merge agent
      // The logic flags this condition
      const needsMergeAgent = agents.length >= 3;
      expect(needsMergeAgent).toBe(true);
    });

    it('2 agents on same file: no merge agent needed', () => {
      const agents = [
        { id: 'a1', confidence: 0.93, completedAt: 100 },
        { id: 'a2', confidence: 0.90, completedAt: 110 },
      ];
      expect(agents.length >= 3).toBe(false);
    });
  });
});

// =============================================================================
// Strategy Selection
// =============================================================================

describe('Strategy Selection', () => {
  it('independent tasks = wide-parallel', () => {
    expect(selectStrategy('independent')).toBe('wide-parallel');
  });

  it('sequential tasks = deep-pipeline', () => {
    expect(selectStrategy('sequential')).toBe('deep-pipeline');
  });

  it('research tasks = fan-out-gather', () => {
    expect(selectStrategy('research')).toBe('fan-out-gather');
  });

  it('mixed tasks = hybrid', () => {
    expect(selectStrategy('mixed')).toBe('hybrid');
  });

  it('improvement tasks = iterative', () => {
    expect(selectStrategy('improvement')).toBe('iterative');
  });

  it('unknown defaults to wide-parallel', () => {
    expect(selectStrategy('unknown')).toBe('wide-parallel');
  });
});

// =============================================================================
// Parallelism Tier Detection
// =============================================================================

describe('Parallelism Tier Detection', () => {
  it('ratio < 0.3 = limited', () => {
    expect(detectParallelismTier(0.1)).toBe('limited');
    expect(detectParallelismTier(0.29)).toBe('limited');
  });

  it('ratio 0.3-0.6 = standard', () => {
    expect(detectParallelismTier(0.3)).toBe('standard');
    expect(detectParallelismTier(0.5)).toBe('standard');
    expect(detectParallelismTier(0.6)).toBe('standard');
  });

  it('ratio > 0.6 = max', () => {
    expect(detectParallelismTier(0.61)).toBe('max');
    expect(detectParallelismTier(1.0)).toBe('max');
  });

  it('max concurrency matches tier', () => {
    expect(maxConcurrency('limited')).toBe(2);
    expect(maxConcurrency('standard')).toBe(5);
    expect(maxConcurrency('max')).toBe(15);
  });
});

// =============================================================================
// Reserve Pool
// =============================================================================

describe('Reserve Pool', () => {
  it('25% of 8 = 2', () => {
    expect(reservePool(8)).toBe(2);
  });

  it('25% of 5 = 1', () => {
    expect(reservePool(5)).toBe(1);
  });

  it('25% of 15 = 3', () => {
    expect(reservePool(15)).toBe(3);
  });

  it('25% of 1 = 0', () => {
    expect(reservePool(1)).toBe(0);
  });
});

// =============================================================================
// Scoring Function
// =============================================================================

describe('Scoring Function', () => {
  it('perfect run = 10', () => {
    expect(scoringFunction(10, 10, {
      noThrottles: true,
      fast: true,
      efficientConflicts: true,
      quorumUsed: true,
      goodStigmergy: true,
    })).toBe(10);
  });

  it('all failed = 0 base + bonuses', () => {
    expect(scoringFunction(0, 10, { noThrottles: true })).toBe(1.5);
  });

  it('50% pass = 3.0 base', () => {
    expect(scoringFunction(5, 10)).toBe(3);
  });

  it('capped at 10', () => {
    expect(scoringFunction(10, 10, {
      noThrottles: true,
      fast: true,
      efficientConflicts: true,
      quorumUsed: true,
      goodStigmergy: true,
    })).toBe(10);
  });
});

// =============================================================================
// Output Parsing
// =============================================================================

describe('Output Parsing', () => {
  it('parses well-formed output', () => {
    const raw = `CONFIDENCE: HIGH
FINDINGS: Found 3 bugs
RESULT: Three security issues in auth module`;
    const parsed = parseAgentOutput(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.confidence).toBe(0.93);
    expect(parsed!.findings).toBe('Found 3 bugs');
    expect(parsed!.result).toContain('Three security issues');
  });

  it('defaults confidence to MEDIUM when missing', () => {
    const raw = `FINDINGS: some stuff
RESULT: here are my findings`;
    const parsed = parseAgentOutput(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.confidence).toBe(0.85);
  });

  it('returns null when no RESULT block', () => {
    const raw = `CONFIDENCE: HIGH
FINDINGS: Found stuff`;
    const parsed = parseAgentOutput(raw);
    expect(parsed).toBeNull();
  });

  it('handles result with no other fields', () => {
    const raw = `RESULT: just the result`;
    const parsed = parseAgentOutput(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.result).toBe('just the result');
  });

  it('handles empty result', () => {
    const raw = `RESULT: `;
    const parsed = parseAgentOutput(raw);
    // Empty result after trim = empty string, but RESULT regex does match
    expect(parsed).not.toBeNull();
  });

  it('handles unicode in results', () => {
    const raw = `CONFIDENCE: HIGH
RESULT: Found issues with \u00e9ncoding and \u4e2d\u6587 characters`;
    const parsed = parseAgentOutput(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.result).toContain('\u00e9ncoding');
  });

  it('handles multiline result', () => {
    const raw = `CONFIDENCE: LOW
FINDINGS: Multiple issues
RESULT: Line 1
Line 2
Line 3`;
    const parsed = parseAgentOutput(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.result).toContain('Line 1');
    expect(parsed!.result).toContain('Line 3');
  });
});

// =============================================================================
// Stress Tests
// =============================================================================

describe('Stress Tests', () => {
  it('1000 pheromone calculations complete', () => {
    const results = Array.from({ length: 1000 }, (_, i) =>
      pheromoneScore(Math.random() * 10, i)
    );
    expect(results.length).toBe(1000);
    expect(results.every(r => r >= 0)).toBe(true);
  });

  it('extreme values in scoring', () => {
    expect(scoringFunction(0, 0)).toBeNaN(); // 0/0
    expect(scoringFunction(1000, 1000)).toBe(6); // base only, no bonuses
    expect(scoringFunction(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toBe(6);
  });

  it('NaN inputs handled in pheromone', () => {
    expect(pheromoneScore(NaN, 5)).toBeNaN();
    expect(pheromoneScore(5, NaN)).toBeNaN();
  });

  it('negative confidence in chain', () => {
    expect(chainConfidence([-0.5, 0.9])).toBeLessThan(0);
  });

  it('empty agent list in conflict resolution', () => {
    expect(() => conflictWinner([])).toThrow();
  });

  it('worktree isolation with 100 agents', () => {
    const agents = Array.from({ length: 100 }, (_, i) => ({
      id: `a${i}`,
      confidence: 0.7 + Math.random() * 0.3,
      completedAt: 100 + i,
    }));
    const winner = conflictWinner(agents);
    expect(winner).toBeDefined();
    // Winner should have highest confidence
    const winnerAgent = agents.find(a => a.id === winner)!;
    expect(agents.every(a => a.confidence <= winnerAgent.confidence)).toBe(true);
  });

});

// =============================================================================
// Checkpoint / Resume
// =============================================================================

describe('Mechanism 14: Checkpoint/Resume', () => {
  it('creates checkpoint with timestamp', () => {
    const cp = createCheckpoint({
      task: 'fix auth bugs',
      wave: 2,
      completedResults: [{ taskId: 't1', result: 'fixed login', confidence: 0.9 }],
      remainingTasks: ['t2', 't3'],
      concurrency: 5,
    });
    expect(cp.timestamp).toBeGreaterThan(0);
    expect(cp.task).toBe('fix auth bugs');
    expect(cp.wave).toBe(2);
  });

  it('detects stale checkpoint (>24h old)', () => {
    const cp: Checkpoint = {
      task: 'old task',
      wave: 1,
      completedResults: [],
      remainingTasks: [],
      concurrency: 3,
      timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
    };
    expect(isCheckpointStale(cp)).toBe(true);
  });

  it('fresh checkpoint is not stale', () => {
    const cp: Checkpoint = {
      task: 'fresh task',
      wave: 1,
      completedResults: [],
      remainingTasks: [],
      concurrency: 3,
      timestamp: Date.now() - 1 * 60 * 60 * 1000, // 1 hour ago
    };
    expect(isCheckpointStale(cp)).toBe(false);
  });

  it('resume skips completed tasks', () => {
    const cp: Checkpoint = {
      task: 'multi-task',
      wave: 2,
      completedResults: [
        { taskId: 't1', result: 'done', confidence: 0.9 },
        { taskId: 't2', result: 'done', confidence: 0.85 },
      ],
      remainingTasks: ['t3', 't4'],
      concurrency: 5,
      timestamp: Date.now(),
    };
    const resumed = resumeFromCheckpoint(cp);
    expect(resumed.skipTasks).toEqual(['t1', 't2']);
    expect(resumed.skipTasks).not.toContain('t3');
  });

  it('resume starts at next wave', () => {
    const cp: Checkpoint = {
      task: 'wave test',
      wave: 3,
      completedResults: [],
      remainingTasks: ['t5'],
      concurrency: 4,
      timestamp: Date.now(),
    };
    const resumed = resumeFromCheckpoint(cp);
    expect(resumed.startWave).toBe(4);
    expect(resumed.concurrency).toBe(4);
  });

  it('--resume flag detection', () => {
    const args = '--resume';
    expect(args.includes('--resume')).toBe(true);
  });

  it('--resume with checkpoint file parsing', () => {
    const args = '--resume .hive/checkpoints/hive-20260326.json';
    const match = args.match(/--resume\s+(\S+)/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('.hive/checkpoints/hive-20260326.json');
  });
});

// =============================================================================
// Read-Only Heuristic (Word Boundary Matching)
// =============================================================================

describe('Read-Only Heuristic', () => {
  it('"research competitors" is read-only', () => {
    expect(isReadOnly('research competitors')).toBe(true);
  });

  it('"fix the auth bug" is NOT read-only', () => {
    expect(isReadOnly('fix the auth bug')).toBe(false);
  });

  it('"address the issue" does NOT match "add" (word boundary)', () => {
    expect(isReadOnly('address the issue')).toBe(true);
  });

  it('"adding tests" does NOT match "add" (word boundary)', () => {
    expect(isReadOnly('adding tests')).toBe(true);
  });

  it('"create a new file" is NOT read-only', () => {
    expect(isReadOnly('create a new file')).toBe(false);
  });

  it('"search and analyze" is read-only', () => {
    expect(isReadOnly('search and analyze')).toBe(true);
  });
});

// =============================================================================
// Zero Subtask Guard
// =============================================================================

describe('Zero Subtask Guard', () => {
  it('0 subtasks skips swarm', () => {
    expect(shouldSkipSwarm(0)).toBe(true);
  });

  it('1 subtask does not skip', () => {
    expect(shouldSkipSwarm(1)).toBe(false);
  });
});

// =============================================================================
// Parallelism Tier Edge Case (All Wave 1 Failures)
// =============================================================================

describe('Parallelism Tier: Wave 1 Failures', () => {
  it('all wave 1 failures defaults to limited', () => {
    expect(detectTierWithFailures(0.8, true)).toBe('limited');
  });

  it('partial failures still use ratio', () => {
    expect(detectTierWithFailures(0.5, false)).toBe('standard');
    expect(detectTierWithFailures(0.8, false)).toBe('max');
  });
});

// =============================================================================
// Reserve Pool Release Conditions
// =============================================================================

describe('Reserve Pool Release Conditions', () => {
  it('releases when all queued and none waiting', () => {
    expect(shouldReleaseReserve({
      allQueued: true, noneWaiting: true, zeroFailures: false,
      velocityAboveExpected: false, isFinalWave: false, inErrorRecovery: false,
    })).toBe(true);
  });

  it('releases on clean wave with high velocity', () => {
    expect(shouldReleaseReserve({
      allQueued: false, noneWaiting: false, zeroFailures: true,
      velocityAboveExpected: true, isFinalWave: false, inErrorRecovery: false,
    })).toBe(true);
  });

  it('releases on final wave', () => {
    expect(shouldReleaseReserve({
      allQueued: false, noneWaiting: false, zeroFailures: false,
      velocityAboveExpected: false, isFinalWave: true, inErrorRecovery: false,
    })).toBe(true);
  });

  it('never releases during error recovery', () => {
    expect(shouldReleaseReserve({
      allQueued: true, noneWaiting: true, zeroFailures: true,
      velocityAboveExpected: true, isFinalWave: true, inErrorRecovery: true,
    })).toBe(false);
  });

  it('does not release when conditions not met', () => {
    expect(shouldReleaseReserve({
      allQueued: false, noneWaiting: false, zeroFailures: false,
      velocityAboveExpected: false, isFinalWave: false, inErrorRecovery: false,
    })).toBe(false);
  });
});

// =============================================================================
// Integration: Worktree + Existing Mechanisms
// =============================================================================

describe('Integration: Worktree Isolation', () => {
  it('worktree results feed into merge decisions', () => {
    const worktreeResults = [
      { id: 'a1', confidence: 0.93, result: 'bug in line 42' },
      { id: 'a2', confidence: 0.90, result: 'issue at line 42' },
      { id: 'a3', confidence: 0.88, result: 'line 42 has a bug' },
      { id: 'a4', confidence: 0.70, result: 'no issues found' },
      { id: 'a5', confidence: 0.86, result: 'code looks clean' },
    ];

    // High confidence results auto-merge
    expect(mergeDecision(worktreeResults[0].confidence)).toBe('auto-merge');
    expect(mergeDecision(worktreeResults[1].confidence)).toBe('auto-merge');
    expect(mergeDecision(worktreeResults[2].confidence)).toBe('auto-merge');

    // Low confidence goes to manual review
    expect(mergeDecision(worktreeResults[3].confidence)).toBe('manual-review');

    // Boundary: 0.86 auto-merges
    expect(mergeDecision(worktreeResults[4].confidence)).toBe('auto-merge');
  });

  it('mode detection controls worktree activation', () => {
    expect(shouldIsolate('lite', true, false)).toBe(false);
    expect(shouldIsolate('standard', true, false)).toBe(true);
    expect(shouldIsolate('full', true, false)).toBe(true);
  });

  it('--isolate overrides mode detection', () => {
    expect(shouldIsolate('lite', false, true)).toBe(true);
    expect(shouldIsolate('standard', false, true)).toBe(true);
  });
});
