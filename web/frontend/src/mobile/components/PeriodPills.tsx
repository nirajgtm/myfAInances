import { fmtMonthShort } from "../../shared/lib/format";

interface Props {
  periods: string[];
  selected: string[]; // empty = All
  onChange: (selected: string[]) => void;
}

// Multi-select. Tap "All" to clear; tap a month to toggle membership.
export function PeriodPills({ periods, selected, onChange }: Props) {
  if (!periods.length) return null;
  const isAll = selected.length === 0;

  return (
    <div className="no-scrollbar" style={{ display: "flex", gap: 8, padding: "0 16px 4px", overflowX: "auto" }}>
      <button
        onClick={() => onChange([])}
        style={{
          flexShrink: 0,
          padding: "6px 13px",
          borderRadius: 999,
          border: isAll ? "none" : "1px solid var(--line)",
          background: isAll ? "var(--text)" : "var(--bg-elev)",
          color: isAll ? "var(--bg)" : "var(--text-2)",
          fontSize: 13,
          fontWeight: 500,
          whiteSpace: "nowrap",
          cursor: "pointer",
        }}
      >
        All
      </button>
      {periods.map((p) => {
        const isActive = selected.includes(p);
        return (
          <button
            key={p}
            onClick={() => {
              if (isActive) onChange(selected.filter((x) => x !== p));
              else onChange([...selected, p]);
            }}
            style={{
              flexShrink: 0,
              padding: "6px 13px",
              borderRadius: 999,
              border: isActive ? "none" : "1px solid var(--line)",
              background: isActive ? "var(--text)" : "var(--bg-elev)",
              color: isActive ? "var(--bg)" : "var(--text-2)",
              fontSize: 13,
              fontWeight: 500,
              whiteSpace: "nowrap",
              cursor: "pointer",
            }}
          >
            {fmtMonthShort(p)} {p.slice(2, 4)}
          </button>
        );
      })}
    </div>
  );
}
