import React from "react";
import ReactDOM from "react-dom/client";
import { initOfflineEngine } from "./lib/offline-engine";

/**
 * Initialize mobile app
 */
function App() {
  React.useEffect(() => {
    const engine = initOfflineEngine();
    console.log("CAFM Mobile App initialized in offline-first mode");

    // Monitor online/offline status
    engine.onOnlineStatusChange((isOnline) => {
      console.log("Connectivity status:", isOnline ? "Online" : "Offline");
    });

    // Monitor sync status
    engine.onSyncStatusChange((status) => {
      console.log("Sync status:", status);
    });
  }, []);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>CAFM Enterprise Mobile Field Application</h1>
      <p>Phase 5: Offline-First Technician & QA Inspector Platform</p>

      <section style={{ marginTop: "20px" }}>
        <h2>Core Features</h2>
        <ul>
          <li>✅ Full offline persistence with IndexedDB</li>
          <li>✅ Automatic background sync + manual Sync Now trigger</li>
          <li>✅ Work session timer (Start/Pause/Stop)</li>
          <li>✅ Checklist step execution with audit trail</li>
          <li>✅ Photo compression before queuing</li>
          <li>✅ Multi-select equipment filtering</li>
          <li>✅ My WRs vs. Unassigned Trade Pool toggle</li>
          <li>✅ Numeric threshold validation with mandatory photos on failure</li>
          <li>✅ Immutable PM_StepAuditLog with SHA-256 checksums</li>
          <li>✅ One-tap WR Claim/Self-Assign</li>
        </ul>
      </section>

      <section style={{ marginTop: "20px" }}>
        <h2>Database Storage</h2>
        <p>
          All data persisted in <code>IndexedDB</code> with automatic fallback to{" "}
          <code>localStorage</code> for headless environments.
        </p>
        <ul>
          <li>Work Requests (My & Unassigned)</li>
          <li>Location Hierarchy (Building → Floor → Room)</li>
          <li>Equipment Registry</li>
          <li>PM Checklists & Step Definitions</li>
          <li>Work Sessions & Timer Logs</li>
          <li>Photo Upload Queue</li>
          <li>Sync Mutation Queue</li>
          <li>Immutable Audit Trail</li>
        </ul>
      </section>

      <section style={{ marginTop: "20px" }}>
        <h2>Sync Engine</h2>
        <p>Bidirectional sync with conflict resolution:</p>
        <ul>
          <li>Automatic sync when online</li>
          <li>Manual "Sync Now" button with status indicator</li>
          <li>Pending mutation badge count</li>
          <li>Last synced timestamp</li>
          <li>Online/Offline mode simulator toggle</li>
          <li>Conflict resolution preserving PM_StepAuditLog immutability</li>
        </ul>
      </section>

      <section style={{ marginTop: "20px" }}>
        <h2>Testing</h2>
        <p>Comprehensive test suite with 16 test groups covering:</p>
        <ul>
          <li>✅ IndexedDB persistence & retrieval</li>
          <li>✅ Sync queue conflict resolution</li>
          <li>✅ Multi-select equipment filtering</li>
          <li>✅ Checklist threshold validation</li>
          <li>✅ Timer override workflows</li>
          <li>✅ Audit log checksums</li>
          <li>✅ WR assignment & claim operations</li>
          <li>✅ Photo compression ratios</li>
        </ul>
      </section>

      <footer style={{ marginTop: "40px", borderTop: "1px solid #ccc", paddingTop: "20px" }}>
        <p style={{ fontSize: "0.9em", color: "#666" }}>
          CAFM Enterprise Platform v1.0 | Phase 5: Offline-First Mobile Field Application
        </p>
      </footer>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
