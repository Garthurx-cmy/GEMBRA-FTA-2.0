import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary caught component error]:", error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          id="error-boundary-fallback"
          role="alert"
          className="bg-white border border-red-200 rounded-xl p-6 my-4 shadow-sm text-center max-w-xl mx-auto"
        >
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center">
              <AlertTriangle size={24} />
            </div>
          </div>
          <h2 className="text-base font-extrabold text-gray-800 mb-1">
            {this.props.fallbackTitle || "Ocorreu um problema ao exibir esta tela"}
          </h2>
          <p className="text-xs text-gray-600 max-w-md mx-auto mb-4">
            {this.state.error?.message || "Erro inesperado de renderização. Seus dados e rascunho foram preservados."}
          </p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0B2E59] hover:bg-[#082242] text-white text-xs font-bold rounded-lg transition-colors shadow-sm cursor-pointer"
            >
              <RefreshCw size={14} />
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
