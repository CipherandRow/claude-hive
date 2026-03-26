# Hive: Bio-Inspired Swarm Orchestrator for Claude Code

A drop-in skill that turns Claude Code into a multi-agent swarm. 16 mechanisms from honeybee and ant colony research, backed by 148 algorithmic tests including adversarial, stress, and A/B comparisons.

## Quick Start

```bash
# Copy the skill to your Claude Code commands
cp hive.md ~/.claude/commands/hive.md

# Use it
/hive research the top 5 competitors in my market
/hive run QA on all test files in this repo
/hive fix all TypeScript errors in src/
```

That's it. One file, no dependencies, no server, no setup.

**Note:** Hive agents run as concurrent subprocesses via Claude Code's Agent tool. They execute in parallel but share one API rate limit pool. For large swarms (10+ heavy agents), multi-session tools can distribute load across separate sessions. Hive's strength is coordination quality (conflict resolution, consensus, fault tolerance), not raw throughput.

## What a Run Looks Like

```
> /hive fix all TypeScript errors in src/

Mode: Standard (6 subtasks) | Strategy: wide-parallel | Protocol: vote
Worktree isolation: ON (file-writing detected)

Wave 1 (concurrency: 5, reserve: 1)
  [DONE] Fix src/auth.ts -- 3 errors fixed (38s, HIGH)
  [DONE] Fix src/api.ts -- 1 error fixed (22s, HIGH)
  [DONE] Fix src/utils.ts -- 2 errors fixed (31s, HIGH)
  [DONE] Fix src/models.ts -- 4 errors fixed (45s, MEDIUM)
  [DONE] Fix src/routes.ts -- 1 error fixed (19s, HIGH)

Wave 2 (concurrency: 1)
  [DONE] Synthesize + merge all branches (12s, HIGH)

Result: 11 TypeScript errors fixed across 5 files. 0 conflicts.
Duration: 57s total. Score: 9.2/10
History saved to ~/.claude/hive-history.jsonl
```

## What It Does

When you run `/hive <task>`, it:

1. **Analyzes** your task and picks the optimal strategy (parallel, pipeline, fan-out-gather, hybrid, iterative)
2. **Plans** subtasks with wave structure, concurrency limits, and reserve capacity
3. **Spawns** agents in parallel with self-validation and shared coordination
4. **Monitors** completion velocity, confidence, and conflicts between waves
5. **Resolves** disagreements by finding the exact reasoning step where agents diverge
6. **Learns** from each run, so the next one is faster and better

## Why This Exists

Most "swarm" prompts are 20 lines that say "spawn N agents and merge results." They don't handle:
- What happens when agents disagree?
- What happens when you hit rate limits mid-swarm?
- What happens when context runs out?
- How do you avoid duplicate work across agents?
- How do you resume after a failure?

Hive handles all of these with mechanisms adapted from real biological research.

## The 16 Mechanisms

| # | Mechanism | From | What It Solves |
|---|-----------|------|----------------|
| 1 | Pheromone Evaporation | Ant colonies | Old strategies fade, recent ones dominate |
| 2 | Self-Validation | Leaf-cutter ants | Agents check their own work before returning |
| 3 | Reasoning Trees | AgentAuditor paper | Finds WHERE two agents disagree, not just WHO wins |
| 4 | Stigmergy | Ant trails | Agents coordinate through shared findings, not messages |
| 5 | Completion Velocity | Harvester ant TCP | Scales concurrency based on throughput, not just errors |
| 6 | Semantic Quorum | Honeybee nest selection | "Found 3 bugs" and "Three defects" count as agreement |
| 7 | Scout Retirement | Honeybee scouts | Kills stuck agents before they waste your budget |
| 8 | Decision Protocols | ACL 2025 | Vote for reasoning, consensus for knowledge, AAD for creative |
| 9 | Playbook | Ant tandem running | Winning approaches persist across runs |
| 10 | Ready-Up Signal | Bee piping | Pipeline agents verify inputs before doing work |
| 11 | Cross-Inhibition | Bee stop signals | Low-confidence proposals are dampened proportionally |
| 12 | Inspector Agents | Honeybee inspectors | Re-checks previously rejected options if conditions change |
| 13 | Assembly Line QC | Leaf-cutter processing | Wave handoffs serve as quality gates |
| 14 | Checkpoint/Resume | Inspired by LangGraph | Save state, resume with `/hive --resume` |
| 15 | Adaptive Mode | Ant response thresholds | 2-task swarm skips all the heavy mechanisms automatically |
| 16 | Worktree Isolation | Termite chambers | Each agent works in its own git worktree, zero file conflicts |

## Adaptive Mode (Why It's Not Bloated)

The skill auto-detects task size and skips mechanisms that don't help:

- **1-3 tasks (Lite):** Just spawn, collect, synthesize. No pre-flight, no stigmergy, no checkpoints.
- **4-8 tasks (Standard):** Adds pre-flight, stigmergy, checkpoints, velocity scaling, worktree isolation (when writing files).
- **9+ tasks (Full):** Everything active, all 16 mechanisms.

## Worktree Isolation

