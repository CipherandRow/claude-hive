# Contributing to Hive

Thanks for your interest in contributing.

## Ways to Contribute

- **Bug reports**: Open an issue describing what happened vs. what you expected
- **Mechanism improvements**: If you find a better algorithm for any of the 16 mechanisms, open a PR with tests
- **Platform ports**: Port Hive to other agent frameworks (OpenClaw, Aider, etc.) in the `ports/` directory
- **Test improvements**: Add more edge cases or adversarial tests to the test suite

## Development Setup

```bash
git clone https://github.com/CipherandRow/claude-hive.git
cd claude-hive
npm install
npx vitest run        # run tests
npx vitest --watch    # watch mode
```

## Project Structure

```
hive.md                        # The skill (this is the product)
src/hive-mechanisms.ts         # Reference implementation of algorithmic logic
tests/hive-mechanisms.spec.ts  # 148 tests importing from src/
```

## Guidelines

- The skill file (`hive.md`) is the source of truth. `src/hive-mechanisms.ts` is a reference implementation of the same algorithms for testing purposes.
- All PRs should include tests for new logic
- Keep the mechanism numbering (1-16) consistent across all files
- Follow the existing code style (TypeScript, vitest)

## Porting to Other Platforms

See the "Porting to Other Platforms" section in the README. Add your port to `ports/<platform-name>/` with a README explaining what was changed.
