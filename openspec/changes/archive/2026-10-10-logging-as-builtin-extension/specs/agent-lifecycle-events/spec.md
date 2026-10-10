## MODIFIED Requirements

### Requirement: Approval requests log only via Event→Log

When tool approvals become pending, the system SHALL emit `agent:tool-approval-request` and MUST NOT also write a duplicate approval entry through the log emission seam at the status-controller emit site. The built-in log extension's bus subscription SHALL be the sole path that turns that event into a log entry, and the status controller MUST NOT call the seam's approval logging directly.
#### Scenario: Approval pending produces one log path
- **WHEN** `syncApprovals` observes one or more tools needing approval
- **THEN** each pending tool causes an `agent:tool-approval-request` emission and the status controller does not write an approval entry directly through the seam

### Requirement: Approval resolution emits lifecycle event

The system SHALL emit `agent:tool-approval-resolved` on the AgentEventBus exactly once per pending approval when it is resolved — whether by user decision or by command-safety auto-decision. The event payload SHALL include `tool_call_id`, `tool_name`, `decision` (`approved` | `denied`), and `reason` when a reason exists. The built-in log extension SHALL be the sole path that turns this event into an `approval` category log entry.

#### Scenario: Command-safety auto-deny emits resolution
- **WHEN** command-safety automatically denies a shell command tool call
- **THEN** `agent:tool-approval-resolved` is emitted with `decision: "denied"` and a reason, and exactly one `approval` log entry is written by the log extension
