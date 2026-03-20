import TextInput from "ink-text-input";
import { useEffect, useState } from "react";

import { useArgs } from "../hooks/use-args.js";
import { useUserInput } from "../hooks/use-user-input.js";

export const UserInput = () => {
  const [input, setInput] = useState(() => useArgs.getReadonlyState().config.initialPrompt);

  useEffect(() => {
    useUserInput.getActions().setValue(input);
  }, [input]);

  useEffect(() => {
    const cb = useUserInput.subscribe(
      (s) => s.value,
      () => {
        const v = useUserInput.getReadonlyState().value;
        if (!v) {
          setInput("");
        }
      }
    );

    return cb;
  }, []);

  return <TextInput value={input} onChange={setInput} />;
};
