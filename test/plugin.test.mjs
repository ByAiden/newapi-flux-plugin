// Runs the plugin's hooks the way the gateway calls them: node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let fetchImpl = () => {
  throw new Error("utils.fetch is not available");
};
globalThis.utils = { fetch: (request) => fetchImpl(request) };

const plugin = await import("../plugin.js");
const { meta, native, protocols } = plugin;

const BASE = "https://api.bfl.ai";
const KEY = ["byaiden", "flux"].join("_");

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function decodeNative(model, body) {
  return native.createTask({ method: "POST", path: "/v1/" + model, params: {}, query: {}, requestHeaders: {}, body: { kind: "json", value: body } });
}

function decodeImage(operation, value, model) {
  return protocols.openai_image.decodeRequest({ operation: operation, model: model || value.model, body: { kind: "json", value: value } });
}

function driver(intent, extra) {
  return Object.assign(
    { requestBody: intent.requestBody, action: intent.action, model: intent.model, upstreamModel: intent.model, baseUrl: BASE, apiKey: "bfl-test", authHeader: "Bearer bfl-test", upstream: { kind: "vendor" }, config: {}, files: [], publicTaskId: "task_new" },
    extra || {},
  );
}

function query(state, extra) {
  return Object.assign({ taskId: "bfl-1", publicTaskId: "task_1", action: "text_to_image", model: state.model, upstreamModel: state.model, baseUrl: BASE, apiKey: "bfl-test", authHeader: "Bearer bfl-test", upstream: { kind: "vendor" }, config: {}, data: {}, state: state }, extra || {});
}

function usage(model, body) {
  return plugin.extractUsage(driver(decodeNative(model, body)));
}

// Submit, poll and settle one request the way the gateway does.
function run(intent, submitBody, pollBody) {
  const ctx = driver(intent);
  const reserved = plugin.extractUsage(ctx);
  const request = plugin.buildSubmitRequest(ctx);
  const submitted = plugin.parseSubmitResponse(ctx, { statusCode: 200, headers: {}, body: submitBody });
  const qctx = query(submitted.state, { taskId: submitted.taskId, data: submitted.taskData });
  const poll = plugin.buildQueryRequest(qctx);
  const result = plugin.parseTaskResult(qctx, pollBody, { status: 200, headers: {} });
  const settled = plugin.extractUsageOnComplete(qctx, result, pollBody);
  return { reserved, request, submitted, poll, result, settled };
}

test("manifest follows the community rules", () => {
  const source = readFileSync(new URL("../plugin.js", import.meta.url), "utf8");
  const block = source.match(/export const meta = (\{[\s\S]*?\n\});/);
  assert.ok(block);
  assert.deepEqual(JSON.parse(block[1].replace(/^\s*\/\/[^\n]*\n/gm, "")), meta);
  assert.equal(meta.apiVersion, 1);
  assert.equal(meta.key, KEY);
  assert.ok(meta.key.length <= 30);
  assert.match(meta.version, /^\d+\.\d+\.\d+$/);
  for (const name of ["CHANGELOG.md", "CHANGELOG.zh-CN.md"]) {
    const changelog = readFileSync(new URL("../" + name, import.meta.url), "utf8");
    assert.match(changelog, new RegExp("version: \"?" + meta.version.replace(/\./g, "\\.") + "\"?"));
    assert.ok(changelog.includes("## [" + meta.version + "]"));
  }
  assert.equal(meta.channelTypes, undefined);
  assert.equal(meta.baseUrl, BASE);
  assert.equal(meta.author.url, "https://github.com/" + meta.author.name);
  assert.ok(meta.allowedHosts.includes("api.bfl.ai"));
  assert.ok(!JSON.stringify(meta).includes("$"));
});

test("profiles cover every model and examples are complete vectors", () => {
  const profiled = meta.usageProfiles.flatMap((profile) => profile.models);
  assert.equal(new Set(profiled).size, profiled.length);
  for (const model of profiled) assert.ok(meta.models.includes(model));
  for (const example of meta.usageExamples) assert.deepEqual(Object.keys(example.facts).sort(), Object.keys(meta.usageSchema).sort());
  for (const profile of meta.usageProfiles) {
    for (const example of profile.examples) assert.deepEqual(Object.keys(example.facts).sort(), Object.keys(profile.schema).sort(), example.label);
  }
  // Each model's reserved facts match its profile's schema.
  const bodies = { "flux-pro-1.0-fill": { image: "https://a/i.png" } };
  for (const model of meta.models) {
    const facts = usage(model, bodies[model] || { prompt: "x" });
    const profile = meta.usageProfiles.find((entry) => entry.models.includes(model));
    assert.deepEqual(Object.keys(facts).sort(), Object.keys(profile ? profile.schema : meta.usageSchema).sort(), model);
  }
  assert.deepEqual(meta.protocols[0].models, meta.models);
  assert.equal(meta.routes.filter((route) => route.type === "submit").length, meta.models.length);
});

