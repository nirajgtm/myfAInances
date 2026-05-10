import { useEffect, useState, useCallback } from "react";
import { api, AppState, Report, Transaction, Benefits, Recommendations, AccountSummary, Subscription, Insight } from "../shared/lib/api";
import { MobileTabBar, TabId } from "./components/MobileTabBar";
import { MobileHome } from "./screens/MobileHome";
import { MobileSpending } from "./screens/MobileSpending";
import { MobileTransactions } from "./screens/MobileTransactions";
import { MobileCards } from "./screens/MobileCards";
import { MobileWealth } from "./screens/MobileWealth";
import { TransactionDetailSheet } from "./components/TransactionDetailSheet";
import { FilterBar } from "./components/FilterBar";
import { SettingsSheet } from "./components/SettingsSheet";
import { AccountDetailSheet } from "./components/AccountDetailSheet";
import { UploadProgressBanner } from "./components/UploadProgressBanner";
import { UploadStatus } from "../shared/lib/upload";

export default function MobileApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [benefits, setBenefits] = useState<Benefits | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null);
  const [accountSummaries, setAccountSummaries] = useState<AccountSummary[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [tab, setTab] = useState<TabId>("home");
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>(() => {
    // Restore last-known status across page refreshes.
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("myfainance.uploadStatus") : null;
      if (raw) return JSON.parse(raw);
    } catch {}
    return { kind: "idle" };
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedCardIds, setSelectedCardIds] = useState<string[]>(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("myfainance.cardFilter") : null;
    return stored ? JSON.parse(stored) : [];
  });
  // Period filter starts as null (no choice yet). On first state load we default
  // to YTD if the user hasn't picked one before. After that it's persisted.
  const [selectedPeriods, setSelectedPeriods] = useState<string[] | null>(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("myfainance.periodFilter") : null;
    return stored ? JSON.parse(stored) : null;
  });

  // Persist filter state across reloads
  useEffect(() => {
    localStorage.setItem("myfainance.cardFilter", JSON.stringify(selectedCardIds));
  }, [selectedCardIds]);
  useEffect(() => {
    if (selectedPeriods !== null) {
      localStorage.setItem("myfainance.periodFilter", JSON.stringify(selectedPeriods));
    }
  }, [selectedPeriods]);

  // First-time default: when state loads and no period filter has been chosen,
  // pick year-to-date (all months in the latest period's year).
  useEffect(() => {
    if (selectedPeriods !== null) return;
    if (!state || state.periods.length === 0) return;
    const sorted = [...state.periods].sort();
    const year = sorted[sorted.length - 1].slice(0, 4);
    const ytd = sorted.filter((p) => p.startsWith(year));
    setSelectedPeriods(ytd);
  }, [state, selectedPeriods]);

  // Effective period for "single-period" UI (Home hero, report fetch).
  // Uses the most recent selected period, the latest known period, or
  // the current calendar month as a final fallback so the app still
  // renders on a fresh install with zero transactions.
  const periodsForFilter = selectedPeriods ?? [];
  const currentMonth = new Date().toISOString().slice(0, 7);
  const effectivePeriod =
    periodsForFilter.length > 0
      ? [...periodsForFilter].sort().slice(-1)[0]
      : state?.latest_period ?? currentMonth;

  // Derived: filtered transactions used by all screens (period AND card filter combined).
  const filteredTxns = allTransactions.filter((t) => {
    if (selectedCardIds.length > 0 && !selectedCardIds.includes(t.account_id)) return false;
    if (periodsForFilter.length > 0 && !periodsForFilter.includes(t.date_posted.slice(0, 7))) return false;
    return true;
  });

  // Derived: per-account statement coverage for the Cards tab.
  const statementCoverage: Record<string, string[]> = {};
  for (const t of allTransactions) {
    const p = t.date_posted.slice(0, 7);
    const list = statementCoverage[t.account_id] = statementCoverage[t.account_id] || [];
    if (!list.includes(p)) list.push(p);
  }
  for (const k of Object.keys(statementCoverage)) statementCoverage[k].sort();

  const refresh = useCallback(async () => {
    try {
      const s = await api.state();
      setState(s);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Lifted upload-then-ingest handler. Lives at App level so it
  // survives tab switches — the user can drop a file on Home, navigate
  // to Activity, and still see the progress banner along the top.
  const refreshAfterIngest = useCallback(async () => {
    await refresh();
    try {
      const txns = await fetch("/api/transactions").then((r) => r.json());
      setAllTransactions(txns);
    } catch {}
    api.benefits().then(setBenefits).catch(() => {});
    api.accountSummaries().then(setAccountSummaries).catch(() => {});
    api.insights().then(setInsights).catch(() => {});
  }, [refresh]);

  const handleUploadFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setUploadStatus({ kind: "uploading", total: files.length });
    try {
      const upload = await api.uploadFiles(files);
      const uploaded = upload.saved.length;
      const rejected = upload.rejected.length;
      if (uploaded === 0) {
        setUploadStatus({
          kind: "error",
          message: rejected > 0
            ? `Rejected: ${upload.rejected.map((r) => `${r.filename} (${r.reason})`).join(", ")}`
            : "No files saved",
        });
        return;
      }
      setUploadStatus({ kind: "ingesting", uploaded });
      const ingest = await api.triggerIngest();
      setUploadStatus({
        kind: "done",
        uploaded,
        rejected,
        ingestOk: ingest.ok,
        tail: (ingest.stdout_tail || "").split("\n").filter((l) => l.trim()).slice(-3).join("\n"),
      });
      await refreshAfterIngest();
    } catch (e: any) {
      setUploadStatus({ kind: "error", message: e.message || "Upload failed" });
    }
  }, [refreshAfterIngest]);

  // Auto-dismiss the success banner after 8s. Errors stay until tap.
  useEffect(() => {
    if (uploadStatus.kind !== "done") return;
    const id = setTimeout(() => setUploadStatus({ kind: "idle" }), 8000);
    return () => clearTimeout(id);
  }, [uploadStatus.kind]);

  // Persist upload status across page refreshes.
  useEffect(() => {
    try {
      if (uploadStatus.kind === "idle") {
        localStorage.removeItem("myfainance.uploadStatus");
      } else {
        localStorage.setItem("myfainance.uploadStatus", JSON.stringify(uploadStatus));
      }
    } catch {}
  }, [uploadStatus]);

  // On mount, ask the backend whether an ingest is in flight. If yes,
  // adopt the "ingesting" state and poll until it finishes — covers the
  // case where the user refreshed the tab mid-ingest.
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const pollOnce = async () => {
      try {
        const s = await api.ingestStatus();
        if (cancelled) return;
        if (s.active) {
          // Show "ingesting" state if we don't already have something newer.
          setUploadStatus((cur) => {
            if (cur.kind === "uploading" || cur.kind === "ingesting") return cur;
            return { kind: "ingesting", uploaded: 0 };
          });
          pollTimer = setTimeout(pollOnce, 3000);
        } else {
          // Backend says idle — clear any "ingesting" we restored from
          // localStorage and refresh data so the user sees latest.
          setUploadStatus((cur) => {
            if (cur.kind === "ingesting") {
              refreshAfterIngest();
              return { kind: "idle" };
            }
            return cur;
          });
        }
      } catch {
        if (!cancelled) pollTimer = setTimeout(pollOnce, 5000);
      }
    };

    pollOnce();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-reload poll: every 8s, check /api/state for changed counts. If anything
  // changed (new txns, new statements, new subs, etc.), refetch transactions and
  // benefits silently. Lets the app stay live during a background ingest.
  useEffect(() => {
    if (!state) return;
    const id = setInterval(async () => {
      try {
        const s = await api.state();
        const changed = (
          s.counts.transactions !== state.counts.transactions ||
          s.counts.statements !== state.counts.statements ||
          s.counts.subscriptions !== state.counts.subscriptions ||
          s.counts.anomalies !== state.counts.anomalies ||
          s.accounts.length !== state.accounts.length
        );
        if (changed) {
          setState(s);
          const txns = await fetch("/api/transactions").then((r) => r.json());
          setAllTransactions(txns);
          const benefitsResp = await api.benefits();
          setBenefits(benefitsResp);
        }
      } catch {
        // Silent: backend may briefly be unavailable during writes.
      }
    }, 8000);
    return () => clearInterval(id);
  }, [state]);

  // Benefits don't depend on period - fetch once per session.
  useEffect(() => {
    api.benefits().then(setBenefits).catch((e) => setError(e.message));
  }, []);

  // Account summaries (balances, due dates, activity histograms). Refetch
  // when statements or txn count changes so the home upcoming-payments
  // widget stays current.
  useEffect(() => {
    api.accountSummaries().then(setAccountSummaries).catch(() => {});
    api.subscriptions().then(setSubscriptions).catch(() => {});
    api.insights().then(setInsights).catch(() => {});
  }, [state?.counts.transactions, state?.counts.statements]);

  // Fetch ALL transactions once. Filtering is client-side for snappy filter toggles.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/transactions")
      .then((r) => r.json())
      .then((txns: Transaction[]) => { if (!cancelled) setAllTransactions(txns); })
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, []);

  // Fetch the per-period report + recommendations for the effective period.
  useEffect(() => {
    if (!effectivePeriod) return;
    let cancelled = false;
    Promise.all([api.report(effectivePeriod), api.recommendations(effectivePeriod)])
      .then(([rep, recs]) => {
        if (cancelled) return;
        setReport(rep);
        setRecommendations(recs);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [effectivePeriod]);

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "var(--negative)", fontWeight: 600, marginBottom: 8 }}>Could not load data</div>
          <div style={{ fontSize: 13, color: "var(--text-3)" }}>{error}</div>
          <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 16 }}>
            Is the backend running? Try: cd web/backend && .venv/bin/uvicorn main:app --port 8000
          </div>
        </div>
      </div>
    );
  }

  if (!state || !report) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 100, position: "relative" }}>
      <UploadProgressBanner status={uploadStatus} onDismiss={() => setUploadStatus({ kind: "idle" })} />

      {/* Top header: period dropdown + accounts dropdown + settings, single row. */}
      <div style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}>
        <FilterBar
          periods={state.periods}
          selectedPeriods={periodsForFilter}
          onPeriodsChange={setSelectedPeriods}
          accounts={state.accounts}
          selectedCardIds={selectedCardIds}
          onCardsChange={setSelectedCardIds}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>

      {tab === "home" && (
        <MobileHome
          state={state}
          report={report}
          transactions={filteredTxns}
          benefits={benefits}
          recommendations={recommendations}
          accountSummaries={accountSummaries}
          insights={insights}
          onSelectTxn={setSelectedTxn}
          onSelectAccount={setActiveAccountId}
          onSelectAlert={(a) => {
            const t = allTransactions.find((tx) => tx.id === a.txn_id);
            if (t) setSelectedTxn(t);
          }}
          uploadStatus={uploadStatus}
          onUploadFiles={handleUploadFiles}
        />
      )}
      {tab === "tx" && <MobileTransactions transactions={filteredTxns} state={state} onSelectTxn={setSelectedTxn} />}
      {tab === "spend" && (
        <MobileSpending report={report} transactions={filteredTxns} allTransactions={allTransactions} state={state} onSelectTxn={setSelectedTxn} />
      )}
      {tab === "wealth" && (
        <MobileWealth state={state} summaries={accountSummaries} onSelectAccount={setActiveAccountId} />
      )}
      {tab === "cards" && (
        <MobileCards
          state={state}
          benefits={benefits}
          recommendations={recommendations}
          statementCoverage={statementCoverage}
          transactions={filteredTxns}
          onSelectTxn={setSelectedTxn}
          onSelectAccount={setActiveAccountId}
        />
      )}

      <MobileTabBar active={tab} onSelect={setTab} />

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} state={state} />

      <AccountDetailSheet
        account={state.accounts.find((a) => a.id === activeAccountId) ?? null}
        summary={accountSummaries.find((s) => s.account_id === activeAccountId) ?? null}
        benefits={benefits}
        transactions={filteredTxns}
        subscriptions={subscriptions}
        isPrimary={(() => {
          // Primary = the credit card with the most txns over the last 12 months.
          const ccs = state.accounts.filter((a) => a.type === "credit_card");
          let bestId: string | null = null;
          let best = -1;
          for (const a of ccs) {
            const s = accountSummaries.find((x) => x.account_id === a.id);
            if (s && s.txn_count_12mo > best) { best = s.txn_count_12mo; bestId = a.id; }
          }
          return activeAccountId === bestId && best > 0;
        })()}
        isDormant={(() => {
          if (!activeAccountId) return false;
          const s = accountSummaries.find((x) => x.account_id === activeAccountId);
          if (!s || !s.last_activity) return false;
          const days = Math.floor((Date.now() - new Date(s.last_activity).getTime()) / 86400000);
          return days >= 90;
        })()}
        onClose={() => setActiveAccountId(null)}
        onSelectTxn={(t) => { setActiveAccountId(null); setSelectedTxn(t); }}
        onAccountChanged={() => { refresh(); }}
      />

      <TransactionDetailSheet
        txn={selectedTxn}
        state={state}
        onClose={() => setSelectedTxn(null)}
        onCategoryChanged={async () => {
          // Refetch all transactions so the updated category propagates everywhere.
          const txns = await fetch("/api/transactions").then((r) => r.json());
          setAllTransactions(txns);
          // Also refresh the currently-open detail sheet's txn data
          if (selectedTxn) {
            const updated = txns.find((t: Transaction) => t.id === selectedTxn.id);
            if (updated) setSelectedTxn(updated);
          }
        }}
      />
    </div>
  );
}
