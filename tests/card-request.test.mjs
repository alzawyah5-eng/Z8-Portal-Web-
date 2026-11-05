import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// A verified client requests their own Regular card; nothing is issued automatically.
const read = path => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const provider = read("base44/shared/photonpay.ts");
const pickCard = new Function(provider.slice(provider.indexOf("export function pickCard")).replace("export function pickCard", "return function pickCard"))();
// The real notification helpers from the shared module.
const notifySource = provider.slice(provider.indexOf("const usdText"), provider.indexOf("// When PhotonPay does not create a card")).replace(/export async function/g, "async function");
const { notifyClient, notifyHolderChange } = new Function(`${notifySource}; return { notifyClient, notifyHolderChange };`)();
const backend = read("base44/functions/photonpayCards/entry.ts").replace(/^import .*;\n/gm, "").replace("export default async function (req)", "return async function (req)");

function table(rows) {
  const store = rows.map(row => ({ ...row }));
  return {
    store,
    list: async () => store,
    get: async id => store.find(row => row.id === id) || null,
    filter: async query => ({ items: store.filter(row => Object.entries(query).every(([k, v]) => row[k] === v)) }),
    update: async (id, data) => { const row = store.find(r => r.id === id); Object.assign(row, data); return row; },
    create: async data => { const row = { id: `new-${store.length + 1}`, created_date: new Date().toISOString(), ...data }; store.push(row); return row; },
    delete: async id => { const at = store.findIndex(r => r.id === id); if (at >= 0) store.splice(at, 1); return { ok: true }; },
  };
}

function harness({ email = "client@example.com", role = "user", holders = [], cards = [], settings = [], requests = [], balance = 500, funds = 500, entries, users } = {}) {
  const calls = [];
  const entities = {
    Cardholder: table(holders), Card: table(cards), PhotonPayLog: table([]), CardTransaction: table([]),
    ProgrammeSettings: table(settings), CardholderApplication: table([]), CardRequest: table(requests),
    // The client's Z8 account: funded by default so each test checks its own rule.
    AccountEntry: table(entries ?? (funds ? [{ id: "e0", owner_email: "client@example.com", kind: "deposit", status: "completed", amount: funds, created_date: "2026-11-01T00:00:00Z" }] : [])),
    Notification: table([]),
    User: table(users ?? [{ id: "u1", email: "client@example.com", role: "user" }, { id: "u2", email: "admin@example.com", role: "admin" }]),
  };
  const files = [];
  const integrations = { Core: {
    UploadPrivateFile: async ({ file }) => { const uri = `mp/private/abcdefghij0123456789/${String(file.name)}`; files.push(uri); return { file_uri: uri }; },
    CreateFileSignedUrl: async ({ file_uri }) => ({ signed_url: `https://files.example/${file_uri}?sig=1` }),
  } };
  const client = { auth: { me: async () => ({ id: `u-${email}`, role, email }) }, asServiceRole: { entities, integrations } };
  const handler = new Function("createClientFromRequest", "getConfig", "photonRequest", "resolveConfig", "pickCard", "refreshCardRecord", "saveTransaction", "unlockIfFunded", "secrets", "notifyClient", "notifyHolderChange", backend)(
    () => client,
    () => ({ configured: true, env: "prod", privateKey: "stored" }),
    async (_cfg, path, options) => {
      calls.push({ path, options });
      if (path.endsWith("account/single")) return { data: { accountNo: "FA-USD0001", realTimeBalance: balance } };
      if (path.endsWith("openCardHalo")) return { data: { createCardStatus: "pending" } };
      if (path.endsWith("getCardDetail")) return { data: { cardId: "XR1", cardNo: "558325******4788", expirationDate: "", cardBalance: 29.8, cardStatus: "normal", cardScheme: "MasterCard", cardCurrency: "USD" } };
      if (path.endsWith("preRecharge")) return { data: { rechargeAmount: options?.query?.rechargeAmount, arrivalAmount: options?.query?.rechargeAmount } };
      if (path.endsWith("/recharge")) return { data: { status: "succeed", transactionId: "IT1", rechargeAmount: 30, arrivalAmount: 29.5, cardBalance: 29.5 } };
      if (path.endsWith("getCvv")) return { data: { cardId: "XR1", cardNo: "5583251234564788", cvv: "123", expirationDate: "11/29" } };
      return { data: [] };
    },
    async cfg => cfg, pickCard, async (_base44, record) => record, async () => null, async () => false,
    { get: (name) => (name === "PHOTONPAY_APP_SECRET" ? "test-app-secret" : "") },
    notifyClient, notifyHolderChange,
  );
  return {
    calls, entities, files,
    async request(action, payload = {}, headers = { "true-client-ip": "203.0.113.7" }) {
      const result = await handler(new Request("https://z8.example/fn", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ action, payload }) }));
      return { status: result.status, body: await result.json() };
    },
  };
}

const approved = { id: "h1", owner_email: "client@example.com", email: "client@example.com", status: "active", photon_cardholder_id: "CH1", first_name: "Ana", full_name: "Ana Client" };

test("the approval workflow that issued cards automatically is gone", () => {
  assert.equal(fs.existsSync(new URL("../base44/workflows/AutoIssueCardOnApproval.jsonc", import.meta.url)), false);
  assert.ok(!backend.includes('"auto_issue"'), "no auto_issue action remains");
});

test("an unverified client cannot request a card and nothing reaches PhotonPay", async () => {
  const h = harness({ email: "new@example.com" });
  const r = await h.request("request_card", { purpose: "advertising", amount: 50 });
  assert.equal(r.status, 403);
  assert.equal(h.calls.length, 0);
  assert.equal(h.entities.CardRequest.store.length, 0);
  const mine = await h.request("my_registration");
  assert.equal(mine.body.card_request.can_request, false);
});

