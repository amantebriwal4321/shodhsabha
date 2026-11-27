import { mkdirSync } from "fs";
import { chromium } from "playwright";

async function main() {
  mkdirSync("demo/raw", { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: "demo/raw", size: { width: 1280, height: 720 } },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3456", { waitUntil: "networkidle" });
  await page.getByTestId("start-button").waitFor();
  await page.waitForTimeout(20800);
  await page.getByTestId("demo-hallucination").click();
  await page.getByTestId("confidence").waitFor({ timeout: 40000 });
  const mode = await page.getByTestId("mode-badge").innerText();
  const confidence = await page.getByTestId("confidence").innerText();
  const messages = await page.locator("[data-testid^='msg-']").count();
  if (!/recorded/i.test(mode)) throw new Error(`unexpected mode ${mode}`);
  if (messages < 5) throw new Error(`only ${messages} messages`);
  if (!confidence.trim()) throw new Error("missing confidence");
  await page.waitForTimeout(5500);
  const brief = page.getByTestId("brief-panel");
  await brief.evaluate((el) => {
    el.scrollTop = 160;
  });
  await page.waitForTimeout(4000);
  await brief.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(2500);
  const markdown = page.waitForEvent("download");
  await page.getByTestId("export-md").click();
  await markdown;
  await page.waitForTimeout(1600);
  const pdf = page.waitForEvent("download");
  await page.getByTestId("export-pdf").click();
  await pdf;
  await page.waitForTimeout(9000);
  const video = page.video();
  await context.close();
  const path = await video?.path();
  await browser.close();
  console.log(JSON.stringify({ path, mode, confidence, messages }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
