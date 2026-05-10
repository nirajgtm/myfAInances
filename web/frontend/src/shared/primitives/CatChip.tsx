import { categoryColor, categorySoft } from "../lib/format";

interface Props {
  categoryId: string | null | undefined;
  name: string;
  size?: "sm" | "md";
}

export function CatChip({ categoryId, name, size = "sm" }: Props) {
  const padY = size === "sm" ? 3 : 5;
  const padX = size === "sm" ? 8 : 11;
  const fs = size === "sm" ? 11 : 12.5;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: `${padY}px ${padX}px`,
        borderRadius: 999,
        background: categorySoft(categoryId),
        color: categoryColor(categoryId),
        fontSize: fs,
        fontWeight: 500,
        letterSpacing: "-0.01em",
        lineHeight: 1,
      }}
    >
      <span className="cat-dot" style={{ background: categoryColor(categoryId), width: 6, height: 6 }} />
      {name}
    </span>
  );
}
