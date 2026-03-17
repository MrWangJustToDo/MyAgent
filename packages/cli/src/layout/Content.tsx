import { Static } from "ink";
import { memo, type JSX } from "react";

import { useStatic } from "../hooks/useStatic";

export const Content = memo(() => {
  const { head, list, key } = useStatic((s) => ({ list: s.state, head: s.header, key: s.remountKey }));

  const typedList = list as JSX.Element[];

  const validList = [head, ...typedList].filter(Boolean);

  return (
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    <Static key={key} items={validList}>
      {(item) => item}
    </Static>
  );
});

Content.displayName = "Content";
