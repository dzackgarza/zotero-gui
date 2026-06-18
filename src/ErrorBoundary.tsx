import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-red-500/30 rounded-lg p-6 max-w-4xl w-full shadow-2xl">
            <h1 className="text-xl font-bold text-red-500 mb-2 flex items-center gap-2">
              <span className="text-2xl">⚠️</span> Application Render Error
            </h1>
            <p className="text-slate-400 text-sm mb-4">
              The application encountered an unexpected error during rendering. This is typically caused by a bad state update or a type mismatch.
            </p>
            
            <div className="bg-slate-950 rounded border border-slate-800 p-4 overflow-x-auto mb-4">
              <h2 className="text-red-400 font-mono text-sm font-semibold mb-2">Error Details</h2>
              <pre className="text-red-300 text-xs font-mono whitespace-pre-wrap">
                {this.state.error?.toString()}
              </pre>
            </div>

            {this.state.errorInfo && (
              <div className="bg-slate-950 rounded border border-slate-800 p-4 overflow-x-auto mb-6">
                <h2 className="text-slate-400 font-mono text-sm font-semibold mb-2">Component Stack Trace</h2>
                <pre className="text-slate-500 text-[10px] font-mono whitespace-pre-wrap leading-relaxed">
                  {this.state.errorInfo.componentStack}
                </pre>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-semibold text-sm transition border border-slate-700"
              >
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
