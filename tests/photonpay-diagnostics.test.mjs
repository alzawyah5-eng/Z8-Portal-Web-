import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { generateKeyPairSync, createHash } from "node:crypto";

const read = path => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const source = read("base44/functions/photonpayDiagnostics/entry.ts").replace(/^import .*;\n/gm, "").replace("export default async function (req)", "return async function (req)");
const pair = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
const baseConfig = { appId: "testApp8", appSecret: "test-only-not-a-real-credential", privateKey: pair.privateKey, env: "prod", envExplicit: true, configured: true };

function harness({ role = "admin", anonymous = false, config = {}, tokenSuccess = false, reflectSecrets = false } = {}) {
  const cfg = { ...baseConfig, ...config };
  const calls = [];
  const handler = new Function("createClientFromRequest", "getConfig", "host", "fetch", source)(
    () => ({ auth: { me: async () => { if (anonymous) throw Object.assign(new Error("Unauthorized"), { status: 401 }); return { role }; } } }),
    () => cfg,
    env => env === "prod" ? "https://x-api.photonpay.com" : "https://x-api.sandbox.photontech.cc",
    async (target, options = {}) => {
      calls.push({ target, options });
      const url = new URL(target);
      if (url.hostname === "checkip.amazonaws.com") { assert.equal(options.headers, undefined); return new Response("203.0.113.10\n"); }
      if (url.pathname === "/cdn-cgi/trace") {
        assert.equal(options.headers, undefined, "No credentials may be sent to a public IP check");
        if (url.hostname === "www.cloudflare.com") return new Response("ip=203.0.113.10\nloc=US\ncolo=PDX\n");
        return new Response("Not found", { status: 404 });
      }
      if (reflectSecrets) {
        return Response.json({ code: "blocked", msg: cfg.appId + " " + cfg.appSecret + " " + btoa(cfg.appId + "/" + cfg.appSecret) + " " + cfg.privateKey });
      }
      if (url.hostname.includes("sandbox")) return Response.json({ code: "union-oauth2-local:00021", msg: "app not exist" });
      if (url.pathname === "/vcc/openApi/v4/getCardBin") return Response.json({ code: "1002", msg: "invalid token" }, { status: 401 });
      if (tokenSuccess) return Response.json({ code: "0000", data: { token: "test-token-do-not-return" } });
      return Response.json({ code: "union-oauth2-local:00289", msg: "Insufficient permissions" }, { headers: { "cf-ray": "test-correlation-id" } });
    },
  );
  return { calls, cfg, request: async (body = {}, method = "POST") => {
    const response = await handler(new Request("https://z8.example/diagnostics", { method, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) }));
    return { status: response.status, body: await response.json() };
  } };
}