test("usage examples equal the reservation they describe", () => {
  assert.deepEqual(usage("flux-kontext-pro", { prompt: "x" }), meta.usageExamples[0].facts);
  assert.deepEqual(usage("flux-kontext-max", { prompt: "x", input_image: "https://a/1.png" }), meta.usageExamples[1].facts);
  assert.deepEqual(usage("flux-pro-1.1-ultra", { prompt: "x" }), meta.usageExamples[2].facts);
  const [flux3, flux2] = meta.usageProfiles;
  assert.deepEqual(usage("flux-3-image", { prompt: "x" }), flux3.examples[0].facts);
  assert.deepEqual(usage("flux-3-image", { prompt: "x", resolution: "4k" }), flux3.examples[1].facts);
  assert.deepEqual(usage("flux-3-image-klein", { prompt: "x", resolution: "2k" }), flux3.examples[2].facts);
  assert.deepEqual(usage("flux-2-pro", { prompt: "x" }), flux2.examples[0].facts);
  assert.deepEqual(usage("flux-2-pro", { prompt: "x", width: 2048, height: 2048 }), flux2.examples[1].facts);
  assert.deepEqual(usage("flux-2-max", { prompt: "x", width: 1024, height: 1024, input_image: "https://a/1.png", input_image_2: "https://a/2.png" }), flux2.examples[2].facts);
});

test("FLUX 3 Image sends resolution 1k by default and prices by tier", () => {
  const intent = decodeNative("flux-3-image", { prompt: "A rabbit", aspect_ratio: "16:9" });
  assert.equal(intent.model, "flux-3-image");
  assert.equal(intent.action, "text_to_image");
  const request = plugin.buildSubmitRequest(driver(intent));
  assert.equal(request.url, BASE + "/v1/flux-3-image");
  assert.equal(request.method, "POST");
  assert.equal(request.headers["x-key"], "bfl-test");
  assert.equal(request.headers.Authorization, undefined);
  assert.deepEqual(request.body, { prompt: "A rabbit", aspect_ratio: "16:9", resolution: "1k" });
  assert.equal(usage("flux-3-image", { prompt: "x", resolution: "768sq" }).credits, 4.1);
  assert.equal(usage("flux-3-image", { prompt: "x", resolution: "1.5k" }).credits, 7);
  // Exact sizes bill at the smallest tier with at least as many pixels.
  assert.deepEqual(usage("flux-3-image", { prompt: "x", width: 1024, height: 1024 }), { credits: 4.8, resolution: "1k", image_count: 1 });
  assert.equal(usage("flux-3-image", { prompt: "x", width: 1280, height: 1024 }).resolution, "1.5k");
  assert.equal(usage("flux-3-image", { prompt: "x", width: 4096, height: 2048 }).resolution, "4k");
  assert.equal(usage("flux-3-image", { prompt: "x", images: ["https://a/1.png"], resolution: "match_input" }).resolution, "2k");
  assert.equal(usage("flux-3-image-klein", { prompt: "x" }).credits, 0.9);
  assert.equal(usage("flux-3-image-klein", { prompt: "x", images: "https://a/1.png" }).resolution, "4k");
  assert.equal(plugin.extractUsage(Object.assign(driver(intent), { usagePurpose: "billing_ratios" })), null);
});

test("FLUX 3 validation", () => {
  assert.throws(() => decodeNative("flux-3-image", {}), /prompt is required/);
  assert.throws(() => decodeNative("flux-3-image", { prompt: "x", seed: 1 }), /seed is not supported on flux-3-image/);
  assert.throws(() => decodeNative("flux-3-image", { prompt: "x", input_image: "https://a" }), /input_image is not supported/);
  assert.throws(() => decodeNative("flux-3-image", { prompt: "x", resolution: "8k" }), /resolution must be one of/);
  assert.throws(() => decodeNative("flux-3-image", { prompt: "x", resolution: "match_input" }), /needs reference images/);
  assert.throws(() => decodeNative("flux-3-image-klein", { prompt: "x", images: ["https://a"], resolution: "match_input" }), /resolution must be one of/);
  assert.throws(() => decodeNative("flux-3-image", { prompt: "x", width: 1024 }), /set together/);
  assert.throws(() => decodeNative("flux-3-image", { prompt: "x", width: 128, height: 1024 }), /width must be an integer from 256/);
  assert.throws(() => decodeNative("flux-3-image", { prompt: "x", width: 1024, height: 1024, resolution: "1k" }), /either resolution/);
  assert.throws(() => decodeNative("flux-3-image", { prompt: "x", images: ["https://a"], width: 4096, height: 2048 }), /with reference images/);
  assert.throws(() => decodeNative("flux-3-image", { prompt: "x", images: Array.from({ length: 11 }, (_, i) => "https://a/" + i) }), /1 to 10/);
  assert.throws(() => decodeNative("flux-3-image", { prompt: "x", safety_tolerance: 5 }), /safety_tolerance must be an integer from 0 to 4/);
  assert.throws(() => decodeNative("flux-3-image", { prompt: "x", webhook_url: "https://hook" }), /poll the task/);
  assert.throws(() => decodeNative("flux-3-image", { prompt: "x", aspect_ratio: "5:3" }), /aspect_ratio must be one of/);
  assert.throws(() => decodeNative("flux-3-image", { prompt: "x", images: [{ file_id: "f" }] }), /file_id/);
  assert.throws(() => decodeNative("flux-3-image", { model: "flux-2-pro", prompt: "x" }), /taken from the path/);
  const klein = decodeNative("flux-3-image-klein", { prompt: "x", seed: 7, steps: 8, output_format: "png", images: "data:image/png;base64,iVBORw0KGgo=" });
  assert.deepEqual(klein.requestBody.images, ["iVBORw0KGgo="]);
  assert.equal(klein.action, "image_edit");
  assert.throws(() => decodeNative("flux-3-image-klein", { prompt: "x", steps: 20 }), /steps must be an integer from 1 to 16/);
});

