"use client";

/** Last-resort error page (replaces the root layout, so it carries its own document and styles). */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, 'Segoe UI', Helvetica, Arial, sans-serif", background: "#f6f8fb", color: "#101828" }}>
        <title>Something went wrong · Tailorite</title>
        <main style={{ maxWidth: 480, margin: "15vh auto", padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#475467", marginBottom: 20 }}>Tailorite hit an unexpected problem. Your saved work is safe.</p>
          {error.digest ? <p style={{ color: "#667085", fontSize: 12 }}>Reference: {error.digest}</p> : null}
          <button
            type="button"
            onClick={() => retry()}
            style={{ background: "#0666ff", color: "#fff", border: 0, borderRadius: 8, padding: "10px 16px", fontSize: 15, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
