import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { consumeScrollRestore, rememberScreen, scrollFor } from "@/lib/tabStack";

const getHashId = (hash) => {
  const rawId = hash.slice(1);

  try {
    return decodeURIComponent(rawId);
  } catch {
    return rawId;
  }
};

export default function ScrollToTop() {
  const { pathname, search, hash } = useLocation();
  const navigationType = useNavigationType();
  const previous = useRef(null);

  useEffect(() => {
    const current = `${pathname}${search}`;
    const from = previous.current;
    previous.current = current;

    // Keep each tab's stack: note where the screen being left was scrolled to.
    if (from && from !== current) {
      const fromUrl = new URL(from, window.location.origin);
      rememberScreen(fromUrl.pathname, fromUrl.search, window.scrollY);
    }

    if (consumeScrollRestore() === current) {
      const top = scrollFor(current);
      const timer = window.setTimeout(() => window.scrollTo({ top, left: 0, behavior: "instant" }), 80);
      return () => window.clearTimeout(timer);
    }

    if (navigationType === "POP") return;

    if (hash) {
      const id = getHashId(hash);
      const timer = window.setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      }, 50);
      return () => window.clearTimeout(timer);
    }

    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, search, hash, navigationType]);

  return null;
}