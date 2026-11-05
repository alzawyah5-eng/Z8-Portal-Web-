import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { loadStacks, pushScreen, resetStack, tabFor } from "@/lib/tabStack";

const TabStackContext = createContext({
  stacks: {},
  direction: "none",
  currentRoot: null,
  topFor: () => null,
  depthFor: () => 0,
  resetTab: () => {},
});

/**
 * Tracks one navigation stack per bottom tab, plus the direction of the last
 * transition so screens can push in from the right and pop back out to it.
 */
export function TabStackProvider({ children }) {
  const { pathname, search, key: locationKey } = useLocation();
  const navigationType = useNavigationType();
  const root = tabFor(pathname);

  const [stacks, setStacks] = useState(() => loadStacks());
  const [direction, setDirection] = useState("none");
  const previousRoot = useRef(root);

  useEffect(() => {
    if (!root) {
      setDirection("none");
      return;
    }

    pushScreen(pathname, search);
    setStacks(loadStacks());

    const switchedTabs = previousRoot.current !== null && previousRoot.current !== root;
    previousRoot.current = root;

    if (switchedTabs) setDirection("none");
    else if (navigationType === "POP") setDirection("back");
    else setDirection("forward");
  }, [pathname, search, locationKey, navigationType, root]);

  const topFor = useCallback((tab) => {
    const stack = stacks[tab] || [];
    return stack[stack.length - 1] || null;
  }, [stacks]);

  const depthFor = useCallback((tab) => (stacks[tab] || []).length, [stacks]);

  const resetTab = useCallback((tab, baseKey) => {
    resetStack(tab, baseKey);
    setStacks(loadStacks());
  }, []);

  const value = useMemo(
    () => ({ stacks, direction, currentRoot: root, topFor, depthFor, resetTab }),
    [stacks, direction, root, topFor, depthFor, resetTab]
  );

  return <TabStackContext.Provider value={value}>{children}</TabStackContext.Provider>;
}

export function useTabStack() {
  return useContext(TabStackContext);
}