test("a client whose PhotonPay check is still pending cannot request yet", async () => {
  const h = harness({ holders: [{ ...approved, status: "pending" }] });
  assert.equal((await h.request("request_card", { purpose: "advertising", amount: 50 })).status, 403);
  assert.equal(h.calls.length, 0);
});

test("a verified client sees the 20 USD minimum and cannot request less", async () => {
  const h = harness({ holders: [approved] });
  const mine = await h.request("my_registration");
  assert.equal(mine.body.card_request.can_request, true);
  assert.equal(mine.body.card_request.min_amount, 20);
  for (const amount of [undefined, 0, 1, 19.99, "abc"]) {
    assert.equal((await h.request("request_card", { purpose: "advertising", amount })).status, 400, `amount ${amount}`);
  }
  assert.equal(h.entities.CardRequest.store.length, 0);
  // The administrator may set a higher minimum, never a lower one.
  const higher = harness({ holders: [approved], settings: [{ id: "s", min_opening_amount: 50 }] });
  assert.equal((await higher.request("my_registration")).body.card_request.min_amount, 50);
  assert.equal((await higher.request("request_card", { purpose: "advertising", amount: 30 })).status, 400);
  const lower = harness({ holders: [approved], settings: [{ id: "s", min_opening_amount: 5 }] });
  assert.equal((await lower.request("my_registration")).body.card_request.min_amount, 20);
});

