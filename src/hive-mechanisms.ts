// =============================================================================
// Hive Mechanisms — Reference Implementation
// =============================================================================
// This module contains the algorithmic logic for all 16 bio-inspired mechanisms
// used by Claude Hive's multi-agent swarm orchestration. Each function implements
// a specific mechanism drawn from honeybee and ant colony research: pheromone
// decay, quorum sensing, stigmergy, cross-inhibition, worktree isolation, and
// more. These are the production decision-making primitives that drive agent
// coordination, conflict resolution, and adaptive concurrency.
// =============================================================================

// ---- Mechanism 1: Pheromone Evaporation ----

/**
 * Calculates a time-decayed pheromone score.
 * Implements Mechanism 1 (Pheromone Evaporation): recent high-quality results
 * are weighted more heavily than older ones, using exponential decay.
 */
export function pheromoneScore(score: number, daysSince: number, decayRate = 0.95): number {
  return score * Math.pow(decayRate, daysSince);
}

// ---- Mechanism 2: Self-Validation Gates ----

/**
 * Parses a confidence label (HIGH/MEDIUM/LOW) into a numeric value.
 * Implements Mechanism 2 (Self-Validation Gates): agents self-report confidence
 * which gates whether results are accepted, escalated, or retried.
 */
export function parseConfidence(label: string): number {
  const map: Record<string, number> = { HIGH: 0.93, MEDIUM: 0.85, LOW: 0.70 };
  return map[label.toUpperCase()] ?? 0.85;
}

/**
 * Computes chained confidence across a pipeline of agents.
 * Implements Mechanism 13 (Assembly Line QC): multiplicative confidence
 * degrades quickly, enforcing quality gates in sequential pipelines.
 */
export function chainConfidence(agents: number[]): number {
  return agents.reduce((acc, c) => acc * c, 1);
}

// ---- Mechanism 3: Reasoning Tree Conflicts ----

/**
 * Resolves a conflict between two agents by comparing reasoning steps and confidence.
 * Implements Mechanism 3 (Reasoning Tree Conflicts): finds the divergence point,
 * picks the higher-confidence winner, and escalates to Opus when challenger
 * confidence is too low to decide autonomously.
 */
export function resolveConflict(
  agentA: { result: string; confidence: number; steps: string[] },
  agentB: { result: string; confidence: number; steps: string[] },
  challengerConfidence: number
): { winner: 'A' | 'B'; escalateToOpus: boolean; divergenceStep: number } {
  const divergenceStep = agentA.steps.findIndex((s, i) => s !== agentB.steps[i]);
  const effectiveStep = divergenceStep === -1 ? 0 : divergenceStep;

  if (challengerConfidence <= 0.7) {
    return { winner: agentA.confidence >= agentB.confidence ? 'A' : 'B', escalateToOpus: true, divergenceStep: effectiveStep };
  }
  return { winner: agentA.confidence >= agentB.confidence ? 'A' : 'B', escalateToOpus: false, divergenceStep: effectiveStep };
}

// ---- Mechanism 4: Stigmergy ----

/**
 * Checks whether stigmergy backpressure thresholds have been exceeded.
 * Implements Mechanism 4 (Stigmergy): when findings accumulate faster than
 * they can be consumed, throttling and summarization are triggered.
 */
export function checkBackpressure(findingsSinceLastSummary: number): { shouldThrottle: boolean; shouldSummarize: boolean } {
  return {
    shouldThrottle: findingsSinceLastSummary > 20,
    shouldSummarize: findingsSinceLastSummary > 20,
  };
}

// ---- Mechanism 5: Completion Velocity ----

/**
 * Computes task completion velocity (tasks per minute).
 * Implements Mechanism 5 (Completion Velocity): used to detect whether
 * the swarm should scale up, scale down, or maintain current concurrency.
 */
export function computeVelocity(completed: number, elapsedMin: number): number {
  return elapsedMin > 0 ? completed / elapsedMin : 0;
}

// ---- Mechanism 6: Semantic Quorum ----

/**
 * Calculates Jaccard similarity (word overlap) between two strings.
 * Implements Mechanism 6 (Semantic Quorum): agents' conclusions are compared
 * for agreement to determine whether quorum has been reached.
 */
export function semanticOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Negation-aware semantic overlap that returns 0 when one side is negated and the other is not.
 * Implements Mechanism 6b (Negation-Aware Fallback): prevents false quorum when
 * agents agree on topic but disagree on polarity (e.g., "no bugs" vs "bugs found").
 */
export function negationAwareOverlap(a: string, b: string): number {
  const negations = ['no', 'not', 'never', 'none', 'neither', "don't", "doesn't", "didn't", "won't", "can't"];
  const tokensA = a.toLowerCase().split(/\s+/);
  const tokensB = b.toLowerCase().split(/\s+/);
  const hasNegA = tokensA.some(t => negations.includes(t));
  const hasNegB = tokensB.some(t => negations.includes(t));
  if (hasNegA !== hasNegB) return 0;
  return semanticOverlap(a, b);
}

// ---- Mechanism 7: Scout Retirement (TTL) ----

