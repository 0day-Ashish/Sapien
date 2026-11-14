"use client";

import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect } from "react";

/**
 * Smooth page scrolling (Lenis). Scroll panels inside the page keep their own native scroll,
 * in-page anchor links glide to their target, and people who ask for reduced motion get the
 * browser's plain scrolling.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: true, anchors: true, allowNestedScroll: true });
    return () => lenis.destroy();
  }, []);
  return null;
}
