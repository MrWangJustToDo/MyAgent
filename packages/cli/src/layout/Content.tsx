/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Static } from "ink";
import { memo, type JSX } from "react";

import { useDynamic } from "../hooks/use-dynamic";
import { useStatic } from "../hooks/use-static";

export const Content = memo(() => {
  const { head, list, key } = useStatic((s) => ({ list: s.list, head: s.header, key: s.remountKey }));

  const dynamicList = useDynamic((s) => s.list);

  const typedList = list as JSX.Element[];

  const validList = [head, ...typedList].filter(Boolean);

  return (
    <>
      {/* @ts-ignore */}
      <Static key={key} items={validList}>
        {(item) => item}
      </Static>
      {dynamicList}
    </>
  );
});

Content.displayName = "Content";
