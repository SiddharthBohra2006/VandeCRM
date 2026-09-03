// DashboardPage.tsx — PLACEHOLDER (boot baseline)
// OWNER: Codex (per CODEX-TASKS.md Task 3)
// This placeholder exists ONLY so the client typechecks to a green baseline.
// Codex must REPLACE this entire file with the real dashboard implementation.
import { useAuth } from '../../contexts/AuthContext';

export default function DashboardPage() {
  const { crmTerms } = useAuth();

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>
      <div className="empty-state">
        Dashboard is being built (Owner: Codex). {crmTerms.leadPlural} will appear here.
      </div>
    </div>
  );
}
