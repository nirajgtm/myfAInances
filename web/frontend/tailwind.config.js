/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // All colors map to CSS variables in shared/styles/tokens.css.
      // Theme switching (dark, editorial) just changes the variable values via parent class.
      colors: {
        bg: "var(--bg)",
        elev: "var(--bg-elev)",
        sunken: "var(--bg-sunken)",
        mute: "var(--bg-mute)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        fg: "var(--text)",
        fg2: "var(--text-2)",
        fg3: "var(--text-3)",
        fg4: "var(--text-4)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        "accent-deep": "var(--accent-deep)",
        positive: "var(--positive)",
        negative: "var(--negative)",
        warning: "var(--warning)",
        "warning-soft": "var(--warning-soft)",
      },
      borderRadius: {
        xs: "var(--r-xs)",
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        xl: "var(--r-xl)",
      },
      boxShadow: {
        soft: "var(--shadow-sm)",
        card: "var(--shadow-md)",
        deep: "var(--shadow-lg)",
      },
      fontFamily: {
        display: "var(--font-display)",
        text: "var(--font-text)",
        numeric: "var(--font-numeric)",
        serif: "var(--font-serif)",
      },
    },
  },
  plugins: [],
};