/**
 * Calculates the time-to-live for a scout agent based on historical averages and complexity.
 * Implements Mechanism 7 (Scout Retirement / TTL): prevents runaway agents by
 * setting adaptive timeouts derived from past performance.
 */
export function ttl(historyAvg: number, complexity: 'simple' | 'medium' | 'complex'): number {
  const multipliers = { simple: 1.0, medium: 1.5, complex: 2.0 };
  const base = historyAvg > 0 ? historyAvg * 2.5 : 120;
  return base * multipliers[complexity];
}

// ---- Mechanism 8: Decision Protocols ----

/**
 * Selects the appropriate decision protocol for a given task type.
 * Implements Mechanism 8 (Decision Protocols): reasoning tasks use voting,
 * knowledge tasks use consensus, and creative tasks use AAD (Advocate-Adversary Debate).
 */
export function selectProtocol(taskType: string): string {
  const map: Record<string, string> = {
    reasoning: 'vote',
    knowledge: 'consensus',
    creative: 'aad',
  };
  return map[taskType] ?? 'consensus';
}

// ---- Mechanism 10: Ready-Up Signal / Context Ceiling ----

/**
 * Determines the context management action based on usage percentage.
 * Implements Mechanism 10 (Ready-Up Signal / Pre-Flight): manages context
 * window budgets to prevent agents from exceeding limits mid-task.
 */
export function contextAction(usedPercent: number): string {
  if (usedPercent < 50) return 'full';
  if (usedPercent < 70) return 'save-reduce';
  if (usedPercent < 85) return 'priority-only';
  return 'emergency-abort';
}

// ---- Mechanism 11: Cross-Inhibition ----

/**
 * Applies confidence-proportional dampening to competing proposals.
 * Implements Mechanism 11 (Cross-Inhibition): the highest-confidence proposal
 * suppresses lower-confidence alternatives, mimicking lateral inhibition in neural circuits.
 */
export function crossInhibit(proposals: { confidence: number; proposal: string }[]): { proposal: string; weight: number }[] {
  const maxConf = Math.max(...proposals.map(p => p.confidence));
  return proposals.map(p => ({
    proposal: p.proposal,
    weight: p.confidence * (1 - maxConf * 0.5),
  })).sort((a, b) => b.weight - a.weight);
}

/**
 * Determines if a near-tie between top proposals should escalate to a reasoning tree.
 * Implements Mechanism 11 (Cross-Inhibition): when the top two proposals are within
 * 0.05 confidence, cross-inhibition alone cannot resolve the conflict.
 */
export function shouldEscalateToReasoningTree(proposals: { confidence: number }[]): boolean {
  if (proposals.length < 2) return false;
  const sorted = [...proposals].sort((a, b) => b.confidence - a.confidence);
  return Math.abs(sorted[0].confidence - sorted[1].confidence) <= 0.05;
}

// ---- Mechanism 14: Checkpoint/Resume ----

/**
 * Represents a saved checkpoint of swarm progress.
 * Used by Mechanism 14 (Checkpoint/Resume) to enable crash recovery.
 */
export interface Checkpoint {
  task: string;
  wave: number;
  completedResults: { taskId: string; result: string; confidence: number }[];
  remainingTasks: string[];
  concurrency: number;
  timestamp: number;
}

/**
 * Creates a checkpoint with a current timestamp.
 * Implements Mechanism 14 (Checkpoint/Resume): saves swarm state so that
 * interrupted runs can be resumed without re-doing completed work.
 */
export function createCheckpoint(data: Omit<Checkpoint, 'timestamp'>): Checkpoint {
  return { ...data, timestamp: Date.now() };
}

/**
 * Checks whether a checkpoint has exceeded its maximum age.
 * Implements Mechanism 14 (Checkpoint/Resume): stale checkpoints are discarded
 * to avoid resuming with outdated context.
 */
export function isCheckpointStale(checkpoint: Checkpoint, maxAgeHours = 24): boolean {
  return (Date.now() - checkpoint.timestamp) > maxAgeHours * 60 * 60 * 1000;
}

/**
 * Derives resume instructions from a checkpoint.
 * Implements Mechanism 14 (Checkpoint/Resume): determines which wave to start at,
 * which tasks to skip, and what concurrency to use.
 */
export function resumeFromCheckpoint(checkpoint: Checkpoint): { startWave: number; skipTasks: string[]; concurrency: number } {
  return {
    startWave: checkpoint.wave + 1,
    skipTasks: checkpoint.completedResults.map(r => r.taskId),
    concurrency: checkpoint.concurrency,
  };
}

// ---- Mechanism 15: Adaptive Mode ----

/**
 * Selects the swarm mode (lite/standard/full) based on subtask count.
 * Implements Mechanism 15 (Adaptive Mode): small tasks use lite mode (no isolation),
 * medium tasks use standard, and large tasks use full orchestration.
 */
export function selectMode(subtasks: number): 'lite' | 'standard' | 'full' {
  if (subtasks <= 3) return 'lite';
  if (subtasks <= 8) return 'standard';
  return 'full';
}

// ---- Mechanism 16: Worktree Isolation ----

