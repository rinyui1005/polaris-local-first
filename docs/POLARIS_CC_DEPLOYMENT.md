# Polaris CC deployment

This branch builds a mobile-first web client for the existing CcCompanion HTTP API.

## Runtime layout

- `127.0.0.1:8795`: existing CcCompanion service
- `127.0.0.1:8796`: Polaris CC static server and same-origin `/chat/*` proxy
- Cloudflare Tunnel: route a dedicated hostname to `http://127.0.0.1:8796`

The original `ccc.yuririko.uk` ingress remains unchanged. The frontend hostname can be added as a second ingress rule, before the final `http_status:404` rule.

## Build artifact

Run `npm run build`. Deploy the resulting `dist/` directory together with `server/cccompanion-web.mjs` to `/home/ubuntu/polaris-cc`.

## Local-only connection secret

The CcCompanion access secret is entered by the user in the browser. It is stored only in that browser's `localStorage` and sent as `X-Auth-Token` to same-origin `/chat/*` requests. It is never embedded in the build artifact or committed to Git.
