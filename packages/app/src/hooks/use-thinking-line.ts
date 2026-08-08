import { createState } from "reactivity-store";

export const useThinkingLine = createState(
  () => ({
    enabled: false,
    content: "",
  }),
  {
    withActions: (state) => ({
      setEnabled: (enabled: boolean) => {
        state.enabled = enabled;
      },
      toggle: (): boolean => {
        state.enabled = !state.enabled;
        return state.enabled;
      },
      setContent: (content: string) => {
        state.content = content;
      },
      getEnabled: (): boolean => state.enabled,
    }),
    withDeepSelector: false,
    withStableSelector: true,
    withNamespace: "useThinkingLine",
  }
);
