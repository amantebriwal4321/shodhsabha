# Sponsors

Checked against public docs on 27 Nov 2026. If a call is not in those docs, it is not in this repo.

| Sponsor | What they actually ship | In this app | Needs a secret |
| --- | --- | --- | --- |
| Lyzr | Agent Studio. Chat is `POST https://agent-prod.studio.lyzr.ai/v3/inference/chat/` with `x-api-key`. Body is `user_id`, `agent_id`, `session_id`, `message`. Response field is `response`. | `lib/llm.ts` sends each live seat through that endpoint. Per-seat agent ids are optional overrides. | `LYZR_API_KEY` and `LYZR_AGENT_ID` (create the agent in Studio first) |
| BAND | Rooms for people and agents. TypeScript SDK `@band-ai/sdk` 2.0.1. REST base `https://app.band.ai/api/v1`. Send text with `POST /agent/chats/{chat_id}/messages` and at least one @mention. Auth header `X-API-Key`. | Live runs mirror each A2A line. `scripts/band-bridge.ts` is the websocket seat (`Agent`, `GenericAdapter`, `loadAgentConfigFromEnv`) for inbound mentions. | `BAND_API_KEY`, `BAND_AGENT_ID`, `BAND_CHAT_ID`, `BAND_MENTION_HANDLE` |
| Finch | finchtech.ai, an agent and skill market. Hosted agents expose health, invoke, and task URLs. finch_v2 signs the raw body with HMAC-SHA256. Skills are packages you publish from Listing Center. | Provider routes under `/api/finch/*`. Citation skill is loaded into prompts from `finch/skills/citation-discipline/skill.json`. | `FINCH_KEY_ID` and `FINCH_REQUEST_SECRET` to sign. Unsigned local mode works without them. |
| Agent37 | Sandboxes plus an Agent API on templates. Create `POST https://api.agent37.com/v1/instances` with `Authorization: Bearer`. Chat `POST {instance}/v1/responses` with `X-Agent37-Key`. Success body includes `output_text`, `session_id`, `status`. | Second scribe on an existing instance. Create is implemented and refused unless `AGENT37_AUTO_CREATE=true`. | `AGENT37_API_KEY` and `AGENT37_INSTANCE_URL` |
| AdaL | Sylph coding agent. CLI install from `https://adal.sylph.ai/install.sh`. Headless flag shape used here is `adal --query ... --output text`. SDK is Python and needs a logged-in CLI. | Skill at `adal/skills/shodh-scout/SKILL.md`. Live runs shell out only when the binary exists. Not used to generate this code. | A local `adal` login. No API key in this app. |

## Not invented

- No Lyzr call creates agents. The create endpoint wants provider, model, and often `llm_credential_id`. Chat against an id you already made is the verified path.
- No BAND message is sent without a mention. Their API rejects those with 422.
- Finch HMAC joins the five documented lines with a newline. If a contract test disagrees, the joiner is the thing to change in `lib/finch-sign.ts`. Nonces are remembered in process memory. On serverless that is not a durable replay store. TODO: move nonce storage to a shared store before a real Finch review.
- Agent37 streaming (`stream:true`) is documented and unused. We want one `output_text`.
- AdaL was not logged in during this build. Do not treat the skill file as a record of an AdaL session.

## Fallback order for the council brain

1. Lyzr, if the key and an agent id are both set.
2. OpenAI (`OPENAI_API_KEY`, model `OPENAI_MODEL`, default `gpt-4o-mini`).
3. Groq (OpenAI-compatible `https://api.groq.com/openai/v1/chat/completions`).
4. Gemini (`generativelanguage.googleapis.com`, model `GEMINI_MODEL`, default `gemini-2.5-flash`).
5. Otherwise a recorded run for the three known questions, or a keyless gather for anything else.

Sources never go through those providers. arXiv, OpenAlex, Wikipedia, and DuckDuckGo lite are fetched by the scouts.
