// Shared shape for upload-then-ingest progress. Lives in App-level state
// so it persists across tab switches.

export type UploadStatus =
  | { kind: "idle" }
  | { kind: "uploading"; total: number }
  | { kind: "ingesting"; uploaded: number }
  | { kind: "done"; uploaded: number; rejected: number; ingestOk: boolean; tail: string }
  | { kind: "error"; message: string };
