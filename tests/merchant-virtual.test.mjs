import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { generateKeyPairSync, createSign } from "node:crypto";

const read = path => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const backend = read("base44/functions/photonpayCards/entry.ts").replace(/^import .*;\n/gm, "").replace("export default async function (req)", "return async function (req)");
const provider = read("base44/shared/photonpay.ts");
const pickCard = new Function(provider.slice(provider.indexOf("export function pickCard")).replace("export function pickCard", "return function pickCard"))();
const holder = { id: "holder-local", photon_cardholder_id: "CH0001", email: "client@example.com", status: "active" };
const remote = { cardholderId: "CH0001", firstName: "Test", lastName: "Client", email: holder.email, status: "normal", cardholderReviewStatus: "approved" };
const input = { cardholderRecordId: holder.id, ownerEmail: " Client@example.com ", cardBin: "123456", nickname: "Client card" };

function harness({ role = "admin", rows = [remote], local = holder } = {}) {
  const calls = { provider: [], updates: [], creates: [], config: 0 };
  const entity = {
    get: async id => id === local?.id ? local : null,
    filter: async query => ({ items: local && query.photon_cardholder_id === local.photon_cardholder_id ? [local] : [] }),
    update: async (id, data) => { calls.updates.push({ id, data }); return { ...local, ...data, id }; },
    create: async data => { calls.creates.push(data); return { id: "new-holder", ...data }; },
  };
  const client = { auth: { me: async () => ({ role, email: "admin@example.com" }) }, asServiceRole: { entities: { Cardholder: entity } } };
  const handler = new Function("createClientFromRequest", "getConfig", "photonRequest", "resolveConfig", "pickCard", "refreshCardRecord", "notifyClient", "notifyHolderChange", backend)(
    () => client,
    () => { calls.config++; return { configured: true, env: "prod", masterAccountEmail: "photonpay@zavooo.com", privateKey: "stored" }; },
    async (_cfg, path, options) => {
      calls.provider.push({ path, options });
      if (path.endsWith("pagingVccCardholder")) return { data: rows, total: rows.length };
      if (path.endsWith("account/single")) return { data: { accountNo: "FA-USD0001", currency: "USD", realTimeBalance: 500 } };
      if (path.endsWith("openCard")) return { data: { status: "succeed", cardDetail: { cardId: "XR0001", cardholderId: remote.cardholderId, cardStatus: "normal", cardFormFactor: "virtual_card" } } };
      return { data: [] };
    },
    async cfg => cfg, pickCard, async (_base44, record) => record, async () => null, async () => null,
  );
  return {
    calls,
    async request(action, payload = {}, headers = {}) {
      const result = await handler(new Request("https://z8.example/function", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ action, payload }) }));
      return { status: result.status, body: await result.json() };
    },
  };
}

