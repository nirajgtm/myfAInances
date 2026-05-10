// Bottom-sheet category picker. Tap to set; toggle to apply to merchant's other txns.
// Add a new category from inside the picker.

import { useEffect, useMemo, useState } from "react";
import { Transaction } from "../../shared/lib/api";
import { matchesQuery } from "../../shared/lib/search";
import { categoryColor } from "../../shared/lib/format";

interface Category {
  id: string;
  name: string;
  parent: string | null;
}

interface Props {
  txn: Transaction | null;
  onClose: () => void;
  onUpdated: () => void; // called after a successful update so caller can refresh
}

export function CategoryPicker({ txn, onClose, onUpdated }: Props) {
  const [cats, setCats] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [applyToMerchant, setApplyToMerchant] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState<string>("");

  useEffect(() => {
    if (!txn) return;
    fetch("/api/categories").then((r) => r.json()).then(setCats);
  }, [txn]);

  const filtered = useMemo(() => {
    if (!query.trim()) return cats;
    return cats.filter((c) => matchesQuery(query, [c.name, c.id, c.parent]));
  }, [cats, query]);

  if (!txn) return null;

  async function setCategory(category_id: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${txn.id}/category`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_id, apply_to_merchant: applyToMerchant }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || res.statusText);
      onUpdated();
      onClose();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function addCategory() {
    if (busy || !newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const id = newName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_");
      const res = await fetch(`/api/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: newName.trim(), parent: newParent || null }),
      });
      if (!res.ok) {
        const detail = (await res.json()).detail || res.statusText;
        throw new Error(detail);
      }
      const created = (await res.json()).category;
      setCats((prev) => [...prev, created]);
      setShowNewForm(false);
      setNewName("");
      setNewParent("");
      // Auto-select the new category
      await setCategory(created.id);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  // Group by parent
  const parents = cats.filter((c) => !c.parent);
  const byParent: Record<string, Category[]> = {};
  for (const c of filtered) {
    const p = c.parent || "_root";
    (byParent[p] = byParent[p] || []).push(c);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 70, animation: "fadeIn 0.2s ease" }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "var(--bg-elev)",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: "82vh",
          display: "flex",
          flexDirection: "column",
          zIndex: 80,
          paddingBottom: "max(20px, env(safe-area-inset-bottom))",
          animation: "slideUp 0.25s ease",
        }}
      >
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--bg-mute)" }} />
        </div>

        {/* Header */}
        <div style={{ padding: "12px 22px 8px" }}>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>Set category</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
            {txn.merchant_canonical || txn.description_normalized}
          </div>
        </div>

        {/* Apply-to-merchant toggle */}
        {txn.merchant_canonical && (
          <button
            onClick={() => setApplyToMerchant(!applyToMerchant)}
            style={{
              margin: "0 16px 8px",
              padding: "10px 12px",
              borderRadius: 12,
              background: applyToMerchant ? "var(--accent-soft)" : "var(--bg)",
              color: applyToMerchant ? "var(--accent-deep)" : "var(--text-3)",
              border: "none",
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                background: applyToMerchant ? "var(--accent)" : "var(--bg-elev)",
                border: applyToMerchant ? "none" : "1px solid var(--line-strong)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {applyToMerchant ? "✓" : ""}
            </span>
            Also update all <strong>{txn.merchant_canonical}</strong> transactions
          </button>
        )}

        {/* Search */}
        <div style={{ padding: "0 16px 8px" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search categories..."
            style={{
              width: "100%",
              padding: "10px 12px",
              background: "var(--bg-mute)",
              borderRadius: 10,
              border: "none",
              outline: "none",
              fontSize: 14,
              color: "var(--text)",
              fontFamily: "inherit",
            }}
          />
        </div>

        {error && (
          <div style={{ padding: "0 22px 8px", color: "var(--negative)", fontSize: 12 }}>{error}</div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflow: "auto", padding: "0 16px 16px" }}>
          {!showNewForm && (
            <button
              onClick={() => setShowNewForm(true)}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 12,
                background: "var(--bg)",
                border: "1px dashed var(--line-strong)",
                color: "var(--accent)",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                marginBottom: 10,
              }}
            >
              + Add new category
            </button>
          )}

          {showNewForm && (
            <div style={{ background: "var(--bg)", borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Category name (e.g., 'Yoga classes')"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  background: "var(--bg-elev)",
                  fontSize: 14,
                  marginBottom: 8,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              <select
                value={newParent}
                onChange={(e) => setNewParent(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  background: "var(--bg-elev)",
                  fontSize: 13,
                  marginBottom: 8,
                  fontFamily: "inherit",
                }}
              >
                <option value="">(no parent)</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={addCategory}
                  disabled={busy || !newName.trim()}
                  style={{
                    flex: 1,
                    padding: "9px 0",
                    borderRadius: 8,
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: 13,
                    opacity: busy || !newName.trim() ? 0.5 : 1,
                  }}
                >
                  Add & apply
                </button>
                <button
                  onClick={() => { setShowNewForm(false); setNewName(""); }}
                  style={{
                    flex: 1,
                    padding: "9px 0",
                    borderRadius: 8,
                    background: "var(--bg-mute)",
                    color: "var(--text-2)",
                    border: "none",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {parents.map((parent) => {
            const children = byParent[parent.id] || [];
            const showParent = (byParent["_root"] || []).some((c) => c.id === parent.id);
            if (children.length === 0 && !showParent) return null;
            return (
              <div key={parent.id} style={{ marginTop: 6 }}>
                {showParent && (
                  <CatRow cat={parent} active={txn.category === parent.id} onClick={() => setCategory(parent.id)} />
                )}
                {children.map((c) => (
                  <CatRow
                    key={c.id}
                    cat={c}
                    active={txn.category === c.id}
                    onClick={() => setCategory(c.id)}
                    indent
                  />
                ))}
              </div>
            );
          })}
          {/* Orphan: filtered shows children whose parent was filtered out */}
          {Object.entries(byParent).map(([pid, children]) => {
            if (pid === "_root") return null;
            if (parents.find((p) => p.id === pid)) return null;
            return (
              <div key={pid}>
                {children.map((c) => (
                  <CatRow key={c.id} cat={c} active={txn.category === c.id} onClick={() => setCategory(c.id)} />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </>
  );
}

function CatRow({ cat, active, onClick, indent }: { cat: Category; active: boolean; onClick: () => void; indent?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "9px 12px",
        paddingLeft: indent ? 28 : 12,
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent-deep)" : "var(--text)",
        border: "none",
        borderRadius: 8,
        cursor: "pointer",
        textAlign: "left",
        fontSize: 14,
        fontWeight: active ? 600 : 500,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 4, background: categoryColor(cat.id) }} />
      <span>{cat.name}</span>
      {active && <span style={{ marginLeft: "auto", color: "var(--accent)" }}>✓</span>}
    </button>
  );
}
