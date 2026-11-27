/**
 * Long-running BAND agent. The Next.js app cannot hold the websocket on
 * serverless, so inbound mentions are handled here.
 *
 * Needs BAND_AGENT_ID and BAND_API_KEY (see docs.band.ai quickstart).
 * Run: npm run band:bridge
 */
import { Agent, GenericAdapter, loadAgentConfigFromEnv } from "@band-ai/sdk";
import { runSabha } from "../lib/council";
import type { Brief } from "../lib/types";

const LEADING_MENTIONS = /^\s*(?:@\S+\s*)+/;

async function answer(question: string): Promise<string> {
  let brief: Brief | null = null;
  await runSabha({
    question,
    send: (event) => {
      if (event.type === "brief") brief = event.brief;
    },
  });
  if (!brief) return "The sabha did not produce a brief.";
  const done: Brief = brief;
  return [`Confidence ${done.confidence}/100.`, "", done.markdown].join("\n").slice(0, 8000);
}

async function main() {
const adapter = new GenericAdapter(async ({ message, tools }) => {
  const text = String(message.content ?? "").replace(LEADING_MENTIONS, "").trim();
  const mention = {
    id: message.senderId,
    handle: message.senderName ?? message.senderType,
  };
  if (!text) {
    await tools.sendMessage("Ask a research question and I will convene the sabha.", [mention]);
    return;
  }
  const reply = await answer(text);
  await tools.sendMessage(reply, [mention]);
});

const agent = Agent.create({
  adapter,
  config: loadAgentConfigFromEnv(),
});

await agent.run();
}

void main();
