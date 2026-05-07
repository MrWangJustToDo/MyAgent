import { Chip } from "@heroui/react";
import { isToolUIPart, getToolName } from "ai";
import { ListTodoIcon } from "lucide-react";

import type { UIMessage } from "ai";

interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}

interface TodoListProps {
  message: UIMessage;
}

export const TodoList = ({ message }: TodoListProps) => {
  const todos = extractTodos(message);
  if (!todos || todos.length === 0) return null;

  return (
    <div className="border-default-200 bg-default-50 mt-1.5 rounded border p-2 text-xs">
      <div className="text-default-600 mb-1 flex items-center gap-1 font-medium">
        <ListTodoIcon className="h-3.5 w-3.5" />
        Tasks
      </div>
      <div className="space-y-0.5">
        {todos.map((todo) => (
          <div key={todo.id} className="flex items-center gap-1.5">
            <StatusBadge status={todo.status} />
            <span className={todo.status === "completed" ? "text-default-400 line-through" : ""}>{todo.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const StatusBadge = ({ status }: { status: TodoItem["status"] }) => {
  const config = {
    pending: { color: "default" as const, label: "pending" },
    in_progress: { color: "warning" as const, label: "active" },
    completed: { color: "success" as const, label: "done" },
    cancelled: { color: "danger" as const, label: "cancel" },
  };
  const { color, label } = config[status];
  return (
    <Chip size="sm" variant="dot" color={color} className="h-4 text-[9px]">
      {label}
    </Chip>
  );
};

function extractTodos(message: UIMessage): TodoItem[] | null {
  for (const part of message.parts) {
    if (isToolUIPart(part) && getToolName(part) === "todo" && part.state === "output-available") {
      const result = part.output as { todos?: TodoItem[] } | undefined;
      if (result?.todos) return result.todos;
    }
  }
  return null;
}
