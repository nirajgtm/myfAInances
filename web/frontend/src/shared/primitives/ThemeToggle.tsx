// Theme cycler button. Tap to cycle: system -> light -> dark -> system.

import { Sun, Moon, Laptop } from "lucide-react";
import { useTheme } from "../lib/theme";

export function ThemeToggle({ size = 38 }: { size?: number }) {
  const { mode, cycle } = useTheme();
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Laptop;
  const label = mode === "light" ? "Light theme" : mode === "dark" ? "Dark theme" : "System theme";

  return (
    <button
      onClick={cycle}
      aria-label={`Theme: ${label}. Tap to cycle.`}
      title={label}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        border: "none",
        background: "var(--bg-mute)",
        color: "var(--text)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
        transition: "background 0.15s ease",
      }}
    >
      <Icon size={Math.round(size * 0.45)} strokeWidth={1.8} />
    </button>
  );
}
