import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const backendSource = read("base44/functions/photonpayCards/entry.ts");
const providerSource = read("base44/shared/photonpay.ts");
const pickCard = new Function(providerSource.slice(providerSource.indexOf("export function pickCard")).replace("export function pickCard", "return function pickCard"))();
const user = { role: "user", email: "alice@example.com" };
const admin = { role: "admin", email: "admin@example.com" };
const ownCard = { id: "local-card", photon_card_id: "trusted-provider-card", owner_email: user.email, last4: "1111", currency: "USD", nickname: "Everyday" };

function harness({ account = user, card = ownCard, configured = true, providerError = null, txPages = [], failMigration = false } = {}) {
  const calls = { provider: [], cardUpdates: [], transactionUpdates: [], events: [], config: 0, pages: [] };
  const client = {
    auth: { me: async () => account },
    asServiceRole: { entities: {
      Card: {
        get: async (id) => id === card?.id ? card : null,
        update: async (id, data) => { calls.cardUpdates.push({ id, data }); return { ...card, ...data }; },
      },
      CardTransaction: {
        filter: async (query, options) => { calls.pages.push({ query, options }); if (failMigration) throw new Error("storage unavailable"); return txPages[calls.pages.length - 1] || { items: [], has_more: false }; },
        update: async (id, data) => { calls.transactionUpdates.push({ id, data }); return { id, ...data }; },
        create: async (data) => { calls.events.push(data); return data; },
      },
    } },
  };
  const source = backendSource.replace(/^import .*;\n/gm, "").replace("export default async function (req)", "return async function (req)");
  const handler = new Function("createClientFromRequest", "getConfig", "photonRequest", "resolveConfig", "pickCard", "refreshCardRecord", source)(
    () => client,
    () => { calls.config++; return { configured, env: "sandbox", privateKey: "" }; },
    async (cfg, path, options) => {
      calls.provider.push({ path, options });
      if (providerError) throw new Error(providerError);
      return { data: { cardId: "trusted-provider-card", cardholderId: "private-holder-id", cardNo: "4111111111111111", cvv: "123", expiryDate: "12/30", cardCurrency: "USD", cardScheme: "MasterCard", cardStatus: "active" } };
    },
    async (cfg) => cfg,
    pickCard,
    async (_base44, record) => record,
  );
  return {
    calls,
    async request(action, payload = {}, method = "POST") {
      const response = await handler(new Request("https://example.com/card-control", { method, ...(method === "POST" ? { body: JSON.stringify({ action, payload }), headers: { "content-type": "application/json" } } : {}) }));
      return { status: response.status, body: await response.json() };
    },
  };
}

test("only POST accepts card requests", async () => {
  const h = harness();
  assert.equal((await h.request("status", {}, "GET")).status, 405);
  assert.equal(h.calls.config, 0);
});

test("anonymous callers cannot use the provider", async () => {
  const h = harness({ account: null });
  assert.equal((await h.request("status")).status, 401);
  assert.equal(h.calls.config, 0);
});

test("unknown account roles fail closed even for an assigned email", async () => {
  const h = harness({ account: { ...user, role: "manager" } });
  assert.equal((await h.request("detail", { recordId: ownCard.id })).status, 403);
  assert.equal(h.calls.config, 0);
});

for (const action of ["status", "bins", "list", "issue", "assign", "sync_holders"]) {
  test("users cannot run admin action: " + action, async () => {
    const h = harness();
    const result = await h.request(action, { recordId: ownCard.id, role: "admin", ownerEmail: user.email });
    assert.equal(result.status, 403);
    assert.equal(h.calls.config, 0);
    assert.equal(h.calls.provider.length, 0);
    assert.equal(h.calls.cardUpdates.length, 0);
  });
}

for (const action of ["detail", "freeze", "unfreeze", "cancel"]) {
  test("another account cannot " + action + " a card", async () => {
    const h = harness({ account: { ...user, email: "bob@example.com" } });
    assert.equal((await h.request(action, { recordId: ownCard.id, cardId: "attacker-provider-id" })).status, 403);
    assert.equal(h.calls.provider.length, 0);
  });
  test("an unassigned card cannot be used for " + action, async () => {
    const h = harness({ card: { ...ownCard, owner_email: "" } });
    assert.equal((await h.request(action, { recordId: ownCard.id })).status, 403);
  });
}

