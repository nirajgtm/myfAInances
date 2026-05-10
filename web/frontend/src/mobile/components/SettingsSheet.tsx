// Settings bottom sheet. Replaces the inert NG avatar with something useful:
// theme picker, data summary, open-questions count, app version.

import { useTheme, ThemeMode } from "../../shared/lib/theme";
import { AppState } from "../../shared/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  state: AppState;
}

export function SettingsSheet({ open, onClose, state }: Props) {
  const { mode, setMode } = useTheme();

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90, animation: "fadeIn 0.2s ease" }}
      />
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--bg-elev)",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: "82vh",
          overflowY: "auto",
          zIndex: 100,
          paddingBottom: "max(20px, env(safe-area-inset-bottom))",
          animation: "slideUp 0.25s ease",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--bg-mute)" }} />
        </div>

        <div style={{ padding: "12px 22px 20px" }}>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>Settings</div>
        </div>

        {/* Appearance */}
        <Section label="Appearance">
          <div style={{ display: "flex", gap: 6 }}>
            <ThemeChip label="System" mode="system" current={mode} onSelect={setMode} />
            <ThemeChip label="Light" mode="light" current={mode} onSelect={setMode} />
            <ThemeChip label="Dark" mode="dark" current={mode} onSelect={setMode} />
          </div>
        </Section>

        {/* Data */}
        <Section label="Your data">
          <Row label="Accounts" value={String(state.accounts.length)} />
          <Row label="Transactions" value={state.counts.transactions.toLocaleString()} />
          <Row label="Statements" value={String(state.counts.statements)} />
          <Row label="Subscriptions" value={String(state.counts.subscriptions)} />
          <Row label="Anomalies" value={String(state.counts.anomalies)} />
        </Section>

        {/* About */}
        <Section label="About">
          <Row label="App" value="MyfAInance" />
          <Row label="Mode" value="Local-first" />
          <div style={{ fontSize: 11.5, color: "var(--text-3)", padding: "8px 4px 0", lineHeight: 1.5 }}>
            All data stays on this device. No third-party syncing.
          </div>
        </Section>

        <div style={{ padding: "8px 16px 4px" }}>
          <button
            onClick={onClose}
            style={{
              width: "100%",
              padding: "11px 0",
              background: "var(--text)",
              color: "var(--bg)",
              borderRadius: 12,
              border: "none",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "0 16px 16px" }}>
      <div
        style={{
          fontSize: 10.5,
          color: "var(--text-3)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 8,
          padding: "0 4px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          background: "var(--bg)",
          borderRadius: 14,
          border: "0.5px solid var(--line)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 12 }}>{children}</div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 4px",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--text-2)" }}>{label}</span>
      <span style={{ color: "var(--text)", fontWeight: 500 }} className="num-display">
        {value}
      </span>
    </div>
  );
}

function ThemeChip({
  label,
  mode,
  current,
  onSelect,
}: {
  label: string;
  mode: ThemeMode;
  current: ThemeMode;
  onSelect: (m: ThemeMode) => void;
}) {
  const active = mode === current;
  return (
    <button
      onClick={() => onSelect(mode)}
      style={{
        flex: 1,
        padding: "9px 0",
        borderRadius: 10,
        border: active ? "none" : "1px solid var(--line)",
        background: active ? "var(--text)" : "var(--bg-elev)",
        color: active ? "var(--bg)" : "var(--text-2)",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
