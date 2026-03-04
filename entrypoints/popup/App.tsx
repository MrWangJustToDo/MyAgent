import { Card, CardBody, CardHeader, Divider, Input, Listbox, ListboxItem } from "@heroui/react";
import useSWR from "swr";

import { Logo } from "@/components/logo";
import { useOllamaModal } from "@/hooks/useOllamaModal";
import { useOllamaStatus } from "@/hooks/useOllamaStatus";
import { useSyncConfig } from "@/hooks/useSyncConfig";

const { check } = useOllamaStatus.getActions();

function App() {
  const connect = useOllamaStatus((s) => s.state);

  const { url, setUrl } = useOllamaConfig();

  const { selected, setSelected, list } = useOllamaModal();

  useSWR(`state-${url}`, check);

  useSyncConfig({ side: "popup" });

  const selectedSet = useMemo(() => new Set<string>().add(selected), [selected]);

  return (
    <div className="p-2">
      <Card className="min-w-[300px]" radius="sm">
        <CardHeader className="relative flex items-center justify-between">
          <Logo className={`w-[1.8em] ${connect ? "text-green-500" : "text-red-500"}`} />
          Ollama Translate
        </CardHeader>
        <Divider />
        <CardBody>
          <Input label="Ollama api" isRequired value={url} onChange={(s) => setUrl(s.target.value)} />
          <br />
          <div className="max-h-60 overflow-auto">
            <Listbox
              disallowEmptySelection
              aria-label="Single selection example"
              selectedKeys={selectedSet}
              selectionMode="single"
              variant="flat"
              onSelectionChange={(set) => {
                if (set) {
                  const typedSet = set as Set<string>;

                  setSelected(Array.from(typedSet)[0]);
                } else {
                  setSelected("");
                }
              }}
            >
              {list.map((i) => (
                <ListboxItem key={i.key}>{i.label}</ListboxItem>
              ))}
            </Listbox>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export default App;