test("users must supply a local record; a raw provider ID never grants access", async () => {
  const h = harness();
  assert.equal((await h.request("detail", { cardId: "trusted-provider-card" })).status, 400);
  assert.equal((await h.request("detail", { recordId: "missing" })).status, 403);
  assert.equal(h.calls.provider.length, 0);
});

test("owned card details exclude provider and cardholder identifiers", async () => {
  const h = harness();
  const result = await h.request("detail", { recordId: ownCard.id, cardId: "attacker-provider-id" });
  assert.equal(result.status, 200);
  assert.equal(result.body.card.card_no, "4111111111111111");
  assert.equal(result.body.card.photon_card_id, undefined);
  assert.equal(result.body.card.cardholder_id, undefined);
  assert.deepEqual(Object.keys(result.body.card).sort(), ["card_no", "cvv", "expiry", "last4", "masked_number", "scheme", "currency"].sort());
  assert.deepEqual(h.calls.provider[0].options.query, { cardId: ownCard.photon_card_id });
});

test("admins need a stated reason to view a client's card details, and the view is recorded for the client", async () => {
  const h = harness({ account: admin });
  for (const reason of [undefined, "", "check"]) {
    const refused = await h.request("detail", { recordId: ownCard.id, reason });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.reason_required, true);
  }
  assert.equal(h.calls.provider.length, 0, "no card data fetched without a reason");
  const result = await h.request("detail", { recordId: ownCard.id, reason: "Client asked for help with a declined payment" });
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body.card).sort(), ["card_no", "cvv", "expiry", "last4", "masked_number", "scheme", "currency"].sort());
  const audit = h.calls.events.find((event) => event.event === "Card details viewed by administrator");
  assert.ok(audit, "view recorded in the card's activity");
  assert.equal(audit.owner_email, ownCard.owner_email, "visible to the client");
  assert.match(audit.note, /admin@example\.com: Client asked for help/);
});

test("an admin viewing a card assigned to their own account needs no reason", async () => {
  const h = harness({ account: admin, card: { ...ownCard, owner_email: admin.email } });
  assert.equal((await h.request("detail", { recordId: ownCard.id })).status, 200);
  assert.equal(h.calls.events.length, 0);
});

for (const [action, expected] of [["freeze", "frozen"], ["unfreeze", "active"], ["cancel", "cancelled"]]) {
  test("an owner can " + action + " only the trusted linked card", async () => {
    const h = harness();
    const result = await h.request(action, { recordId: ownCard.id, cardId: "attacker-provider-id", owner_email: "bob@example.com" });
    assert.equal(result.status, 200);
    assert.equal(h.calls.provider[0].options.body.cardId, ownCard.photon_card_id);
    assert.deepEqual(h.calls.cardUpdates, [{ id: ownCard.id, data: { status: expected } }]);
    assert.equal(h.calls.events[0].owner_email, user.email);
    assert.equal(h.calls.events[0].card_id, ownCard.id);
  });
}

test("only an admin can assign all activity pages without provider credentials", async () => {
  const h = harness({ account: admin, configured: false, txPages: [
    { items: [{ id: "tx1" }], has_more: true, next_cursor: "page2" },
    { items: [{ id: "tx2" }], has_more: false },
  ] });
  const result = await h.request("assign", { recordId: ownCard.id, ownerEmail: " BOB@example.com " });
  assert.equal(result.status, 200);
  assert.equal(result.body.owner_email, "bob@example.com");
  assert.deepEqual(h.calls.cardUpdates, [
    { id: ownCard.id, data: { owner_email: "" } },
    { id: ownCard.id, data: { owner_email: "bob@example.com" } },
  ]);
  assert.deepEqual(h.calls.transactionUpdates.map((row) => row.data.owner_email), ["bob@example.com", "bob@example.com"]);
  assert.equal(h.calls.pages[1].options.cursor, "page2");
  assert.equal(h.calls.config, 0);
});

