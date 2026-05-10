import { initialFor } from "../lib/format";

interface Props {
  label?: string | null;
  icon?: string;            // explicit initials/icon override
  color?: string;           // background color (CSS var or hex)
  size?: number;
  radius?: number;
}

export function MerchantIcon({ label, icon, color = "var(--bg-mute)", size = 36, radius = 10 }: Props) {
  const initials = icon || initialFor(label);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: color,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.36,
        fontWeight: 600,
        letterSpacing: "-0.02em",
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}
