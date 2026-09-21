# validator-ci-coverage Specification

## Purpose

Every `validate-*.mjs` script in the repository runs in CI, on Linux and Windows. Coverage is
discovered by glob rather than enumerated, so a new validator is wired by existing and a script with
no `validate:*` npm entry still runs. The suite drives the files directly against the build the job
already produced, because 151 of the 156 core `validate:*` definitions embed `pnpm run build &&` and
going through npm would pay a rebuild per validator.

Two properties keep a green run honest. A validator whose prerequisite is missing is reported as a
**skip**, never as a pass — otherwise "Windows is green" can mean "Windows verified nothing". And a
validator that reads a path git does not track fails the suite, because that passes only on a machine
where the path happens to be populated and fails on a fresh clone, which is to say in CI and only in
CI.

## Requirements

### Requirement: Validators run in CI

Every validation script in the repository SHALL run in CI. A validation script that no workflow
invokes MUST NOT exist: it reads as coverage while providing none, and it rots without anyone
noticing.

Coverage SHALL be determined by discovering the scripts, not by enumerating them, so a newly
added validator is wired by virtue of existing.

#### Scenario: A new validator is covered without being registered

- **WHEN** a developer adds a `packages/<pkg>/scripts/validate-<name>.mjs`
- **THEN** it runs in CI without editing any workflow or driver list

#### Scenario: A validator with no npm entry still runs

- **WHEN** a validation script exists on disk but has no `validate:*` entry in its package's
  `package.json`
- **THEN** it still runs in CI

#### Scenario: A failing validator fails the build

- **WHEN** any validator exits non-zero
- **THEN** the CI job fails and names the offending validator

### Requirement: Validators run against a single shared build

The suite SHALL run against the build the CI job already produced, not rebuild per validator.

The per-script `pnpm run build &&` prefix SHALL remain, so each `validate:*` script stays correct
when run standalone; the suite runner drives the scripts directly and SHALL NOT pay that cost.

#### Scenario: No redundant rebuilds

- **WHEN** the suite runs N validators
- **THEN** the package is built at most once for the whole suite, not once per validator

#### Scenario: A standalone validator still works

- **WHEN** a developer runs `pnpm --filter @codent/core run validate:<name>` directly
- **THEN** it builds and runs as before

### Requirement: Validators run on Linux and Windows

The suite SHALL run on both Linux and Windows. Windows in particular is the only mechanism that
catches a validator that depends on POSIX-only behaviour, which is common in a repository whose
tooling was written POSIX-first.

#### Scenario: A POSIX-only validator fails rather than passes quietly

- **WHEN** a validator's prerequisite check relies on a POSIX-only construct (e.g.
  `spawnSync("sh", ["-c", "command -v …"])`)
- **THEN** the Windows run reports a failure or an explicit skip, never a silent pass

#### Scenario: Both platforms gate a pull request

- **WHEN** a pull request is opened
- **THEN** the validator suite runs on Linux and on Windows

### Requirement: A skipped validator is reported as a skip, not as a pass

A validator that exits 0 without exercising its assertions SHALL be distinguishable from one that
verified everything. The suite SHALL report skipped validators separately from passed ones.

Silent degradation is the failure mode this exists to prevent: a validator whose prerequisite is
missing is indistinguishable from a passing one when both exit 0.

#### Scenario: Missing prerequisite is reported

- **WHEN** a validator's external prerequisite is unavailable and it exits 0 without asserting
- **THEN** the run summary reports it as skipped, not passed

#### Scenario: Partial internal skip is reported

- **WHEN** a validator skips an internal branch but still asserts the rest
- **THEN** the skip is visible in the run output

### Requirement: A validator MUST NOT read an untracked path

A validator SHALL NOT depend on files or directories that git does not track. Fixtures SHALL be
created at run time (e.g. under the OS temp directory) and cleaned up afterwards.

A validator that reads a gitignored path passes only on a machine where that path happens to be
populated, and fails on a fresh clone — which is to say, in CI and only in CI.

#### Scenario: Reading the repo's `.agents` fails the suite

- **WHEN** a validator reads a path under the repository's `.agents/` directory
- **THEN** the suite reports it as a failure naming that validator

#### Scenario: A fixture-based validator passes on a fresh clone

- **WHEN** the repository is checked out without any gitignored directories present
- **THEN** every validator passes

### Requirement: The suite is reported with usable totals

The suite SHALL report per-package and total counts of passed, failed and skipped validators, and
SHALL name every failing validator with its output.

#### Scenario: Summary names failures

- **WHEN** a run finishes with failures
- **THEN** the summary lists each failing validator and its diagnostic output