test("invalid assignment emails do not change access", async () => {
  const h = harness({ account: admin });
  assert.equal((await h.request("assign", { recordId: ownCard.id, ownerEmail: "invalid-email" })).status, 400);
  assert.equal(h.calls.cardUpdates.length, 0);
});

test("removing assignment removes access to both card and activity", async () => {
  const h = harness({ account: admin, txPages: [{ items: [{ id: "tx1" }], has_more: false }] });
  assert.equal((await h.request("assign", { recordId: ownCard.id, ownerEmail: "" })).status, 200);
  assert.equal(h.calls.cardUpdates.at(-1).data.owner_email, "");
  assert.equal(h.calls.transactionUpdates[0].data.owner_email, "");
});

test("failed assignment does not grant the new account card access", async () => {
  const h = harness({ account: admin, failMigration: true });
  assert.equal((await h.request("assign", { recordId: ownCard.id, ownerEmail: "bob@example.com" })).status, 500);
  assert.deepEqual(h.calls.cardUpdates, [{ id: ownCard.id, data: { owner_email: "" } }]);
});

test("provider diagnostics never appear in customer errors", async () => {
  const h = harness({ providerError: "SECRET_INTERNAL_PROVIDER_DIAGNOSTIC" });
  const result = await h.request("detail", { recordId: ownCard.id });
  assert.equal(result.status, 500);
  assert.ok(!JSON.stringify(result.body).includes("SECRET_INTERNAL"));
});

test("unlinked cards cannot call provider controls", async () => {
  const h = harness({ card: { ...ownCard, photon_card_id: "" } });
  assert.equal((await h.request("freeze", { recordId: ownCard.id })).status, 409);
  assert.equal(h.calls.provider.length, 0);
});

test("physical records cannot use virtual programme controls", async () => {
  const h = harness({ card: { ...ownCard, form_factor: "physical_card" } });
  assert.equal((await h.request("detail", { recordId: ownCard.id })).status, 409);
  assert.equal(h.calls.provider.length, 0);
});

function evaluate(rule, account, data = {}) {
  if (typeof rule === "boolean") return rule;
  if (!rule) return false;
  if (rule.$or) return rule.$or.some((part) => evaluate(part, account, data));
  if (rule.$and) return rule.$and.every((part) => evaluate(part, account, data));
  if (rule.user_condition) return Object.entries(rule.user_condition).every(([key, value]) => account?.[key] === value);
  return Object.entries(rule).every(([key, value]) => {
    const expected = value === "{{user.email}}" ? account?.email : value;
    return key.startsWith("data.") && expected !== undefined && data[key.slice(5)] === expected;
  });
}
for (const name of ["Card", "CardTransaction"]) {
  test(name + " schema limits reads to assigned users and writes to admins", () => {
    const schema = JSON.parse(read("base44/entities/" + name + ".jsonc"));
    assert.equal(evaluate(schema.rls.read, user, { owner_email: user.email }), true);
    assert.equal(evaluate(schema.rls.read, user, { owner_email: "bob@example.com" }), false);
    assert.equal(evaluate(schema.rls.read, user, { owner_email: "" }), false);
    assert.equal(evaluate(schema.rls.read, null, { owner_email: "" }), false);
    assert.equal(evaluate(schema.rls.read, admin, { owner_email: "" }), true);
    for (const action of ["create", "update", "delete"]) {
      assert.equal(evaluate(schema.rls[action], user), false);
      assert.equal(evaluate(schema.rls[action], admin), true);
    }
    assert.equal(evaluate(schema.properties.owner_email.rls.write, user), false);
  });
}

test("sensitive Card fields and Cardholder records remain admin-only", () => {
  const card = JSON.parse(read("base44/entities/Card.jsonc"));
  for (const field of ["photon_card_id", "photon_cardholder_id", "request_id", "bin", "notes", "cardholder_id"]) {
    assert.equal(evaluate(card.properties[field].rls.read, user), false);
    assert.equal(evaluate(card.properties[field].rls.write, user), false);
    assert.equal(evaluate(card.properties[field].rls.read, admin), true);
  }
  const holder = JSON.parse(read("base44/entities/Cardholder.jsonc"));
  for (const action of ["create", "read", "update", "delete"]) {
    assert.equal(evaluate(holder.rls[action], user), false);
    assert.equal(evaluate(holder.rls[action], admin), true);
  }
});

