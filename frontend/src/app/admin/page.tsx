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
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'USER_LOGIN':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'FILE_UPLOAD':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      case 'FILE_DOWNLOAD':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'CLOUD_REBALANCE':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'FILE_DELETE':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      default:
        return 'bg-white/10 text-[#c1c6d7] border-white/20';
    }
  };

  if (authError) {
    return (
      <div className="min-h-screen bg-[#060913] text-white flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full glass-panel bg-slate-900/80 border border-red-500/30 p-8 rounded-3xl text-center space-y-5 shadow-2xl backdrop-blur-xl">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto text-red-400">
            <span className="material-symbols-outlined text-4xl">admin_panel_settings</span>
          </div>
          <h2 className="font-extrabold text-2xl tracking-tight text-white">Administrator Access Required</h2>
          <p className="text-xs text-slate-400 leading-relaxed">{authError}</p>
          <div className="pt-2 flex flex-col gap-3">
            <Link
              href="/login"
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg transition-all"
            >
              Sign In with Admin Account
            </Link>
            <Link
              href="/dashboard"
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all"
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
    <div className="min-h-screen bg-[#070b14] text-slate-100 font-sans selection:bg-blue-500 selection:text-white pb-16">
      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-[200] bg-slate-900/95 border border-cyan-500/40 text-cyan-300 px-5 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-2 animate-fadeIn backdrop-blur-md">
          <span className="material-symbols-outlined text-base">info</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Admin Header Bar */}
      <header className="sticky top-0 z-50 bg-[#0b101d]/90 backdrop-blur-xl border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 p-[1px] shadow-lg shadow-cyan-500/20">
                <div className="w-full h-full bg-[#0B0F19] rounded-[11px] flex items-center justify-center">
                  <span className="material-symbols-outlined text-cyan-400 text-2xl">admin_panel_settings</span>
                </div>
              </div>
              <div>
                <span className="font-extrabold text-xl tracking-tight text-white">
                  Cloud<span className="text-cyan-400">Fusion</span>
                </span>
                <span className="ml-2 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  ADMIN CONSOLE
                </span>
              </div>
            </Link>

            <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Multi-Cloud Security Perimeter Active</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="px-4 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-base">dashboard</span>
              <span>Switch to User Dashboard</span>
            </Link>

            <button
              onClick={() => {
                fetchAdminData();
                setToastMessage('Refreshed admin telemetry & audit ledger.');
                setTimeout(() => setToastMessage(null), 3000);
              }}
              title="Refresh Telemetry"
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-300 hover:text-white border border-white/10 transition-colors"
            >
              <span className="material-symbols-outlined text-base">refresh</span>
            </button>

            <button
              onClick={handleLogout}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 hover:text-white border border-white/10 transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">logout</span>
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Admin Workspace */}
      <main className="max-w-7xl mx-auto px-6 pt-8 space-y-8">
        {/* Page Title & Mission Statement */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-extrabold text-3xl text-white tracking-tight">System Administration & Telemetry</h1>
            <p className="text-xs text-slate-400 mt-1">
              Live monitoring of registered accounts, system-wide storage mesh consumption, and cryptographic audit records.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-900 border border-white/10 px-3.5 py-1.5 rounded-full w-fit">
            <span className="text-cyan-400 font-bold">Admin:</span>
            <span>{currentUser?.email || 'admin@cloudfusion.io'}</span>
          </div>
        </div>

        {/* 4 TELEMETRY HERO CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* CARD 1: Total Registered Users */}
          <div className="bg-slate-900/60 border border-white/10 p-6 rounded-3xl shadow-xl backdrop-blur-xl space-y-2 relative overflow-hidden group hover:border-cyan-500/40 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Users</span>
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <span className="material-symbols-outlined text-xl">group</span>
              </div>
            </div>
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {isLoading ? '...' : telemetry?.totalUsers ?? 0}
            </div>
            <p className="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold">
              <span className="material-symbols-outlined text-xs">check_circle</span>
              <span>100% Active Accounts</span>
            </p>
          </div>

          {/* CARD 2: System-wide Storage Stored */}
          <div className="bg-slate-900/60 border border-white/10 p-6 rounded-3xl shadow-xl backdrop-blur-xl space-y-2 relative overflow-hidden group hover:border-indigo-500/40 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Mesh Storage</span>
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <span className="material-symbols-outlined text-xl">database</span>
              </div>
            </div>
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {isLoading ? '...' : telemetry?.totalStoredGB ?? '0.00'} <span className="text-base text-slate-400 font-semibold">GB</span>
            </div>
            <p className="text-[11px] text-indigo-300 font-semibold truncate">
              {formatBytes(telemetry?.totalStoredBytes || 0)} Encrypted
            </p>
          </div>

          {/* CARD 3: Active Files & Replicas */}
          <div className="bg-slate-900/60 border border-white/10 p-6 rounded-3xl shadow-xl backdrop-blur-xl space-y-2 relative overflow-hidden group hover:border-purple-500/40 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Encrypted Assets</span>
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <span className="material-symbols-outlined text-xl">lock</span>
              </div>
            </div>
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {isLoading ? '...' : telemetry?.totalFiles ?? 0}
            </div>
            <p className="text-[11px] text-cyan-300 font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">shield</span>
              <span>{telemetry?.totalMirroredFiles ?? 0} Dual-Mirrored Replicas</span>
            </p>
          </div>

          {/* CARD 4: Security Audit Events */}
          <div className="bg-slate-900/60 border border-white/10 p-6 rounded-3xl shadow-xl backdrop-blur-xl space-y-2 relative overflow-hidden group hover:border-emerald-500/40 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Audit Ledger</span>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <span className="material-symbols-outlined text-xl">history_edu</span>
              </div>
            </div>
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {isLoading ? '...' : telemetry?.totalAuditEvents ?? 0}
            </div>
            <p className="text-[11px] text-slate-400 font-semibold">
              Immutable Cryptographic Log
            </p>
          </div>
        </div>

        {/* CLOUD MESH DISTRIBUTION METER */}
        <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-6 sm:p-8 space-y-4 backdrop-blur-xl shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-extrabold text-lg text-white">System-Wide Storage Mesh Distribution</h3>
              <p className="text-xs text-slate-400 mt-0.5">Real-time asset dispersion across all 5 connected cloud storage providers.</p>
            </div>
            <span className="text-xs font-mono text-cyan-400 font-bold px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 w-fit">
              AES-256-GCM Encrypted
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-2">
            {[
              { id: 'MEGA', name: 'MEGA', color: 'text-rose-400', border: 'border-rose-500/30', bg: 'bg-rose-500/10' },
              { id: 'GOOGLE_DRIVE', name: 'Google Drive', color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10' },
              { id: 'ONEDRIVE', name: 'OneDrive', color: 'text-cyan-400', border: 'border-cyan-500/30', bg: 'bg-cyan-500/10' },
              { id: 'AWS_S3', name: 'AWS S3', color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/10' },
              { id: 'DROPBOX', name: 'Dropbox', color: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500/10' },
            ].map((node) => {
              const nodeData = telemetry?.providerDistribution?.[node.id] || { count: 0, bytes: 0 };
              return (
                <div key={node.id} className={`p-4 rounded-2xl border ${node.border} ${node.bg} space-y-1 text-center`}>
                  <div className="text-xs font-bold text-slate-400 uppercase">{node.name}</div>
                  <div className={`text-lg font-extrabold ${node.color}`}>
                    {formatBytes(nodeData.bytes)}
                  </div>
                  <div className="text-[10px] text-slate-400">{nodeData.count} {nodeData.count === 1 ? 'file' : 'files'}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SECTION: REGISTERED USERS & ACCOUNT STATUS */}
        <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6 backdrop-blur-xl shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-extrabold text-xl text-white">Registered Users & Account Status</h2>
              <p className="text-xs text-slate-400 mt-0.5">Manage user authorization privileges and observe individual storage footprints.</p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-lg">search</span>
              <input
                type="text"
                placeholder="Search users by name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="text-[11px] font-bold text-slate-400 uppercase border-b border-white/10">
                <tr>
                  <th className="pb-3">User</th>
                  <th className="pb-3">Role</th>
                  <th className="pb-3">Joined</th>
                  <th className="pb-3">Files</th>
                  <th className="pb-3">Mesh Storage</th>
                  <th className="pb-3 text-right">Account Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No user accounts found matching your query.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-slate-800 border border-white/10 flex items-center justify-center font-bold text-cyan-400 text-xs">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-white text-sm">{u.name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                            u.role === 'ADMIN'
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                              : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
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
                      <td className="py-4 text-right">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>ACTIVE</span>
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION: SECURITY AUDIT LOG */}
        <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6 backdrop-blur-xl shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-extrabold text-xl text-white">Security Audit Log (Cryptographic Ledger)</h2>
              <p className="text-xs text-slate-400 mt-0.5">Timestamped ledger of AES encryption operations, rebalances, and authentication sessions.</p>
            </div>

            {/* Action Filter */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
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
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all shrink-0 ${
                    auditActionFilter === opt.id
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="text-[11px] font-bold text-slate-400 uppercase border-b border-white/10">
                <tr>
                  <th className="pb-3">Action Type</th>
                  <th className="pb-3">User / Actor</th>
                  <th className="pb-3">Details</th>
                  <th className="pb-3">IP Address</th>
                  <th className="pb-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 font-sans">
                      No security audit events recorded matching this filter.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-3.5">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border font-sans ${getActionBadgeClass(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3.5 text-slate-300 font-sans font-medium">
                        <div>{log.user?.email || 'System'}</div>
                        <div className="text-[10px] text-slate-500">{log.user?.role || 'SYSTEM'}</div>
                      </td>
                      <td className="py-3.5 text-slate-300 font-sans max-w-md break-words">
                        {log.details || '—'}
                      </td>
                      <td className="py-3.5 text-slate-400 text-[11px]">
                        {log.ipAddress}
                      </td>
                      <td className="py-3.5 text-right text-slate-400 text-[11px] whitespace-nowrap">
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
