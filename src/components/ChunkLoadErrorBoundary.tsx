import React from "react";
import { Button } from "@/components/ui/button";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error?: Error;
};

const RELOAD_GUARD_KEY = "__lovable_chunk_reload_ts__";

function isLikelyChunkLoadError(error?: Error) {
  const message = (error?.message ?? "").toLowerCase();

  return (
    message.includes("dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("loading chunk") ||
    message.includes("chunkloaderror") ||
    message.includes("failed to fetch")
  );
}

function hasRecentlyReloaded() {
  const raw = sessionStorage.getItem(RELOAD_GUARD_KEY);
  const ts = raw ? Number(raw) : 0;
  if (!Number.isFinite(ts) || ts <= 0) return false;
  return Date.now() - ts < 30_000;
}

export default class ChunkLoadErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidUpdate() {
    if (!this.state.hasError) return;

    // Auto-recover once if this looks like a cached/old chunk issue after a deploy.
    if (isLikelyChunkLoadError(this.state.error) && !hasRecentlyReloaded()) {
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
      window.location.reload();
    }
  }

  private handleReload = () => {
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const chunkError = isLikelyChunkLoadError(this.state.error);

    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold">
            {chunkError ? "Update available" : "Something went wrong"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {chunkError
              ? "Your browser may be using an older cached version. Refresh to load the latest update."
              : "Please refresh the page. If the issue persists, let me know what screen you were on."}
          </p>

          <div className="mt-4">
            <Button onClick={this.handleReload} className="w-full">
              Refresh
            </Button>
          </div>

          {import.meta.env.DEV && this.state.error?.message ? (
            <pre className="mt-4 whitespace-pre-wrap rounded-md bg-muted p-3 text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
          ) : null}
        </div>
      </div>
    );
  }
}
