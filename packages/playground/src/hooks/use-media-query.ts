import { useEffect, useState } from "react";

/**
 * Subscribe to a single media query.
 *
 * Deliberately thin: this is the only `matchMedia` primitive in the playground.
 * Anything that needs to react to viewport size should go through
 * {@link useBreakpoint} instead, so layout structure has one owner.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