test("FLUX.2 prices by megapixel and reference images", () => {
  const intent = decodeNative("flux-2-pro", { prompt: "A cat", seed: 42, disable_pup: true, output_format: "png" });
  const request = plugin.buildSubmitRequest(driver(intent));
  assert.equal(request.url, BASE + "/v1/flux-2-pro");
  assert.deepEqual(request.body, { prompt: "A cat", width: 1024, height: 1024, seed: 42, output_format: "png", disable_pup: true });
  // 1440x810 is 1.11 MP, billed as 2 MP.
  assert.deepEqual(usage("flux-2-pro", { prompt: "x", width: 1440, height: 810 }), { credits: 4.5, output_megapixels: 2, input_megapixels: 0, image_count: 1 });
  // An edit without a size reserves 4 MP output, and one reference up to 4 MP.
  assert.deepEqual(usage("flux-2-pro", { prompt: "x", input_image: "https://a/1.png" }), { credits: 13.5, output_megapixels: 4, input_megapixels: 4, image_count: 1 });
  assert.equal(usage("flux-2-flex", { prompt: "x" }).credits, 5);
  assert.equal(usage("flux-2-max", { prompt: "x" }).credits, 7);
  assert.equal(usage("flux-2-klein-4b", { prompt: "x", width: 1448, height: 1448 }).credits, 1.5);
  assert.equal(usage("flux-2-klein-9b", { prompt: "x" }).credits, 1.5);
  assert.equal(usage("flux-2-pro-preview", { prompt: "x" }).credits, 3);
  assert.equal(usage("flux-2-klein-9b-preview", { prompt: "x", width: 1024, height: 1024, input_image: "a", input_image_2: "b", input_image_3: "c" }).credits, 2.1);
  assert.equal(usage("flux-2-pro", { prompt: "x", width: 4096, height: 4096 }).output_megapixels, 4);
});

test("FLUX.2 validation", () => {
  assert.throws(() => decodeNative("flux-2-klein-4b", { prompt: "x", input_image_5: "e" }), /input_image_5 is not supported/);
  assert.throws(() => decodeNative("flux-2-pro", { prompt: "x", input_image_2: "b" }), /needs input_image first/);
  assert.throws(() => decodeNative("flux-2-pro", { prompt: "x", guidance: 3 }), /guidance is not supported on flux-2-pro/);
  assert.throws(() => decodeNative("flux-2-flex", { prompt: "x", guidance: 20 }), /guidance must be a number from 1.5 to 10/);
  assert.throws(() => decodeNative("flux-2-flex", { prompt: "x", disable_pup: true }), /disable_pup is not supported/);
  assert.throws(() => decodeNative("flux-2-pro", { prompt: "x", output_format: "gif" }), /output_format must be one of/);
  assert.throws(() => decodeNative("flux-2-pro", { prompt: "x", safety_tolerance: 6 }), /0 to 5/);
  assert.throws(() => decodeNative("flux-2-pro", { prompt: "x", input_image_blob_path: "p" }), /not supported/);
  const flex = decodeNative("flux-2-flex", { prompt: "x", steps: 30, guidance: 4.5, prompt_upsampling: false });
  assert.deepEqual(flex.requestBody, { prompt: "x", width: 1024, height: 1024, prompt_upsampling: false, guidance: 4.5, steps: 30, model: "flux-2-flex" });
});

test("FLUX.1 models bill per image", () => {
  assert.deepEqual(usage("flux-pro-1.1", { prompt: "x" }), { credits: 4, image_count: 1 });
  assert.equal(usage("flux-dev", { prompt: "x" }).credits, 2.5);
  assert.equal(usage("flux-pro-1.0-fill", { image: "https://a/i.png", mask: "https://a/m.png" }).credits, 5);
  const kontext = decodeNative("flux-kontext-pro", { prompt: "make it night", input_image: "https://a/1.png", aspect_ratio: "21:9" });
  assert.equal(kontext.action, "image_edit");
  assert.equal(plugin.buildSubmitRequest(driver(kontext)).url, BASE + "/v1/flux-kontext-pro");
  assert.equal(decodeNative("flux-pro-1.0-fill", { image: "https://a/i.png" }).action, "inpaint");
  assert.equal(decodeNative("flux-pro-1.1-ultra", { prompt: "x", raw: true, image_prompt: "aGk=", image_prompt_strength: 0.3 }).action, "image_prompt");
  assert.throws(() => decodeNative("flux-kontext-pro", { prompt: "x", aspect_ratio: "3:1" }), /between 21:9 and 9:21/);
  assert.throws(() => decodeNative("flux-pro-1.1", { prompt: "x", width: 1000, height: 1024 }), /multiples of 32/);
  assert.throws(() => decodeNative("flux-pro-1.1", { prompt: "x", width: 2048, height: 1024 }), /256 to 1440/);
  assert.throws(() => decodeNative("flux-pro-1.0-fill", { prompt: "x" }), /image is required/);
  assert.throws(() => decodeNative("flux-pro-1.0-fill", { image: "a", steps: 10 }), /15 to 50/);
  assert.throws(() => decodeNative("flux-pro-1.1-ultra", { prompt: "x", image_prompt_strength: 0.3 }), /needs image_prompt/);
  assert.throws(() => decodeNative("flux-dev", { prompt: "x", guidance: 7 }), /1.5 to 5/);
  assert.throws(() => decodeNative("flux-pro-1.1", { prompt: "x", safety_tolerance: 7 }), /0 to 6/);
  assert.throws(() => decodeNative("flux-pro-1.1", { prompt: "x", raw: true }), /raw is not supported/);
});

