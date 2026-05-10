// Bottom tab bar (matches the design's MobileTabBar). Translucent warm bg, terracotta accent for active.

export type TabId = "home" | "tx" | "spend" | "wealth" | "cards";

const TABS: { id: TabId; label: string; iconPath: string }[] = [
  { id: "home",   label: "Home",     iconPath: "M3 11l9-8 9 8v9a2 2 0 01-2 2h-3v-7H8v7H5a2 2 0 01-2-2v-9z" },
  { id: "tx",     label: "Activity", iconPath: "M3 6h18M3 12h18M3 18h12" },
  { id: "spend",  label: "Spending", iconPath: "M12 3v18M5 9h11a3 3 0 010 6H7a3 3 0 000 6h12" },
  { id: "wealth", label: "Wealth",   iconPath: "M4 19V9 M9 19V5 M14 19v-7 M19 19v-3 M3 19h18" },
  { id: "cards",  label: "Cards",    iconPath: "M3 6h18v12H3z M3 10h18 M7 14h4" },
];

export function MobileTabBar({ active, onSelect }: { active: TabId; onSelect: (id: TabId) => void }) {
  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: 84,
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingTop: 8,
        background: "var(--bg-translucent)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "0.5px solid var(--line)",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "flex-start",
        zIndex: 40,
      }}
    >
      {TABS.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              flex: 1,
              border: "none",
              background: "transparent",
              padding: "4px 0",
              cursor: "pointer",
            }}
          >
            <svg
              width={22}
              height={22}
              viewBox="0 0 24 24"
              fill="none"
              stroke={isActive ? "var(--accent)" : "var(--text-3)"}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={t.iconPath} />
            </svg>
            <div
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: isActive ? "var(--accent)" : "var(--text-3)",
              }}
            >
              {t.label}
            </div>
          </button>
        );
      })}
    </nav>
  );
}
