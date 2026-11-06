const STORAGE_KEY = "z8.tabStack";
const RESTORE_KEY = "z8.scrollRestore";
const MAX_STACK = 20;

// Tab identity -> the routes that belong to it. Detail screens keep their tab.
const TABS = [
  { root: "/", matches: (path) => path === "/" || path === "/admin" },
  { root: "/cards", matches: (path) => path.startsWith("/cards") },
  { root: "/account", matches: (path) => path.startsWith("/account") },
  { root: "/cardholders", matches: (path) => path.startsWith("/cardholders") },
  { root: "/activity", matches: (path) => path.startsWith("/activity") },
  { root: "/admin/funds", matches: (path) => path.startsWith("/admin/funds") },
  { root: "/verification", matches: (path) => path.startsWith("/verification") },
  { root: "/admin/connections", matches: (path) => path.startsWith("/admin/connections") || path.startsWith("/settings") },
];

export function tabFor(pathname = "") {
  const tab = TABS.find((entry) => entry.matches(pathname));
  return tab ? tab.root : null;
}

function read() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
    return { scroll: parsed.scroll || {}, stacks: parsed.stacks || {} };
  } catch {
    return { scroll: {}, stacks: {} };
  }
}

function write(state) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode or restricted WebView: stack memory simply resets */
  }
}

export function loadStacks() {
  return read().stacks;
}

/** Append the screen to its tab's stack (the last entry is the tab's current screen). */
export function pushScreen(pathname, search = "") {
  const root = tabFor(pathname);
  if (!root) return;
  const key = `${pathname}${search || ""}`;
  const state = read();
  const stack = state.stacks[root] || [];
  if (stack[stack.length - 1] !== key) stack.push(key);
  state.stacks[root] = stack.slice(-MAX_STACK);
  write(state);
}

/** Pop a tab back to its root screen. */
export function resetStack(root, baseKey) {
  if (!root) return;
  const state = read();
  state.stacks[root] = baseKey ? [baseKey] : [];
  write(state);
}

/** Remember where a screen was scrolled to, so returning to it feels native. */
export function rememberScreen(pathname, search = "", scrollY = 0) {
  const root = tabFor(pathname);
  if (!root) return;
  const state = read();
  const key = `${pathname}${search || ""}`;
  state.scroll[key] = Math.max(0, Math.round(scrollY || 0));
  write(state);
}

export function scrollFor(key) {
  return read().scroll[key] || 0;
}

/** Ask the next navigation to restore the saved scroll position instead of jumping to the top. */
export function requestScrollRestore(key) {
  try {
    sessionStorage.setItem(RESTORE_KEY, key);
  } catch {
    /* ignore */
  }
}

export function consumeScrollRestore() {
  try {
    const value = sessionStorage.getItem(RESTORE_KEY);
    sessionStorage.removeItem(RESTORE_KEY);
    return value;
  } catch {
    return null;
  }
}
