# Optional per-request model proxy credentials

An authenticated hosting application can use `--model-proxy-base-url` with
`--token-secret-file` and `--auth-type openai`. The model proxy URL is trusted
server configuration (HTTPS or literal loopback HTTP), never a chat parameter.
The hosting server places a bounded proxy credential in `X-Model-Proxy-Token`
for each chat request. Missing credentials are rejected; shared process keys are
not used as a fallback. Do not combine this with an Open ACE gateway setting.

The handler passes `OPENAI_BASE_URL` and `OPENAI_API_KEY` through the SDK's
per-query `env` option. It does not mutate `process.env`, write a key into model
settings, or return the header to the browser. Literal credential occurrences
in SDK messages, error logs and stderr are redacted. This does not sandbox the
CLI: approved commands can inspect their own environment. Only restricted proxy
credentials belong here; never inject an unrestricted provider key.

The hosting server and model proxy must enforce authenticated identity, exact
model and credential version, admission limits, deadlines, revocation, egress
policy and upstream TLS. A header or a UI model selection is not authorization.
File and command permissions remain independent of model credentials.

For an embedded portal that authenticates API requests with its own cookies,
the host may set `window.__WEBUI_CONTEXT_ENABLED__ = true`, a valid mount in
`window.__WEBUI_BASENAME__`, and `window.__WEBUI_CONTEXT_ID__` to a public
48-character lowercase hexadecimal model-selection ID. The ID persists in
per-tab session storage under that mount and is sent as `context_id` only to
the same-origin mounted API. In this mode no legacy URL bearer token is added.
The host must check context ownership server-side. IDs are not capabilities,
secrets, session-auth tokens or a substitute for CSRF protection.

The feature is opt-in; standalone model configuration and existing integrations
keep their default behavior. The Node and Deno entry points pass these options
to the same handler. The default UI does not add application-specific controls.

Unit checks cover environment separation, rejected configuration, and context
URL behavior. A real SDK/CLI integration test must additionally verify environment
precedence, session resume, streaming, abort, long-turn lease renewal and absence
of fallback to stored provider settings. Do not mark this path production-ready
from helper tests alone.
