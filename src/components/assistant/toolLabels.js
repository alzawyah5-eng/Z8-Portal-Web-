// Plain-language names for the steps an assistant takes, so a conversation
// reads "Looked up clients" instead of "read_Cardholder".

const ENTITY_NAMES = {
  Cardholder: ["client", "clients"],
  CardholderApplication: ["verification application", "verification applications"],
  Card: ["card", "cards"],
  CardTransaction: ["card activity", "card activity"],
  CardRequest: ["card request", "card requests"],
  ProgrammeSettings: ["programme setting", "programme settings"],
  PhotonPayLog: ["PhotonPay request log", "PhotonPay request log"],
  User: ["account", "accounts"],
};

const ENTITY_VERBS = {
  read: ["Looking up", "Looked up", "Couldn't look up"],
  create: ["Saving", "Saved", "Couldn't save"],
  update: ["Updating", "Updated", "Couldn't update"],
  delete: ["Removing", "Removed", "Couldn't remove"],
};

// photonpayCards actions, as [running, done, failed].
const CARD_ACTIONS = {
  status: ["Checking the PhotonPay connection", "Checked the PhotonPay connection", "Couldn't reach PhotonPay"],
  balance: ["Checking the programme balance", "Checked the programme balance", "Couldn't read the balance"],
  list: ["Reading cards at PhotonPay", "Read cards at PhotonPay", "Couldn't read cards at PhotonPay"],
  bins: ["Reading available card ranges", "Read available card ranges", "Couldn't read card ranges"],
  issue: ["Applying for the card at PhotonPay", "Applied for the card at PhotonPay", "PhotonPay didn't accept the card"],
  resolve: ["Checking the card application", "Checked the card application", "Couldn't check the application"],
  refresh: ["Refreshing the card", "Refreshed the card", "Couldn't refresh the card"],
  detail: ["Fetching card details", "Fetched card details", "Couldn't fetch card details"],
  freeze: ["Freezing the card", "Froze the card", "Couldn't freeze the card"],
  unfreeze: ["Unfreezing the card", "Unfroze the card", "Couldn't unfreeze the card"],
  cancel: ["Cancelling the card", "Cancelled the card", "Couldn't cancel the card"],
  sync_holders: ["Syncing clients from PhotonPay", "Synced clients from PhotonPay", "Couldn't sync clients"],
  update_card: ["Updating card settings", "Updated card settings", "Couldn't update card settings"],
  unblock_cvv: ["Unblocking the CVV", "Unblocked the CVV", "Couldn't unblock the CVV"],
};

const FUNCTION_NAMES = {
  photonpayDiagnostics: ["Running connection diagnostics", "Ran connection diagnostics", "Diagnostics didn't finish"],
  photonpayTransactionSync: ["Syncing transactions", "Synced transactions", "Couldn't sync transactions"],
  sendProgrammeAlert: ["Sending an alert", "Sent an alert", "Couldn't send the alert"],
};

function parse(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

const RUNNING = ["pending", "running", "in_progress"];
const FAILED = ["failed", "error"];

export function toolState(toolCall) {
  const results = parse(toolCall.results);
  const running = RUNNING.includes(toolCall.status);
  const failed = !running && (FAILED.includes(toolCall.status)
    || Boolean(results && typeof results === "object" && !Array.isArray(results) && (results.error || results.success === false)));
  return { running, failed, results, args: parse(toolCall.arguments_string) };
}

function humanise(name) {
  return String(name || "Step").replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (c) => c.toUpperCase());
}

// [label, short outcome] for one step.
export function describeTool(toolCall) {
  const { running, failed, results, args } = toolState(toolCall);
  const pick = (triple) => triple[running ? 0 : failed ? 2 : 1];
  const name = String(toolCall.name || "");
  const projection = toolCall.display_projection || {};
  const projected = running ? projection.active_label : failed ? projection.error_label : projection.label;

  let label = "";
  const entityMatch = name.match(/^(read|create|update|delete)_(\w+)$/);
  if (entityMatch) {
    const [, verb, entity] = entityMatch;
    const [one, many] = ENTITY_NAMES[entity] || [humanise(entity).toLowerCase(), humanise(entity).toLowerCase()];
    label = `${pick(ENTITY_VERBS[verb])} ${verb === "read" ? many : one}`;
  } else if (name === "photonpayCards") {
    const action = String(args?.action || "");
    label = CARD_ACTIONS[action] ? pick(CARD_ACTIONS[action]) : `${running ? "Working with" : "Used"} PhotonPay${action ? ` (${humanise(action).toLowerCase()})` : ""}`;
  } else if (FUNCTION_NAMES[name]) {
    label = pick(FUNCTION_NAMES[name]);
  } else {
    label = projected || humanise(name);
  }

  let outcome = "";
  if (!running && !failed) {
    if (Array.isArray(results)) outcome = results.length ? `${results.length} found` : "none found";
    else if (results && typeof results === "object" && Array.isArray(results.items)) outcome = results.items.length ? `${results.items.length} found` : "none found";
  }
  if (failed && results && typeof results === "object" && typeof results.error === "string") outcome = results.error;
  return { label, outcome, running, failed, results, args };
}
