// Drag-and-drop / tap-to-pick upload area for the Home tab. The actual
// upload state (uploading → ingesting → done) lives in App.tsx so it
// survives tab switches; this component is purely presentational with
// a `handleFiles` callback up to the parent.

import { useRef, useState } from "react";
import { UploadCloud, FileText, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { UploadStatus } from "../../shared/lib/upload";

interface Props {
  status: UploadStatus;
  onFiles: (files: FileList | null) => void;
}

const ACCEPT = ".pdf,.csv,.html,.htm,.txt,.tsv,application/pdf,text/csv,text/html,text/plain";

export function UploadDropzone({ status, onFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    onFiles(e.dataTransfer.files);
  };

  const busy = status.kind === "uploading" || status.kind === "ingesting";

  return (
    <div style={{ marginTop: 14 }}>
      <div
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{
          border: dragOver ? "2px dashed var(--accent)" : "1.5px dashed var(--line)",
          background: dragOver ? "var(--accent-soft)" : "var(--bg-elev)",
          borderRadius: "var(--r-lg)",
          padding: 18,
          cursor: busy ? "default" : "pointer",
          transition: "background 0.15s ease, border-color 0.15s ease",
          textAlign: "center",
          color: "inherit",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          style={{ display: "none" }}
          onChange={(e) => onFiles(e.target.files)}
        />
        <Body status={status} />
      </div>
    </div>
  );
}

function Body({ status }: { status: UploadStatus }) {
  if (status.kind === "uploading") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--text-2)" }}>
        <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
        <span style={{ fontSize: 13.5, fontWeight: 500 }}>Uploading {status.total} file{status.total === 1 ? "" : "s"}…</span>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }
  if (status.kind === "ingesting") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--text-2)" }}>
        <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Processing {status.uploaded} statement{status.uploaded === 1 ? "" : "s"}…</div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>The LLM extractor can take 1–2 min per file. You can switch tabs.</div>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }
  if (status.kind === "done") {
    return (
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 10 }}>
        <span style={{ color: status.ingestOk ? "var(--positive)" : "var(--warning)", flexShrink: 0 }}>
          {status.ingestOk ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
        </span>
        <div style={{ textAlign: "left", maxWidth: 280 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>
            {status.uploaded} ingested{status.rejected > 0 && ` · ${status.rejected} rejected`}
          </div>
          {status.tail && (
            <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 4, fontFamily: "monospace", whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
              {status.tail}
            </div>
          )}
        </div>
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <X size={18} style={{ color: "var(--negative)" }} />
        <div style={{ textAlign: "left", maxWidth: 280 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--negative)" }}>Upload failed</div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{status.message}</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "var(--text-2)" }}>
      <UploadCloud size={26} strokeWidth={1.5} />
      <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>Drop a statement to add</div>
      <div style={{ fontSize: 11, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", justifyContent: "center" }}>
        <FileText size={12} />
        <span>PDF, CSV, HTML, tax forms — multiple files OK</span>
      </div>
    </div>
  );
}