test("a FLUX.2 task submits, polls and settles on the cost BFL reports", () => {
  fetchImpl = () => {
    throw new Error("no fetch expected");
  };
  const intent = decodeImage("generate", { model: "flux-2-pro", prompt: "A cat", size: "1536x1024", seed: 3 });
  const out = run(
    intent,
    { id: "bfl-1", polling_url: "https://api.us1.bfl.ai/v1/get_result?id=bfl-1", cost: 4.5, input_mp: 0, output_mp: 1.5 },
    { id: "bfl-1", status: "Ready", result: { sample: "https://delivery-us1.bfl.ai/results/x/sample.png?se=1", seed: 3 }, progress: null, details: null, cost: 4.5 },
  );
  assert.deepEqual(out.request.body, { prompt: "A cat", width: 1536, height: 1024, seed: 3 });
  assert.deepEqual(out.reserved, { credits: 4.5, output_megapixels: 2, input_megapixels: 0, image_count: 1 });
  assert.equal(out.submitted.taskId, "bfl-1");
  assert.equal(out.submitted.state.polling_url, "https://api.us1.bfl.ai/v1/get_result?id=bfl-1");
  assert.deepEqual(out.poll, { url: "https://api.us1.bfl.ai/v1/get_result?id=bfl-1", method: "GET", headers: { Accept: "application/json", "x-key": "bfl-test" } });
  assert.deepEqual(out.result, { status: "SUCCESS", progress: "100%" });
  assert.deepEqual(out.settled, { credits: 4.5, output_megapixels: 2, input_megapixels: 0, image_count: 1 });
  const rendered = protocols.openai_image.render({}, { task_id: "task_1", status: "SUCCESS", data: { status: "Ready", result: { sample: "https://delivery-us1.bfl.ai/results/x/sample.png?se=1" } } });
  assert.deepEqual(rendered, { data: [{ url: "https://delivery-us1.bfl.ai/results/x/sample.png?se=1" }] });
});

test("an edit settles on the reported cost and megapixels", () => {
  const intent = decodeImage("edit", { model: "flux-2-max", prompt: "Make it red", image: "https://a/1.png" });
  assert.equal(intent.action, "image_edit");
  const out = run(intent, { id: "bfl-2", polling_url: "https://api.bfl.ai/v1/get_result?id=bfl-2", cost: 13, input_mp: 1.98, output_mp: 1.98 }, { id: "bfl-2", status: "Ready", result: { sample: "https://delivery-eu1.bfl.ai/s.jpeg" } });
  assert.equal(out.reserved.credits, 28);
  assert.deepEqual(out.settled, { credits: 13, output_megapixels: 2, input_megapixels: 2, image_count: 1 });
  // Without a reported cost, the megapixels BFL reports price the task.
  const noCost = run(intent, { id: "bfl-3", polling_url: "https://api.bfl.ai/v1/get_result?id=bfl-3", input_mp: 1, output_mp: 1 }, { id: "bfl-3", status: "Ready", result: { sample: "https://d/s.jpeg" } });
  assert.deepEqual(noCost.settled, { credits: 10, output_megapixels: 1, input_megapixels: 1, image_count: 1 });
  // Nothing reported keeps the reservation.
  const nothing = run(intent, { id: "bfl-4", polling_url: "https://api.bfl.ai/v1/get_result?id=bfl-4" }, { id: "bfl-4", status: "Ready", result: { sample: "https://d/s.jpeg" } });
  assert.deepEqual(nothing.settled, out.reserved);
});

test("FLUX 3 settles on the tier of the delivered size", () => {
  const intent = decodeNative("flux-3-image", { prompt: "x", images: ["https://a/1.png"], resolution: "match_input" });
  const out = run(intent, { id: "f3", polling_url: "https://api.eu.bfl.ai/v1/get_result?id=f3", output_mp: 1.0 }, { id: "f3", status: "Ready", result: { sample: "https://d/s.jpeg" } });
  assert.deepEqual(out.reserved, { credits: 10, resolution: "2k", image_count: 1 });
  assert.deepEqual(out.settled, { credits: 4.8, resolution: "1k", image_count: 1 });
  const costed = run(intent, { id: "f3", output_mp: 3.9, cost: 10 }, { id: "f3", status: "Ready", result: { sample: "https://d/s.jpeg" }, cost: 10 });
  assert.deepEqual(costed.settled, { credits: 10, resolution: "2k", image_count: 1 });
  const absurd = run(intent, { id: "f3", cost: 1e9 }, { id: "f3", status: "Ready", result: { sample: "https://d/s.jpeg" } });
  assert.deepEqual(absurd.settled, out.reserved);
  assert.equal(plugin.extractUsageOnComplete(query({}), { status: "SUCCESS" }, { status: "Ready" }), null);
  assert.equal(plugin.extractUsageOnComplete(query(out.submitted.state), { status: "FAILURE" }, { status: "Error" }), null);
});

