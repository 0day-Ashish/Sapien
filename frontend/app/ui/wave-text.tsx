"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Large display text whose letters float up and down in a slow ripple. The font size is fitted
 * to the container so the line never runs off screen. Transform-only motion, off for reduced motion.
 */
export function WaveText({ text, className = "" }: { text: string; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const ruler = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState<number | null>(null);

  useLayoutEffect(() => {
    const container = box.current?.parentElement;
    const el = ruler.current;
    if (!container || !el) return;
    const fit = () => {
      if (el.offsetWidth) setFontSize(Math.min(256, (container.clientWidth * 0.96 * 100) / el.offsetWidth));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => observer.disconnect();
  }, [text]);

  return (
    <span ref={box} className={`relative block w-full ${className}`} style={fontSize ? { fontSize: `${fontSize}px` } : undefined}>
      <span className="sr-only">{text}</span>
      <span ref={ruler} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap" style={{ fontSize: "100px" }}>
        {text}
      </span>
      <span aria-hidden="true" className="inline-block whitespace-nowrap pb-[0.18em]">
        {Array.from(text).map((ch, i) => (
          <span key={i} className="wave-letter inline-block" style={{ animationDelay: `${i * 110}ms` }}>
            {ch === " " ? " " : ch}
          </span>
        ))}
      </span>
    </span>
  );
}
