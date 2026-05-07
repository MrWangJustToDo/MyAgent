import { Button } from "@heroui/react";
import { AlertTriangleIcon } from "lucide-react";
import { Component } from "react";

import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
          <AlertTriangleIcon className="text-danger h-10 w-10" />
          <h2 className="text-sm font-semibold">Something went wrong</h2>
          <p className="text-default-500 max-w-xs text-center text-xs">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <Button
            size="sm"
            color="primary"
            variant="flat"
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
