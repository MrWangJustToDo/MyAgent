import { Button, Popover, PopoverContent, PopoverTrigger } from "@heroui/react";
import { SendIcon, SquareIcon, XIcon, ImageIcon } from "lucide-react";
import { useRef, useState, useCallback } from "react";

import { useServerConfig } from "@/hooks/useServerConfig";

import type { FileUIPart } from "ai";

interface ChatInputProps {
  onSend: (text: string, files?: FileUIPart[]) => void;
  isLoading: boolean;
  onStop: () => void;
}

export const ChatInput = ({ onSend, isLoading, onStop }: ChatInputProps) => {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<FileUIPart[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const serverUrl = useServerConfig((s) => s.url);

  const handleStop = useCallback(() => {
    onStop();
    fetch(`${serverUrl}/api/chat/stop`, { method: "POST" }).catch(() => {});
  }, [onStop, serverUrl]);

  const handleSubmit = useCallback(() => {
    const text = value.trim();
    if ((!text && attachments.length === 0) || isLoading) return;
    onSend(text, attachments.length > 0 ? attachments : undefined);
    setValue("");
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, attachments, isLoading, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const addImageFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    const newParts: FileUIPart[] = [];
    for (const file of imageFiles) {
      if (file.size > 10 * 1024 * 1024) continue;
      const dataUrl = await fileToDataUrl(file);
      newParts.push({
        type: "file",
        mediaType: file.type,
        filename: file.name,
        url: dataUrl,
      });
    }
    if (newParts.length > 0) {
      setAttachments((prev) => [...prev, ...newParts]);
    }
  }, []);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      addImageFiles(imageFiles);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const hasContent = value.trim() || attachments.length > 0;

  return (
    <div className="border-divider shrink-0 border-t p-2">
      {attachments.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {attachments.map((att, i) => (
            <div key={i} className="group relative">
              <Popover placement="top">
                <PopoverTrigger>
                  <button className="bg-default-100 h-12 w-12 overflow-hidden rounded">
                    <img src={att.url} alt={att.filename} className="h-full w-full object-cover" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="p-1">
                  <img src={att.url} alt={att.filename} className="max-h-64 max-w-64 rounded object-contain" />
                </PopoverContent>
              </Popover>
              <button
                className="bg-danger absolute -top-0.5 -right-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full opacity-0 group-hover:opacity-100"
                onClick={() => removeAttachment(i)}
              >
                <XIcon className="h-2.5 w-2.5 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Send a message... (Ctrl+V to paste image)"
          rows={1}
          className="border-default-200 bg-default-50 placeholder:text-default-400 focus:border-primary min-h-[36px] flex-1 resize-none rounded-lg border px-3 py-2 text-sm transition-colors outline-none"
          style={{ maxHeight: "120px" }}
        />
        {isLoading ? (
          <Button isIconOnly size="sm" color="danger" variant="flat" onPress={handleStop} title="Stop">
            <SquareIcon className="h-4 w-4" />
          </Button>
        ) : (
          <Button isIconOnly size="sm" color="primary" onPress={handleSubmit} isDisabled={!hasContent} title="Send">
            {attachments.length > 0 && !value.trim() ? (
              <ImageIcon className="h-4 w-4" />
            ) : (
              <SendIcon className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
};
