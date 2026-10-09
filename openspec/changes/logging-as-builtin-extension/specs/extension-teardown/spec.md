## ADDED Requirements

### Requirement: Extension teardown exposes an awaited flush phase

Every extension teardown SHALL run as an ordered, awaited sequence, and SHALL include a flush phase between the shutdown notification and the release of core-held resources:

1. emit `session:shutdown` to interceptor extensions,
2. run each extension's flush phase (optional; awaited),
3. deactivate each extension,
4. unregister its registrations and clear its UI slots.

Core MUST await the sequence before releasing resources an extension may write through, and MUST NOT release them while a flush could still be pending.

#### Scenario: Shutdown reaches extensions before their registrations are removed
- **WHEN** an agent is destroyed
- **THEN** `session:shutdown` is emitted while the extension's subscriptions and tools are still registered

#### Scenario: Teardown is awaited before resource release
- **WHEN** an extension's flush phase performs asynchronous work
- **THEN** core waits for that work to settle before dropping the extension's write resources

#### Scenario: Disable runs the same sequence
- **WHEN** a single extension is disabled rather than destroyed with the whole agent
- **THEN** that extension's flush phase runs and its registrations are removed, and other extensions are unaffected

### Requirement: Extensions can register a synchronous exit flush

An extension that buffers state for persistence SHALL be able to register a synchronous flush that the process-exit path can invoke without awaiting. The synchronous path MUST be best-effort and MUST NOT throw into the exit path: a failing flush MUST be contained so it cannot prevent the process from exiting.

#### Scenario: Exit path flushes registered extensions synchronously
- **WHEN** the process is exiting through the fatal-error guard or an exit hook
- **THEN** every registered synchronous flush is invoked without awaiting, and the buffered state is written

#### Scenario: Failing synchronous flush is contained
- **WHEN** a registered synchronous flush throws
- **THEN** the error is contained and the process still exits

#### Scenario: Registration is released with the extension
- **WHEN** an extension is destroyed
- **THEN** its synchronous flush is no longer invoked by the exit path

### Requirement: Teardown failures are reported, not swallowed

A failure in any teardown phase MUST NOT abort the remaining phases or prevent the extension's registrations from being removed, and SHALL be reported through the unified bus as an extension-error event that distinguishes the failing phase (activate / flush / deactivate). Teardown MUST NOT leave an extension observable in an active state after it has been destroyed.

#### Scenario: Flush failure does not skip unregistration
- **WHEN** an extension's flush phase throws
- **THEN** an extension-error event names the flush phase, the extension's registrations are still removed, and the remaining extensions are still torn down

#### Scenario: Deactivation failure is reported
- **WHEN** an extension's deactivate throws
- **THEN** the failure is reported on the unified bus and the extension still ends up inactive with no registrations

### Requirement: Teardown flush does not depend on the session channel

The flush phase SHALL be available to extensions regardless of whether a host or session is attached, so a headless host and a process-exit guard can both guarantee durable writes. The flush phase MUST NOT be expressed as a session channel subscription.

#### Scenario: Headless host flushes on exit
- **WHEN** an extension buffering state runs under a host with no session UI attached and the process exits
- **THEN** the synchronous exit flush writes the buffered state

#### Scenario: Flush is not a channel
- **WHEN** a consumer inspects the session channels
- **THEN** no channel exists for the extension flush phase
