import { cardColor, cardSoft, cardShortName } from "../lib/format";

interface Props {
  id: string;
  name: string;
  size?: "xs" | "sm";
}

export function CardPill({ id, name, size = "xs" }: Props) {
  const padY = size === "xs" ? 1.5 : 3;
  const padX = size === "xs" ? 7 : 9;
  const fs = size === "xs" ? 10 : 11;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: `${padY}px ${padX}px`,
        borderRadius: 5,
        background: cardSoft(id),
        color: cardColor(id),
        fontSize: fs,
        fontWeight: 600,
        letterSpacing: "-0.005em",
        whiteSpace: "nowrap",
        lineHeight: 1.2,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: 5,
          background: cardColor(id),
          flexShrink: 0,
        }}
      />
      {cardShortName(name)}
    </span>
  );
}
