# Security Notes

`flexbe_webui` is intended for trusted robot-control networks. By default, it is not hardened for untrusted/public environments.

## Network Exposure

- Keep WebUI hosts/ports restricted to trusted interfaces.
- If possible, run on localhost (`127.0.0.1`) and tunnel/forward access securely.
- Avoid exposing default ports on open networks.

## API Token Protection

You can enable basic token auth for control, mutation, and filesystem-metadata
API endpoints:

```bash
export FLEXBE_WEBUI_API_TOKEN='replace-with-long-random-token'
```

When enabled, clients must include one of:

- `Authorization: Bearer <token>`
- `X-API-Token: <token>`

Websocket endpoints accept the same token as a `token` or `api_token` query
parameter because browsers cannot set custom websocket headers.

Most read-only endpoints remain accessible without a token. However, endpoints
that expose local configuration, package filesystem paths, behavior metadata, or
full Python source are **also token-protected** when token auth is enabled.

Protected read and metadata endpoints include:

- `/api/v1/get_config_files`
- `/api/v1/get_config_settings`
- `/api/v1/packages/behaviors`
- `/api/v1/packages/states`
- `/api/v1/io/behaviors/{package_name}`
- `/api/v1/io/states/{package_name}`
- `/api/v1/io/behavior/{package_name}/{codefile_name}`

Shutdown-control endpoints are protected as well:

- `/api/v1/ui_connected`
- `/api/v1/confirm_shutdown`
- `/ws/check_shutdown`

Direct browser access to protected HTTP endpoints will be rejected with `401`
because browsers do not automatically inject `Authorization` or `X-API-Token`
headers; use `webui_client` or supply the header explicitly (e.g. via a
reverse-proxy or development tooling). The browser client can also bootstrap a
token from a one-time `?token=<token>` or `?api_token=<token>` URL; it stores the
token in local storage and removes it from the visible URL.

## Diagnostics Endpoints

`/dev/diagnostics`, `/api/v1/dev/diagnostics`, and `/api/v1/dev/diagnostics/node` are
restricted to loopback clients (`127.0.0.1` / `::1`) regardless of how the server is
bound. They are not subject to token auth because they are inaccessible to non-local
clients by design.

Remote access via SSH port-forwarding is the recommended approach for LAN debugging.

**Limitation:** the loopback check inspects the TCP peer address (`request.client.host`).
A reverse proxy running on `127.0.0.1` that forwards external traffic will pass the check
unconditionally. If you deploy behind such a proxy, restrict access to diagnostics endpoints
at the proxy level, or reject requests that carry a non-loopback `X-Forwarded-For` header.

### webui_client behavior

`ros2 run flexbe_webui webui_client` forwards token headers automatically when
`FLEXBE_WEBUI_API_TOKEN` is set in the client process environment. It also adds
the token query parameter used by the shutdown websocket.
