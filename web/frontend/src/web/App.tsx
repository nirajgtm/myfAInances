// Desktop shell - placeholder. Will get sidebar nav + dense layouts that mirror the
// mobile screens but at 1280-wide widths (per the design's web-screens.jsx).

export default function WebApp() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div style={{ textAlign: "center", maxWidth: 480 }}>
        <div className="num-display" style={{ fontSize: 38, marginBottom: 12, color: "var(--accent)" }}>
          Desktop view soon
        </div>
        <div style={{ color: "var(--text-2)", lineHeight: 1.6 }}>
          The mobile dashboard is the priority. The desktop view will add a sidebar,
          a wider hero, and dense tables. For now, narrow your browser window or use a
          phone-sized viewport to see the mobile layout.
        </div>
        <div style={{ color: "var(--text-3)", fontSize: 13, marginTop: 16 }}>
          On macOS: Cmd-Option-I, then toggle device toolbar (Cmd-Shift-M in Chrome / Cmd-Option-R in Safari).
        </div>
      </div>
    </div>
  );
}
