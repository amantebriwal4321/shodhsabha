import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { DEMOS } from "../lib/demo";
import { runKeyless } from "../lib/council";
import type { SabhaEvent } from "../lib/types";

async function main() {
  const dir = path.join(process.cwd(), "data/demos");
  mkdirSync(dir, { recursive: true });
  for (const demo of DEMOS) {
    const events: SabhaEvent[] = [];
    console.log(`capturing ${demo.id}`);
    const brief = await runKeyless(demo.question, (event) => {
      if (event.type === "status") return;
      events.push(event);
    });
    const capturedAt = new Date().toISOString();
    brief.mode = "demo";
    brief.provider = "recording";
    brief.capturedAt = capturedAt;
    const label =
      "Recorded run. Keyless gather over arXiv, OpenAlex, Wikipedia, and DuckDuckGo. No model call.";
    writeFileSync(
      path.join(dir, demo.file),
      JSON.stringify({ id: demo.id, question: demo.question, capturedAt, label, events, brief }, null, 2),
    );
    console.log(`  sources ${brief.citations.length} confidence ${brief.confidence}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