/**
 * Determines whether an agent should run in an isolated git worktree.
 * Implements Mechanism 16 (Worktree Isolation): write-capable agents in standard
 * or full mode get isolation; lite mode never isolates unless forced.
 */
export function shouldIsolate(mode: 'lite' | 'standard' | 'full', writesFiles: boolean, forceIsolate: boolean): boolean {
  if (forceIsolate) return true;
  if (mode === 'lite') return false;
  return writesFiles;
}

/**
 * Decides whether a worktree result should auto-merge or require manual review.
 * Implements Mechanism 16 (Worktree Isolation): high-confidence results (>= 0.85)
 * are auto-merged; lower confidence requires human review.
 */
export function mergeDecision(confidence: number): 'auto-merge' | 'manual-review' {
  return confidence >= 0.85 ? 'auto-merge' : 'manual-review';
}

/**
 * Picks the winning agent when multiple agents produce conflicting worktree results.
 * Implements Mechanism 16 (Worktree Isolation): highest confidence wins;
 * ties broken by earliest completion time.
 */
export function conflictWinner(agents: { id: string; confidence: number; completedAt: number }[]): string {
  const sorted = [...agents].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.completedAt - b.completedAt;
  });
  return sorted[0].id;
}

// ---- Strategy Selection ----

/**
 * Selects the execution strategy based on task type.
 * Maps task categories to parallelism strategies (wide-parallel, deep-pipeline,
 * fan-out-gather, hybrid, iterative).
 */
export function selectStrategy(taskType: string): string {
  const map: Record<string, string> = {
    independent: 'wide-parallel',
    sequential: 'deep-pipeline',
    research: 'fan-out-gather',
    mixed: 'hybrid',
    improvement: 'iterative',
  };
  return map[taskType] ?? 'wide-parallel';
}

// ---- Parallelism Tier Detection ----

/**
 * Detects the parallelism tier based on the independence ratio of subtasks.
 * Determines whether the swarm should run in limited (2), standard (5),
 * or max (15) concurrency.
 */
export function detectParallelismTier(ratio: number): 'limited' | 'standard' | 'max' {
  if (ratio < 0.3) return 'limited';
  if (ratio <= 0.6) return 'standard';
  return 'max';
}

/**
 * Returns the maximum concurrent agent count for a given parallelism tier.
 */
export function maxConcurrency(tier: 'limited' | 'standard' | 'max'): number {
  return { limited: 2, standard: 5, max: 15 }[tier];
}

/**
 * Detects parallelism tier with a fallback to 'limited' when all wave 1 tasks failed.
 * Handles the edge case where ratio-based detection would be misleading after
 * total first-wave failure.
 */
export function detectTierWithFailures(ratio: number, allFailed: boolean): 'limited' | 'standard' | 'max' {
  if (allFailed) return 'limited';
  return detectParallelismTier(ratio);
}

// ---- Reserve Pool ----

/**
 * Calculates the number of reserve agents (25% of concurrency, floored).
 * Reserve agents are held back to handle retries and error recovery.
 */
export function reservePool(concurrency: number): number {
  return Math.floor(concurrency * 0.25);
}

/**
 * Determines whether the reserve pool should be released back into the active pool.
 * Release conditions: final wave, all queued with none waiting, or clean run
 * with high velocity. Never releases during error recovery.
 */
export function shouldReleaseReserve(opts: { allQueued: boolean; noneWaiting: boolean; zeroFailures: boolean; velocityAboveExpected: boolean; isFinalWave: boolean; inErrorRecovery: boolean }): boolean {
  if (opts.inErrorRecovery) return false;
  if (opts.isFinalWave) return true;
  if (opts.allQueued && opts.noneWaiting) return true;
  if (opts.zeroFailures && opts.velocityAboveExpected) return true;
  return false;
}

// ---- Scoring Function ----

/**
 * Calculates the overall swarm run score (0-10) from pass rate and bonus conditions.
 * Base score is (passed/total)*6, with up to 4 bonus points for operational quality.
 */
export function scoringFunction(passed: number, total: number, opts: {
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

// ---- Read-Only Heuristic ----

/**
 * Determines whether a task description implies read-only operations.
 * Uses word-boundary matching to avoid false positives (e.g., "address" does not match "add").
 */
export function isReadOnly(taskDescription: string): boolean {
  const writeKeywords = ['fix', 'refactor', 'update', 'create', 'write', 'modify', 'add', 'remove', 'delete'];
  return !writeKeywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(taskDescription));
}

// ---- Zero Subtask Guard ----

/**
 * Returns true if the swarm should be skipped entirely (zero subtasks).
 * Prevents launching an empty swarm when decomposition produces no work items.
 */
export function shouldSkipSwarm(subtaskCount: number): boolean {
  return subtaskCount === 0;
}

// ---- Output Parsing ----

/**
 * Parses structured agent output (CONFIDENCE/FINDINGS/RESULT blocks) from raw text.
 * Returns null if no RESULT block is found. Defaults confidence to MEDIUM when missing.
 */
export function parseAgentOutput(raw: string): {
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
