import { AnimatePresence, motion } from "framer-motion";
import { useLocation, useOutlet } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTabStack } from "@/lib/TabStackContext";

const OFFSET = 34;

const slide = {
  enter: (direction) => ({
    opacity: 0,
    x: direction === "back" ? -OFFSET : direction === "forward" ? OFFSET : 0,
  }),
  center: { opacity: 1, x: 0 },
  exit: (direction) => ({
    opacity: 0,
    x: direction === "back" ? OFFSET : direction === "forward" ? -OFFSET : 0,
  }),
};

export default function PageTransition() {
  const location = useLocation();
  const outlet = useOutlet();
  const isMobile = useIsMobile();
  const { direction } = useTabStack();

  // Desktop keeps the original subtle fade-in with no exit choreography.
  if (!isMobile) {
    return (
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {outlet}
      </motion.div>
    );
  }

  return (
    <AnimatePresence mode="wait" initial={false} custom={direction}>
      <motion.div
        key={location.pathname}
        custom={direction}
        variants={slide}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}