test("diagnostics reject anonymous callers before touching configuration or the network", async () => {
  const h = harness({ anonymous: true });
  assert.equal((await h.request()).status, 401);
  assert.equal(h.calls.length, 0);
});
test("diagnostics reject users and unexpected roles", async () => {
  for (const role of ["user", "manager", undefined]) {
    const h = harness({ role: role === undefined ? "unknown" : role });
    assert.equal((await h.request()).status, 403);
    assert.equal(h.calls.length, 0);
  }
});
test("diagnostics require POST", async () => {
  const h = harness();
  assert.equal((await h.request({}, "GET")).status, 405);
  assert.equal(h.calls.length, 0);
});
test("admin diagnostics validate the matching RSA public key and signature", async () => {
  const h = harness();
  const { body } = await h.request();
  assert.equal(body.key.valid, true);
  assert.equal(body.key.bits, 2048);
  assert.equal(body.key.pkcs8, true);
  assert.equal(body.key.signature_verified, true);
  assert.equal(body.key.public_key_sha256, createHash("sha256").update(pair.publicKey).digest("hex"));
  assert.equal(body.egress.observed_ip, "203.0.113.10");
  assert.equal(body.egress.source, "checkip.amazonaws.com");
});
test("diagnostics preserve the exact live and sandbox errors without mutating cards", async () => {
  const h = harness();
  const { body } = await h.request();
  assert.equal(body.probes.length, 4);
  assert.equal(body.probes[0].http_status, 200);
  assert.equal(body.probes[0].code, "union-oauth2-local:00289");
  assert.equal(body.probes[1].scheme, "Basic");
  assert.equal(body.probes[2].http_status, 401);
  assert.equal(body.probes[3].code, "union-oauth2-local:00021");
  for (const call of h.calls) {
    const path = new URL(call.target).pathname;
    assert.ok(["/", "/cdn-cgi/trace", "/oauth2/token/accessToken", "/vcc/openApi/v4/getCardBin"].includes(path));
    if (path === "/vcc/openApi/v4/getCardBin") assert.equal(call.options.method, "GET");
  }
});
test("diagnostic responses redact raw and encoded credentials before truncating messages", async () => {
  const h = harness({ reflectSecrets: true });
  const result = JSON.stringify((await h.request()).body);
  for (const secret of [h.cfg.appId, h.cfg.appSecret, h.cfg.privateKey, btoa(h.cfg.appId + "/" + h.cfg.appSecret), pair.privateKey.split("\n")[1]]) assert.ok(!result.includes(secret));
  assert.ok(result.includes("[redacted]"));
});
test("a successful token is never returned and skips fallback authentication probes", async () => {
  const h = harness({ tokenSuccess: true });
  const { body } = await h.request();
  assert.equal(body.probes.length, 1);
  assert.equal(body.probes[0].success, true);
  assert.ok(!JSON.stringify(body).includes("test-token-do-not-return"));
});
test("egress-only diagnostics never attempt provider authentication", async () => {
  const h = harness();
  const { body } = await h.request({ egress_only: true });
  assert.equal(body.probes.length, 0);
  assert.equal(body.egress.observed_ip, "203.0.113.10");
  assert.ok(h.calls.every(call => new URL(call.target).pathname === "/cdn-cgi/trace" || new URL(call.target).hostname === "checkip.amazonaws.com"));
});
test("invalid private keys are reported without returning their contents", async () => {
  const h = harness({ config: { privateKey: "invalid-private-material" } });
  const { body } = await h.request();
  assert.equal(body.key.valid, false);
  assert.ok(!JSON.stringify(body).includes("invalid-private-material"));
});
test("missing app credentials do not trigger authentication requests", async () => {
  const h = harness({ config: { appId: "", appSecret: "", configured: false, privateKey: "" } });
  const { body } = await h.request();
  assert.equal(body.credentials.app_id.present, false);
  assert.equal(body.probes.length, 0);
  assert.ok(h.calls.every(call => new URL(call.target).pathname === "/cdn-cgi/trace" || new URL(call.target).hostname === "checkip.amazonaws.com"));
});
test("the standard connection checker preserves provider error details", async () => {
  const sharedSource = read("base44/shared/photonpay.ts").replace(/^import .*;\n/gm, "").replace(/export (async )?function /g, (_, asyncPart) => (asyncPart || "") + "function ");
  const create = new Function("secrets", "fetch", sharedSource + "\nreturn {getConfig, getAccessToken};");
  const { getConfig, getAccessToken } = create({ get: name => ({ PHOTONPAY_APP_ID: baseConfig.appId, PHOTONPAY_APP_SECRET: baseConfig.appSecret, PHOTONPAY_ENV: "prod" })[name] }, async () => Response.json({ code: "union-oauth2-local:00289", msg: "Insufficient permissions" }, { headers: { "cf-ray": "reference-123" } }));
  await assert.rejects(() => getAccessToken(getConfig()), error => error.providerCode === "union-oauth2-local:00289" && error.httpStatus === 200 && error.stage === "authentication" && error.reference === "reference-123");
});
test("portal comparison returns only equality flags and makes no network requests", async () => {
  const h = harness();
  const { status, body } = await h.request({
    compare_only: true, portal_app_id: h.cfg.appId,
    portal_secret_sha256: createHash("sha256").update(h.cfg.appSecret).digest("hex"),
  });
  assert.equal(status, 200);
  assert.deepEqual(body.matches, { app_id: true, app_secret: true });
  assert.equal(h.calls.length, 0);
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes(h.cfg.appSecret));
  assert.ok(!serialized.includes(h.cfg.appId));
  assert.ok(!serialized.includes(h.cfg.privateKey));
});
test("portal comparison distinguishes an incorrect ID from an incorrect secret", async () => {
  const h = harness();
  const secretHash = createHash("sha256").update(h.cfg.appSecret).digest("hex");
  assert.deepEqual((await h.request({ compare_only: true, portal_app_id: "different-id", portal_secret_sha256: secretHash })).body.matches, { app_id: false, app_secret: true });
  assert.deepEqual((await h.request({ compare_only: true, portal_app_id: h.cfg.appId, portal_secret_sha256: "0".repeat(64) })).body.matches, { app_id: true, app_secret: false });
  assert.equal(h.calls.length, 0);
});
test("portal comparison validates fingerprint format before any network request", async () => {
  const h = harness();
  for (const hash of ["", "short", "x".repeat(64)]) {
    assert.equal((await h.request({ compare_only: true, portal_app_id: h.cfg.appId, portal_secret_sha256: hash })).status, 400);
  }
  assert.equal(h.calls.length, 0);
});

