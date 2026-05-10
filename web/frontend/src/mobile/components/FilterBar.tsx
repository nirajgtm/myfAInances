// Top header bar with three slots, all on a single line:
//   [Month/period dropdown]  [Cards dropdown]  ...  [Settings button]
//
// Tapping either dropdown opens a bottom sheet. The period sheet shows preset
// ranges (This month / Last month / 3M / YTD / All) and an explicit month list
// for custom multi-select. The cards sheet is a multi-select pill grid.

import { useState } from "react";
import { AppState } from "../../shared/lib/api";
import { fmtMonthShort, cardColor, cardSoft, cardShortName } from "../../shared/lib/format";

interface Props {
  periods: string[];
  selectedPeriods: string[];
  onPeriodsChange: (s: string[]) => void;
  accounts: AppState["accounts"];
  selectedCardIds: string[];
  onCardsChange: (s: string[]) => void;
  onOpenSettings: () => void;
}

type Preset = "this" | "last" | "3m" | "ytd" | "all";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "this", label: "This month" },
  { id: "last", label: "Last month" },
  { id: "3m", label: "Last 3 months" },
  { id: "ytd", label: "Year to date" },
  { id: "all", label: "All time" },
];

function computePreset(preset: Preset, periods: string[]): string[] {
  if (periods.length === 0) return [];
  const sorted = [...periods].sort();
  const latest = sorted[sorted.length - 1];
  if (preset === "all") return [];
  if (preset === "this") return [latest];
  if (preset === "last") return sorted.length >= 2 ? [sorted[sorted.length - 2]] : [latest];
  if (preset === "3m") return sorted.slice(-3);
  if (preset === "ytd") {
    const year = latest.slice(0, 4);
    return sorted.filter((p) => p.startsWith(year));
  }
  return [];
}

function detectPreset(selected: string[], periods: string[]): Preset | null {
  const eq = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();
  for (const p of PRESETS) {
    if (eq(selected, computePreset(p.id, periods))) return p.id;
  }
  return null;
}

function periodLabel(selected: string[], periods: string[]): string {
  if (selected.length === 0) return "All time";
  if (selected.length === 1) {
    const p = selected[0];
    return `${fmtMonthShort(p)} ${p.slice(0, 4)}`;
  }
  // Detect preset for nicer labels.
  const preset = detectPreset(selected, periods);
  if (preset === "3m") return "Last 3 months";
  if (preset === "ytd") return "Year to date";
  return `${selected.length} months`;
}

export function FilterBar({
  periods,
  selectedPeriods,
  onPeriodsChange,
  accounts,
  selectedCardIds,
  onCardsChange,
  onOpenSettings,
}: Props) {
  const [periodSheetOpen, setPeriodSheetOpen] = useState(false);
  const [cardSheetOpen, setCardSheetOpen] = useState(false);

  const cardLabel =
    selectedCardIds.length === 0
      ? `${accounts.length} accounts`
      : selectedCardIds.length === 1
        ? (() => {
            const a = accounts.find((x) => x.id === selectedCardIds[0]);
            return a ? cardShortName(a.nickname) : "1 account";
          })()
        : `${selectedCardIds.length} accounts`;

  const cardActive = selectedCardIds.length > 0;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px 6px",
        }}
      >
        <DropdownPill
          label={periodLabel(selectedPeriods, periods)}
          active={selectedPeriods.length > 0}
          onClick={() => setPeriodSheetOpen(true)}
        />
        <DropdownPill
          label={cardLabel}
          active={cardActive}
          dot
          onClick={() => setCardSheetOpen(true)}
        />
        <div style={{ flex: 1 }} />
        <button
          aria-label="Settings"
          onClick={onOpenSettings}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            background: "var(--bg-elev)",
            color: "var(--text-2)",
            border: "0.5px solid var(--line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {periodSheetOpen && (
        <PeriodSheet
          periods={periods}
          selected={selectedPeriods}
          onChange={onPeriodsChange}
          onClose={() => setPeriodSheetOpen(false)}
        />
      )}
      {cardSheetOpen && (
        <CardSheet
          accounts={accounts}
          selected={selectedCardIds}
          onChange={onCardsChange}
          onClose={() => setCardSheetOpen(false)}
        />
      )}
    </>
  );
}

