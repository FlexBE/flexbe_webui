# Runtime Architecture

This note documents ownership boundaries in the runtime stack. The intent is to keep transport state, message handling, controller state, and rendering separate so future changes do not reintroduce connection-state regressions.

## Layers

### `RC.ROS`

`RC.ROS` owns ROS transport lifecycle:

- open/close the ROS bridge connection
- offline mode gating
- connect/disconnect/trying/stopping flags
- initial namespace setup for UI panels

`RC.ROS` should be the only layer that decides whether the client has an active ROS transport session.

It should not:

- infer behavior-engine execution state from individual runtime messages
- own mirror/onboard/launcher heartbeat interpretation
- directly decide runtime page modes beyond transport connect/disconnect setup

### `RC.PubSub`

`RC.PubSub` owns runtime message ingress and command egress:

- subscribe to onboard, mirror, launcher, and state-map topics
- publish runtime commands
- track heartbeat/status/state-map timing
- translate raw messages into higher-level controller signals

`RC.PubSub` should:

- update execution status based on message content
- detect stale or inconsistent runtime data
- feed status and feedback into `RC.Controller` and `UI.RuntimeControl`

`RC.PubSub` should not:

- own ROS transport connection state
- replace `RC.Controller` as the source of truth for UI state transitions

In particular:

- heartbeats confirm runtime liveness
- heartbeats do not establish transport connectivity on their own
- behavior status messages such as `READY`, `STARTED`, `FINISHED`, and `FAILED` must be translated into controller state transitions explicitly

### `RC.Controller`

`RC.Controller` is the canonical runtime UI state machine.

It owns transitions between states such as:

- offline
- no behavior
- configuration
- starting
- active
- locked
- changed
- external

It is the layer that decides what the runtime UI should display.

`RC.Controller` should:

- accept explicit signals from transport or pub/sub layers
- own `current_state_path` and `locked_state_path`
- decide whether the UI is connected, running, locked, external, or configurable

It should not:

- manage ROS transport directly
- parse raw topic messages

### `UI.RuntimeControl`

`UI.RuntimeControl` owns rendering and operator interaction for runtime supervision.

It should:

- render the current controller/runtime state
- show current state, lock status, outcome requests, and feedback
- gather current parameter/autonomy/lock selections from the DOM

It should not:

- own transport connection state
- interpret raw heartbeat/status/state-map messages directly

## Practical Rules

When changing runtime code, use these rules:

1. Transport lifecycle belongs in `RC.ROS`.
2. Message interpretation belongs in `RC.PubSub`.
3. UI/runtime mode transitions belong in `RC.Controller`.
4. Rendering and operator interaction belong in `UI.RuntimeControl`.

## Example

A correct `READY` path looks like this:

1. `RC.PubSub` receives onboard `BEStatus.READY`.
2. `RC.PubSub` signals the controller that the runtime is connected and no behavior is active.
3. `RC.Controller` transitions to the appropriate connected/configuration state.
4. `UI.RuntimeControl` renders the corresponding runtime view.

What should not happen:

- relying on heartbeat reception alone to move the shell from disconnected to connected
- leaving `READY` as a feedback-only message without updating controller state

## Why This Matters

The most subtle runtime regressions in this codebase have come from mixing these responsibilities:

- transport looked connected, but controller stayed disconnected
- heartbeats were present, but runtime UI still showed `No Connection`
- execution feedback arrived, but the shell state machine was not advanced

Keeping these boundaries explicit makes those failures much easier to prevent and debug.

## API Contract

The HTTP API uses a normalized response envelope:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "status": 200
}
```

Use the following rules when adding or updating endpoints:

1. `success=false` means request-level failure.
   This includes auth failures, validation failures, malformed requests,
   transport failures, and command execution failures.

2. `success=true` means the request contract succeeded.
   Domain-specific outcomes belong inside `data`.

3. Command-style mutation endpoints must return `data.ok`.
   Examples: file editor open, ROS create/close/publish operations.

4. Partial success belongs inside `data`, not the envelope.
   Example: code generation can succeed overall while a secondary source-save
   step fails and reports that failure in dedicated `data` fields.

5. Aggregation endpoints may be best-effort, but they must stay explicit.
   If partial results are returned, include structured per-item failures in
   `data` rather than relying on truthiness or omitted fields.

6. Frontend code must never use raw truthiness for API responses.
   Use the helpers in [`app/api.js`](/home/david/synth-test/src/flexbe_webui/flexbe_webui/app/api.js)
   and stop normal processing immediately when `success=false`.