test("task states map to gateway statuses", () => {
  const ctx = query({ model: "flux-2-pro" });
  const parse = (body) => plugin.parseTaskResult(ctx, body, { status: 200, headers: {} });
  assert.deepEqual(parse({ status: "Pending", progress: null }), { status: "QUEUED" });
  assert.deepEqual(parse({ status: "Pending", progress: 0.4 }), { status: "IN_PROGRESS", progress: "40%" });
  assert.deepEqual(parse({ status: "Generating", progress: 55 }), { status: "IN_PROGRESS", progress: "55%" });
  assert.deepEqual(parse({ status: "Reasoning" }), { status: "IN_PROGRESS" });
  assert.deepEqual(parse({ status: "Ready", result: {} }), { status: "FAILURE", reason: "BFL returned no image" });
  assert.deepEqual(parse({ status: "Request Moderated", result: null, details: { "Moderation Reasons": ["Violence"] } }), { status: "FAILURE", reason: "Request Moderated: Violence" });
  assert.deepEqual(parse({ status: "Content Moderated", details: { "Moderation Reasons": ["Sexual Content", "Self Harm"] } }), { status: "FAILURE", reason: "Content Moderated: Sexual Content, Self Harm" });
  assert.deepEqual(parse({ status: "Error", error: "out of memory" }), { status: "FAILURE", reason: "Error: out of memory" });
  assert.deepEqual(parse({ status: "Task not found" }), { status: "FAILURE", reason: "Task not found" });
  assert.deepEqual(parse({ status: "Brewing" }), { status: "UNKNOWN", reason: "unrecognized status: Brewing" });
  assert.deepEqual(parse(null), { status: "UNKNOWN", reason: "unrecognized status: " });
});

test("polling stays on BFL hosts or the channel's own host", () => {
  const state = (url) => ({ model: "flux-2-pro", polling_url: url });
  assert.equal(plugin.buildQueryRequest(query(state("https://api.eu1.bfl.ai/v1/get_result?id=bfl-1"))).url, "https://api.eu1.bfl.ai/v1/get_result?id=bfl-1");
  // An unknown host would receive the key; the channel's get_result is used.
  assert.equal(plugin.buildQueryRequest(query(state("https://evil.example/v1/get_result?id=bfl-1"))).url, BASE + "/v1/get_result?id=bfl-1");
  assert.equal(plugin.buildQueryRequest(query(state("https://api.us9.bfl.ai/v1/get_result?id=bfl-1"))).url, BASE + "/v1/get_result?id=bfl-1");
  assert.equal(plugin.buildQueryRequest(query(state("https://api.bfl.ai/v1/other"))).url, BASE + "/v1/get_result?id=bfl-1");
  assert.equal(plugin.buildQueryRequest(query({ model: "flux-2-pro" }, { taskId: "a b" })).url, BASE + "/v1/get_result?id=a%20b");
  // A proxy channel keeps its own host.
  assert.equal(plugin.buildQueryRequest(query(state("https://api.us1.bfl.ai/v1/get_result?id=bfl-1"), { baseUrl: "https://proxy.example/bfl/" })).url, "https://proxy.example/bfl/v1/get_result?id=bfl-1");
  // Every host a default channel can poll is in allowedHosts.
  for (const host of ["api.bfl.ai", "api.us.bfl.ai", "api.eu.bfl.ai", "api.us1.bfl.ai", "api.eu1.bfl.ai"]) {
    const url = plugin.buildQueryRequest(query(state("https://" + host + "/v1/get_result?id=x"))).url;
    assert.ok(meta.allowedHosts.includes(new URL(url).host), host);
  }
  const submit = plugin.buildSubmitRequest(driver(decodeNative("flux-dev", { prompt: "x" }), { baseUrl: "https://api.eu.bfl.ai/" }));
  assert.equal(submit.url, "https://api.eu.bfl.ai/v1/flux-dev");
});

test("artifacts and downloads use a fresh signed URL without credentials", () => {
  const data = { id: "bfl-1", status: "Ready", result: { sample: "https://delivery-eu1.bfl.ai/r/sample.webp?sig=old" } };
  assert.deepEqual(plugin.listArtifacts({ taskId: "bfl-1", status: "SUCCESS", action: "text_to_image", data: data }), [{ key: "image", type: "image", mimeType: "image/webp" }]);
  assert.deepEqual(plugin.listArtifacts({ taskId: "bfl-1", status: "FAILURE", data: data }), []);
  assert.deepEqual(plugin.listArtifacts({ taskId: "bfl-1", status: "SUCCESS", data: { status: "Ready", result: { sample: "https://d/x" } } }), [{ key: "image", type: "image" }]);
  const seen = [];
  fetchImpl = (request) => {
    seen.push(request);
    return { status: 200, headers: {}, body: { status: "Ready", result: { sample: "https://delivery-eu1.bfl.ai/r/sample.webp?sig=new" } } };
  };
  const ctx = Object.assign(driver({ requestBody: {}, model: "flux-2-pro" }), { artifactKey: "image", data: data, state: { polling_url: "https://api.eu1.bfl.ai/v1/get_result?id=bfl-1" }, upstreamTaskId: "bfl-1", clientRequest: { method: "GET", headers: {} } });
  assert.deepEqual(plugin.buildContentRequest(ctx), { url: "https://delivery-eu1.bfl.ai/r/sample.webp?sig=new", method: "GET", credentialless: true });
  assert.equal(seen[0].url, "https://api.eu1.bfl.ai/v1/get_result?id=bfl-1");
  assert.equal(seen[0].headers["x-key"], "bfl-test");
  fetchImpl = () => ({ status: 404, headers: {}, body: { status: "Task not found" } });
  assert.equal(plugin.buildContentRequest(ctx).url, "https://delivery-eu1.bfl.ai/r/sample.webp?sig=old");
  fetchImpl = () => {
    throw new Error("timeout");
  };
  assert.equal(plugin.buildContentRequest(ctx).url, "https://delivery-eu1.bfl.ai/r/sample.webp?sig=old");
  assert.throws(() => plugin.buildContentRequest(Object.assign({}, ctx, { data: {} })), /artifact_not_found/);
  assert.throws(() => plugin.buildContentRequest(Object.assign({}, ctx, { artifactKey: "video" })), /artifact_not_found/);
});