test("a request waits for the administrator: nothing reaches PhotonPay, and the client sees it pending", async () => {
  const h = harness({ holders: [approved] });
  const r = await h.request("request_card", { purpose: "advertising", amount: 75 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(h.calls.length, 0, "no provider call before approval");
  assert.equal(h.entities.Card.store.length, 0);
  const row = h.entities.CardRequest.store[0];
  assert.equal(row.status, "pending");
  assert.equal(row.amount, 75);
  assert.equal(row.owner_email, "client@example.com");
  const mine = await h.request("my_registration");
  assert.equal(mine.body.card_request.can_request, false);
  assert.equal(mine.body.card_request.waiting_approval, true);
  assert.equal(mine.body.latest_card_request.status, "pending");
  assert.equal(mine.body.latest_card_request.amount, 75);
  assert.equal((await h.request("request_card", { purpose: "advertising", amount: 75 })).status, 409, "one request at a time");
});

test("two concurrent requests leave a single pending request", async () => {
  const h = harness({ holders: [approved] });
  const results = await Promise.all([h.request("request_card", { purpose: "advertising", amount: 20 }), h.request("request_card", { purpose: "advertising", amount: 20 })]);
  assert.equal(results.filter(r => r.status === 200).length, 1, JSON.stringify(results));
  assert.equal(h.entities.CardRequest.store.filter(r => r.status === "pending").length, 1);
});

test("the client can cancel their pending request, and only their own", async () => {
  const h = harness({ holders: [approved] });
  await h.request("request_card", { purpose: "advertising", amount: 40 });
  const id = h.entities.CardRequest.store[0].id;
  const other = harness({ email: "other@example.com", holders: [{ ...approved, id: "h2", owner_email: "other@example.com" }], requests: [{ id, status: "pending", owner_email: "client@example.com", cardholder_record_id: "h1", amount: 40 }] });
  assert.equal((await other.request("cancel_card_request", { requestId: id })).status, 404);
  assert.equal((await h.request("cancel_card_request", { requestId: id })).status, 200);
  assert.equal(h.entities.CardRequest.store[0].status, "cancelled");
  assert.equal((await h.request("my_registration")).body.card_request.can_request, true);
});

test("clients cannot approve or reject card requests", async () => {
  const h = harness({ holders: [approved], requests: [{ id: "r1", status: "pending", owner_email: "client@example.com", cardholder_record_id: "h1", amount: 40 }] });
  assert.equal((await h.request("approve_card_request", { requestId: "r1", amount: 40, gpsCountry: "AE" })).status, 403);
  assert.equal((await h.request("reject_card_request", { requestId: "r1", note: "no" })).status, 403);
  assert.equal(h.calls.length, 0);
});

const pendingRow = { id: "r1", status: "pending", owner_email: "client@example.com", cardholder_record_id: "h1", amount: 40, client_name: "Ana Client" };

test("approval creates the card at PhotonPay loaded with the approved amount, from the administrator's device, unlocked", async () => {
  const h = harness({ role: "admin", email: "admin@example.com", holders: [approved], requests: [pendingRow] });
  const r = await h.request("approve_card_request", { requestId: "r1", amount: 55, gpsCountry: "ae" }, { "true-client-ip": "203.0.113.7", "cf-connecting-ip": "74.220.48.197" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const halo = h.calls.find(c => c.path.endsWith("openCardHalo")).options.body;
  assert.equal(halo.rechargeAmount, 55, "the opening balance is the approved amount");
  assert.equal(halo.ipAddress, "203.0.113.7", "the approving administrator's device, never Base44's hosting hop");
  assert.equal(halo.gpsCountry, "AE");
  assert.equal(halo.cardholderId, "CH1");
  assert.equal(halo.cardType, "recharge");
  assert.equal(h.calls.filter(c => c.path.endsWith("openCardHalo")).length, 1, "a single attempt, no zero-balance try first");
  const card = h.entities.Card.store[0];
  assert.equal(card.owner_email, "client@example.com");
  assert.ok(card.funded_at, "the client's deposit funds the card, so its details are not locked");
  const row = h.entities.CardRequest.store[0];
  assert.equal(row.status, "approved");
  assert.equal(row.approved_amount, 55);
  assert.equal(row.card_record_id, card.id);
  assert.equal(h.entities.CardTransaction.store[0].event, "Card approved and funded");
  assert.equal((await h.request("approve_card_request", { requestId: "r1", amount: 55, gpsCountry: "AE" })).status, 409, "approved only once");
});

test("approval refuses under 20 USD, without a device or country, or when the USD account is short", async () => {
  const h = harness({ role: "admin", email: "admin@example.com", holders: [approved], requests: [pendingRow] });
  assert.equal((await h.request("approve_card_request", { requestId: "r1", amount: 10, gpsCountry: "AE" })).status, 400);
  assert.equal((await h.request("approve_card_request", { requestId: "r1", amount: 40 })).status, 400);
  assert.equal((await h.request("approve_card_request", { requestId: "r1", amount: 40, gpsCountry: "AE" }, { "cf-connecting-ip": "74.220.48.197" })).status, 400);
  assert.ok(!h.calls.some(c => c.path.endsWith("openCardHalo")));
  const short = harness({ role: "admin", email: "admin@example.com", holders: [approved], requests: [pendingRow], balance: 30 });
  const r = await short.request("approve_card_request", { requestId: "r1", amount: 40, gpsCountry: "AE" });
  assert.equal(r.status, 502);
  assert.match(r.body.error, /30\.00 USD/);
  assert.equal(short.entities.CardRequest.store[0].status, "pending", "stays pending to approve again later");
  assert.ok(short.entities.CardRequest.store[0].last_error);
  assert.equal(short.entities.Card.store.length, 0, "no card is left behind");
});

test("rejection needs a reason, which the client then sees", async () => {
  const admin = harness({ role: "admin", email: "admin@example.com", holders: [approved], requests: [pendingRow] });
  assert.equal((await admin.request("reject_card_request", { requestId: "r1", note: "" })).status, 400);
  assert.equal((await admin.request("reject_card_request", { requestId: "r1", note: "Deposit not received" })).status, 200);
  const rejected = admin.entities.CardRequest.store[0];
  assert.equal(rejected.status, "rejected");
  assert.equal(admin.calls.length, 0);
  const client = harness({ holders: [approved], requests: [rejected] });
  const mine = await client.request("my_registration");
  assert.equal(mine.body.latest_card_request.status, "rejected");
  assert.equal(mine.body.latest_card_request.review_note, "Deposit not received");
  assert.equal(mine.body.card_request.can_request, true, "they can ask again");
});

test("the allowance counts the client's own cards, and requests can be paused", async () => {
  const full = harness({ holders: [approved], cards: [{ id: "c1", cardholder_id: "h1", status: "active", auto_issued: true }] });
  assert.equal((await full.request("request_card", { purpose: "advertising", amount: 20 })).status, 409, "default allowance is one card");
  const more = harness({ holders: [approved], cards: [{ id: "c1", cardholder_id: "h1", status: "active", auto_issued: true }], settings: [{ id: "s", max_cards_per_client: 2 }] });
  assert.equal((await more.request("request_card", { purpose: "advertising", amount: 20 })).status, 200);
  const paused = harness({ holders: [approved], settings: [{ id: "s", client_requests_enabled: false }] });
  assert.equal((await paused.request("request_card", { purpose: "advertising", amount: 20 })).status, 409);
});

test("another client's verified card user is never used", async () => {
  const h = harness({ email: "other@example.com", holders: [approved] });
  assert.equal((await h.request("request_card", { purpose: "advertising", amount: 20 })).status, 403);
  assert.equal(h.entities.CardRequest.store.length, 0);
});

test("the verification page learns the client's PhotonPay outcome", async () => {
  const states = [
    [{ ...approved }, "verified"],
    [{ ...approved, status: "pending", review_status: "pending" }, "checking"],
    [{ ...approved, status: "pending", review_status: "modify" }, "needs_changes"],
    [{ ...approved, status: "suspended", review_status: "rejected" }, "declined"],
  ];
  for (const [row, expected] of states) {
    const r = await harness({ holders: [row] }).request("my_registration");
    assert.equal(r.body.identity.status, expected);
    assert.equal(r.body.identity.full_name, "Ana Client");
    assert.equal(r.body.identity.photon_cardholder_id, undefined, "no provider ids reach the client");
  }
  assert.equal((await harness({ email: "new@example.com" }).request("my_registration")).body.identity, null);
});

test("a client the administrator registered (no owner link) is found through their card, linked, and can request", async () => {
  const adminMade = { ...approved, owner_email: null, email: "someone-else@example.com" };
  const h = harness({ holders: [adminMade], cards: [{ id: "c1", cardholder_id: "h1", owner_email: "client@example.com", status: "active", auto_issued: false }] });
  const mine = await h.request("my_registration");
  assert.equal(mine.body.identity.status, "verified");
  assert.equal(mine.body.card_request.can_request, true, "an admin-issued card does not use up the client's own request");
  assert.equal(h.entities.Cardholder.store[0].owner_email, "client@example.com", "linked to this login");
  assert.equal((await h.request("request_card", { purpose: "advertising", amount: 20 })).status, 200);
});

test("an admin-registered client is also found by the email PhotonPay holds for them", async () => {
  const h = harness({ holders: [{ ...approved, owner_email: null }] });
  assert.equal((await h.request("my_registration")).body.identity.status, "verified");
});

test("a card user already linked to another login is never claimed", async () => {
  const h = harness({ holders: [{ ...approved, owner_email: "owner@example.com" }], cards: [{ id: "c1", cardholder_id: "h1", owner_email: "client@example.com", status: "active" }] });
  const mine = await h.request("my_registration");
  assert.equal(mine.body.identity, null);
  assert.equal(h.entities.Cardholder.store[0].owner_email, "owner@example.com");
  assert.equal((await h.request("request_card", { purpose: "advertising", amount: 20 })).status, 403);
});

test("revealed card details take the full number, CVV and expiry from PhotonPay's getCvv", async () => {
  const card = { id: "c1", cardholder_id: "h1", owner_email: "client@example.com", status: "active", photon_card_id: "XR1", auto_issued: false, currency: "USD" };
  const h = harness({ holders: [approved], cards: [card] });
  const r = await h.request("detail", { recordId: "c1" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.card.card_no, "5583251234564788");
  assert.equal(r.body.card.cvv, "123");
  assert.equal(r.body.card.expiry, "11/29");
});

// ---- Client accounts: money must be deposited before a card can be requested.

test("a verified client with no funds cannot request a card and is told to fund their account", async () => {
  const h = harness({ holders: [approved], funds: 0 });
  const mine = await h.request("my_registration");
  assert.equal(mine.body.card_request.can_request, false);
  assert.equal(mine.body.card_request.needs_funds, true);
  assert.match(mine.body.card_request.reason, /Fund your account first/);
  const r = await h.request("request_card", { purpose: "advertising", amount: 20 });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Fund your account first/);
  assert.equal(h.entities.CardRequest.store.length, 0);
});

test("below the minimum, or asking for more than is available, is refused", async () => {
  const low = harness({ holders: [approved], funds: 19.99 });
  assert.equal((await low.request("my_registration")).body.card_request.needs_funds, true);
  // Deposited 300 (Emerald), 250 already on a card: 50 left.
  const spent = (left) => [
    { id: "e0", owner_email: "client@example.com", kind: "deposit", status: "completed", amount: 300 },
    { id: "e1", owner_email: "client@example.com", kind: "card_opening", status: "completed", amount: left - 300 },
  ];
  const some = harness({ holders: [approved], entries: spent(50) });
  const r = await some.request("request_card", { purpose: "advertising", amount: 60 });
  assert.equal(r.status, 402);
  assert.match(r.body.error, /available balance is 50\.00 USD/);
  assert.equal((await some.request("request_card", { purpose: "advertising", amount: 50 })).status, 200);
});

test("a pending request holds its amount, and a client's report of a deposit does not count until confirmed", async () => {
  const h = harness({ holders: [approved], entries: [
    { id: "e0", owner_email: "client@example.com", kind: "deposit", status: "completed", amount: 300 },
    { id: "e1", owner_email: "client@example.com", kind: "card_opening", status: "completed", amount: -200 },
  ] });
  await h.request("request_card", { purpose: "advertising", amount: 70 });
  const wallet = (await h.request("my_wallet")).body;
  assert.equal(wallet.balance, 100);
  assert.equal(wallet.held, 70);
  assert.equal(wallet.available, 30);
  const reported = await h.request("report_deposit", { amount: 500, method: "bank_transfer", reference: "TRX-1" });
  assert.equal(reported.status, 200, JSON.stringify(reported.body));
  assert.equal(reported.body.entry.status, "pending");
  assert.equal((await h.request("my_wallet")).body.balance, 100, "not counted before confirmation");
});

test("deposits need a verified client, an amount and a method", async () => {
  assert.equal((await harness({ email: "new@example.com" }).request("report_deposit", { amount: 50, method: "cash" })).status, 403);
  const h = harness({ holders: [approved] });
  assert.equal((await h.request("report_deposit", { amount: 0, method: "cash" })).status, 400);
  assert.equal((await h.request("report_deposit", { amount: 10, method: "card" })).status, 400);
});

test("clients cannot record, confirm or read other accounts", async () => {
  const h = harness({ holders: [approved] });
  for (const action of ["wallet_overview", "wallet_client", "wallet_record", "wallet_review"]) {
    assert.equal((await h.request(action, { ownerEmail: "client@example.com", amount: 1000, method: "cash", entryId: "e0", decision: "confirm" })).status, 403, action);
  }
  assert.equal(h.entities.AccountEntry.store.length, 1);
});

test("the administrator confirms a reported deposit for the amount actually received, or rejects it with a reason", async () => {
  const entries = [
    { id: "d1", owner_email: "client@example.com", client_name: "Ana Client", kind: "deposit", status: "pending", amount: 100, reported_by: "client", method: "bank_transfer" },
    { id: "d2", owner_email: "client@example.com", kind: "deposit", status: "pending", amount: 40, reported_by: "client", method: "cash" },
  ];
  const admin = harness({ role: "admin", email: "admin@example.com", holders: [approved], entries });
  const overview = (await admin.request("wallet_overview")).body;
  assert.equal(overview.pending_deposits.length, 2);
  const confirmed = await admin.request("wallet_review", { entryId: "d1", decision: "confirm", amount: 95 });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal(confirmed.body.balance, 95);
  assert.equal(admin.entities.AccountEntry.store[0].reported_amount, 100);
  assert.equal((await admin.request("wallet_review", { entryId: "d1", decision: "confirm" })).status, 409, "confirmed once only");
  assert.equal((await admin.request("wallet_review", { entryId: "d2", decision: "reject", note: "" })).status, 400);
  assert.equal((await admin.request("wallet_review", { entryId: "d2", decision: "reject", note: "Not received" })).status, 200);
  const client = harness({ holders: [approved], entries: admin.entities.AccountEntry.store });
  const wallet = (await client.request("my_wallet")).body;
  assert.equal(wallet.balance, 95);
  assert.ok(wallet.entries.some((e) => e.status === "rejected" && e.note === "Not received"));
  assert.ok(!JSON.stringify(wallet).includes("admin_note"), "internal notes stay internal");
});

test("the administrator records cash or transfers directly, and corrections need a reason and cannot go below zero", async () => {
  const admin = harness({ role: "admin", email: "admin@example.com", holders: [approved], funds: 0 });
  assert.equal((await admin.request("wallet_record", { ownerEmail: "client@example.com", amount: 200, method: "wire" })).status, 400);
  const r = await admin.request("wallet_record", { ownerEmail: "Client@Example.com", amount: 200, method: "cash", reference: "Receipt 17" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.balance, 200);
  assert.equal(admin.entities.AccountEntry.store[0].owner_email, "client@example.com");
  assert.equal((await admin.request("wallet_record", { ownerEmail: "client@example.com", kind: "adjustment", amount: -10 })).status, 400, "reason required");
  assert.equal((await admin.request("wallet_record", { ownerEmail: "client@example.com", kind: "adjustment", amount: -500, note: "Bank charge" })).status, 409);
  assert.equal((await admin.request("wallet_record", { ownerEmail: "client@example.com", kind: "adjustment", amount: -5, note: "Bank charge" })).body.balance, 195);
});

test("approval takes the card's opening amount from the client's account and refuses more than they have", async () => {
  const req = { ...pendingRow, amount: 40 };
  const short = harness({ role: "admin", email: "admin@example.com", holders: [approved], requests: [req], funds: 40 });
  const tooMuch = await short.request("approve_card_request", { requestId: "r1", amount: 60, gpsCountry: "AE" }, { "true-client-ip": "203.0.113.7" });
  assert.equal(tooMuch.status, 409);
  assert.match(tooMuch.body.error, /available balance is 40\.00 USD/);
  assert.ok(!short.calls.some((c) => c.path.endsWith("openCardHalo")));
  const ok = await short.request("approve_card_request", { requestId: "r1", amount: 40, gpsCountry: "AE" }, { "true-client-ip": "203.0.113.7" });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const debit = short.entities.AccountEntry.store.find((e) => e.kind === "card_opening");
  assert.equal(debit.amount, -40);
  assert.equal(debit.card_request_id, "r1");
  const client = harness({ holders: [approved], entries: short.entities.AccountEntry.store, cards: short.entities.Card.store });
  assert.equal((await client.request("my_wallet")).body.balance, 0);
});

test("topping up a client's card needs their available balance and charges it once confirmed", async () => {
  const card = { id: "c9", owner_email: "client@example.com", cardholder_id: "h1", status: "active", card_type: "recharge", photon_card_id: "XR9", nickname: "Ana card", last4: "1111" };
  const admin = harness({ role: "admin", email: "admin@example.com", holders: [approved], cards: [card], funds: 30 });
  const refused = await admin.request("top_up_quote", { recordId: "c9", amount: 50 });
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /available balance is 30\.00 USD/);
  assert.ok(!admin.calls.some((c) => c.path.endsWith("preRecharge")));
  const quote = await admin.request("top_up_quote", { recordId: "c9", amount: 30 });
  assert.equal(quote.status, 200, JSON.stringify(quote.body));
  assert.equal(admin.entities.Card.store[0].pending_topup_amount, 30);
  const done = await admin.request("top_up_confirm", { recordId: "c9", requestId: quote.body.request_id });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  const charge = admin.entities.AccountEntry.store.find((e) => e.kind === "card_topup");
  assert.equal(charge.amount, -30);
  assert.equal(charge.card_id, "c9");
});

test("an administrator's own card is topped up from the programme account, not a client balance", async () => {
  const card = { id: "c8", owner_email: "admin@example.com", status: "active", card_type: "recharge", photon_card_id: "XR8" };
  const admin = harness({ role: "admin", email: "admin@example.com", cards: [card], funds: 0 });
  assert.equal((await admin.request("top_up_quote", { recordId: "c8", amount: 25 })).status, 200);
});

// ---- Clients add credit to their own cards from their account balance.

const clientCard = { id: "c7", owner_email: "client@example.com", cardholder_id: "h1", status: "active", card_type: "recharge", photon_card_id: "XR7", nickname: "Ana card", last4: "7777" };

test("a client adds credit to their own card from their balance: quote first, then charged once", async () => {
  const h = harness({ holders: [approved], cards: [clientCard], funds: 30 });
  const quote = await h.request("top_up_quote", { recordId: "c7", amount: 30 });
  assert.equal(quote.status, 200, JSON.stringify(quote.body));
  const done = await h.request("top_up_confirm", { recordId: "c7", requestId: quote.body.request_id });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  const charges = h.entities.AccountEntry.store.filter((e) => e.kind === "card_topup");
  assert.equal(charges.length, 1);
  assert.equal(charges[0].amount, -30);
  assert.equal((await h.request("top_up_confirm", { recordId: "c7", requestId: quote.body.request_id })).status, 409, "a quote is used once");
  assert.equal((await h.request("my_wallet")).body.balance, 0);
});

test("a client cannot add more credit than their available balance", async () => {
  const h = harness({ holders: [approved], cards: [clientCard], funds: 30 });
  const r = await h.request("top_up_quote", { recordId: "c7", amount: 31 });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Your available balance is 30\.00 USD/);
  assert.equal(r.body.needs_funds, true);
  assert.ok(!h.calls.some((c) => c.path.endsWith("preRecharge")));
});

test("a client cannot top up someone else's card, a frozen card, or when top-ups are paused", async () => {
  const other = harness({ email: "other@example.com", cards: [clientCard], funds: 500, users: [{ id: "u3", email: "other@example.com", role: "user" }] });
  assert.equal((await other.request("top_up_quote", { recordId: "c7", amount: 10 })).status, 403);
  const frozen = harness({ holders: [approved], cards: [{ ...clientCard, status: "frozen" }] });
  const f = await frozen.request("top_up_quote", { recordId: "c7", amount: 10 });
  assert.equal(f.status, 409);
  assert.match(f.body.error, /Unfreeze/);
  const paused = harness({ holders: [approved], cards: [clientCard], settings: [{ id: "s", client_topups_enabled: false }] });
  assert.equal((await paused.request("top_up_quote", { recordId: "c7", amount: 10 })).status, 409);
  for (const h of [other, frozen, paused]) assert.ok(!h.calls.some((c) => c.path.endsWith("preRecharge")));
});

test("clients still cannot use administrator-only card tools", async () => {
  const h = harness({ holders: [approved], cards: [clientCard] });
  assert.equal((await h.request("update_card", { recordId: "c7", nickname: "x" })).status, 403);
  assert.equal((await h.request("sandbox_txn", { recordId: "c7" })).status, 403);
});

// ---- Clients say what each card is for.

test("a card request needs a purpose from the list, and 'other' needs the client's own words", async () => {
  const h = harness({ holders: [approved] });
  const none = await h.request("request_card", { amount: 20 });
  assert.equal(none.status, 400);
  assert.match(none.body.error, /what you'll use the card for/);
  assert.equal((await h.request("request_card", { amount: 20, purpose: "gambling" })).status, 400);
  assert.equal((await h.request("request_card", { amount: 20, purpose: "other", purposeDetail: "x" })).status, 400);
  assert.equal(h.entities.CardRequest.store.length, 0);
  const ok = await h.request("request_card", { amount: 20, purpose: "other", purposeDetail: "Supplier payments" });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(h.entities.CardRequest.store[0].purpose, "other");
  assert.equal(h.entities.CardRequest.store[0].purpose_detail, "Supplier payments");
  assert.equal((await h.request("my_registration")).body.latest_card_request.purpose, "other");
});

test("the approved card keeps its purpose and is named after it", async () => {
  const admin = harness({ role: "admin", email: "admin@example.com", holders: [approved], requests: [{ ...pendingRow, purpose: "travel" }] });
  const r = await admin.request("approve_card_request", { requestId: "r1", amount: 40, gpsCountry: "AE" }, { "true-client-ip": "203.0.113.7" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const card = admin.entities.Card.store[0];
  assert.equal(card.purpose, "travel");
  assert.equal(card.nickname, "Ana · Travel");
  assert.equal(admin.calls.find((c) => c.path.endsWith("openCardHalo")).options.body.nickname, "Ana · Travel");
});


// ---- Proof of payment for deposits.

const pdf = btoa("%PDF-1.4 receipt");
const jpeg = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3));

test("a client attaches a photo or PDF as proof when reporting a deposit, and can open their own", async () => {
  const h = harness({ holders: [approved] });
  const stored = await h.request("store_deposit_proof", { dataBase64: pdf, fileName: "Bank receipt.pdf" });
  assert.equal(stored.status, 200, JSON.stringify(stored.body));
  assert.ok(stored.body.proof_token);
  assert.equal(stored.body.proof_token.includes("mp/private"), false, "the storage path is never handed to the client");
  const r = await h.request("report_deposit", { amount: 80, method: "bank_transfer", proofToken: stored.body.proof_token, proofName: "Bank receipt.pdf" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.entry.has_proof, true);
  const entry = h.entities.AccountEntry.store.find((e) => e.status === "pending");
  assert.match(entry.proof_file_uri, /\.pdf$/);
  assert.equal(entry.proof_type, "application/pdf");
  const wallet = (await h.request("my_wallet")).body;
  assert.ok(!JSON.stringify(wallet).includes("mp/private"), "clients never see storage paths");
  const link = await h.request("my_deposit_proof", { entryId: entry.id });
  assert.equal(link.status, 200);
  assert.match(link.body.url, /^https:\/\/files\.example\//);
  assert.equal((await h.request("store_deposit_proof", { dataBase64: jpeg, fileName: "slip.heic" })).body.type, "image/jpeg");
});

test("only photos and PDFs up to 6 MB are accepted as proof", async () => {
  const h = harness({ holders: [approved] });
  assert.equal((await h.request("store_deposit_proof", { dataBase64: btoa("MZ executable") })).status, 400);
  assert.equal((await h.request("store_deposit_proof", { dataBase64: "" })).status, 400);
  assert.equal(h.files.length, 0);
});

test("a proof token cannot be forged, reused by another client, or swapped with an ID photo token", async () => {
  const a = harness({ holders: [approved] });
  const token = (await a.request("store_deposit_proof", { dataBase64: pdf })).body.proof_token;
  const otherHolder = { ...approved, id: "h2", owner_email: "other@example.com", email: "other@example.com" };
  const b = harness({ email: "other@example.com", holders: [otherHolder], users: [{ id: "u3", email: "other@example.com", role: "user" }] });
  assert.equal((await b.request("report_deposit", { amount: 10, method: "cash", proofToken: token })).status, 400, "another account's token");
  assert.equal((await a.request("report_deposit", { amount: 10, method: "cash", proofToken: token.slice(0, -3) + "abc" })).status, 400, "altered token");
  const idToken = (await a.request("store_id_photo", { dataBase64: jpeg, fileName: "id.jpg" })).body.photo_token;
  assert.ok(idToken);
  assert.equal((await a.request("report_deposit", { amount: 10, method: "cash", proofToken: idToken })).status, 400, "ID photo token is not a proof token");
  assert.equal(a.entities.AccountEntry.store.filter((e) => e.status === "pending").length, 0);
});

test("a client cannot open another client's proof; the administrator can open any", async () => {
  const entries = [{ id: "d9", owner_email: "client@example.com", kind: "deposit", status: "pending", amount: 50, proof_file_uri: "mp/private/abcdefghij0123456789/r.pdf", proof_type: "application/pdf" }];
  const other = harness({ email: "other@example.com", entries, users: [{ id: "u3", email: "other@example.com", role: "user" }] });
  assert.equal((await other.request("my_deposit_proof", { entryId: "d9" })).status, 404);
  assert.equal((await other.request("deposit_proof", { entryId: "d9" })).status, 403);
  const admin = harness({ role: "admin", email: "admin@example.com", entries });
  const r = await admin.request("deposit_proof", { entryId: "d9" });
  assert.equal(r.status, 200);
  assert.match(r.body.url, /r\.pdf/);
  const overview = (await admin.request("wallet_overview")).body;
  assert.equal(overview.pending_deposits[0].has_proof, true);
});

test("the administrator can attach proof when recording money received", async () => {
  const admin = harness({ role: "admin", email: "admin@example.com", holders: [approved], funds: 0 });
  const token = (await admin.request("store_deposit_proof", { dataBase64: jpeg, fileName: "cash slip.jpg" })).body.proof_token;
  const r = await admin.request("wallet_record", { ownerEmail: "client@example.com", amount: 100, method: "cash", proofToken: token, proofName: "cash slip.jpg" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(admin.entities.AccountEntry.store[0].proof_type, "image");
});


// ---- Notifications for the client's bell.

const notes = (h, email = "client@example.com") => h.entities.Notification.store.filter((n) => n.owner_email === email);

test("deposit confirmed or not received, and money recorded or corrected, notify the client", async () => {
  const entries = [
    { id: "d1", owner_email: "client@example.com", kind: "deposit", status: "pending", amount: 100, method: "bank_transfer" },
    { id: "d2", owner_email: "client@example.com", kind: "deposit", status: "pending", amount: 40, method: "cash" },
  ];
  const admin = harness({ role: "admin", email: "admin@example.com", holders: [approved], entries });
  await admin.request("wallet_review", { entryId: "d1", decision: "confirm", amount: 100 });
  await admin.request("wallet_review", { entryId: "d2", decision: "reject", note: "Not on our statement" });
  await admin.request("wallet_record", { ownerEmail: "client@example.com", amount: 25, method: "cash" });
  await admin.request("wallet_record", { ownerEmail: "client@example.com", kind: "adjustment", amount: -5, note: "Bank charge" });
  const titles = notes(admin).map((n) => n.title);
  assert.deepEqual(titles, ["Deposit confirmed", "Deposit not received", "Funds added to your account", "Your balance was corrected"]);
  assert.match(notes(admin)[1].body, /Not on our statement/);
  assert.ok(notes(admin).every((n) => n.read === false && n.link === "/account"));
  assert.equal(notes(admin, "admin@example.com").length, 0, "the administrator is not notified of their own action");
});

test("card request approved or rejected notifies the client, once", async () => {
  const approve = harness({ role: "admin", email: "admin@example.com", holders: [approved], requests: [{ ...pendingRow, purpose: "travel" }] });
  await approve.request("approve_card_request", { requestId: "r1", amount: 40, gpsCountry: "AE" }, { "true-client-ip": "203.0.113.7" });
  assert.deepEqual(notes(approve).map((n) => n.title), ["Card request approved"]);
  const reject = harness({ role: "admin", email: "admin@example.com", holders: [approved], requests: [pendingRow] });
  await reject.request("reject_card_request", { requestId: "r1", note: "Deposit pending" });
  await reject.request("reject_card_request", { requestId: "r1", note: "again" });
  assert.deepEqual(notes(reject).map((n) => n.title), ["Card request not approved"]);
});

test("a verification change from PhotonPay notifies once, however many times it is seen", async () => {
  const db = { Notification: harness().entities.Notification };
  const base44 = { asServiceRole: { entities: db } };
  const before = { id: "h1", owner_email: "client@example.com", status: "pending", review_status: "pending" };
  await notifyHolderChange(base44, before, { ...before, status: "active", review_status: "approved" });
  await notifyHolderChange(base44, before, { ...before, status: "active", review_status: "approved" });
  await notifyHolderChange(base44, { ...before, status: "active" }, { ...before, status: "active" });
  assert.deepEqual(db.Notification.store.map((n) => n.title), ["You're verified"]);
});

test("a notification that cannot be written never fails the action", async () => {
  const broken = { asServiceRole: { entities: { Notification: { filter: async () => { throw new Error("down"); }, create: async () => { throw new Error("down"); } } } } };
  assert.equal(await notifyClient(broken, "client@example.com", { title: "x", key: "k" }), null);
});

test("clients can read and mark only their own notifications (data rules)", () => {
  const rules = JSON.parse(read("base44/entities/Notification.jsonc").replace(/^\s*\/\/.*$/gm, "")).rls;
  assert.deepEqual(rules.create, { user_condition: { role: "admin" } });
  assert.match(JSON.stringify(rules.read), /data\.owner_email.*\{\{user\.email\}\}/);
  assert.match(JSON.stringify(rules.update), /data\.owner_email.*\{\{user\.email\}\}/);
  assert.deepEqual(rules.delete, { user_condition: { role: "admin" } });
});


// ---- Card tiers: Emerald from 250 deposited, Plum from 10,000, Crimson from 50,000.

const deposited = (amount, spent = 0) => [
  { id: "t0", owner_email: "client@example.com", kind: "deposit", status: "completed", amount },
  ...(spent ? [{ id: "t1", owner_email: "client@example.com", kind: "card_opening", status: "completed", amount: -spent }] : []),
];

test("under 250 USD deposited in total there is no card yet, even with balance", async () => {
  const h = harness({ holders: [approved], entries: deposited(249) });
  const state = (await h.request("my_registration")).body.card_request;
  assert.equal(state.can_request, false);
  assert.equal(state.needs_funds, true);
  assert.equal(state.tier, "");
  assert.equal(state.next_tier.id, "emerald");
  assert.equal(state.next_tier.remaining, 1);
  assert.match(state.reason, /250\.00 USD deposited in total/);
  assert.equal((await h.request("request_card", { purpose: "travel", amount: 100 })).status, 409);
});

test("tiers follow total deposits and do not drop when money is spent", async () => {
  const cases = [[250, 0, "emerald"], [9999.99, 0, "emerald"], [10000, 0, "plum"], [10000, 9900, "plum"], [49999, 0, "plum"], [50000, 0, "crimson"]];
  for (const [amount, spent, tier] of cases) {
    const wallet = (await harness({ holders: [approved], entries: deposited(amount, spent) }).request("my_wallet")).body;
    assert.equal(wallet.tier, tier, `${amount} deposited, ${spent} spent`);
  }
  const plum = (await harness({ holders: [approved], entries: deposited(12000) }).request("my_wallet")).body;
  assert.deepEqual(plum.eligible_tiers, ["emerald", "plum"]);
  assert.equal(plum.next_tier.id, "crimson");
  assert.equal(plum.next_tier.remaining, 38000);
});

test("a client requests their own tier or a lower one, never a higher one; the card keeps it", async () => {
  const h = harness({ holders: [approved], entries: deposited(12000), settings: [{ id: "s", max_cards_per_client: 5 }] });
  const tooHigh = await h.request("request_card", { purpose: "travel", amount: 100, tier: "crimson" });
  assert.equal(tooHigh.status, 403);
  assert.match(tooHigh.body.error, /Crimson card needs 50000\.00 USD/);
  assert.equal((await h.request("request_card", { purpose: "travel", amount: 100 })).status, 200);
  assert.equal(h.entities.CardRequest.store[0].tier, "plum", "defaults to the client's own tier");
  const lower = harness({ holders: [approved], entries: deposited(12000) });
  assert.equal((await lower.request("request_card", { purpose: "travel", amount: 100, tier: "emerald" })).status, 200);
  assert.equal(lower.entities.CardRequest.store[0].tier, "emerald");
  const admin = harness({ role: "admin", email: "admin@example.com", holders: [approved], requests: [{ ...pendingRow, tier: "plum" }], entries: deposited(12000) });
  await admin.request("approve_card_request", { requestId: "r1", amount: 40, gpsCountry: "AE" }, { "true-client-ip": "203.0.113.7" });
  assert.equal(admin.entities.Card.store[0].tier, "plum");
});

test("thresholds come from Settings, and each step must sit above the last", async () => {
  const custom = (await harness({ holders: [approved], entries: deposited(600), settings: [{ id: "s", tier_start_amount: 500, tier_plum_from: 600, tier_crimson_from: 100 }] }).request("my_wallet")).body;
  assert.deepEqual(custom.ladder.map((s) => s.from), [500, 600, 601]);
  assert.equal(custom.tier, "plum");
});

test("a deposit that reaches a new tier tells the client", async () => {
  const admin = harness({ role: "admin", email: "admin@example.com", holders: [approved], entries: deposited(9000) });
  await admin.request("wallet_record", { ownerEmail: "client@example.com", amount: 1500, method: "bank_transfer" });
  assert.ok(admin.entities.Notification.store.some((n) => n.title === "You've reached Plum"));
  const first = harness({ role: "admin", email: "admin@example.com", holders: [approved], funds: 0 });
  await first.request("wallet_record", { ownerEmail: "client@example.com", amount: 250, method: "cash" });
  assert.ok(first.entities.Notification.store.some((n) => n.title === "You can now request your Emerald card"));
  const same = harness({ role: "admin", email: "admin@example.com", holders: [approved], entries: deposited(300) });
  await same.request("wallet_record", { ownerEmail: "client@example.com", amount: 100, method: "cash" });
  assert.ok(!same.entities.Notification.store.some((n) => /reached|can now request/.test(n.title)));
});

// ---- The administrator chooses which tiers the app offers.

test("a switched-off tier is not offered, shown or requested; clients fall back to the highest tier on", async () => {
  const off = [{ id: "s", tier_crimson_enabled: false, max_cards_per_client: 5 }];
  const h = harness({ holders: [approved], entries: deposited(60000), settings: off });
  const wallet = (await h.request("my_wallet")).body;
  assert.deepEqual(wallet.ladder.map((s) => s.id), ["emerald", "plum"]);
  assert.equal(wallet.tier, "plum", "qualifies for Crimson, gets the highest tier on");
  assert.equal(wallet.next_tier, null);
  const r = await h.request("request_card", { purpose: "travel", amount: 100, tier: "crimson" });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /Crimson card isn't available/);
  assert.equal((await h.request("request_card", { purpose: "travel", amount: 100 })).status, 200);
  assert.equal(h.entities.CardRequest.store[0].tier, "plum");
});

test("with the starter tier off, the first card is the next tier on", async () => {
  const h = harness({ holders: [approved], entries: deposited(3000), settings: [{ id: "s", tier_emerald_enabled: false }] });
  const state = (await h.request("my_registration")).body.card_request;
  assert.equal(state.tier, "");
  assert.equal(state.can_request, false);
  assert.match(state.reason, /first card \(Plum\) needs 10000\.00 USD/);
  assert.equal(state.next_tier.id, "plum");
  assert.equal(state.next_tier.remaining, 7000);
});

test("with every tier off, card requests are paused", async () => {
  const h = harness({ holders: [approved], entries: deposited(20000), settings: [{ id: "s", tier_emerald_enabled: false, tier_plum_enabled: false, tier_crimson_enabled: false }] });
  const state = (await h.request("my_registration")).body.card_request;
  assert.equal(state.can_request, false);
  assert.match(state.reason, /paused/);
  assert.equal((await h.request("request_card", { purpose: "travel", amount: 100 })).status, 409);
});
