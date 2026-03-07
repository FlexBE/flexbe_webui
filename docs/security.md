# Security Notes

`flexbe_webui` is intended for trusted robot-control networks. By default, it is not hardened for untrusted/public environments.

## Network Exposure

- Keep WebUI hosts/ports restricted to trusted interfaces.
- If possible, run on localhost (`127.0.0.1`) and tunnel/forward access securely.
- Avoid exposing default ports on open networks.

## API Token Protection

You can enable basic token auth for mutating API endpoints:

```bash
export FLEXBE_WEBUI_API_TOKEN='replace-with-long-random-token'
```

When enabled, clients must include one of:

- `Authorization: Bearer <token>`
- `X-API-Token: <token>`

Read-only endpoints remain accessible without a token.

### webui_client behavior

`ros2 run flexbe_webui webui_client` forwards token headers automatically when
`FLEXBE_WEBUI_API_TOKEN` is set in the client process environment.

