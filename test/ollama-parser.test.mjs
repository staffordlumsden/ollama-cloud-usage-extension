import assert from "node:assert/strict";
import test from "node:test";
import { OllamaAuthError, parseOllamaSettings } from "../lib/ollama-parser.js";

const fixture = `<!doctype html>
<header>
  <nav id="user-nav"><a class="font-medium" href="/settings">stafford</a><div>stafford@example.com</div></nav>
</header>
<main>
  <div><a href="/stafford">stafford</a><h2 class="truncate" id="header-email">stafford@example.com</h2></div>
  <h2><span>Cloud usage</span><span class="rounded-full capitalize">pro</span
  ></h2>
  <section>
    <span>Session usage</span>
    <div data-usage-track aria-label="Session usage 37.5% used">
      <div data-usage-segment data-model="qwen3.5:cloud" data-requests="2"></div>
    </div>
    <div class="local-time" data-time="2026-08-04T12:30:00Z">Resets soon</div>
  </section>
  <section>
    <span>Weekly usage</span>
    <div aria-label="Weekly usage 61% used" data-usage-track>
      <div data-usage-segment data-model="qwen3.5:cloud" data-requests="7"></div>
      <div data-requests="3" data-model="deepseek-v3.1:671b-cloud" data-usage-segment></div>
      <div data-usage-segment data-model="qwen3.5:cloud" data-requests="1"></div>
    </div>
    <div data-time="2026-08-10T00:00:00Z" class="local-time">Resets in 6 days</div>
  </section>
  <script>/* usage interaction code */</script>
</main>`;

test("parses identity, plan, usage windows, resets, and weekly model requests", () => {
  assert.deepEqual(parseOllamaSettings(fixture), {
    username: "stafford",
    email: "stafford@example.com",
    subscription: "pro",
    session: { percent: 37.5, resetsAt: "2026-08-04T12:30:00.000Z" },
    weekly: { percent: 61, resetsAt: "2026-08-10T00:00:00.000Z" },
    models: [
      { model: "qwen3.5:cloud", requests: 8 },
      { model: "deepseek-v3.1:671b-cloud", requests: 3 },
    ],
  });
});

test("does not report session-only model segments as weekly models", () => {
  const result = parseOllamaSettings(fixture);
  assert.equal(result.models.some(({ model }) => model === "qwen3.5:cloud" && result.models[0].requests === 10), false);
});

test("rejects a signed-out page", () => {
  assert.throws(() => parseOllamaSettings("<h1>Sign in</h1>"), OllamaAuthError);
});