test("users cannot promote their own account role", () => {
  const schema = JSON.parse(read("base44/entities/User.jsonc"));
  assert.equal(schema.properties.role.default, "user");
  assert.equal(evaluate(schema.properties.role.rls.write, user), false);
  assert.equal(evaluate(schema.properties.role.rls.write, admin), true);
});

function component(path, mocks) {
  const output = ts.transpileModule(read(path), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", output)((name) => name in mocks ? mocks[name] : require(name), module, module.exports);
  return module.exports.default;
}
function guard(auth, pathname = "/") {
  const Navigate = () => null;
  const Outlet = () => null;
  const mocks = {
    react: { useEffect() {} },
    "react-router-dom": { Navigate, Outlet, useLocation: () => ({ pathname, search: "" }) },
    "@/lib/AuthContext": { useAuth: () => auth },
    "@/components/UserNotRegisteredError": () => null,
  };
  return { mocks, Navigate, Outlet };
}

test("signed-out admin routes lead to admin sign-in and preserve the destination", () => {
  const { mocks, Navigate } = guard({ isAuthenticated: false, isLoadingAuth: false, authChecked: true }, "/admin/connections");
  const result = component("src/components/ProtectedRoute.jsx", mocks)({});
  assert.equal(result.type, Navigate);
  assert.equal(result.props.to, "/admin/login?returnTo=%2Fadmin%2Fconnections");
});

test("an expired session can reach the app sign-in without a redirect loop", () => {
  const { mocks, Navigate } = guard({ isAuthenticated: false, isLoadingAuth: false, authChecked: true, authError: { type: "auth_required" } }, "/cards");
  const result = component("src/components/ProtectedRoute.jsx", mocks)({});
  assert.equal(result.type, Navigate);
  assert.equal(result.props.to, "/login?returnTo=%2Fcards");
});

test("users cannot render admin routes; admins can", () => {
  for (const account of [user, admin]) {
    const { mocks, Navigate, Outlet } = guard({ user: account });
    const result = component("src/components/AdminRoute.jsx", mocks)({});
    assert.equal(result.type, account.role === "admin" ? Outlet : Navigate);
  }
});

test("user navigation omits Connections, API, issuing, and cardholder controls", () => {
  for (const account of [user, admin]) {
    const Dummy = () => null;
    const mocks = {
      "lucide-react": new Proxy({}, { get: () => Dummy }),
      "react-router-dom": { Link: Dummy, NavLink: Dummy, Outlet: Dummy, useLocation: () => ({ pathname: "/" }) },
      "@/lib/AuthContext": { useAuth: () => ({ user: account, logout() {} }) },
      "@/lib/utils": { cn: (...items) => items.filter(Boolean).join(" ") },
      "@/lib/format": { initials: () => "Z8" },
      "@/components/Brand": Dummy,
      "@/components/ui/button": { Button: Dummy },
    };
    const tree = JSON.stringify(component("src/components/Layout.jsx", mocks)({}));
    assert.equal(tree.includes('"/admin/connections"'), account.role === "admin");
    assert.equal(tree.includes('"/cardholders"'), account.role === "admin");
    assert.equal(tree.includes('"/cards?new=1"'), account.role === "admin");
  }
});

test("safe sign-in return paths reject external destinations and remove auth tokens", async () => {
  const { safeReturnTo } = await import("data:text/javascript;base64," + Buffer.from(read("src/lib/authReturnTo.js")).toString("base64"));
  const previous = globalThis.window;
  try {
    for (const [raw, expected] of [
      ["https://evil.example/path", "/"],
      ["//evil.example/path", "/"],
      ["/\\evil.example/path", "/"],
      ["/cards/local-card?access_token=secret&view=details", "/cards/local-card?view=details"],
    ]) {
      globalThis.window = { location: { origin: "https://z8.example", search: "?returnTo=" + encodeURIComponent(raw) } };
      assert.equal(safeReturnTo(), expected);
    }
  } finally { globalThis.window = previous; }
});
