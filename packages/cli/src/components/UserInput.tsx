import TextInput from "ink-text-input";
import { useEffect, useState } from "react";

import { useArgs } from "../hooks/useArgs.js";
import { useUserInput } from "../hooks/useUserInput.js";

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
