'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';

interface TelemetryData {
  totalUsers: number;
  totalFiles: number;
  totalStoredBytes: string;
  totalStoredGB: string;
  totalMirroredFiles: number;
  totalAuditEvents: number;
  providerDistribution: Record<string, { count: number; bytes: number }>;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER';
  isMfaEnabled: boolean;
  createdAt: string;
  activeFilesCount: number;
  usedStorageBytes: string;
  status: 'ACTIVE' | 'SUSPENDED';
}

interface AuditItem {
  id: string;
  action: string;
  details: string | null;
  ipAddress: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

export default function CloudFusionAdminConsole() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Telemetry & Data States
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [usersList, setUsersList] = useState<UserItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditItem[]>([]);

  // Search & Filter States
  const [userSearch, setUserSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('ALL');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const formatBytes = (bytesVal: any): string => {
    const bytes = Number(bytesVal);
    if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const fetchAdminData = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('cloudfusion_token');
      if (!token) {
        setAuthError('Authentication session missing. Please log in with administrator credentials.');
        setIsLoading(false);
        return;
      }

      const headers = { Authorization: `Bearer ${token}` };

      const [telemetryRes, usersRes, logsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/telemetry`, { headers, credentials: 'include' }),
        fetch(`${API_BASE_URL}/api/admin/users`, { headers, credentials: 'include' }),
        fetch(`${API_BASE_URL}/api/admin/audit-logs`, { headers, credentials: 'include' }),
      ]);

      if (telemetryRes.status === 403 || usersRes.status === 403) {
        setAuthError('Administrator access restricted. Your account does not possess the ADMIN role.');
        setIsLoading(false);
        return;
      }

      if (telemetryRes.ok) {
        const data = await telemetryRes.json();
        setTelemetry(data.telemetry);
      }

      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsersList(data.users || []);
      }

      if (logsRes.ok) {
        const data = await logsRes.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err: any) {
      console.warn('Admin fetch notice:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    document.title = 'CloudFusion | Administrator Console';

    const storedUserStr = localStorage.getItem('cloudfusion_user');
    if (storedUserStr) {
      try {
        const u = JSON.parse(storedUserStr);
        setCurrentUser(u);
        if (u.role !== 'ADMIN') {
          setAuthError('Access Denied. You must be signed in with an Administrator account.');
          setIsLoading(false);
          return;
        }
      } catch {}
    } else {
      setAuthError('Session expired. Please log in.');
      setIsLoading(false);
      return;
    }

    fetchAdminData();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('cloudfusion_token');
    localStorage.removeItem('cloudfusion_user');
    router.push('/login');
  };

  const getActionBadgeClass = (action: string) => {
    switch (action) {
      case 'USER_REGISTER':
      case 'USER_LOGIN':
      case 'FILE_UPLOAD':
      case 'CLOUD_REBALANCE':
        return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
      default:
        return 'bg-slate-800/80 text-slate-300 border-white/10';
    }
  };

  if (authError) {
    return (
      <div className="min-h-screen bg-[#070b14] text-slate-100 flex items-center justify-center p-6 font-['Times_New_Roman',Times,Georgia,serif]">
        <div className="max-w-md w-full bg-[#0b101d] border border-cyan-500/30 p-8 rounded-2xl text-center space-y-5 shadow-2xl backdrop-blur-xl">
          <div className="text-cyan-400 font-bold text-sm tracking-widest uppercase">
            [ Security Alert ]
          </div>
          <h2 className="font-bold text-2xl tracking-tight text-white">Administrator Access Required</h2>
          <p className="text-sm text-slate-400 leading-relaxed">{authError}</p>
          <div className="pt-2 flex flex-col gap-3">
            <Link
              href="/login"
              className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wider uppercase transition-all shadow-lg shadow-cyan-500/20"
            >
              Sign In with Admin Account
            </Link>
            <Link
              href="/dashboard"
              className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold text-xs tracking-wider uppercase border border-white/10 transition-all"
            >
              Return to User Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const filteredUsers = usersList.filter((u) => {
    if (!userSearch) return true;
    const term = userSearch.toLowerCase();
    return u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term);
  });

  const filteredLogs = auditLogs.filter((log) => {
    if (auditActionFilter === 'ALL') return true;
    return log.action === auditActionFilter;
  });

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 font-['Times_New_Roman',Times,Georgia,serif] selection:bg-cyan-500 selection:text-slate-950 pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-[200] bg-[#0b101d]/95 border border-cyan-500/40 text-cyan-300 px-5 py-3 rounded-xl shadow-2xl text-xs font-bold animate-fadeIn backdrop-blur-md">
          {toastMessage}
        </div>
      )}

      {/* Top Admin Navigation Bar */}
      <header className="sticky top-0 z-50 bg-[#0b101d]/95 backdrop-blur-xl border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="group flex items-center gap-2">
              <span className="font-bold text-2xl tracking-tight text-white">
                Cloud<span className="text-cyan-400">Fusion</span>
              </span>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 uppercase tracking-wider">
                Admin Console
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-3 font-sans">
            <Link
              href="/dashboard"
              className="px-4 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-semibold transition-all shadow-sm"
            >
              Switch to User Dashboard
            </Link>

            <button
              onClick={() => {
                fetchAdminData();
                setToastMessage('Refreshed admin telemetry and audit ledger.');
                setTimeout(() => setToastMessage(null), 3000);
              }}
              title="Refresh Telemetry"
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition-colors"
            >
              Refresh
            </button>

            <button
              onClick={handleLogout}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white border border-white/10 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Admin Workspace */}
      <main className="max-w-7xl mx-auto px-6 pt-8 space-y-8">
        {/* Page Title & Mission Statement */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-bold text-3xl text-white tracking-tight">System Administration & Telemetry</h1>
            <p className="text-sm text-slate-400 mt-1 italic">
              Live monitoring of registered accounts, multi-cloud storage distribution, and cryptographic audit records.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900 border border-white/10 px-4 py-1.5 rounded-full w-fit font-sans">
            <span className="text-cyan-400 font-bold uppercase tracking-wider">Admin:</span>
            <span>{currentUser?.email || 'admin@cloudfusion.io'}</span>
          </div>
        </div>

        {/* 4 TELEMETRY HERO CARDS - ROMAN NUMERALS & TWO-COLOR PALETTE */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* CARD I: Total Registered Users */}
          <div className="bg-[#0b101d] border border-white/10 hover:border-cyan-500/40 p-6 rounded-2xl shadow-xl space-y-2 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">I. Total Users</span>
              <span className="text-xs font-bold text-cyan-400 tracking-wider">PART I</span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight">
              {isLoading ? '...' : telemetry?.totalUsers ?? 0}
            </div>
            <p className="text-xs text-cyan-400 font-semibold">
              Active Accounts Provisioned
            </p>
          </div>

          {/* CARD II: System-wide Storage Stored */}
          <div className="bg-[#0b101d] border border-white/10 hover:border-cyan-500/40 p-6 rounded-2xl shadow-xl space-y-2 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">II. Mesh Storage</span>
              <span className="text-xs font-bold text-cyan-400 tracking-wider">PART II</span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight">
              {isLoading ? '...' : telemetry?.totalStoredGB ?? '0.00'} <span className="text-base text-slate-400 font-normal">GB</span>
            </div>
            <p className="text-xs text-slate-400 truncate">
              {formatBytes(telemetry?.totalStoredBytes || 0)} Under AES-256 Mesh
            </p>
          </div>

          {/* CARD III: Active Files & Replicas */}
          <div className="bg-[#0b101d] border border-white/10 hover:border-cyan-500/40 p-6 rounded-2xl shadow-xl space-y-2 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">III. Encrypted Assets</span>
              <span className="text-xs font-bold text-cyan-400 tracking-wider">PART III</span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight">
              {isLoading ? '...' : telemetry?.totalFiles ?? 0}
            </div>
            <p className="text-xs text-cyan-400 font-semibold">
              {telemetry?.totalMirroredFiles ?? 0} Dual-Mirrored Replicas
            </p>
          </div>

          {/* CARD IV: Security Audit Events */}
          <div className="bg-[#0b101d] border border-white/10 hover:border-cyan-500/40 p-6 rounded-2xl shadow-xl space-y-2 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">IV. Audit Ledger</span>
              <span className="text-xs font-bold text-cyan-400 tracking-wider">PART IV</span>
            </div>
            <div className="text-3xl font-bold text-white tracking-tight">
              {isLoading ? '...' : telemetry?.totalAuditEvents ?? 0}
            </div>
            <p className="text-xs text-slate-400">
              Immutable Cryptographic Records
            </p>
          </div>
        </div>

        {/* SECTION I: CLOUD MESH DISTRIBUTION */}
        <div className="bg-[#0b101d] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-xl text-white">Section I — Storage Mesh Distribution</h3>
              <p className="text-xs text-slate-400 mt-0.5 italic">Asset dispersion across connected cloud storage providers.</p>
            </div>
            <span className="text-xs font-bold text-cyan-400 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 w-fit uppercase tracking-wider font-sans">
              AES-256-GCM Encrypted
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-2">
            {[
              { id: 'MEGA', name: 'MEGA' },
              { id: 'GOOGLE_DRIVE', name: 'Google Drive' },
              { id: 'ONEDRIVE', name: 'OneDrive' },
              { id: 'AWS_S3', name: 'AWS S3' },
              { id: 'DROPBOX', name: 'Dropbox' },
            ].map((node, idx) => {
              const romanNums = ['I', 'II', 'III', 'IV', 'V'];
              const nodeData = telemetry?.providerDistribution?.[node.id] || { count: 0, bytes: 0 };
              return (
                <div
                  key={node.id}
                  className="p-4 rounded-xl border border-white/10 bg-slate-900/60 hover:border-cyan-500/40 space-y-1 text-center transition-colors"
                >
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    {romanNums[idx]}. {node.name}
                  </div>
                  <div className="text-lg font-bold text-cyan-400">
                    {formatBytes(nodeData.bytes)}
                  </div>
                  <div className="text-xs text-slate-400">
                    {nodeData.count} {nodeData.count === 1 ? 'file' : 'files'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECTION II: REGISTERED USERS & ACCOUNT STATUS */}
        <div className="bg-[#0b101d] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-xl text-white">Section II — Registered Users & Account Status</h2>
              <p className="text-xs text-slate-400 mt-0.5 italic">Individual storage footprints and user account statuses.</p>
            </div>

            {/* Search Input */}
            <div className="w-full sm:w-72 font-sans">
              <input
                type="text"
                placeholder="Search by name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full px-4 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-white/10">
                <tr>
                  <th className="pb-3">User</th>
                  <th className="pb-3">Role</th>
                  <th className="pb-3">Joined</th>
                  <th className="pb-3">Files</th>
                  <th className="pb-3">Mesh Storage</th>
                  <th className="pb-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 italic">
                      No user accounts found matching your query.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u, index) => (
                    <tr key={u.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-4">
                        <div>
                          <div className="font-bold text-white text-sm">{u.name}</div>
                          <div className="text-xs text-slate-400">{u.email}</div>
                        </div>
                      </td>
                      <td className="py-4 font-sans">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            u.role === 'ADMIN'
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                              : 'bg-slate-900 text-slate-300 border-white/10'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-4 text-slate-400">
                        {new Date(u.createdAt).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-4 font-semibold text-white">
                        {u.activeFilesCount} files
                      </td>
                      <td className="py-4 font-semibold text-cyan-300">
                        {formatBytes(u.usedStorageBytes)}
                      </td>
                      <td className="py-4 text-right font-sans">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                          Active
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION III: SECURITY AUDIT LOG */}
        <div className="bg-[#0b101d] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-xl text-white">Section III — Security Audit Log</h2>
              <p className="text-xs text-slate-400 mt-0.5 italic">Timestamped ledger of cryptographic operations, rebalances, and authentication sessions.</p>
            </div>

            {/* Action Filter */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 font-sans">
              {[
                { id: 'ALL', label: 'All Events' },
                { id: 'FILE_UPLOAD', label: 'Uploads' },
                { id: 'CLOUD_REBALANCE', label: 'Rebalances' },
                { id: 'USER_LOGIN', label: 'Logins' },
                { id: 'USER_REGISTER', label: 'Registrations' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setAuditActionFilter(opt.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold tracking-wider transition-all shrink-0 ${
                    auditActionFilter === opt.id
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-white/10">
                <tr>
                  <th className="pb-3">Action Type</th>
                  <th className="pb-3">User / Actor</th>
                  <th className="pb-3">Details</th>
                  <th className="pb-3">IP Address</th>
                  <th className="pb-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 italic">
                      No security audit events recorded matching this filter.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3.5 font-sans">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider ${getActionBadgeClass(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3.5 text-slate-300">
                        <div>{log.user?.email || 'System'}</div>
                        <div className="text-[11px] text-slate-500">{log.user?.role || 'SYSTEM'}</div>
                      </td>
                      <td className="py-3.5 text-slate-300 max-w-md break-words">
                        {log.details || '—'}
                      </td>
                      <td className="py-3.5 text-slate-400 text-xs">
                        {log.ipAddress}
                      </td>
                      <td className="py-3.5 text-right text-slate-400 text-xs whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
