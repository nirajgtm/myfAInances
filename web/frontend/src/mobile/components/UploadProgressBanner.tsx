// Persistent top banner that shows upload + ingest progress on every
// tab. Renders nothing in the idle state. Done / error states linger
// for a few seconds with a tap-to-dismiss affordance so the user
// can confirm what happened even after switching tabs mid-process.

import { UploadStatus } from "../../shared/lib/upload";
import { Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";

interface Props {
  status: UploadStatus;
  onDismiss: () => void;
}

export function UploadProgressBanner({ status, onDismiss }: Props) {
  if (status.kind === "idle") return null;

  const busy = status.kind === "uploading" || status.kind === "ingesting";

  let bg: string;
  let fg: string;
  let icon: React.ReactNode;
  let title: string;
  let subtitle: string | null = null;

  if (status.kind === "uploading") {
    bg = "var(--accent-soft)";
    fg = "var(--accent-deep)";
    icon = <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />;
    title = `Uploading ${status.total} file${status.total === 1 ? "" : "s"}…`;
  } else if (status.kind === "ingesting") {
    bg = "var(--accent-soft)";
    fg = "var(--accent-deep)";
    icon = <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />;
    title = `Processing ${status.uploaded} statement${status.uploaded === 1 ? "" : "s"}…`;
    subtitle = "The LLM extractor can take 1–2 min per file. Switch tabs freely.";
  } else if (status.kind === "done") {
    bg = status.ingestOk ? "rgba(77,136,85,0.14)" : "rgba(192,138,26,0.14)";
    fg = status.ingestOk ? "var(--positive)" : "var(--warning)";
    icon = status.ingestOk ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />;
    title = `${status.uploaded} statement${status.uploaded === 1 ? "" : "s"} ingested${status.rejected > 0 ? ` · ${status.rejected} rejected` : ""}`;
    if (status.tail) subtitle = status.tail.split("\n").slice(-1)[0];
  } else {
    // error
    bg = "rgba(181,58,44,0.10)";
    fg = "var(--negative)";
    icon = <X size={15} />;
    title = "Upload failed";
    subtitle = status.message;
  }

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 60,
        background: bg,
        color: fg,
        borderBottom: "0.5px solid var(--line)",
        padding: "8px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 12.5,
      }}
    >
      <span style={{ flexShrink: 0, display: "flex" }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 10.5, color: fg, opacity: 0.85, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {subtitle}
          </div>
        )}
      </div>
      {!busy && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            width: 22, height: 22, borderRadius: 11,
            background: "transparent", color: fg, opacity: 0.7,
            border: "none", cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <X size={13} />
        </button>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
