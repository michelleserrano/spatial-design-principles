import { useState, useEffect, useCallback } from "react";

export function useScrollProgress(sectionCount: number) {
  const [progress, setProgress] = useState(0);
  const [continuousIndex, setContinuousIndex] = useState(0);

  const onScroll = useCallback(() => {
    const scrollY = window.scrollY;
    const maxScroll = document.body.scrollHeight - window.innerHeight;
    const p = maxScroll > 0 ? scrollY / maxScroll : 0;
    setProgress(p);
    // Continuous float: e.g. 2.7 = 70% through section 2→3
    setContinuousIndex(p * sectionCount);
  }, [sectionCount]);

  useEffect(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  return { progress, continuousIndex };
}