When agents write code in parallel, they can stomp on each other's files. Hive solves this using git worktrees: each agent gets its own isolated branch. After completion, results are merged back with confidence-weighted conflict resolution.

- Auto-enabled in Standard/Full mode when agents write files
- Force it with `--isolate`
- Falls back to per-agent output files if not in a git repo

## Dry Run

Preview the full execution plan before committing any API calls:

```bash
/hive --dry-run fix all TypeScript errors in src/
```

Outputs: strategy, wave structure, agent count, estimated cost, and which mechanisms will activate. No agents are launched.

A 2-task swarm runs exactly as fast as a basic "spawn 2 agents" prompt. The complexity only activates when it's needed.

## Verbose Mode

See exactly which mechanisms activated and what decisions were made:

```bash
/hive --verbose fix all TypeScript errors in src/
```

Outputs a mechanism trace after each wave: which of the 16 mechanisms fired, timing, confidence scores, and scaling decisions. Useful for understanding what Hive is doing under the hood.

## Test Results

148 algorithmic logic tests, all passing. These validate the math, thresholds, and decision logic that Hive instructs Claude to follow. They are not end-to-end integration tests (those require live Claude sessions):

| Category | Tests | What's Covered |
|----------|-------|----------------|
| Core mechanisms | 68 | Pheromone decay, quorum, velocity, TTL, scoring, reserve pool, mode detection |
| Worktree isolation | 22 | Activation rules, merge decisions, conflict resolution, integration |
| Stress/adversarial | 14 | 1000-entry pheromone, NaN, empty arrays, 100-agent conflicts, Unicode |
| Negation-aware overlap | 5 | "no damage found" vs "damage found" treated as DIFFERENT |
| Output parsing | 7 | Missing fields, unformatted output, empty responses, multiline |
| Checkpoint/Resume | 5 | Creation, resume flags, old checkpoint detection |
| Strategy/protocol | 3 | Strategy selection, protocol mapping |
| Read-only heuristic | 4 | Word boundary matching, substring false positives ("address" != "add") |
| Cross-inhibition | 3 | Dampening formula, equal-confidence escalation, weight calculation |
| Reserve pool | 3 | Release conditions, error recovery hold, final wave capacity |
| Zero subtask / edge cases | 3 | Direct-answer mode, empty input, single-subtask bypass |

**A/B tested:** Pheromone evaporation vs "just use the most recent run." 100-trial Monte Carlo simulation:

| Metric | Pheromone (0.95/day) | Best-of-Recent (last 3 days) |
|--------|---------------------|--------------|
| Mean selected score | 6.65 | 5.02 |
| Selected a bad strategy (<4) | 3/100 trials | 41/100 trials |
| Recovery from recent bad run | 1 run | Never (locked in) |

The key insight: with variable history, picking the best recent run ignores quality trends beyond a narrow window. Pheromone decay weights the full history with time-appropriate discounting, recovering from a single bad run within one iteration. Test in `tests/hive-mechanisms.spec.ts`, "Monte Carlo" describe block.

**Adversarial tested:**
- Negation near-misses ("no damage found" vs "damage found" correctly treated as DIFFERENT)
- 100 agents all disagreeing (quorum correctly never triggers)
- Unicode edge cases, empty strings, extreme values, NaN inputs

## Research Background

The mechanisms come from peer-reviewed research:
- Thomas Seeley (Cornell): Honeybee nest-site selection and quorum sensing
- Marco Dorigo: Ant Colony Optimization (1992)
- Deborah Gordon (Stanford): Harvester ant TCP-like foraging regulation
- AgentAuditor (2026): Reasoning tree conflict resolution
- Anthropic: 4x5 agent ceiling (max 4 specialists x 5 tasks)
- ACL 2025: Voting vs consensus in multi-agent debate

## Requirements

- Claude Code (any plan with agent support)
- No external dependencies
- No server required
- Works on macOS, Linux, and Windows

## Files

| File | Purpose |
|------|---------|
| `hive.md` | The skill. Copy to `~/.claude/commands/` |
| `tests/hive-mechanisms.spec.ts` | 148 algorithmic tests (requires vitest) |

## How It Learns

After each run, Hive records what worked to `~/.claude/hive-history.jsonl`. Next time, it starts with the highest-scoring past configuration.

Records decay at 0.95/day, which means:
- Yesterday's 8/10 run: scores 7.6 (still dominant)
- Last week's 9/10 run: scores 6.4 (fading)
- Last month's 10/10 run: scores 2.1 (nearly gone)

This prevents a single great run from dominating forever, and recovers from a bad run within 1-2 iterations. Tested via 100-trial Monte Carlo simulation (see Test Results).

## Checkpoint/Resume

If a swarm gets interrupted (rate limit, context ceiling, failure), it saves state:
```
CHECKPOINT SAVED: .hive/checkpoints/hive-20260326-1400-wave2.json
To resume: /hive --resume
```

Resume picks up exactly where it left off, with completed results preserved for downstream agents.

## How Hive Compares

