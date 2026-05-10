// 12-month dot strip: one square per month, opacity scales with txn count.
// Dim grey for zero-activity months; tinted (using card color) for active months.

interface Props {
  monthly: { month: string; count: number }[];
  color: string; // CSS color (e.g. "var(--c-shopping)")
  size?: number;
  gap?: number;
}

export function ActivityHeatmap({ monthly, color, size = 9, gap = 3 }: Props) {
  const max = Math.max(1, ...monthly.map((m) => m.count));
  return (
    <div style={{ display: "flex", gap, alignItems: "center" }}>
      {monthly.map((m) => {
        const isZero = m.count === 0;
        // Bucket into 4 levels for clearer visual stepping.
        const level = isZero ? 0 : Math.ceil((m.count / max) * 4);
        const opacity = isZero ? 0.18 : 0.25 + level * 0.18;
        return (
          <div
            key={m.month}
            title={`${m.month}: ${m.count} txn${m.count === 1 ? "" : "s"}`}
            style={{
              width: size,
              height: size,
              borderRadius: 2,
              background: isZero ? "var(--bg-mute)" : `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`,
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );
}
