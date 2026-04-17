/**
 * Per-page Error Boundary
 * Catches rendering errors in individual page components and shows a friendly fallback.
 */
import React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
  pageName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PageErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[ErrorBoundary] Error in ${this.props.pageName ?? "page"}:`,
      error,
      info.componentStack
    );
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[400px] px-4">
          <Card className="p-10 max-w-md w-full text-center space-y-6">
            <div className="flex items-center justify-center w-16 h-16 bg-destructive/10 rounded-full mx-auto">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">
                Something went wrong
              </h2>
              <p className="text-sm text-muted-foreground">
                {this.props.pageName
                  ? `The ${this.props.pageName} page encountered an unexpected error.`
                  : "This page encountered an unexpected error."}
              </p>
              {this.state.error?.message && (
                <p className="text-xs font-mono text-muted-foreground bg-muted px-3 py-2 rounded mt-2">
                  {this.state.error.message}
                </p>
              )}
            </div>
            <div className="flex gap-3 justify-center">
              <Button onClick={this.handleReset} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
              <Button onClick={() => window.location.reload()}>
                Reload Page
              </Button>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
