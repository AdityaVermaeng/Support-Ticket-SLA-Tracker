import React, { useState, useEffect, useCallback } from "react";
import {
  api,
  type User,
  type Ticket,
  type Comment,
  type DashboardStats,
} from "./api";
import {
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  LogOut,
  User as UserIcon,
  MessageSquare,
  Send,
  RefreshCw,
  LayoutDashboard,
  Ticket as TicketIcon,
} from "lucide-react";

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(api.getCurrentUser());
  const [activeTab, setActiveTab] = useState<"dashboard" | "tickets">("dashboard");

  // Auth Form State
  const [isRegistering, setIsRegistering] = useState(false);
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authRole, setAuthRole] = useState<"REPORTER" | "AGENT">("REPORTER");
  const [authError, setAuthError] = useState<string | null>(null);

  // Dashboard & Tickets State
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [userList, setUserList] = useState<User[]>([]);
  const [, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Filters State
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [slaFilter, setSlaFilter] = useState<string>("");

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM");

  // Selected Ticket Detail & Comment Modal
  const [selectedTicket, setSelectedTicket] = useState<(Ticket & { comments: Comment[] }) | null>(null);
  const [commentContent, setCommentContent] = useState("");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>("");

  // Fetch Dashboard & Tickets Data
  const fetchData = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const [dashboardData, ticketData] = await Promise.all([
        api.getDashboard(),
        api.getTickets({
          status: statusFilter || undefined,
          priority: priorityFilter || undefined,
          slaState: slaFilter || undefined,
        }),
      ]);
      setStats(dashboardData);
      setTickets(ticketData.nodes);

      if (currentUser.role === "AGENT") {
        const usersData = await api.getUsers();
        setUserList(usersData);
      }
    } catch (err: unknown) {
      const errorObj = err as Error;
      setError(errorObj.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [currentUser, statusFilter, priorityFilter, slaFilter]);

  useEffect(() => {
    if (currentUser) {
      fetchData();
      const interval = setInterval(fetchData, 15000);
      return () => clearInterval(interval);
    }
  }, [currentUser, fetchData]);

  // Auth Handlers
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      if (isRegistering) {
        const res = await api.register(authName, authEmail, authPassword, authRole);
        setCurrentUser(res.user);
      } else {
        const res = await api.login(authEmail, authPassword);
        setCurrentUser(res.user);
      }
    } catch (err: unknown) {
      const errorObj = err as Error;
      setAuthError(errorObj.message || "Authentication failed");
    }
  };

  const handleLogout = () => {
    api.clearAuth();
    setCurrentUser(null);
  };

  // Create Ticket Handler
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setModalError(null);
    try {
      await api.createTicket(newTitle, newDescription, newPriority);
      setShowCreateModal(false);
      setNewTitle("");
      setNewDescription("");
      setNewPriority("MEDIUM");
      fetchData();
    } catch (err: unknown) {
      const errorObj = err as Error;
      setModalError(errorObj.message || "Failed to create ticket");
    }
  };

  // Open Ticket Details Modal
  const handleOpenTicket = async (id: string) => {
    setModalError(null);
    try {
      const detailed = await api.getTicketById(id);
      setSelectedTicket(detailed);
      setSelectedAssigneeId(detailed.assignedTo?.id || "");
    } catch (err: unknown) {
      const errorObj = err as Error;
      setError(errorObj.message || "Failed to fetch ticket details");
    }
  };

  // Add Comment Handler
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !commentContent.trim()) return;
    setModalError(null);
    try {
      await api.addComment(selectedTicket.id, commentContent);
      setCommentContent("");
      // Refresh ticket details
      const updated = await api.getTicketById(selectedTicket.id);
      setSelectedTicket(updated);
      fetchData();
    } catch (err: unknown) {
      const errorObj = err as Error;
      setModalError(errorObj.message || "Failed to post comment");
    }
  };

  // Status Change Handler
  const handleStatusChange = async (newStatus: string) => {
    if (!selectedTicket) return;
    setModalError(null);
    try {
      await api.changeTicketStatus(selectedTicket.id, newStatus);
      const detailed = await api.getTicketById(selectedTicket.id);
      setSelectedTicket(detailed);
      fetchData();
    } catch (err: unknown) {
      const errorObj = err as Error;
      setModalError(errorObj.message || "Failed to update status");
    }
  };

  // Assignee Update Handler
  const handleAssigneeUpdate = async (newAssigneeId: string) => {
    if (!selectedTicket || !newAssigneeId) return;
    setModalError(null);
    try {
      setSelectedAssigneeId(newAssigneeId);
      await api.assignTicket(selectedTicket.id, newAssigneeId);
      const detailed = await api.getTicketById(selectedTicket.id);
      setSelectedTicket(detailed);
      fetchData();
    } catch (err: unknown) {
      const errorObj = err as Error;
      setModalError(errorObj.message || "Failed to assign ticket");
    }
  };

  // Format SLA Minutes Helper
  const formatSlaTime = (minutes: number, state: string) => {
    if (state === "BREACHED" || minutes <= 0) {
      return <span className="badge badge-breached"><AlertTriangle size={12} /> BREACHED</span>;
    }
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const label = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    if (state === "AT_RISK") {
      return <span className="badge badge-at-risk"><Clock size={12} /> {label} remaining</span>;
    }
    return <span className="badge badge-on-track"><CheckCircle2 size={12} /> {label} remaining</span>;
  };

  // Filter agents for assignment dropdown
  const staffMembers = userList.filter((u: User) => u.role === "AGENT");

  // RENDER: Unauthenticated View (Login / Register)
  if (!currentUser) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div className="glass-panel" style={{ width: "100%", maxWidth: 440, padding: 32 }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ display: "inline-flex", padding: 12, borderRadius: 16, background: "rgba(99, 102, 241, 0.2)", color: "#818cf8", marginBottom: 12 }}>
              <ShieldAlert size={32} />
            </div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Support SLA Tracker</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: 4 }}>
              {isRegistering ? "Create your account" : "Sign in to manage support tickets"}
            </p>
          </div>

          {authError && (
            <div style={{ padding: "10px 14px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 8, color: "#f87171", fontSize: "0.85rem", marginBottom: 16 }}>
              {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {isRegistering && (
              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Full Name</label>
                <input type="text" required className="input-field" value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="Jane Doe" />
              </div>
            )}

            <div>
              <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Email Address</label>
              <input type="email" required className="input-field" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="user@example.com" />
            </div>

            <div>
              <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Password</label>
              <input type="password" required className="input-field" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="••••••••" />
            </div>

            {isRegistering && (
              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Role</label>
                <select className="input-field" value={authRole} onChange={(e) => setAuthRole(e.target.value as "REPORTER" | "AGENT")}>
                  <option value="REPORTER">REPORTER (Raise tickets)</option>
                  <option value="AGENT">AGENT (Manage & assign tickets)</option>
                </select>
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }}>
              {isRegistering ? "Create Account" : "Sign In"}
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: 20 }}>
            <button onClick={() => setIsRegistering(!isRegistering)} style={{ background: "none", border: "none", color: "#818cf8", fontSize: "0.85rem", cursor: "pointer" }}>
              {isRegistering ? "Already have an account? Sign in" : "Need an account? Register here"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // RENDER: Authenticated Dashboard UI
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top Navbar */}
      <header className="glass-panel" style={{ borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0, padding: "14px 24px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ padding: 8, background: "rgba(99, 102, 241, 0.2)", borderRadius: 10, color: "#818cf8" }}>
              <ShieldAlert size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, lineHeight: 1.2 }}>Support Ticket SLA Tracker</h2>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Asia/Kolkata Business Hours (09:00 - 18:00 M-F)</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", padding: "6px 12px", borderRadius: 20, border: "1px solid var(--border-color)" }}>
              <UserIcon size={16} color="#818cf8" />
              <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{currentUser.name}</span>
              <span className={`badge badge-${currentUser.role.toLowerCase()}`} style={{ fontSize: "0.65rem", padding: "2px 6px" }}>{currentUser.role}</span>
            </div>

            <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }}>
              <LogOut size={14} /> Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Container */}
      <main style={{ maxWidth: 1280, width: "100%", margin: "0 auto", padding: 24, flex: 1, display: "flex", flexDirection: "column", gap: 24 }}>
        
        {/* Actions & Tab Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`btn ${activeTab === "dashboard" ? "btn-primary" : "btn-secondary"}`}
            >
              <LayoutDashboard size={16} /> Dashboard
            </button>
            <button
              onClick={() => setActiveTab("tickets")}
              className={`btn ${activeTab === "tickets" ? "btn-primary" : "btn-secondary"}`}
            >
              <TicketIcon size={16} /> Tickets ({tickets.length})
            </button>
          </div>

          <button onClick={() => { setModalError(null); setShowCreateModal(true); }} className="btn btn-primary">
            <PlusCircle size={16} /> Create Ticket
          </button>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div style={{ padding: "12px 16px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 10, color: "#f87171", fontSize: "0.9rem" }}>
            {error}
          </div>
        )}

        {/* TAB 1: DASHBOARD ANALYTICS */}
        {activeTab === "dashboard" && stats && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Stat Cards Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              <div className="glass-panel" style={{ padding: 20 }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Total Tickets</span>
                <h3 style={{ fontSize: "1.8rem", fontWeight: 700, marginTop: 4 }}>{stats.totalTickets}</h3>
              </div>
              <div className="glass-panel" style={{ padding: 20 }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Open</span>
                <h3 style={{ fontSize: "1.8rem", fontWeight: 700, color: "#60a5fa", marginTop: 4 }}>{stats.openTickets}</h3>
              </div>
              <div className="glass-panel" style={{ padding: 20 }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>In Progress</span>
                <h3 style={{ fontSize: "1.8rem", fontWeight: 700, color: "#fbbf24", marginTop: 4 }}>{stats.inProgressTickets}</h3>
              </div>
              <div className="glass-panel" style={{ padding: 20 }}>
                <span style={{ fontSize: "0.8rem", color: "#f59e0b" }}>SLA At Risk</span>
                <h3 style={{ fontSize: "1.8rem", fontWeight: 700, color: "#f59e0b", marginTop: 4 }}>{stats.atRiskTickets}</h3>
              </div>
              <div className="glass-panel" style={{ padding: 20 }}>
                <span style={{ fontSize: "0.8rem", color: "#ef4444" }}>SLA Breached</span>
                <h3 style={{ fontSize: "1.8rem", fontWeight: 700, color: "#ef4444", marginTop: 4 }}>{stats.breachedTickets}</h3>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TICKET DIRECTORY & FILTERS */}
        {activeTab === "tickets" && (
          <div className="glass-panel" style={{ padding: 20 }}>
            {/* Filters Control Bar */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
              <select className="input-field" style={{ width: "auto" }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="OPEN">OPEN</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="CLOSED">CLOSED</option>
              </select>

              <select className="input-field" style={{ width: "auto" }} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                <option value="">All Priorities</option>
                <option value="URGENT">URGENT</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>

              <select className="input-field" style={{ width: "auto" }} value={slaFilter} onChange={(e) => setSlaFilter(e.target.value)}>
                <option value="">All SLA States</option>
                <option value="ON_TRACK">ON_TRACK</option>
                <option value="AT_RISK">AT_RISK</option>
                <option value="BREACHED">BREACHED</option>
              </select>

              <button onClick={fetchData} className="btn btn-secondary">
                <RefreshCw size={14} /> Refresh
              </button>
            </div>

            {/* Ticket Table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                    <th style={{ padding: "12px 16px" }}>TICKET</th>
                    <th style={{ padding: "12px 16px" }}>PRIORITY</th>
                    <th style={{ padding: "12px 16px" }}>STATUS</th>
                    <th style={{ padding: "12px 16px" }}>ASSIGNEE</th>
                    <th style={{ padding: "12px 16px" }}>RESOLUTION SLA</th>
                    <th style={{ padding: "12px 16px" }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
                        No tickets found matching current filters.
                      </td>
                    </tr>
                  ) : (
                    tickets.map((ticket: Ticket) => (
                      <tr key={ticket.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ fontWeight: 600 }}>#{ticket.id.slice(0, 8)} — {ticket.title}</div>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                            Raised by {ticket.createdBy.name} • {new Date(ticket.createdAt).toLocaleString()}
                          </div>
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <span className={`badge badge-${ticket.priority.toLowerCase()}`}>{ticket.priority}</span>
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: ticket.status === "OPEN" ? "#60a5fa" : ticket.status === "IN_PROGRESS" ? "#fbbf24" : "#34d399" }}>
                            {ticket.status}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px", fontSize: "0.85rem" }}>
                          {ticket.assignedTo ? ticket.assignedTo.name : <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Unassigned</span>}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          {formatSlaTime(ticket.sla.resolutionRemainingMinutes, ticket.sla.resolutionState)}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <button onClick={() => handleOpenTicket(ticket.id)} className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "0.8rem" }}>
                            View Ticket
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* CREATE TICKET MODAL */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content">
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 16 }}>Raise Support Ticket</h3>
            {modalError && (
              <div style={{ padding: "10px 14px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 8, color: "#f87171", fontSize: "0.85rem", marginBottom: 16 }}>
                {modalError}
              </div>
            )}
            <form onSubmit={handleCreateTicket} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Title</label>
                <input type="text" required className="input-field" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Summary of issue..." />
              </div>

              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Description</label>
                <textarea required rows={4} className="input-field" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Detailed steps or info..." />
              </div>

              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Priority (SLA Tier)</label>
                <select className="input-field" value={newPriority} onChange={(e) => setNewPriority(e.target.value as "LOW" | "MEDIUM" | "HIGH" | "URGENT")}>
                  <option value="URGENT">URGENT (1h response / 4h resolution)</option>
                  <option value="HIGH">HIGH (4h response / 24h resolution)</option>
                  <option value="MEDIUM">MEDIUM (8h response / 48h resolution)</option>
                  <option value="LOW">LOW (24h response / 72h resolution)</option>
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 12 }}>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Create Ticket</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TICKET DETAILS & COMMENTS MODAL */}
      {selectedTicket && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ maxWidth: 780 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <span className={`badge badge-${selectedTicket.priority.toLowerCase()}`}>{selectedTicket.priority}</span>
                <h2 style={{ fontSize: "1.3rem", fontWeight: 700, marginTop: 6 }}>#{selectedTicket.id.slice(0, 8)} — {selectedTicket.title}</h2>
              </div>
              <button onClick={() => setSelectedTicket(null)} className="btn btn-secondary" style={{ padding: "4px 10px" }}>✕</button>
            </div>

            {modalError && (
              <div style={{ padding: "10px 14px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 8, color: "#f87171", fontSize: "0.85rem", marginBottom: 16 }}>
                {modalError}
              </div>
            )}

            <p style={{ color: "#d1d5db", fontSize: "0.95rem", lineHeight: 1.5, background: "rgba(0,0,0,0.3)", padding: 14, borderRadius: 8, marginBottom: 20 }}>
              {selectedTicket.description}
            </p>

            {/* SLA Status Card */}
            <div style={{ background: "rgba(99, 102, 241, 0.1)", border: "1px solid rgba(99, 102, 241, 0.2)", borderRadius: 10, padding: 16, marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>First Response SLA</span>
                <div style={{ marginTop: 6 }}>
                  {formatSlaTime(selectedTicket.sla.firstResponseRemainingMinutes, selectedTicket.sla.firstResponseState)}
                </div>
                {selectedTicket.firstResponseAt && (
                  <div style={{ fontSize: "0.75rem", color: "#34d399", marginTop: 4 }}>
                    Recorded at {new Date(selectedTicket.firstResponseAt).toLocaleString()}
                  </div>
                )}
              </div>

              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Resolution SLA</span>
                <div style={{ marginTop: 6 }}>
                  {formatSlaTime(selectedTicket.sla.resolutionRemainingMinutes, selectedTicket.sla.resolutionState)}
                </div>
                {selectedTicket.resolvedAt && (
                  <div style={{ fontSize: "0.75rem", color: "#34d399", marginTop: 4 }}>
                    Resolved at {new Date(selectedTicket.resolvedAt).toLocaleString()}
                  </div>
                )}
              </div>
            </div>

            {/* Ticket Management Controls (Agent) */}
            {currentUser.role === "AGENT" && (
              <div style={{ background: "rgba(0,0,0,0.2)", padding: 16, borderRadius: 8, marginBottom: 20, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>Update Status</span>
                  <select className="input-field" style={{ padding: "6px 10px", fontSize: "0.85rem" }} value={selectedTicket.status} onChange={(e) => handleStatusChange(e.target.value)}>
                    <option value="OPEN">OPEN</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="RESOLVED">RESOLVED</option>
                    <option value="CLOSED">CLOSED</option>
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>Assignee</span>
                  <select
                    className="input-field"
                    style={{ padding: "6px 10px", fontSize: "0.85rem" }}
                    value={selectedAssigneeId}
                    onChange={(e) => handleAssigneeUpdate(e.target.value)}
                  >
                    <option value="">-- Select Assignee --</option>
                    {staffMembers.map((s: User) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Comments Thread */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              <h4 style={{ fontSize: "0.95rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <MessageSquare size={16} /> Comments ({selectedTicket.comments.length})
              </h4>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 240, overflowY: "auto", paddingRight: 4 }}>
                {selectedTicket.comments.map((c: Comment) => (
                  <div key={c.id} style={{ background: "rgba(255,255,255,0.03)", padding: 12, borderRadius: 8, border: "1px solid var(--border-color)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: "#e5e7eb" }}>{c.author.name} ({c.author.role})</span>
                      <span>{new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: "0.875rem" }}>{c.content}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Post Comment Form */}
            <form onSubmit={handleAddComment} style={{ display: "flex", gap: 10 }}>
              <input type="text" required placeholder="Type a response or update..." className="input-field" value={commentContent} onChange={(e) => setCommentContent(e.target.value)} />
              <button type="submit" className="btn btn-primary" style={{ padding: "8px 16px" }}>
                <Send size={16} /> Send
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
