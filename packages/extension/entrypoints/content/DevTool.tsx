export const DevTool = () => {
  useEffect(() => {
    window.__MY_REACT_DEVTOOL_FORWARD__?.();
  }, []);

  return null;
};
