import { Component } from "react";

/**
 * Top-level error boundary — catches render crashes anywhere below it and
 * shows a recoverable UI instead of a white screen.
 *
 * Robustness:
 * - Logs the error via console.error and optional `onError` prop so it can be
 *   forwarded to an external reporter (e.g. Sentry) without importing it here.
 * - Offers both reload and retry (reset) — retry clears the error state and
 *   re-renders children, which is enough when the crash was transient (e.g.
 *   a lazy chunk failed to load once).
 * - `resetKeys` — when any key changes, the boundary resets automatically.
 *   Useful for route changes: navigating away from a crashed screen clears it.
 * - Respects `fallback` prop for custom error UIs per subtree.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Always log so the dev console shows what happened
    console.error("Application render error", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps) {
    if (!this.state.hasError) return;
    const { resetKeys } = this.props;
    if (!resetKeys || !prevProps.resetKeys) return;
    const changed = resetKeys.some((k, i) => k !== prevProps.resetKeys[i]);
    if (changed) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  handleReload = () => {
    try {
      window.location.reload();
    } catch {
      // Fallback if reload is blocked (e.g. in tests)
      this.reset();
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) {
      const Fallback = this.props.fallback;
      if (typeof Fallback === "function")
        return <Fallback error={this.state.error} reset={this.reset} />;
      return Fallback;
    }

    return (
      <main className="login-wrap" role="alert" aria-live="assertive">
        <div className="login-card">
          <h1>{this.props.title || "Something went wrong"}</h1>
          <p className="muted">
            {this.props.message || "Please reload the app and try again."}
          </p>
          {this.props.showDetails && this.state.error && (
            <pre
              className="small muted"
              style={{
                textAlign: "left",
                overflow: "auto",
                maxHeight: 120,
                margin: "12px 0",
                padding: 8,
                background: "var(--surface-sunken)",
                borderRadius: 8,
              }}
            >
              {String(this.state.error?.message || this.state.error)}
            </pre>
          )}
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button type="button" className="primary" onClick={this.handleReload}>
              Reload
            </button>
            <button type="button" onClick={this.reset}>
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  }
}