function DropdownPill({
  label,
  active,
  dot,
  onClick,
}: {
  label: string;
  active: boolean;
  dot?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "7px 12px",
        background: active ? "var(--accent-soft)" : "var(--bg-elev)",
        color: active ? "var(--accent-deep)" : "var(--text)",
        borderRadius: 999,
        border: "0.5px solid var(--line)",
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 6,
            background: active ? "var(--accent)" : "var(--text-3)",
          }}
        />
      )}
      <span>{label}</span>
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M2 3.3l2.5 2.5L7 3.3" />
      </svg>
    </button>
  );
}

function PeriodSheet({
  periods,
  selected,
  onChange,
  onClose,
}: {
  periods: string[];
  selected: string[];
  onChange: (s: string[]) => void;
  onClose: () => void;
}) {
  const sorted = [...periods].sort().reverse(); // newest first for the picker
  const activePreset = detectPreset(selected, periods);

  return (
    <SheetShell onClose={onClose} title="Period">
      <div style={{ padding: "0 16px 14px" }}>
        <SectionLabel>Quick ranges</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {PRESETS.map((p) => {
            const isActive = activePreset === p.id;
            return (
              <button
                key={p.id}
                onClick={() => {
                  onChange(computePreset(p.id, periods));
                  onClose();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "11px 14px",
                  background: isActive ? "var(--accent-soft)" : "var(--bg)",
                  color: isActive ? "var(--accent-deep)" : "var(--text)",
                  border: "0.5px solid var(--line)",
                  borderRadius: 12,
                  fontSize: 13.5,
                  fontWeight: 500,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span>{p.label}</span>
                {isActive && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M3 7l3 3 5-6" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "0 16px 16px" }}>
        <SectionLabel>By month</SectionLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {sorted.map((p) => (
            <Pill
              key={p}
              label={`${fmtMonthShort(p)} ${p.slice(0, 4)}`}
              active={selected.includes(p)}
              onClick={() => {
                if (selected.includes(p)) onChange(selected.filter((x) => x !== p));
                else onChange([...selected, p]);
              }}
            />
          ))}
        </div>
      </div>

      <SheetActions onClear={() => onChange([])} onDone={onClose} />
    </SheetShell>
  );
}

function CardSheet({
  accounts,
  selected,
  onChange,
  onClose,
}: {
  accounts: AppState["accounts"];
  selected: string[];
  onChange: (s: string[]) => void;
  onClose: () => void;
}) {
  return (
    <SheetShell onClose={onClose} title="Accounts">
      <div style={{ padding: "0 16px 16px" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Pill label="All" active={selected.length === 0} onClick={() => onChange([])} />
          {accounts.map((a) => {
            const active = selected.includes(a.id);
            return (
              <button
                key={a.id}
                onClick={() => {
                  if (active) onChange(selected.filter((id) => id !== a.id));
                  else onChange([...selected, a.id]);
                }}
                style={{
                  padding: "6px 11px",
                  borderRadius: 999,
                  border: active ? "none" : "1px solid var(--line)",
                  background: active ? cardSoft(a.id) : "var(--bg-elev)",
                  color: active ? cardColor(a.id) : "var(--text-3)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: 5, background: cardColor(a.id) }} />
                {cardShortName(a.nickname)}
              </button>
            );
          })}
        </div>
      </div>
      <SheetActions onClear={() => onChange([])} onDone={onClose} />
    </SheetShell>
  );
}

function SheetShell({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
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
        <div style={{ padding: "12px 22px 16px" }}>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>{title}</div>
        </div>
        {children}
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </>
  );
}

function SheetActions({ onClear, onDone }: { onClear: () => void; onDone: () => void }) {
  return (
    <div style={{ padding: "12px 16px 4px", display: "flex", gap: 8 }}>
      <button
        onClick={onClear}
        style={{
          flex: 1,
          padding: "11px 0",
          background: "var(--bg-mute)",
          color: "var(--text-2)",
          borderRadius: 12,
          border: "none",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Clear
      </button>
      <button
        onClick={onDone}
        style={{
          flex: 2,
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
  );
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        padding: "6px 12px",
        borderRadius: 999,
        border: active ? "none" : "1px solid var(--line)",
        background: active ? "var(--text)" : "var(--bg-elev)",
        color: active ? "var(--bg)" : "var(--text-2)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </div>
  );
}