test("native presenters hide the cost and serve gateway URLs", () => {
  const created = native.taskCreated({}, { task_id: "task_1", status: "SUBMITTED", data: { id: "bfl-1", polling_url: "https://api.us1.bfl.ai/v1/get_result?id=bfl-1", cost: 3, output_mp: 1 } });
  assert.deepEqual(created, { id: "task_1", polling_url: "/v1/get_result?id=task_1", output_mp: 1 });
  const artifacts = { image: { key: "image", type: "image", url: "https://gw.example/v1/tasks/task_1/artifacts/image" } };
  const done = native.taskResult({ artifacts }, { task_id: "task_1", status: "SUCCESS", data: { id: "bfl-1", status: "Ready", result: { sample: "https://delivery/x", seed: 9 }, progress: null, details: null, preview: { url: "https://p" }, cost: 3 } });
  assert.deepEqual(done, { id: "task_1", status: "Ready", result: { sample: "https://gw.example/v1/tasks/task_1/artifacts/image", seed: 9 }, progress: null, details: null });
  const pending = native.taskResult({ artifacts: {} }, { task_id: "task_1", status: "SUBMITTED", data: { id: "bfl-1", polling_url: "https://x", cost: 3 } });
  assert.deepEqual(pending, { id: "task_1", status: "Pending", result: null, progress: null, details: null });
  const timedOut = native.taskResult({ artifacts: {} }, { task_id: "task_1", status: "FAILURE", fail_reason: "task timeout", data: { status: "Pending" } });
  assert.deepEqual(timedOut, { id: "task_1", status: "Error", result: null, progress: null, details: { error: "task timeout" } });
  const moderated = native.taskResult({ artifacts: {} }, { task_id: "task_1", status: "FAILURE", data: { status: "Request Moderated", details: { "Moderation Reasons": ["Violence"] } } });
  assert.equal(moderated.status, "Request Moderated");
  assert.deepEqual(native.error({}, { code: "bad_request", message: "prompt is required" }), { detail: "prompt is required", error: { code: "bad_request" } });
});

test("OpenAI Images maps size, images and masks per model", () => {
  const f3 = decodeImage("generate", { model: "flux-3-image", prompt: "x", size: "1536x1024", n: 1, response_format: "b64_json", quality: "auto", user: "u1", grounding: false });
  assert.deepEqual(f3.requestBody, { prompt: "x", width: 1536, height: 1024, grounding: false, user: "u1", model: "flux-3-image" });
  assert.equal(decodeImage("generate", { model: "flux-3-image", prompt: "x", size: "auto", resolution: "2k" }).requestBody.resolution, "2k");
  const f3edit = decodeImage("edit", { model: "flux-3-image", prompt: "x", image: [{ image_url: { url: "https://a/1.png" } }], images: ["https://a/2.png"] });
  assert.deepEqual(f3edit.requestBody.images, ["https://a/1.png", "https://a/2.png"]);
  const kontext = decodeImage("edit", { model: "flux-kontext-max", prompt: "x", image: ["https://a/1.png", "https://a/2.png"], size: "1920x1080", output_format: "jpg" });
  assert.deepEqual(kontext.requestBody, { prompt: "x", input_image: "https://a/1.png", input_image_2: "https://a/2.png", aspect_ratio: "16:9", output_format: "jpeg", model: "flux-kontext-max" });
  assert.deepEqual(decodeImage("generate", { model: "flux-pro-1.1", prompt: "x", size: "1536x1024" }).requestBody, { prompt: "x", width: 1440, height: 960, model: "flux-pro-1.1" });
  assert.equal(decodeImage("edit", { model: "flux-pro-1.1-ultra", prompt: "x", image: "https://a/1.png" }).requestBody.image_prompt, "https://a/1.png");
  const fill = decodeImage("edit", { model: "flux-pro-1.0-fill", prompt: "a hat", image: "https://a/1.png", mask: "https://a/m.png" });
  assert.deepEqual(fill.requestBody, { image: "https://a/1.png", mask: "https://a/m.png", prompt: "a hat", model: "flux-pro-1.0-fill" });
  assert.throws(() => decodeImage("generate", { model: "flux-2-pro", prompt: "x", n: 2 }), /n must be 1/);
  assert.throws(() => decodeImage("generate", { model: "flux-2-pro", prompt: "x", quality: "hd" }), /quality is not supported/);
  assert.throws(() => decodeImage("generate", { model: "flux-2-pro", prompt: "x", image: "https://a" }), /only valid on \/v1\/images\/edits/);
  assert.throws(() => decodeImage("generate", { model: "flux-pro-1.0-fill", prompt: "x" }), /use \/v1\/images\/edits/);
  assert.throws(() => decodeImage("edit", { model: "flux-2-pro", prompt: "x" }), /image is required/);
  assert.throws(() => decodeImage("edit", { model: "flux-2-pro", prompt: "x", image: "https://a", mask: "https://m" }), /mask is only supported on flux-pro-1.0-fill/);
  assert.throws(() => decodeImage("edit", { model: "flux-2-klein-4b", prompt: "x", image: ["a", "b", "c", "d", "e"] }), /at most 4 images/);
  assert.throws(() => decodeImage("edit", { model: "flux-pro-1.0-fill", prompt: "x", image: "https://a", size: "1024x1024" }), /size is not supported/);
  assert.throws(() => decodeImage("generate", { model: "flux-2-pro", prompt: "x", size: "big" }), /WIDTHxHEIGHT/);
  assert.throws(() => decodeImage("generate", { model: "flux-2-pro", prompt: "x", foo: 1 }), /foo is not supported/);
  assert.throws(() => decodeImage("generate", { model: "flux-3-image", prompt: "x", output_format: "png" }), /output_format is not supported on flux-3-image/);
  assert.throws(() => protocols.openai_image.decodeRequest({ operation: "generate", model: "flux-2-pro", body: { kind: "none" } }), /JSON or multipart/);
});

