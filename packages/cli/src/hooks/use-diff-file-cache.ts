import { createState } from "reactivity-store";

import type { DiffFile } from "@git-diff-view/core";

export const useDiffFileCache = createState(() => ({ state: {} as Record<string, DiffFile> }), {
  withActions: (s) => ({
    setDiffFile: (key: string, value: DiffFile) => {
      s.state[key] = value;
    },
    getDiffFile: (key: string) => s.state[key],
    clear: () => (s.state = {}),
  }),
});
