import { createState } from "reactivity-store";

export interface CommandOutputState {
  /** Lines to display (null = hidden) */
  lines: string[] | null;
  /** Title/header for the output panel */
  title: string;
}

export const useCommandOutput = createState(
  () => ({
    lines: null as string[] | null,
    title: "",
  }),
  {
    withActions: (state) => ({
      show: (title: string, content: string) => {
        state.title = title;
        state.lines = content.split("\n");
      },
      dismiss: () => {
        state.lines = null;
        state.title = "";
      },
    }),
    withDeepSelector: false,
    withStableSelector: true,
    withNamespace: "useCommandOutput",
  }
);
