import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { isChunkLoadError, handleChunkLoadError } from "../utils/versionManager";

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
    if (isChunkLoadError(error)) {
      handleChunkLoadError(error);
    }
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public handleUpdateSystem = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      const isChunkError = isChunkLoadError(this.state.error);

      if (isChunkError) {
        return (
          <div
            id="error-boundary-chunk-fallback"
            role="alert"
            className="bg-white border border-blue-200 rounded-xl p-6 my-4 shadow-sm text-center max-w-xl mx-auto"
          >
            <div className="flex justify-center mb-3">
              <div className="w-12 h-12 bg-blue-50 text-[#0B2E59] rounded-full flex items-center justify-center">
                <RefreshCw size={24} />
              </div>
            </div>
            <h2 className="text-base font-extrabold text-gray-800 mb-1">
              Uma nova versão do sistema foi publicada. Clique para atualizar.
            </h2>
            <p className="text-xs text-gray-600 max-w-md mx-auto mb-4">
              Seus dados e rascunhos locais estão totalmente preservados. Clique no botão abaixo para carregar a versão mais recente da aplicação.
            </p>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                id="btn-update-system-chunk"
                onClick={this.handleUpdateSystem}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B2E59] hover:bg-[#082242] text-white text-xs font-bold rounded-lg transition-colors shadow-sm cursor-pointer"
              >
                <RefreshCw size={14} />
                Atualizar sistema
              </button>
            </div>
          </div>
        );
      }

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

