# AGENTS.md — working agreement for AI coding agents

This file complements `CLAUDE.md` (project context) with _how to work_ in this repository.

## Session start

1. Read `CLAUDE.md`, this file and `docs/PROJECT_STATUS.md`.
2. Run `git status` and `git log --oneline -15`.
3. Pick up the next item of the current milestone in `docs/PROJECT_STATUS.md`. Do not start
   from scratch and do not redo documented research.

## Working rules

- **Real software only.** No mock UIs that pretend to work, no simulated results, no hidden
  errors, no fake values standing in for missing vehicle data. If a signal is unavailable the
  UI shows a dash or hides the element.
- **Tests with the change.** Every package has Vitest tests beside the code. Run the tests that
  cover the change; run the whole suite before a commit.
- **Documentation with the change.** Update the document that describes the changed feature
  and add a line under _Unreleased_ in `CHANGELOG.md`. Do not write duplicate documents.
- **Status honesty.** Use the five status words (developed, tested locally, compiled,
  published, tested in vehicle) and never upgrade a status without evidence.
- **Efficiency.** Reuse components, avoid new dependencies unless justified, do not reformat
  unrelated files, do not rebuild the Studio for a logic-only change.
- **Safety.** Runtime changes must keep deactivate/restore working and must not place
  essential information inside the reserved zones.

## Git

- Commit when a logical unit is complete and tests pass. Conventional commit messages:
  `feat(scope): …`, `fix(scope): …`, `docs: …`, `refactor(scope): …`, `test(scope): …`,
  `chore: …`. Scopes: `signals`, `schema`, `engine`, `simulator`, `compiler`, `mgu`, `studio`,
  `themes`, `ci`, `docs`.
- Push to `main` after a passing unit of work. Releases are tags `vX.Y.Z` created only for
  stable, documented milestones; never for every commit.
- Forbidden: backup folders, `*.bak`/`*.old`/`-v2` files, force-push to `main`, history
  rewriting, committing secrets or proprietary material, destructive git operations.

## Milestone reporting

When a milestone completes, update `docs/PROJECT_STATUS.md` (version, finished, pending, bugs,
decisions, next steps) and report briefly: features, tests run, status, commit, next task.

## Milestones (see docs/PROJECT_STATUS.md for progress)

Foundation (repo, licences, architecture, CI) · MGU runtime · Studio MVP · Theme compiler ·
Simulator · Advanced Studio · Diagnostics & compatibility · Build & release.
