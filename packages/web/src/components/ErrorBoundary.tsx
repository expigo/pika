"use client";

import * as Sentry from "@sentry/nextjs";
import React, { type ErrorInfo, type ReactNode } from "react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center">
          <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-2xl max-w-md">
            <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">
              Something went wrong
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4 text-sm">
              We encountered an unexpected error while loading this component.
            </p>
            <div className="text-xs font-mono bg-white dark:bg-slate-900 p-3 rounded mb-4 overflow-auto max-h-32 text-left">
              {this.state.error?.message}
            </div>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-full font-medium text-sm hover:opacity-90 transition-opacity"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
