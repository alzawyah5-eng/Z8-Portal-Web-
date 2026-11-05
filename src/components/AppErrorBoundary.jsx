import React from "react";

// Last line of defence: a rendering error must never leave a blank screen.
// Shows what happened and a way back, instead of an empty white page.
export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Z8 screen error:", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "var(--background, #fff)" }}>
        <div style={{ maxWidth: 440, width: "100%", fontFamily: "system-ui, sans-serif", color: "inherit" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Something went wrong on this screen</h1>
          <p style={{ fontSize: 14, opacity: 0.75, margin: "0 0 16px" }}>Your information was not lost. Reload to continue. If this keeps happening, send this message to support:</p>
          <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", background: "rgba(127,127,127,0.12)", padding: 12, borderRadius: 12, margin: "0 0 16px" }}>{String(error?.message || error).slice(0, 400)}</pre>
          <button type="button" onClick={() => window.location.reload()} style={{ minHeight: 44, padding: "0 18px", borderRadius: 12, border: 0, background: "#7a1a4f", color: "#fff", fontSize: 15 }}>Reload</button>
        </div>
      </div>
    );
  }
}
