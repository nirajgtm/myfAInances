import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import "./shared/styles/index.css";
import MobileApp from "./mobile/App";
import WebApp from "./web/App";
import { bootstrapTheme } from "./shared/lib/theme";

// Apply persisted theme before first render so no flash of wrong theme.
bootstrapTheme();

const MOBILE_BREAKPOINT_PX = 768;

function isMobileViewport(): boolean {
  // Treat narrow viewports OR touch devices in PWA standalone as mobile.
  if (typeof window === "undefined") return true;
  const narrow = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches;
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  return narrow || standalone;
}

function Root() {
  const [mobile, setMobile] = useState(isMobileViewport());

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`);
    const handler = () => setMobile(isMobileViewport());
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return mobile ? <MobileApp /> : <WebApp />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
