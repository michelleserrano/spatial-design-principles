import { useRef, useEffect, useState, useCallback } from "react";
import { GlassCard } from "./GlassCard";
import type { Principle } from "../data/principles";

interface PrincipleSectionProps {
  principle: Principle;
  index: number;
  onVisible: (index: number) => void;
  contextPhase?: number;
}

export function PrincipleSection({
  principle,
  index,
  onVisible,
  contextPhase,
}: PrincipleSectionProps) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  const handleIntersect = useCallback(
    ([entry]: IntersectionObserverEntry[]) => {
      const visible = entry.isIntersecting;
      setInView(visible);
      if (visible) onVisible(index);
    },
    [index, onVisible]
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersect, {
      threshold: 0,
      rootMargin: "0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersect]);

  return (
    <section className="principle-section" ref={ref}>
      <GlassCard
        principle={principle}
        isActive={inView}
        contextPhase={contextPhase}
      />
    </section>
  );
}