test("main account metadata is returned to admins with production and virtual-only scope", async () => {
  const h = harness();
  const r = await h.request("status");
  assert.equal(r.body.master_account_email, "photonpay@zavooo.com");
  assert.equal(r.body.account_model, "merchant_cardholders");
  assert.equal(r.body.card_form_factor, "virtual_card");
  assert.equal(r.body.env, "prod");
});
test("clients cannot sync merchant cardholders or inspect master account metadata", async () => {
  const h = harness({ role: "user" });
  assert.equal((await h.request("sync_holders")).status, 403);
  assert.equal((await h.request("status")).status, 403);
  assert.equal(h.calls.config, 0);
  assert.equal(h.calls.provider.length, 0);
});
test("physical requests are rejected before connecting to PhotonPay", async () => {
  const h = harness();
  assert.equal((await h.request("issue", { ...input, cardFormFactor: "physical_card" })).status, 400);
  assert.equal(h.calls.config, 0);
  assert.equal(h.calls.provider.length, 0);
});
test("raw provider IDs cannot replace a synced local cardholder", async () => {
  const h = harness();
  assert.equal((await h.request("issue", { cardholderId: "CH0001", cardBin: input.cardBin })).status, 400);
  assert.equal((await h.request("issue", { ...input, cardholderRecordId: "missing" })).status, 409);
  assert.equal(h.calls.provider.length, 0);
});
for (const ownerEmail of ["", "invalid", "a b@example.com"]) test("invalid Z8 assignment email blocks issuance: " + ownerEmail, async () => {
  const h = harness();
  assert.equal((await h.request("issue", { ...input, ownerEmail })).status, 400);
  assert.equal(h.calls.provider.length, 0);
});
test("openCardHalo rules are enforced before any provider operation: USD only, issuing country required", async () => {
  const h = harness();
  const device = { "true-client-ip": "203.0.113.7" };
  for (const cardCurrency of ["EUR", "GBP"]) assert.equal((await h.request("issue", { ...input, cardCurrency, gpsCountry: "AE" }, device)).status, 400);
  for (const gpsCountry of ["", "A", "ARE", "12"]) assert.equal((await h.request("issue", { ...input, gpsCountry }, device)).status, 400);
  assert.equal((await h.request("issue", { ...input, gpsCountry: "AE" })).status, 400, "no device IP");
  // cf-connecting-ip is Base44's own hosting hop (it invokes the function),
  // never the administrator's device, and private addresses are not devices.
  for (const headers of [{ "cf-connecting-ip": "74.220.48.197" }, { "true-client-ip": "10.0.0.5" }, { "x-forwarded-for": "192.168.1.4, 74.220.48.197" }]) {
    assert.equal((await h.request("issue", { ...input, gpsCountry: "AE" }, headers)).status, 400, "no usable device IP: " + JSON.stringify(headers));
  }
  assert.deepEqual([...new Set(h.calls.provider.map(x => x.path))].filter(p => !p.endsWith("pagingVccCardholder")), []);
});
for (const [status, review, expected] of [
  ["normal", "pending", "pending"], ["normal", "modify", "pending"],
  ["normal", undefined, "pending"], ["disabled", "approved", "suspended"],
  ["normal", "rejected", "suspended"],
]) test("local active does not override provider approval: " + status + "/" + review, async () => {
  const h = harness({ rows: [{ ...remote, status, cardholderReviewStatus: review }] });
  const r = await h.request("issue", input);
  assert.equal(r.status, 409);
  assert.deepEqual(h.calls.provider.map(x => x.path), ["/vcc/openApi/v4/pagingVccCardholder"]);
  assert.equal(h.calls.updates.at(-1).data.status, expected);
});
test("a missing or Matrix cardholder cannot be issued under this merchant-only flow", async () => {
  for (const rows of [[], [{ ...remote, cardholderId: "CH9999" }], [{ ...remote, matrixAccount: "MI0001" }]]) {
    const h = harness({ rows });
    assert.equal((await h.request("issue", input)).status, 409);
    assert.equal(h.calls.provider.length, 1);
  }
});
test("approved client is rechecked and receives an explicit virtual card under the merchant token", async () => {
  const h = harness();
  const r = await h.request("issue", { ...input, gpsCountry: "ae", cardholderId: "CH-ATTACKER", memberId: "OTHER", matrixAccount: "MI-OTHER", firstName: "ignored" }, { "true-client-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.9, 74.220.48.197", "cf-connecting-ip": "74.220.48.197" });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "pending");
  const halo = h.calls.provider.find(c => c.path === "/vcc/openApi/v4/openCardHalo");
  assert.ok(halo, "issues through openCardHalo");
  assert.equal(halo.options.body.ipAddress, "203.0.113.7");
  assert.equal(halo.options.body.gpsCountry, "AE");
  assert.equal(halo.options.body.cardCurrency, "USD");
  assert.equal(halo.options.body.accountId, "FA-USD0001", "funding account looked up from PhotonPay");
  assert.equal(r.body.owner_email, "client@example.com");
  assert.equal(r.body.photon_cardholder_id, "CH0001");
  assert.equal(h.calls.provider[0].options.query.cardholderId, "CH0001");
  const body = halo.options.body;
  assert.equal(body.cardholderId, "CH0001");
  assert.equal(body.cardFormFactor, "virtual_card");
  assert.equal(body.memberId, undefined);
  assert.equal(body.matrixAccount, undefined);
  assert.equal(body.firstName, undefined);
  assert.equal(body.rechargeAmount, undefined, "share cards are not funded at issue");
  assert.equal(h.calls.creates.length, 0);
});
test("recharge cards need an opening balance the USD account can cover, and send accountId + rechargeAmount", async () => {
  const device = { "x-forwarded-for": "203.0.113.7, 74.220.48.197" };
  let h = harness();
  assert.equal((await h.request("issue", { ...input, gpsCountry: "AE", cardType: "recharge" }, device)).status, 400);
  assert.equal((await h.request("issue", { ...input, gpsCountry: "AE", cardType: "recharge", rechargeAmount: 900 }, device)).status, 409, "more than the 500 balance");
  assert.ok(!h.calls.provider.some(c => c.path.endsWith("openCardHalo")));
  h = harness();
  const r = await h.request("issue", { ...input, gpsCountry: "AE", cardType: "recharge", rechargeAmount: "120.456" }, device);
  assert.equal(r.status, 200);
  const body = h.calls.provider.find(c => c.path.endsWith("openCardHalo")).options.body;
  assert.equal(body.cardType, "recharge");
  assert.equal(body.accountId, "FA-USD0001");
  assert.equal(body.rechargeAmount, 120.46);
});
test("BIN and provider card queries request virtual cards only", async () => {
  const h = harness();
  await h.request("bins"); await h.request("list");
  for (const call of h.calls.provider) assert.equal(call.options.query.cardFormFactor, "virtual_card");
});
test("sync skips Matrix clients, updates by provider ID, and keeps pending review pending", async () => {
  const h = harness({ rows: [
    { ...remote, cardholderReviewStatus: "pending" },
    { ...remote, cardholderId: "CH0002", matrixAccount: "MI0001" },
    { ...remote, cardholderId: "CH0003" },
  ] });
  const r = await h.request("sync_holders");
  assert.equal(r.status, 200);
  assert.equal(r.body.synced, 2);
  assert.equal(h.calls.updates[0].data.status, "pending");
  assert.equal(h.calls.creates.length, 1);
  assert.equal(h.calls.creates[0].photon_cardholder_id, "CH0003");
  assert.equal(h.calls.creates[0].master_account_email, "photonpay@zavooo.com");
});

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicPem = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
for (const review of ["pending", "approved"]) test("signed webhook preserves separate cardholder review status: " + review, async () => {
  const updates = [];
  const client = { asServiceRole: { entities: { Cardholder: {
    filter: async () => ({ items: [holder] }),
    update: async (id, data) => { updates.push({ id, data }); },
  } } } };
  const source = read("base44/functions/photonpayNotifications/entry.ts").replace(/^import .*;\n/gm, "").replace("export default async function (req)", "return async function (req)");
  const logs = [];
  const handler = new Function("createClientFromRequest", "secrets", "getConfig", "redactBody", "redactHeaders", "saveTransaction", "writeLog", "notifyHolderChange", source)(
    () => client, { get: () => publicPem },
    (base44) => ({ base44, env: "sandbox" }), (text) => String(text || ""), () => "{}",
    async () => "created", async (_cfg, entry) => { logs.push(entry); }, async () => null,
  );
  const body = JSON.stringify({ cardholderId: "CH0001", status: "normal", cardholderReviewStatus: review });
  const signer = createSign("RSA-MD5"); signer.update(body); signer.end();
  const result = await handler(new Request("https://z8.example/webhook", { method: "POST", body, headers: { "X-PD-SIGN": signer.sign(keys.privateKey, "base64"), "X-PD-NOTIFICATION-TYPE": "cardholder_status_update" } }));
  assert.equal(result.status, 200);
  assert.equal(updates[0].data.status, review === "approved" ? "active" : "pending");
  assert.equal(updates[0].data.review_status, review);
  assert.equal(logs.length, 1, "every notification is written to the request log");
  assert.equal(logs[0].kind, "webhook");
  assert.equal(logs[0].http_status, 200);
});