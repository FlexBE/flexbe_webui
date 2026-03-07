Any contribution that you make to this repository will
be under the Apache 2 License, as dictated by that
[license](http://www.apache.org/licenses/LICENSE-2.0.html):

~~~
5. Submission of Contributions. Unless You explicitly state otherwise,
   any Contribution intentionally submitted for inclusion in the Work
   by You to the Licensor shall be under the terms and conditions of
   this License, without any additional terms or conditions.
   Notwithstanding the above, nothing herein shall supersede or modify
   the terms of any separate license agreement you may have executed
   with Licensor regarding such Contributions.
~~~

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

## Developer Tests

Testing guidance is documented in [`docs/testing.md`](/home/david/synth-test/src/flexbe_webui/docs/testing.md).
