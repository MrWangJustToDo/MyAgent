import { Button, Chip } from "@heroui/react";
import { HelpCircleIcon } from "lucide-react";
import { useState } from "react";

interface AskUserViewProps {
  question: string;
  options?: string[];
  multiSelect?: boolean;
  onSubmit: (answer: string) => void;
}

export const AskUserView = ({ question, options, multiSelect, onSubmit }: AskUserViewProps) => {
  const [freeform, setFreeform] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const hasOptions = options && options.length > 0;

  const toggleOption = (value: string) => {
    if (multiSelect) {
      setSelected((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
    } else {
      setSelected([value]);
    }
  };

  const submitSelection = () => {
    if (multiSelect) {
      if (selected.length === 0) return;
      onSubmit(selected.join(", "));
    } else if (selected[0]) {
      onSubmit(selected[0]);
    }
  };

  const submitFreeform = () => {
    const answer = freeform.trim();
    if (!answer) return;
    onSubmit(answer);
  };

  return (
    <div className="border-primary-200 bg-primary-50 mb-1 rounded border p-2 text-xs">
      <div className="mb-1.5 flex items-center gap-1.5">
        <HelpCircleIcon className="text-primary h-3.5 w-3.5" />
        <span className="text-primary-700 font-medium">Agent Question</span>
        <Chip size="sm" variant="flat" color="primary" className="h-5 text-[10px]">
          ask_user
        </Chip>
      </div>
      <p className="text-default-700 mb-2 text-sm whitespace-pre-wrap">{question}</p>

      {hasOptions ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {options.map((opt) => {
              const active = selected.includes(opt);
              return (
                <Button
                  key={opt}
                  size="sm"
                  variant={active ? "solid" : "flat"}
                  color={active ? "primary" : "default"}
                  className="h-6 min-w-0 text-xs"
                  onPress={() => toggleOption(opt)}
                >
                  {opt}
                </Button>
              );
            })}
          </div>
          <Button
            size="sm"
            color="primary"
            className="h-6 text-xs"
            onPress={submitSelection}
            isDisabled={selected.length === 0}
          >
            Submit {multiSelect ? "selection" : "answer"}
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={freeform}
            onChange={(e) => setFreeform(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitFreeform();
              }
            }}
            placeholder="Type your answer..."
            className="border-default-200 bg-default-50 focus:border-primary flex-1 rounded border px-2 py-1 text-sm outline-none"
          />
          <Button
            size="sm"
            color="primary"
            className="h-7 text-xs"
            onPress={submitFreeform}
            isDisabled={!freeform.trim()}
          >
            Reply
          </Button>
        </div>
      )}
    </div>
  );
};