test("multipart edits pass uploaded files as base64 placeholders", () => {
  const ctx = {
    operation: "edit",
    model: "fill-alias",
    upstreamModel: "flux-pro-1.0-fill",
    body: {
      kind: "multipart",
      fields: { prompt: ["a hat"], steps: ["30"], prompt_upsampling: ["true"] },
      files: [
        { field: "image", ref: "request_file:image", filename: "a.png", mimeType: "image/png", size: 10 },
        { field: "mask", ref: "request_file:mask", filename: "m.png", mimeType: "image/png", size: 10 },
      ],
    },
  };
  const intent = protocols.openai_image.decodeRequest(ctx);
  assert.equal(intent.model, "fill-alias");
  assert.deepEqual(intent.requestBody.image, { __fileRef: "request_file:image", encoding: "base64" });
  assert.deepEqual(intent.requestBody.mask, { __fileRef: "request_file:mask", encoding: "base64" });
  assert.equal(intent.requestBody.steps, 30);
  assert.equal(intent.requestBody.prompt_upsampling, true);
  // The mapped model reaches BFL; the alias stays the billing identity.
  const request = plugin.buildSubmitRequest(driver(intent, { upstreamModel: "flux-pro-1.0-fill" }));
  assert.equal(request.url, BASE + "/v1/flux-pro-1.0-fill");
  assert.equal(request.body.model, undefined);
  const bad = Object.assign({}, ctx, { body: Object.assign({}, ctx.body, { files: [{ field: "image", ref: "r", mimeType: "text/plain" }] }) });
  assert.throws(() => protocols.openai_image.decodeRequest(bad), /must be an image/);
  const extra = Object.assign({}, ctx, { body: Object.assign({}, ctx.body, { files: [{ field: "video", ref: "r", mimeType: "image/png" }] }) });
  assert.throws(() => protocols.openai_image.decodeRequest(extra), /unexpected file field/);
  assert.throws(() => plugin.buildSubmitRequest(driver({ requestBody: { prompt: "x" }, model: "unknown" })), /not a supported FLUX model/);
});

test("submit reply without an id fails the submission", () => {
  const ctx = driver(decodeNative("flux-dev", { prompt: "x" }));
  assert.throws(() => plugin.parseSubmitResponse(ctx, { statusCode: 200, headers: {}, body: { polling_url: "x" } }), /did not return a task id/);
  assert.throws(() => plugin.parseSubmitResponse(ctx, { statusCode: 200, headers: {}, body: "oops" }), /did not return a task id/);
});

test("hooks do not mutate their arguments", () => {
  const intent = deepFreeze(decodeNative("flux-2-pro", { prompt: "x", input_image: "https://a/1.png" }));
  const ctx = deepFreeze(driver(intent));
  plugin.extractUsage(ctx);
  plugin.buildSubmitRequest(ctx);
  const submitted = plugin.parseSubmitResponse(ctx, deepFreeze({ statusCode: 200, headers: {}, body: { id: "b", polling_url: "https://api.bfl.ai/v1/get_result?id=b", cost: 9 } }));
  const qctx = deepFreeze(query(submitted.state, { data: submitted.taskData }));
  const body = deepFreeze({ status: "Ready", result: { sample: "https://d/s.png" }, cost: 9 });
  plugin.buildQueryRequest(qctx);
  plugin.parseTaskResult(qctx, body, { status: 200, headers: {} });
  plugin.extractUsageOnComplete(qctx, { status: "SUCCESS" }, body);
  plugin.listArtifacts(deepFreeze({ taskId: "b", status: "SUCCESS", data: body }));
  native.taskResult(deepFreeze({ artifacts: {} }), deepFreeze({ task_id: "t", status: "SUCCESS", data: body }));
  protocols.openai_image.render({}, deepFreeze({ task_id: "t", status: "SUCCESS", data: body }));
  decodeImage("edit", deepFreeze({ model: "flux-3-image", prompt: "x", image: ["https://a/1.png"], size: "1024x1024" }));
});

// --- through another New API gateway (type-60 channel) -----------------------

const GW = "http://middle.example:3000";
const viaGW = { baseUrl: GW, apiKey: "sk-gateway", authHeader: "Bearer sk-gateway", upstream: { kind: "new_api" } };

test("meta declares the New API upstream", () => {
  assert.deepEqual(meta.upstreams, ["vendor", "new_api"]);
});

