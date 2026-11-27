---
name: shodh-scout
description: Extend ShodhSabha with one more keyless source without touching the council graph.
---

# Shodh scout

You are editing this repo as AdaL, a local coding agent. The council already fetches arXiv, OpenAlex, Wikipedia, and DuckDuckGo HTML.

When asked to add a source:

1. Add a fetcher in `lib/sources.ts` that returns `SourceDoc` and never throws past `gatherSources`.
2. Keep it keyless, or gate the key in `.env.example` with a one-line comment.
3. Do not add a new agent seat. Web Scout or Paper Scout should pick the docs up.
4. Add a unit test that parses a fixture. Do not call the network from the test.
5. Leave demo JSON alone unless the user asks to recapture.

Do not invent a sponsor endpoint. If a vendor docs page does not show the call, write the gap in `docs/SPONSORS.md` instead of a fake client.
