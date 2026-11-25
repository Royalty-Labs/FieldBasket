import { useCallback } from "react";

/**
 * Fades a section in the first time it scrolls into view. The class is
 * toggled on the element directly, so nothing re-renders. Without
 * IntersectionObserver (or with reduced motion, via CSS) it just shows.
 */
export function useReveal<T extends HTMLElement>() {
  return useCallback((node: T | null) => {
    if (!node) return;
    if (!("IntersectionObserver" in window)) {
      node.classList.add("is-visible");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
}