| Feature | Hive | Ruflo (26K stars) | oh-my-claudecode (12K) | Claude Squad (6.6K) | Claude Octopus (2K) |
|---------|------|------|------|------|------|
| **Setup** | 1 file, 0 deps | Large codebase + install | tmux + config | Go binary + install | Config + 8 providers |
| **Conflict resolution** | Reasoning tree (finds exact divergence point) | Basic merge | None | None | Majority vote |
| **Consensus** | Semantic quorum (LLM-based) | Not documented | Not documented | Not documented | 75% gate (fixed) |
| **Coordination** | Stigmergy (shared board, indirect) | Direct messaging + neural | Shared task list | Session manager | Direct messaging |
| **Isolation** | Git worktree per agent (auto) | Separate processes | tmux sessions (truly parallel) | Separate workspaces | Separate sessions |
| **Learning** | Pheromone decay + playbook | Neural self-learning (more adaptive) | No | No | No |
| **Rate limit handling** | Checkpoint + halve + delay + resume | Retry | Retry | Manual | Retry |
| **Context management** | Ceiling detection + emergency save | Not documented | Not documented | Not documented | Not documented |
| **Observability** | Execution trace (--verbose) | Not documented | Not documented | Not documented | Not documented |
| **Concurrency scaling** | TCP-inspired velocity (auto-tunes) | Fixed | Fixed | Fixed | Fixed |
| **Real parallelism** | Yes (concurrent subprocesses, shared rate limits) | Yes (separate processes) | Yes (tmux) | Yes (separate sessions) | Yes (multi-provider) |
| **Multi-provider** | Claude only | Claude + Codex | Claude + teams | Claude + Codex + Gemini + Aider | 8 providers |
| **Test coverage** | 148 algorithmic tests | Not publicly documented | Not publicly documented | Not publicly documented | Not publicly documented |
| **Dependencies** | Zero | Many | tmux | Go | Node + config |
| **Community/adoption** | New | 26.8K stars | 12.4K stars | 6.6K stars | 2K stars |

### Where Hive leads

**Algorithmic depth.** No other tool finds the exact reasoning step where agents disagree (Reasoning Trees), uses semantic similarity for quorum instead of string matching, or applies TCP-inspired congestion control to agent concurrency. These aren't marketing features. They're backed by 148 algorithmic tests and peer-reviewed research.

**Zero setup cost.** Copy one markdown file. That's it. No binary to install, no server to run, no config file to write. Every other tool in this space requires installation steps.

**Adaptive complexity.** A 2-task Hive run is just as fast as a bare "spawn 2 agents" prompt. The 16 mechanisms only activate when the task is complex enough to need them. Other tools apply their full overhead to every run.

**Fault tolerance.** Hive is the only skill that handles rate limits, context exhaustion, and mid-run failures gracefully. Checkpoint/resume means you never lose work. Other tools retry or crash.

### Where others lead

**Session isolation.** oh-my-claudecode and Claude Squad run fully independent Claude Code sessions, each with its own context window and rate limit budget. Hive agents run as concurrent subprocesses but share one orchestrator context and one API rate limit pool. For large swarms where rate limits are the bottleneck, multi-session tools can distribute load across separate accounts.

**Adaptive learning.** Ruflo's neural self-learning adapts to user-specific patterns in ways that static pheromone decay cannot. Pheromone decay is simpler and more predictable, but it doesn't model the user's behavior. If you want a system that gets smarter about YOUR habits specifically, Ruflo's approach is more sophisticated.

**Multi-provider.** Claude Octopus supports 8 LLM providers with cross-model adversarial review (different models check each other's work). Hive is Claude-only. If you use multiple AI providers, Hive is not the right tool.

**Stars and community.** Ruflo has 26.8K stars and thousands of users battle-testing edge cases. Hive is new. Adoption follows visibility, and a larger community means bugs are found and fixed faster.

### When Not to Use Hive

- **Single-file edits.** If your task touches one file, just ask Claude directly. Hive adds overhead for no benefit.
- **Large swarms hitting rate limits.** Hive agents share one API rate limit pool. If you need 10+ heavy agents simultaneously, multi-session tools (oh-my-claudecode, Claude Squad) can distribute load across separate sessions.
- **Multi-provider workflows.** Hive is Claude-only. If you need GPT-4 checking Claude's work, use Claude Octopus.
- **Exploratory conversations.** Hive is for defined tasks with clear subtasks, not open-ended brainstorming.

## Known Limitations

- **No end-to-end tests.** The test suite validates algorithmic logic (pheromone math, threshold decisions, conflict resolution formulas). It cannot test whether Claude follows the prompt correctly during a live run. The `--verbose` flag helps verify mechanism activation manually.
- **TTL is advisory.** Claude Code cannot hard-kill running agents. TTL expiry means late results are discarded, not that the agent is terminated.
- **Shared API pipeline.** Agents are dispatched in parallel but share one API connection. This is a Claude Code platform constraint, not a Hive limitation.

## Credits

Built by John Nowlan at [Cipher & Row](https://cipherandrow.com).

Research sources: Seeley (Cornell), Dorigo (ULB), Gordon (Stanford), Anthropic, AgentAuditor.
