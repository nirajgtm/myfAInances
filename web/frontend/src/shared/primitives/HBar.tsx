interface Props {
  value: number;
  max: number;
  color: string;
  height?: number;
}

export function HBar({ value, max, color, height = 6 }: Props) {
  const pct = Math.max(2, (value / max) * 100);
  return (
    <div style={{ width: "100%", height, background: "var(--bg-sunken)", borderRadius: 999, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999 }} />
    </div>
  );
}
