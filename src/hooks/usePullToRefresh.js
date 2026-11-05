import { useEffect, useRef, useState } from "react";

export const PULL_THRESHOLD = 70;
const MAX_PULL = 110;

/**
 * Touch pull-to-refresh for the app's main scroll container.
 * Only engages when the page is already at the top, so normal scrolling is untouched.
 */
export default function usePullToRefresh(onRefresh) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const distance = useRef(0);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    const start = (event) => {
      if (refreshing || event.touches.length !== 1 || window.scrollY > 0) return;
      // Never fight an open dialog or bottom sheet.
      if (document.querySelector('[role="dialog"]')) return;
      startY.current = event.touches[0].clientY;
      distance.current = 0;
    };

    const move = (event) => {
      if (startY.current === null || refreshing) return;
      const delta = event.touches[0].clientY - startY.current;
      if (delta <= 0 || window.scrollY > 0) {
        distance.current = 0;
        setPull(0);
        return;
      }
      distance.current = Math.min(MAX_PULL, delta * 0.5);
      setPull(distance.current);
    };

    const end = async () => {
      if (startY.current === null) return;
      startY.current = null;
      const reached = distance.current >= PULL_THRESHOLD;
      distance.current = 0;
      if (!reached) {
        setPull(0);
        return;
      }
      setRefreshing(true);
      setPull(PULL_THRESHOLD);
      try {
        await refreshRef.current?.();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    };

    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", end);
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
    };
  }, [refreshing]);

  return { pull, refreshing };
}