import { Box } from "ink";
import TextInput from "ink-text-input";
import { useEffect, useRef, useState } from "react";

import { useArgs } from "../hooks/use-args.js";
import { useUserInput } from "../hooks/use-user-input.js";

export const UserInput = () => {
  const [input, setInput] = useState(() => useArgs.getReadonlyState().config.initialPrompt);
  // Increment to force TextInput remount (resets internal cursor to end)
  const [inputKey, setInputKey] = useState(0);
  const programmaticRef = useRef(false);

  useEffect(() => {
    if (!programmaticRef.current) {
      useUserInput.getActions().setValue(input);
    }
    programmaticRef.current = false;
  }, [input]);

  useEffect(() => {
    const cb = useUserInput.subscribe(
      (s) => s.value,
      () => {
        const v = useUserInput.getReadonlyState().value;
        if (v !== input) {
          programmaticRef.current = true;
          setInput(v);
          // Force remount so cursor resets to end of new value
          setInputKey((k) => k + 1);
        }
      }
    );

    return cb;
  }, []);

  // Key on Box forces TextInput remount to reset internal cursor position
  return (
    <Box key={inputKey}>
      <TextInput value={input} onChange={setInput} />
    </Box>
  );
};
