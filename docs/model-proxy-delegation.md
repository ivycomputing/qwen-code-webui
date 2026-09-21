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

## Persisted CLI configuration

Delegated queries set `QWEN_CODE_SIMPLE=1` as well as the per-request endpoint
and key. With Qwen Code 0.17.0 this selects bare mode, ignoring saved
modelProviders/auth settings, hooks and preapproved tools. A conflicting saved
modelProvider can otherwise override environment configuration. Require a CLI
with this behavior before enabling delegation; older builds must not silently
ignore this setting. Direct CLI new/resumed-session tests with a memory provider
passed on 0.17.0; they do not certify the WebUI SDK subprocess path.

The locked SDK 0.1.5 and Qwen CLI 0.17.0 have also been exercised together
with the request environment helper: new session, resume with a different
grant, and cancellation against a stalled memory provider. These tests disable
TCP and do not substitute for provider/TLS deployment validation. The process
registry that makes abort tracking reach ESM `import { spawn }` consumers and
reaps an aborted child's pipes ships separately (see PR #275); this document
describes that behavior once that PR lands.

## Hosting proxy obligations

- **Strip any client-supplied `X-Model-Proxy-Token` and set your own.** Any
  authenticated browser caller can send the header; the fixed base URL limits
  the effect to your proxy, which should reject credentials it did not issue
  anyway. Do not rely on that validation alone — remove the header at the edge.
- **Run the server without provider keys in its environment.** Delegation never
  *routes* through shared keys, but the CLI subprocess inherits the server
  environment: any `OPENAI_API_KEY`/`DASHSCOPE_API_KEY`-style variables stay
  visible to approved shell commands in a delegated session.
- `QWEN_CODE_SIMPLE=1` also disables the user's saved hooks and preapproved
  tools for delegated sessions; a hosting UI must not display permission state
  that no longer applies.

## Limitations

Token redaction string-replaces the credential inside a `JSON.parse(JSON.stringify(...))`
round-trip on each SDK message and enqueue — correct (the token charset contains
nothing JSON escapes) but paid twice per message including large tool results.
Redacting only at the serialization boundary would halve that; left as-is until
profiling shows it matters.
