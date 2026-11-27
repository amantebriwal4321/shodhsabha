# HiDevs form, ready to paste

## Project title

ShodhSabha

## Short description

ShodhSabha is a research council for one hard question. A planner splits the work. A web scout and a paper scout pull arXiv, OpenAlex, Wikipedia, and DuckDuckGo. A skeptic throws out claims that do not answer the question. A fact checker keeps a quote only when that quote sits in the fetched page. A scribe then writes a brief with a confidence score, open questions, and citations you can open. The UI shows every agent to agent message, then exports Markdown or PDF. With no API keys, three recorded runs replay. With a Lyzr key, or OpenAI, Groq, or Gemini, the same seats reason live. The quote check still applies, so a fluent sentence cannot smuggle in a number the pages never contained.

## Long description

Most research chatbots answer in one voice. ShodhSabha refuses that. You ask something like whether a cloud kitchen in Koramangala is a sane bet, or what the public record actually says about LLM hallucination fixes. Six seats talk in the open. The planner assigns lines of inquiry. Scouts do not get to invent sources: they call keyless APIs and bring back titles, URLs, and excerpts. The skeptic compares that packet to the question and marks encyclopedia pages as scope, not as the latest study. The fact checker is code, not a vibe. A quote is verified only if it is inside the fetched text, partial if the overlap is high, rejected otherwise. The scribe writes from the survivors. Confidence is the share of quotes that matched, capped, and lowered when the packet has no numbers for a money question. It is not a probability that your decision will work.

The same run has two speeds. Demo mode replays a capture from a real keyless gather, so a judge with an empty env file still sees a full sabha. Keyless gather runs the fetchers live for any other question and stays extractive. Live mode sends each seat through Lyzr inference when `LYZR_API_KEY` and an agent id are set, otherwise through OpenAI, Groq, or Gemini. Scouts still attach the real packet. If the model names a figure that is not in the pages, the fact checker drops it and the score falls.

Agent to agent is the product, not a diagram we forgot to build. Messages use an envelope with ids, a task, a sender, and a recipient, and the UI prints them as the sabha talks. BAND gets a copy of each live line via the agent messages API, and `npm run band:bridge` keeps a websocket seat that answers mentions. Finch can call the hosted runtime at `/api/finch/invoke`; the citation skill in the repo is what the skeptic and scribe actually load. Agent37, when you point it at an instance you already pay for, rewrites the scribe pass and is ignored if it adds new numbers. AdaL is the local coding harness: a skill file tells it how to add a source, and the server will shell out to the AdaL query command when the CLI is logged in.

## BAND

BAND is the room the sabha can speak into. The web app posts each live message to `POST /api/v1/agent/chats/{chat_id}/messages` on app.band.ai with the agent API key, and the body includes the required @mention so the platform will route it. A serverless function cannot hold BAND's websocket, so inbound mentions are a separate process: `npm run band:bridge` runs `@band-ai/sdk` 2.0.1, `GenericAdapter`, and `loadAgentConfigFromEnv`, then answers with the brief. Recorded replays do not spam a room. Without `BAND_API_KEY`, `BAND_CHAT_ID`, and `BAND_MENTION_HANDLE` the mirror no-ops and the UI pill stays off.

## AdaL

AdaL is a local coding agent from Sylph, not a research API I could find a key for. I did not use it to generate this repo: the CLI wants an interactive login, and this build environment has no AdaL session. What is real is the integration. `adal/skills/shodh-scout/SKILL.md` tells AdaL how to add one keyless source without inventing a new seat. In a live run, if `adal` is on PATH and `ADAL_ENABLED` is not false, the scribe step calls the AdaL CLI in query mode, with tools cleared, and appends the gap note. If the binary is missing, the run continues and the health pill stays off. That is the honest "used while building" note: the skill and the adapter are in the tree, a logged-in AdaL session is not.

## Finch

Finch here is finchtech.ai, the skill and agent market, not the HRIS company with the same name. ShodhSabha is a provider runtime. `GET /api/finch/health` returns `{status:"ready"}`. `POST /api/finch/invoke` accepts a P1 conversation turn and returns the brief in the documented completed envelope, echoing `invocation_id`. Other interaction modes get HTTP 202 plus a `merchant_task_id`, and `GET /api/finch/tasks/{id}` returns the poll body. HMAC follows the published canonical string (method, path, timestamp, nonce, body hash) and the finch_v2 base64url secret rule. Unsigned responses are allowed only when `FINCH_REQUEST_SECRET` is empty, so local curl works. The citation-discipline skill under `finch/skills` is loaded into the skeptic and scribe prompts on every run. Listing it on the market still needs a wallet signature in Listing Center, which I cannot do from here.

## Lyzr

Lyzr is the preferred brain. When `LYZR_API_KEY` and `LYZR_AGENT_ID` are set, each seat calls `POST https://agent-prod.studio.lyzr.ai/v3/inference/chat/` with `x-api-key`, `user_id`, `agent_id`, `session_id`, and `message`, and reads `response`. Optional per-seat ids (`LYZR_PLANNER_AGENT_ID` and the rest) override the shared agent. The scouts still fetch pages themselves. Lyzr is asked to judge the packet, not to browse. If the call fails, that seat falls back to the extractive line and the run records the failure. Creating agents from nothing needs a Studio credential id I could not verify as optional, so the adapter does not pretend to provision agents. No Lyzr key means the recorded sabha, or a keyless gather, and the Lyzr pill stays off.

## Agent37

Agent37 hosts a sandbox and, on agent templates, a chat API. The sabha calls an instance you already have: `POST {AGENT37_INSTANCE_URL}/v1/responses` with header `X-Agent37-Key` and body `{input, stream:false}`, then reads `output_text` and `status`. It is a second scribe. If the rewrite introduces a number that is not in the fetched pages, we keep the earlier draft. `agent37CreateInstance` can `POST https://api.agent37.com/v1/instances` with template `agent37-hermes` and a one dollar budget cap, but only when `AGENT37_AUTO_CREATE=true`, because that spends wallet credit. The default path never creates an instance. No key, no call.

## Problems faced

Finch's signing spec is public and implemented, but publishing the agent still needs their wallet flow and a public HTTPS URL, so I could not complete a market listing. BAND's realtime path is a websocket that Vercel will not keep open, which forced the split between a REST mirror and `band:bridge`. Agent37 bills a wallet, so auto-creating a Hermes box on every demo would have been a nasty surprise. AdaL's login is a browser step, so I shipped the skill and the CLI adapter without a fake transcript of an AdaL session. Lyzr's chat API needs an agent id from Studio. A bare API key is not enough, and I did not invent a zero-config agent. DuckDuckGo sometimes answers and sometimes will not. Scouts continue with Wikipedia, arXiv, and OpenAlex. OpenAlex also puts anonymous callers on a shared free budget, so a busy IP can come back empty. The fact checker is strict on purpose: a cloud kitchen question with no rent figures gets a low score instead of a pep talk.
