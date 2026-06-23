import { Children, Fragment, isValidElement, type ReactNode } from "react";

export const SplitNode = ({ split, children }: { split: ReactNode; children: ReactNode }) => {
  const childList: ReactNode[] = [];

  Children.forEach(children, (v) => {
    if (isValidElement(v)) {
      childList.push(v);
    }
  });

  return (
    <>
      {childList.map((i, index, arr) => {
        if (index !== arr.length - 1) {
          return (
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            <Fragment key={index}>
              {i}
              {split}
            </Fragment>
          );
        } else {
          return i;
        }
      })}
    </>
  );
};
