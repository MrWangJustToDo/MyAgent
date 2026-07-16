import { createState } from "reactivity-store";

const ANIMATION_INTERVAL = 100;
const PHASE_STEP = 1 / 30;

export const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

type IntervalId = ReturnType<typeof setInterval>;

export const useGlobalSpinner = createState(() => ({ frame: 0, phase: 0 }), {
  withActions: (s) => {
    let intervalId: IntervalId | null = null;
    let activeCount = 0;

    return {
      init: () => {
        activeCount++;
        if (intervalId !== null) return;
        intervalId = setInterval(() => {
          s.frame = (s.frame + 1) % frames.length;
          s.phase = (s.phase + PHASE_STEP) % 1;
        }, ANIMATION_INTERVAL);
      },
      dispose: () => {
        activeCount--;
        if (activeCount > 0) return;
        if (intervalId !== null) {
          clearInterval(intervalId);
          intervalId = null;
        }
        activeCount = 0;
      },
    };
  },
  // withNamespace: "useGlobalSpinner",
  withStableSelector: true,
});