test("new_api: submit, poll and download through the middle gateway's native routes with Bearer only", () => {
  const routes = new Set(meta.routes.map((r) => r.method + " " + r.path));
  const prefix = GW + "/" + KEY;
  const intent = decodeImage("generate", { model: "flux-2-pro", prompt: "A cat", size: "1536x1024", seed: 3 });
  const ctx = driver(intent, viaGW);
  const request = plugin.buildSubmitRequest(ctx);
  assert.equal(request.url, prefix + "/v1/flux-2-pro");
  assert.ok(routes.has("POST " + request.url.slice(prefix.length)));
  assert.deepEqual(request.headers, { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer sk-gateway" });
  // The middle gateway decodes the same body on its native route.
  const middleIntent = native.createTask({ method: "POST", path: "/" + KEY + "/v1/flux-2-pro", params: {}, query: {}, requestHeaders: {}, body: { kind: "json", value: JSON.parse(JSON.stringify(request.body)) } });
  assert.deepEqual(plugin.buildSubmitRequest(driver(middleIntent)).body, request.body);
  assert.deepEqual(plugin.extractUsage(driver(middleIntent)), plugin.extractUsage(ctx), "both layers reserve the same facts");

  // What the middle gateway's presenters answer, with its own task id.
  const vendorSubmit = { id: "bfl-1", polling_url: "https://api.us1.bfl.ai/v1/get_result?id=bfl-1", cost: 4.5, input_mp: 0, output_mp: 1.5 };
  const middleSubmit = native.taskCreated({}, { task_id: "task_middle", status: "SUBMITTED", data: vendorSubmit });
  const submitted = plugin.parseSubmitResponse(ctx, { statusCode: 200, headers: {}, body: middleSubmit });
  assert.equal(submitted.taskId, "task_middle");
  const qctx = query(submitted.state, Object.assign({ taskId: "task_middle", data: submitted.taskData }, viaGW));
  const poll = plugin.buildQueryRequest(qctx);
  assert.deepEqual(poll, { url: prefix + "/v1/get_result?id=task_middle", method: "GET", headers: { Accept: "application/json", Authorization: "Bearer sk-gateway" } });
  assert.ok(routes.has("GET /v1/get_result"));
  const signed = GW + "/v1/tasks/task_middle/artifacts/image?sig=1";
  const vendorDone = { id: "bfl-1", status: "Ready", result: { sample: "https://delivery-us1.bfl.ai/x.png", seed: 3 }, progress: null, details: null, cost: 4.5 };
  const middleDone = native.taskResult({ artifacts: { image: { key: "image", type: "image", url: signed } } }, { task_id: "task_middle", status: "SUCCESS", data: vendorDone });
  const result = plugin.parseTaskResult(qctx, middleDone, { status: 200, headers: {} });
  assert.deepEqual(result, { status: "SUCCESS", progress: "100%" });
  // The middle presenters hide BFL's cost: the outer layer prices the reported megapixels.
  const settled = plugin.extractUsageOnComplete(qctx, result, middleDone);
  assert.deepEqual(settled, { credits: 4.5, output_megapixels: 2, input_megapixels: 0, image_count: 1 });
  const pending = native.taskResult({ artifacts: {} }, { task_id: "task_middle", status: "IN_PROGRESS", data: { status: "Pending", progress: 0.5 } });
  assert.equal(plugin.parseTaskResult(qctx, pending, { status: 200, headers: {} }).status, "IN_PROGRESS");
  const failed = native.taskResult({ artifacts: {} }, { task_id: "task_middle", status: "FAILURE", fail_reason: "task timeout", data: { status: "Pending" } });
  assert.equal(plugin.parseTaskResult(qctx, failed, { status: 200, headers: {} }).status, "FAILURE");

  const seen = [];
  fetchImpl = (req) => {
    seen.push(req);
    return { status: 200, headers: {}, body: middleDone };
  };
  const content = plugin.buildContentRequest(Object.assign({}, qctx, { artifactKey: "image", upstreamTaskId: "task_middle", data: middleDone, clientRequest: { method: "GET", headers: {} } }));
  assert.deepEqual(content, { url: GW + "/v1/tasks/task_middle/artifacts/image/content", method: "GET", headers: { Authorization: "Bearer sk-gateway" } });
  assert.equal(seen.length, 0);
});

test("new_api: a FLUX 3 task settles on the tier of the megapixels the middle gateway reports", () => {
  const intent = decodeImage("generate", { model: "flux-3-image", prompt: "A cat" });
  const ctx = driver(intent, viaGW);
  const middleSubmit = native.taskCreated({}, { task_id: "task_m", status: "SUBMITTED", data: { id: "bfl-9", polling_url: "https://api.bfl.ai/v1/get_result?id=bfl-9", cost: 9, output_mp: 1 } });
  const submitted = plugin.parseSubmitResponse(ctx, { statusCode: 200, headers: {}, body: middleSubmit });
  const qctx = query(submitted.state, Object.assign({ taskId: "task_m" }, viaGW));
  const done = native.taskResult({ artifacts: {} }, { task_id: "task_m", status: "SUCCESS", data: { status: "Ready", result: { sample: "https://d/x.png" } } });
  const outer = plugin.extractUsageOnComplete(qctx, { status: "SUCCESS" }, done);
  const vendorQ = query(plugin.parseSubmitResponse(driver(intent), { statusCode: 200, headers: {}, body: { id: "bfl-9", output_mp: 1 } }).state);
  assert.deepEqual(outer, plugin.extractUsageOnComplete(vendorQ, { status: "SUCCESS" }, { status: "Ready", result: { sample: "https://d/x.png" } }));
});
