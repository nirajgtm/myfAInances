// Global multi-select card filter. Empty selection = "All" (no filtering).

import { AppState } from "../../shared/lib/api";
import { cardColor, cardSoft, cardShortName } from "../../shared/lib/format";

interface Props {
  accounts: AppState["accounts"];
  selected: string[]; // empty = all
  onChange: (selected: string[]) => void;
}

export function CardFilter({ accounts, selected, onChange }: Props) {
  if (!accounts.length) return null;
  const isAll = selected.length === 0;

  return (
    <div
      className="no-scrollbar"
      style={{
        display: "flex",
        gap: 6,
        padding: "8px 16px 4px",
        overflowX: "auto",
      }}
    >
      <button
        onClick={() => onChange([])}
        style={{
          padding: "5px 12px",
          borderRadius: 999,
          border: isAll ? "none" : "1px solid var(--line)",
          background: isAll ? "var(--text)" : "var(--bg-elev)",
          color: isAll ? "var(--bg)" : "var(--text-2)",
          fontSize: 11.5,
          fontWeight: 600,
          letterSpacing: "0.01em",
          flexShrink: 0,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        All
      </button>
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
              padding: "5px 11px",
              borderRadius: 999,
              border: active ? "none" : "1px solid var(--line)",
              background: active ? cardSoft(a.id) : "var(--bg-elev)",
              color: active ? cardColor(a.id) : "var(--text-3)",
              fontSize: 11.5,
              fontWeight: 600,
              flexShrink: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: 5,
                background: cardColor(a.id),
                flexShrink: 0,
              }}
            />
            {cardShortName(a.nickname)}
          </button>
        );
      })}
    </div>
  );
}
