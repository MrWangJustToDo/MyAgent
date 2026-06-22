import { debounce } from "lodash-es";
import { useMemo, useState } from "react";

export const useForceUpdate = ({ time }: { time: number }) => {
  const [_, setNum] = useState(0);

  return useMemo(() => debounce(() => setNum((i) => i + 1), time), [time]);
};
