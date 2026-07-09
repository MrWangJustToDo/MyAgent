import { useMemo, useRef } from "react";

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export const useCallbackRef = <T extends Function>(callback: T) => {
  const ref = useRef<T>(callback);

  ref.current = callback;

  return useMemo(
    () =>
      (...args: any[]) =>
        ref.current?.(...args),
    []
  ) as unknown as T;
};
