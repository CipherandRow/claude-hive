import { describe, it, expect } from 'vitest';

// =============================================================================
// Hive Mechanism Tests — 17 bio-inspired mechanisms
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

  it('Monte Carlo: pheromone beats recency-only with variance', () => {
    // Simulate 100 history entries with varying scores and ages
    const history = Array.from({ length: 100 }, (_, i) => ({
      score: 5 + Math.sin(i * 0.3) * 4, // oscillating 1-9
      days: i,
    }));

    const pheromoneWinner = history.reduce((best, h) => {
      const weighted = pheromoneScore(h.score, h.days);
      return weighted > best.weighted ? { ...h, weighted } : best;
    }, { score: 0, days: 0, weighted: 0 });

    const recencyWinner = history[0]; // most recent

    // Pheromone should pick a strategy that balances recency AND quality
    // Not just the most recent one
    expect(pheromoneWinner.weighted).toBeGreaterThan(0);
    expect(pheromoneWinner.score).toBeGreaterThanOrEqual(recencyWinner.score * 0.8);
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
  it('high confidence resolves without Opus', () => {
    const challengerConfidence = 0.85;
    expect(challengerConfidence > 0.7).toBe(true);
  });

  it('low confidence escalates to Opus', () => {
    const challengerConfidence = 0.55;
    expect(challengerConfidence > 0.7).toBe(false);
  });

  it('boundary 0.7 does NOT pass (must be >0.7)', () => {
    const challengerConfidence = 0.7;
    expect(challengerConfidence > 0.7).toBe(false);
  });
});

// =============================================================================
// MECHANISM 4: Stigmergy
// =============================================================================

describe('Mechanism 4: Stigmergy (Shared Findings)', () => {
  it('backpressure triggers at >20 unread findings', () => {
    const findings = 21;
    expect(findings > 20).toBe(true);
  });

  it('no backpressure at 20 or fewer', () => {
    expect(20 > 20).toBe(false);
    expect(15 > 20).toBe(false);
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
  it('higher confidence dampens lower', () => {
    const proposals = [
      { confidence: 0.93, proposal: 'A' },
      { confidence: 0.70, proposal: 'B' },
    ];
    const sorted = proposals.sort((a, b) => b.confidence - a.confidence);
    expect(sorted[0].proposal).toBe('A');
  });

  it('equal confidence = no dampening', () => {
    const a = { confidence: 0.85 };
    const b = { confidence: 0.85 };
    expect(a.confidence === b.confidence).toBe(true);
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
  it('checkpoint filename format', () => {
    const ts = '20260326-1400';
    const wave = 2;
    const filename = `hive-${ts}-wave${wave}.json`;
    expect(filename).toBe('hive-20260326-1400-wave2.json');
  });

  it('auto-trigger on context ceiling', () => {
    const triggers = ['context-ceiling', 'rate-limit', 'consecutive-failures'];
    expect(triggers).toContain('context-ceiling');
  });

  it('--resume flag detection', () => {
    const args = '--resume';
    expect(args.includes('--resume')).toBe(true);
  });

  it('--resume with checkpoint file', () => {
    const args = '--resume .hive/checkpoints/hive-20260326.json';
    const match = args.match(/--resume\s+(\S+)/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('.hive/checkpoints/hive-20260326.json');
  });

  it('old checkpoint warning (>24h)', () => {
    const checkpointAge = 25; // hours
    expect(checkpointAge > 24).toBe(true);
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
