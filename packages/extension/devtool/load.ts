export const loadDevtool = () => {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    import(".");
  }
};
