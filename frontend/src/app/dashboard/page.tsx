'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api';

interface UploadProgressItem {
  id: string;
  name: string;
  provider: string;
  providerBadgeClass: string;
  sizeProgress: string;
  percentage: number;
  status: 'UPLOADING' | 'COMPLETE';
  icon: string;
}

interface ActivityItem {
  id: string;
  fileName: string;
  cloudSource: 'Google Drive' | 'Dropbox' | 'AWS S3' | 'MEGA' | 'MS OneDrive';
  rawCloudProvider?: string;
  size: string;
  sizeBytes?: number;
  mimeType?: string;
  checksumSHA256?: string;
  isMirrored?: boolean;
  mirrorProvider?: string | null;
  timestamp: string;
  status: 'COMPLETED' | 'SYNCING' | 'VERIFIED';
  icon: string;
}

interface CloudConnector {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  colorClass: string;
  isLinked: boolean;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'SECURITY' | 'STORAGE' | 'SUCCESS' | 'INFO';
  timestamp: string;
  isRead: boolean;
  icon: string;
}

export default function CloudFusionAppDashboard() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [user, setUser] = useState<{ name?: string; email?: string; role?: string } | null>(null);

  const [activeNav, setActiveNav] = useState<'dashboard' | 'files' | 'analytics' | 'settings' | 'notifications'>('dashboard');
  const [selectedDestination, setSelectedDestination] = useState<'AI' | 'S3' | 'DROPBOX' | 'GDRIVE' | 'ONEDRIVE' | 'MEGA'>('AI');
  const [dragActive, setDragActive] = useState(false);

  // Notification States
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'ALL' | 'UNREAD' | 'SECURITY' | 'STORAGE'>('ALL');
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif-1',
      title: 'AES-256 Mesh Encryption Active',
      message: 'Zero-knowledge encryption keys initialized successfully for your multi-cloud session.',
      type: 'SECURITY',
      timestamp: '5 mins ago',
      isRead: false,
      icon: 'shield_lock',
    },
    {
      id: 'notif-2',
      title: 'Multi-Cloud Auto-Balance Complete',
      message: 'Files successfully distributed across Google Drive and AWS S3 nodes.',
      type: 'SUCCESS',
      timestamp: '15 mins ago',
      isRead: false,
      icon: 'sync_saved_loc',
    },
    {
      id: 'notif-3',
      title: 'Storage Quota Insight',
      message: '52 GB aggregate pool active across 5 cloud providers.',
      type: 'STORAGE',
      timestamp: '1 hour ago',
      isRead: false,
      icon: 'database',
    },
    {
      id: 'notif-4',
      title: 'System Audit Verified',
      message: 'SHA-256 checksum verification passed for all active file metadata records.',
      type: 'INFO',
      timestamp: '3 hours ago',
      isRead: true,
      icon: 'verified',
    },
  ]);

  // Google Drive Modal State
  const [showGDriveModal, setShowGDriveModal] = useState(false);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);

  // AWS S3 Modal State
  const [showS3Modal, setShowS3Modal] = useState(false);
  const [s3Mode, setS3Mode] = useState<'managed' | 'custom'>('managed');
  const [s3AccessKey, setS3AccessKey] = useState('');
  const [s3SecretKey, setS3SecretKey] = useState('');
  const [s3Region, setS3Region] = useState('eu-north-1');
  const [s3Bucket, setS3Bucket] = useState('');
  const [isSavingS3, setIsSavingS3] = useState(false);
  const [s3Error, setS3Error] = useState<string | null>(null);

  // MEGA Modal State
  const [showMegaModal, setShowMegaModal] = useState(false);
  const [megaMode, setMegaMode] = useState<'managed' | 'custom'>('managed');
  const [megaEmail, setMegaEmail] = useState('');
  const [megaPassword, setMegaPassword] = useState('');
  const [isSavingMega, setIsSavingMega] = useState(false);
  const [megaError, setMegaError] = useState<string | null>(null);

  const handleConnectS3 = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingS3(true);
    setS3Error(null);

    try {
      const token = localStorage.getItem('cloudfusion_token');
      const payload: any = {
        provider: 'AWS_S3',
        accessKeyId: s3AccessKey,
        secretAccessKey: s3SecretKey,
        region: s3Region || 'eu-north-1',
        bucketName: s3Bucket,
      };

      const res = await fetch(`${API_BASE_URL}/api/storage/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to authenticate AWS S3.');
      }

      setShowS3Modal(false);
      setToastMessage('🎉 AWS S3 connected successfully to your storage mesh!');
      setTimeout(() => setToastMessage(null), 5000);
      await fetchStorageQuota();
      await fetchCloudAccounts();
    } catch (err: any) {
      setS3Error(err.message || 'Verification failed.');
    } finally {
      setIsSavingS3(false);
    }
  };

  const handleConnectMega = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingMega(true);
    setMegaError(null);

    try {
      const token = localStorage.getItem('cloudfusion_token');
      const targetEmail = user?.email || megaEmail;
      const payload: any = {
        provider: 'MEGA',
        email: targetEmail,
        password: megaPassword,
      };

      const res = await fetch(`${API_BASE_URL}/api/storage/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to authenticate with MEGA.');
      }

      setShowMegaModal(false);
      setMegaPassword('');
      setToastMessage('🎉 MEGA 20 GB Cloud Node Connected Successfully!');
      setTimeout(() => setToastMessage(null), 5000);
      await fetchStorageQuota();
      await fetchCloudAccounts();
    } catch (err: any) {
      setMegaError(err.message || 'Authentication failed.');
    } finally {
      setIsSavingMega(false);
    }
  };

  const markAllNotificationsAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const toggleNotificationRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: !n.isRead } : n)));
  };

  const deleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  // Settings State
  const [mfaEnabled, setMfaEnabled] = useState(true);
  const [autoIntegrityAudit, setAutoIntegrityAudit] = useState<'REALTIME' | 'DAILY' | 'WEEKLY'>('REALTIME');
  const [balanceStrategy, setBalanceStrategy] = useState<'MAX_FREE' | 'LOWEST_LATENCY' | 'DUAL_MIRROR'>('MAX_FREE');

  // Analytics action states
  const [archiveApplied, setArchiveApplied] = useState(false);
  const [dedupAnalyzed, setDedupAnalyzed] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeUploadModal, setActiveUploadModal] = useState<{
    fileName: string;
    fileSizeStr: string;
    providerName: string;
    progress: number;
    step: 'ENCRYPTING' | 'HASHING' | 'FORWARDING' | 'COMPLETE';
    currentFileIndex?: number;
    totalFiles?: number;
  } | null>(null);
  const [storageQuota, setStorageQuota] = useState<{
    totalQuotaBytes: string;
    usedQuotaBytes: string;
    freeQuotaBytes: string;
    providers: any;
  } | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [showAllUploads, setShowAllUploads] = useState(false);

  // File Explorer Search & Filter States
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [fileCategoryFilter, setFileCategoryFilter] = useState<'ALL' | 'DOCS' | 'IMAGES' | 'MEDIA' | 'ARCHIVES'>('ALL');
  const [fileProviderFilter, setFileProviderFilter] = useState<string>('ALL');

  // Preview Modal States
  const [previewModalFile, setPreviewModalFile] = useState<ActivityItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewTextContent, setPreviewTextContent] = useState<string | null>(null);

  // Migration Modal States
  const [migrateModalFile, setMigrateModalFile] = useState<ActivityItem | null>(null);
  const [migrateTargetProvider, setMigrateTargetProvider] = useState<string>('MEGA');
  const [isMigrating, setIsMigrating] = useState(false);

  // Share Modal States
  const [shareModalFile, setShareModalFile] = useState<ActivityItem | null>(null);
  const [shareExpiryHours, setShareExpiryHours] = useState<number>(24);
  const [generatedShareUrl, setGeneratedShareUrl] = useState<string | null>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const formatStorageBytes = (bytesStr?: string) => {
    if (!bytesStr) return '0.00 GB';
    const bytes = Number(bytesStr);
    if (bytes >= 1073741824 * 1024) {
      return `${(bytes / (1073741824 * 1024)).toFixed(2)} TB`;
    }
    return `${(bytes / 1073741824).toFixed(2)} GB`;
  };

  const formatFriendlyFileSize = (bytesVal: any): string => {
    if (!bytesVal && bytesVal !== 0) return '0 B';
    const bytes = Number(bytesVal);
    if (isNaN(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const calculatePercentUsed = (usedStr?: string, totalStr?: string) => {
    if (!usedStr || !totalStr || Number(totalStr) === 0) return 0;
    const pct = (Number(usedStr) / Number(totalStr)) * 100;
    return Math.min(100, Math.max(0, Math.round(pct * 10) / 10));
  };

  const fetchStorageQuota = async (force: boolean = true) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cloudfusion_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/storage/quota${force ? '?refresh=true' : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setStorageQuota(data);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('cloudfusion_quota_cache', JSON.stringify(data));
          } catch (_) {}
        }
      }
    } catch (e) {
      console.warn('Quota fetch notice:', e);
    }
  };

  const fetchCloudAccounts = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cloudfusion_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/storage/accounts`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.accounts && Array.isArray(data.accounts)) {
          setConnectors((prev) =>
            prev.map((c) => {
              const match = data.accounts.find(
                (a: any) =>
                  a.provider.toLowerCase() === c.id.toLowerCase() ||
                  (a.provider === 'GOOGLE_DRIVE' && c.id === 'gdrive') ||
                  (a.provider === 'AWS_S3' && c.id === 's3') ||
                  (a.provider === 'ONEDRIVE' && c.id === 'onedrive') ||
                  (a.provider === 'MEGA' && c.id === 'mega') ||
                  (a.provider === 'DROPBOX' && c.id === 'dropbox')
              );
              return { ...c, isLinked: !!match };
            })
          );
        }
      }
    } catch (e) {
      console.warn('Cloud accounts fetch notice:', e);
    }
  };

  const fetchUserFiles = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cloudfusion_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/files/`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.files && Array.isArray(data.files)) {
          const formattedActivities: ActivityItem[] = data.files.map((f: any) => ({
            id: f.id,
            fileName: f.originalName || f.name || 'Encrypted File',
            cloudSource:
              f.cloudProvider === 'GOOGLE_DRIVE'
                ? 'Google Drive'
                : f.cloudProvider === 'AWS_S3'
                ? 'AWS S3'
                : f.cloudProvider === 'DROPBOX'
                ? 'Dropbox'
                : f.cloudProvider === 'MEGA'
                ? 'MEGA'
                : 'MS OneDrive',
            rawCloudProvider: f.cloudProvider,
            size: formatFriendlyFileSize(f.sizeBytes ?? f.size),
            sizeBytes: Number(f.sizeBytes ?? f.size ?? 0),
            mimeType: f.mimeType || 'application/octet-stream',
            checksumSHA256: f.checksumSHA256,
            isMirrored: !!f.isMirrored,
            mirrorProvider: f.mirrorProvider || null,
            timestamp: f.createdAt ? new Date(f.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now',
            status: 'COMPLETED',
            icon: f.mimeType?.includes('image')
              ? 'image'
              : f.mimeType?.includes('video')
              ? 'movie'
              : f.mimeType?.includes('pdf')
              ? 'description'
              : 'article',
          }));
          setActivities(formattedActivities);

          const formattedUploads: UploadProgressItem[] = data.files.map((f: any) => {
            const providerName =
              f.cloudProvider === 'GOOGLE_DRIVE'
                ? 'Google Drive'
                : f.cloudProvider === 'AWS_S3'
                ? 'AWS S3'
                : f.cloudProvider === 'DROPBOX'
                ? 'Dropbox'
                : f.cloudProvider === 'MEGA'
                ? 'MEGA'
                : 'OneDrive';

            const badgeClass =
              f.cloudProvider === 'GOOGLE_DRIVE'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : f.cloudProvider === 'AWS_S3'
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                : f.cloudProvider === 'DROPBOX'
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                : f.cloudProvider === 'MEGA'
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';

            return {
              id: f.id,
              name: f.originalName || f.name || 'Encrypted File',
              provider: providerName,
              providerBadgeClass: badgeClass,
              sizeProgress: `${formatFriendlyFileSize(f.sizeBytes ?? f.size)} • Encrypted & Saved`,
              percentage: 100,
              status: 'COMPLETE',
              icon: f.mimeType?.includes('image')
                ? 'image'
                : f.mimeType?.includes('video')
                ? 'movie'
                : f.mimeType?.includes('pdf')
                ? 'description'
                : 'article',
            };
          });
          setUploadItems(formattedUploads);
        }
      }
    } catch (e) {
      console.warn('Files fetch notice:', e);
    }
  };

  const handleFileDownload = async (fileId: string, fileName: string) => {
    if (downloadingFileId) return;
    setDownloadingFileId(fileId);
    setToastMessage(`Decrypting & retrieving "${fileName}" from multi-cloud mesh...`);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cloudfusion_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/files/download/${fileId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`Download failed with status ${res.status}`);
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setToastMessage(`âœ… Decrypted & downloaded "${fileName}" successfully!`);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (e) {
      console.error('File download error:', e);
      setToastMessage(`âŒ Failed to download "${fileName}".`);
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setDownloadingFileId(null);
    }
  };

  const matchesCategory = (file: ActivityItem, category: string) => {
    if (category === 'ALL') return true;
    const name = (file.fileName || '').toLowerCase();
    const mime = (file.mimeType || '').toLowerCase();
    if (category === 'IMAGES') {
      return mime.includes('image') || /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(name);
    }
    if (category === 'DOCS') {
      return mime.includes('pdf') || mime.includes('text') || /\.(pdf|doc|docx|txt|md|csv|xlsx|pptx)$/i.test(name);
    }
    if (category === 'MEDIA') {
      return mime.includes('video') || mime.includes('audio') || /\.(mp4|mov|avi|mkv|mp3|wav|ogg)$/i.test(name);
    }
    if (category === 'ARCHIVES') {
      return /\.(zip|rar|tar|gz|7z|bz2)$/i.test(name);
    }
    return true;
  };

  const handlePreviewFile = async (file: ActivityItem) => {
    setPreviewModalFile(file);
    setPreviewLoading(true);
    setPreviewBlobUrl(null);
    setPreviewTextContent(null);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cloudfusion_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/files/preview/${file.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to retrieve file preview');
      }

      const blob = await res.blob();
      const isText = (file.mimeType || '').includes('text') || /\.(txt|md|json|csv|log|js|ts|py|html|css)$/i.test(file.fileName);

      if (isText) {
        const text = await blob.text();
        setPreviewTextContent(text);
      } else {
        const url = URL.createObjectURL(blob);
        setPreviewBlobUrl(url);
      }
    } catch (err: any) {
      console.warn('Preview error:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleMigrateFile = async (fileId: string, targetProvider: string) => {
    setIsMigrating(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cloudfusion_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/files/migrate/${fileId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ targetProvider }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to migrate file');
      }

      setToastMessage(`🎉 ${data.message || 'File migrated successfully!'}`);
      setTimeout(() => setToastMessage(null), 5000);
      setMigrateModalFile(null);
      await fetchUserFiles();
      await fetchStorageQuota();
    } catch (err: any) {
      alert(`Migration error: ${err.message}`);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleGenerateShareLink = async (fileId: string, expiryHours: number) => {
    setIsGeneratingShare(true);
    setShareCopied(false);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cloudfusion_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/files/share/${fileId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ expiryHours }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate share link');
      }

      setGeneratedShareUrl(data.shareUrl);
    } catch (err: any) {
      alert(`Share link error: ${err.message}`);
    } finally {
      setIsGeneratingShare(false);
    }
  };

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}" from your cloud mesh?`)) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cloudfusion_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/files/${fileId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to delete file');
      }

      setToastMessage(`🗑️ File "${fileName}" deleted.`);
      setTimeout(() => setToastMessage(null), 4000);
      await fetchUserFiles();
      await fetchStorageQuota();
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    document.title = 'CloudFusion | Dashboard';

    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlAuthToken = urlParams.get('auth_token');
      const urlUser = urlParams.get('user');

      if (urlAuthToken) {
        localStorage.setItem('cloudfusion_token', urlAuthToken);
        if (urlUser) {
          try {
            localStorage.setItem('cloudfusion_user', decodeURIComponent(urlUser));
          } catch (_) {
            localStorage.setItem('cloudfusion_user', urlUser);
          }
        }
      }
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('cloudfusion_token') : null;
    const storedUser = typeof window !== 'undefined' ? localStorage.getItem('cloudfusion_user') : null;
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {}
    }

    if (typeof window !== 'undefined') {
      try {
        const cachedQuota = localStorage.getItem('cloudfusion_quota_cache');
        if (cachedQuota) {
          const parsed = JSON.parse(cachedQuota);
          setStorageQuota(parsed);
        }
      } catch (_) {}
    }

    if (!token) {
      router.push('/login');
    } else {

      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const connectedProvider = urlParams.get('connected');
        const authError = urlParams.get('error');

        if (connectedProvider) {
          const providerNameMap: Record<string, string> = {
            onedrive: 'Microsoft OneDrive (+5 GB)',
            gdrive: 'Google Drive (+15 GB)',
            dropbox: 'Dropbox (+2 GB)',
          };
          const providerEnumMap: Record<string, string> = {
            onedrive: 'ONEDRIVE',
            gdrive: 'GOOGLE_DRIVE',
            dropbox: 'DROPBOX',
          };
          const name = providerNameMap[connectedProvider] || connectedProvider;
          const targetEnum = providerEnumMap[connectedProvider];

          fetchStorageQuota();
          fetchCloudAccounts();

          setNotifications((prev) => [
            {
              id: `notif-${Date.now()}`,
              title: `${name} Connected!`,
              message: `${name} has been successfully authenticated and linked to your multi-cloud mesh!`,
              type: 'SUCCESS',
              timestamp: 'Just now',
              isRead: false,
              icon: 'cloud_done',
            },
            ...prev,
          ]);
          setToastMessage(`ðŸŽ‰ ${name} connected successfully!`);
          setTimeout(() => setToastMessage(null), 5000);
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        if (authError) {
          setToastMessage(`OAuth notice: ${authError}`);
          setTimeout(() => setToastMessage(null), 5000);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }

      fetchStorageQuota();
      fetchCloudAccounts();
      fetchUserFiles();
    }
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (e) {
      console.error('Logout error', e);
    } finally {
      localStorage.removeItem('cloudfusion_token');
      localStorage.removeItem('cloudfusion_user');
      localStorage.removeItem('cloudfusion_quota_cache');
      router.push('/login');
    }
  };

  const toggleConnectorLink = async (id: string) => {
    const connector = connectors.find((c) => c.id === id);
    if (!connector) return;

    const providerMap: Record<string, string> = {
      gdrive: 'GOOGLE_DRIVE',
      s3: 'AWS_S3',
      dropbox: 'DROPBOX',
      onedrive: 'ONEDRIVE',
      mega: 'MEGA',
    };

    const targetProvider = providerMap[id] || id;
    const isCurrentlyLinked = connector.isLinked;

    // If unlinked, initiate proper credentials flow or OAuth redirect
    if (!isCurrentlyLinked) {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cloudfusion_token') || '' : '';
      if (id === 'onedrive') {
        window.location.href = `${API_BASE_URL}/api/storage/onedrive/login?token=${encodeURIComponent(token)}`;
        return;
      } else if (id === 'gdrive') {
        window.location.href = `${API_BASE_URL}/api/storage/gdrive/login?token=${encodeURIComponent(token)}`;
        return;
      } else if (id === 'dropbox') {
        window.location.href = `${API_BASE_URL}/api/storage/dropbox/login?token=${encodeURIComponent(token)}`;
        return;
      } else if (id === 's3') {
        setShowS3Modal(true);
        return;
      } else if (id === 'mega') {
        setShowMegaModal(true);
        return;
      }
    }

    // If currently linked, disconnecting safely removes the account
    try {
      const token = localStorage.getItem('cloudfusion_token');
      const res = await fetch(`${API_BASE_URL}/api/storage/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ provider: targetProvider }),
      });

      if (res.ok) {
        setConnectors((prev) =>
          prev.map((c) => (c.id === id ? { ...c, isLinked: false } : c))
        );

        setNotifications((prev) => [
          {
            id: `notif-${Date.now()}`,
            title: `${connector.name} Disconnected`,
            message: `${connector.name} unlinked from CloudFusion mesh.`,
            type: 'INFO',
            timestamp: 'Just now',
            isRead: false,
            icon: connector.icon,
          },
          ...prev,
        ]);

        await fetchStorageQuota();
        await fetchCloudAccounts();
      }
    } catch (e) {
      console.error('Connector toggle error:', e);
    }
  };

  // Cloud Connectors state (reset hardcoded values, loaded dynamically from DB)
  const [connectors, setConnectors] = useState<CloudConnector[]>([
    {
      id: 'mega',
      name: 'MEGA E2EE Cloud',
      subtitle: '20 GB Free Encrypted Storage',
      icon: 'lock',
      colorClass: 'text-[#d9272e] border-[#d9272e]/20',
      isLinked: false,
    },
    {
      id: 'gdrive',
      name: 'Google Drive',
      subtitle: '15 GB Free Workspace Storage',
      icon: 'add_to_drive',
      colorClass: 'text-emerald-400 border-emerald-500/20',
      isLinked: false,
    },
    {
      id: 'onedrive',
      name: 'Microsoft OneDrive',
      subtitle: '5 GB Free Microsoft Storage',
      icon: 'cloud',
      colorClass: 'text-cyan-400 border-cyan-500/20',
      isLinked: false,
    },
    {
      id: 's3',
      name: 'AWS S3',
      subtitle: '5 GB Free Object Bucket',
      icon: 'database',
      colorClass: 'text-amber-400 border-amber-500/20',
      isLinked: false,
    },
    {
      id: 'dropbox',
      name: 'Dropbox',
      subtitle: '2 GB Free Sync Folder',
      icon: 'folder_shared',
      colorClass: 'text-blue-400 border-blue-500/20',
      isLinked: false,
    },
  ]);

  // Upload items state (reset hardcoded items to empty array)
  const [uploadItems, setUploadItems] = useState<UploadProgressItem[]>([]);

  // Dashboard activity items (reset hardcoded items to empty array)
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    const totalFiles = fileList.length;

    const targetProviderMap = {
      AI: { name: 'FUSION AI', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30', enum: 'AI' },
      S3: { name: 'AWS S3', badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30', enum: 'AWS_S3' },
      DROPBOX: { name: 'Dropbox', badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30', enum: 'DROPBOX' },
      GDRIVE: { name: 'Google Drive', badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', enum: 'GOOGLE_DRIVE' },
      ONEDRIVE: { name: 'MS OneDrive', badge: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30', enum: 'ONEDRIVE' },
      MEGA: { name: 'MEGA', badge: 'bg-rose-500/20 text-rose-400 border-rose-500/30', enum: 'MEGA' },
    };

    const sel = targetProviderMap[selectedDestination];
    let successfulUploads = 0;

    for (let i = 0; i < totalFiles; i++) {
      const file = fileList[i];
      const tempId = `up-${Date.now()}-${i}`;
      const fileSizeStr = formatFriendlyFileSize(file.size);

      const newItem: UploadProgressItem = {
        id: tempId,
        name: file.name,
        provider: sel.name,
        providerBadgeClass: sel.badge,
        sizeProgress: `Uploading... ${fileSizeStr}`,
        percentage: 35,
        status: 'UPLOADING',
        icon: 'upload_file',
      };

      setUploadItems((prev) => [newItem, ...prev]);

      // Trigger visual upload progress loading modal with multi-file counter
      setActiveUploadModal({
        fileName: file.name,
        fileSizeStr,
        providerName: sel.name,
        progress: 25,
        step: 'ENCRYPTING',
        currentFileIndex: i + 1,
        totalFiles,
      });

      const stepTimer1 = setTimeout(() => {
        setActiveUploadModal((prev) => (prev ? { ...prev, progress: 55, step: 'HASHING' } : null));
      }, 400);

      const stepTimer2 = setTimeout(() => {
        setActiveUploadModal((prev) => (prev ? { ...prev, progress: 85, step: 'FORWARDING' } : null));
      }, 900);

      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('cloudfusion_token') : null;
        const formData = new FormData();
        formData.append('file', file);
        if (sel.enum !== 'AI') {
          formData.append('provider', sel.enum);
        } else {
          formData.append('strategy', balanceStrategy);
        }

        const res = await fetch(`${API_BASE_URL}/api/files/upload`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
          body: formData,
        });

        clearTimeout(stepTimer1);
        clearTimeout(stepTimer2);

        if (res.ok) {
          successfulUploads++;
          setActiveUploadModal({
            fileName: file.name,
            fileSizeStr,
            providerName: sel.name,
            progress: 100,
            step: 'COMPLETE',
            currentFileIndex: i + 1,
            totalFiles,
          });

          setUploadItems((prev) =>
            prev.map((item) =>
              item.id === tempId
                ? { ...item, percentage: 100, status: 'COMPLETE', sizeProgress: `Completed (${fileSizeStr})` }
                : item
            )
          );

          setNotifications((prev) => [
            {
              id: `notif-${Date.now()}-${i}`,
              title: 'File Upload Completed',
              message: `"${file.name}" was encrypted with AES-256 and uploaded to ${sel.name}.`,
              type: 'SUCCESS',
              timestamp: 'Just now',
              isRead: false,
              icon: 'cloud_done',
            },
            ...prev,
          ]);

          // Pause briefly between files for smooth visual transition
          if (i < totalFiles - 1) {
            await new Promise((resolve) => setTimeout(resolve, 700));
          }
        } else {
          setUploadItems((prev) => prev.filter((item) => item.id !== tempId));
        }
      } catch (e) {
        clearTimeout(stepTimer1);
        clearTimeout(stepTimer2);
        console.error(`File upload error for ${file.name}:`, e);
        setUploadItems((prev) => prev.filter((item) => item.id !== tempId));
      }
    }

    if (totalFiles > 1) {
      setToastMessage(`Batch complete! Successfully uploaded ${successfulUploads} of ${totalFiles} files.`);
    } else if (successfulUploads === 1) {
      setToastMessage(`"${fileList[0].name}" uploaded & encrypted onto ${sel.name}!`);
    }
    setTimeout(() => setToastMessage(null), 5000);
    setTimeout(() => setActiveUploadModal(null), 1200);

    fetchStorageQuota();
    fetchUserFiles();
  };

  const removeUploadItem = (id: string) => {
    setUploadItems((prev) => prev.filter((i) => i.id !== id));
  };

  if (!isMounted) {
    return (
      <div className="min-h-screen bg-[#101415] text-[#e0e3e5] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#101415] text-[#e0e3e5] font-['Plus_Jakarta_Sans',sans-serif] flex flex-col justify-between relative">
      {/* Toast Alert Popover */}
      {toastMessage && (
        <div className="fixed top-5 right-8 z-[100] bg-emerald-500/95 text-white px-6 py-3.5 rounded-2xl shadow-2xl border border-emerald-400/50 flex items-center space-x-3 backdrop-blur-md animate-fadeIn">
          <span className="material-symbols-outlined text-2xl">check_circle</span>
          <span className="font-bold text-sm">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-white/80 hover:text-white ml-2">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}

      {/* Upload Progress Loading Animation Modal */}
      {activeUploadModal && (
        <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#161c1e] border border-cyan-500/30 rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6 relative overflow-hidden text-center">
            {/* Spinning Encryption Halo */}
            <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin" />
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <span className="material-symbols-outlined text-3xl">cloud_upload</span>
              </div>
            </div>

            {/* Header & File Info */}
            <div className="space-y-1">
              <h3 className="font-extrabold text-xl text-white tracking-tight">
                {activeUploadModal.totalFiles && activeUploadModal.totalFiles > 1
                  ? `Encrypting & Uploading (${activeUploadModal.currentFileIndex || 1} of ${activeUploadModal.totalFiles})`
                  : 'Encrypting & Uploading File'}
              </h3>
              <p className="text-xs text-[#8b90a0]">Zero-Knowledge AES-256 Multi-Cloud Stream</p>
            </div>

            <div className="bg-[#101415] p-4 rounded-2xl border border-white/10 text-left flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold text-sm text-white truncate">{activeUploadModal.fileName}</div>
                <div className="text-xs text-[#8b90a0] mt-0.5">{activeUploadModal.fileSizeStr}</div>
              </div>

              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-extrabold shrink-0">
                {activeUploadModal.providerName}
              </span>
            </div>

            {/* Animated Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-[#8b90a0]">Uploading Progress</span>
                <span className="text-cyan-400 font-mono font-bold">{activeUploadModal.progress}%</span>
              </div>

              <div className="w-full bg-[#1d2022] h-3 rounded-full overflow-hidden p-0.5 border border-white/10">
                <div
                  className="bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-400 h-full rounded-full transition-all duration-500 shadow-lg"
                  style={{ width: `${activeUploadModal.progress}%` }}
                />
              </div>
            </div>

            {/* Live Step Checkmarks */}
            <div className="space-y-2 text-left pt-2 border-t border-white/10 text-xs">
              <div className="flex items-center space-x-2.5">
                <span className={`material-symbols-outlined text-base ${activeUploadModal.progress >= 25 ? 'text-emerald-400' : 'text-[#8b90a0]'}`}>
                  {activeUploadModal.progress >= 25 ? 'check_circle' : 'hourglass_empty'}
                </span>
                <span className={activeUploadModal.progress >= 25 ? 'text-white font-medium' : 'text-[#8b90a0]'}>
                  1. Zero-Knowledge AES-256-GCM Encryption
                </span>
              </div>

              <div className="flex items-center space-x-2.5">
                <span className={`material-symbols-outlined text-base ${activeUploadModal.progress >= 55 ? 'text-emerald-400' : 'text-[#8b90a0]'}`}>
                  {activeUploadModal.progress >= 55 ? 'check_circle' : 'hourglass_empty'}
                </span>
                <span className={activeUploadModal.progress >= 55 ? 'text-white font-medium' : 'text-[#8b90a0]'}>
                  2. SHA-256 Integrity Checksum Verified
                </span>
              </div>

              <div className="flex items-center space-x-2.5">
                <span className={`material-symbols-outlined text-base ${activeUploadModal.progress >= 85 ? 'text-emerald-400' : 'text-[#8b90a0]'}`}>
                  {activeUploadModal.progress >= 85 ? 'check_circle' : 'hourglass_empty'}
                </span>
                <span className={activeUploadModal.progress >= 85 ? 'text-white font-medium' : 'text-[#8b90a0]'}>
                  3. Streaming to {activeUploadModal.providerName} REST API
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AWS S3 Connection Configuration Modal */}
      {showS3Modal && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#161c1e] border border-amber-500/30 rounded-3xl p-8 max-w-lg w-full shadow-2xl space-y-6 relative text-left">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl">database</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-xl text-white tracking-tight">Connect AWS S3 Bucket</h3>
                  <p className="text-xs text-[#8b90a0]">Enterprise Zero-Knowledge Cloud Storage</p>
                </div>
              </div>

              <button
                onClick={() => setShowS3Modal(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Error Message */}
            {s3Error && (
              <div className="bg-rose-500/20 border border-rose-500/30 rounded-2xl p-3.5 text-xs text-rose-300 flex items-center space-x-2">
                <span className="material-symbols-outlined text-base text-rose-400">error</span>
                <span>{s3Error}</span>
              </div>
            )}

            {/* Mode Switcher */}
            <div className="grid grid-cols-2 p-1 bg-[#101415] rounded-2xl border border-white/10 text-xs font-bold">
              <button
                type="button"
                onClick={() => setS3Mode('managed')}
                className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center space-x-1.5 ${
                  s3Mode === 'managed'
                    ? 'bg-amber-500 text-black shadow-md'
                    : 'text-[#8b90a0] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-sm">bolt</span>
                <span>1-Click Fast Connect</span>
              </button>
              <button
                type="button"
                onClick={() => setS3Mode('custom')}
                className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center space-x-1.5 ${
                  s3Mode === 'custom'
                    ? 'bg-amber-500 text-black shadow-md'
                    : 'text-[#8b90a0] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-sm">key</span>
                <span>Custom IAM Keys</span>
              </button>
            </div>

            {s3Mode === 'managed' ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2 text-xs text-[#c1c6d7]">
                  <div className="flex items-center space-x-2 font-bold text-amber-400">
                    <span className="material-symbols-outlined text-base">verified_user</span>
                    <span>Zero Setup Required</span>
                  </div>
                  <p>
                    Instantly links an isolated, client-side AES-256 encrypted storage vault in the CloudFusion S3 mesh without needing an AWS account or secret keys.
                  </p>
                </div>

                <div className="pt-2 flex items-center justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowS3Modal(false)}
                    className="px-5 py-2.5 rounded-full text-xs font-bold text-[#c1c6d7] hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={isSavingS3}
                    onClick={() => handleConnectS3()}
                    className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs px-6 py-2.5 rounded-full shadow-lg transition-all flex items-center space-x-2 disabled:opacity-50"
                  >
                    {isSavingS3 ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        <span>Connecting S3...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">bolt</span>
                        <span>1-Click Connect S3</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleConnectS3} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#c1c6d7] mb-1.5 uppercase tracking-wider">
                    AWS Access Key ID
                  </label>
                  <input
                    type="text"
                    required
                    value={s3AccessKey}
                    onChange={(e) => setS3AccessKey(e.target.value)}
                    placeholder="e.g. AKIA..."
                    className="w-full bg-[#101415] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder:text-white/20 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#c1c6d7] mb-1.5 uppercase tracking-wider">
                    AWS Secret Access Key
                  </label>
                  <input
                    type="password"
                    required
                    value={s3SecretKey}
                    onChange={(e) => setS3SecretKey(e.target.value)}
                    placeholder="Your AWS Secret Access Key"
                    className="w-full bg-[#101415] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder:text-white/20 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#c1c6d7] mb-1.5 uppercase tracking-wider">
                      AWS Region
                    </label>
                    <select
                      value={s3Region}
                      onChange={(e) => setS3Region(e.target.value)}
                      className="w-full bg-[#101415] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                    >
                      <option value="eu-north-1">eu-north-1 (Stockholm)</option>
                      <option value="us-east-1">us-east-1 (N. Virginia)</option>
                      <option value="us-west-2">us-west-2 (Oregon)</option>
                      <option value="eu-west-1">eu-west-1 (Ireland)</option>
                      <option value="eu-central-1">eu-central-1 (Frankfurt)</option>
                      <option value="ap-southeast-1">ap-southeast-1 (Singapore)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#c1c6d7] mb-1.5 uppercase tracking-wider">
                      S3 Bucket Name
                    </label>
                    <input
                      type="text"
                      required
                      value={s3Bucket}
                      onChange={(e) => setS3Bucket(e.target.value)}
                      placeholder="Bucket name"
                      className="w-full bg-[#101415] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-mono placeholder:text-white/20 focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowS3Modal(false)}
                    className="px-5 py-2.5 rounded-full text-xs font-bold text-[#c1c6d7] hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSavingS3}
                    className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs px-6 py-2.5 rounded-full shadow-lg transition-all flex items-center space-x-2 disabled:opacity-50"
                  >
                    {isSavingS3 ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        <span>Verifying S3...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">verified</span>
                        <span>Verify & Connect S3</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MEGA Cloud Connection Modal */}
      {showMegaModal && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#161c1e] border border-rose-500/30 rounded-3xl p-8 max-w-lg w-full shadow-2xl space-y-6 relative text-left">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center font-extrabold text-xl">
                  M
                </div>
                <div>
                  <h3 className="font-extrabold text-xl text-white tracking-tight">Connect MEGA Cloud</h3>
                  <p className="text-xs text-[#8b90a0]">20 GB High-Capacity Zero-Knowledge Storage</p>
                </div>
              </div>

              <button
                onClick={() => setShowMegaModal(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Error Message */}
            {megaError && (
              <div className="bg-rose-500/20 border border-rose-500/30 rounded-2xl p-3.5 text-xs text-rose-300 flex items-center space-x-2">
                <span className="material-symbols-outlined text-base text-rose-400">error</span>
                <span>{megaError}</span>
              </div>
            )}

            {/* Mode Switcher */}
            <div className="grid grid-cols-2 p-1 bg-[#101415] rounded-2xl border border-white/10 text-xs font-bold">
              <button
                type="button"
                onClick={() => setMegaMode('managed')}
                className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center space-x-1.5 ${
                  megaMode === 'managed'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'text-[#8b90a0] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-sm">bolt</span>
                <span>1-Click Fast Connect</span>
              </button>
              <button
                type="button"
                onClick={() => setMegaMode('custom')}
                className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center space-x-1.5 ${
                  megaMode === 'custom'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'text-[#8b90a0] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-sm">account_circle</span>
                <span>Custom Account</span>
              </button>
            </div>

            {megaMode === 'managed' ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 space-y-2 text-xs text-[#c1c6d7]">
                  <div className="flex items-center space-x-2 font-bold text-rose-400">
                    <span className="material-symbols-outlined text-base">cloud_done</span>
                    <span>Instant 20 GB Storage Pool</span>
                  </div>
                  <p>
                    Seamlessly attaches a 20 GB zero-knowledge encrypted storage node to your mesh with one click.
                  </p>
                </div>

                <div className="pt-2 flex items-center justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowMegaModal(false)}
                    className="px-5 py-2.5 rounded-full text-xs font-bold text-[#c1c6d7] hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={isSavingMega}
                    onClick={() => handleConnectMega()}
                    className="bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs px-6 py-2.5 rounded-full shadow-lg transition-all flex items-center space-x-2 disabled:opacity-50"
                  >
                    {isSavingMega ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Linking MEGA...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">bolt</span>
                        <span>1-Click Connect MEGA</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleConnectMega} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#c1c6d7] mb-1.5 uppercase tracking-wider">
                    MEGA Account Email
                  </label>
                  <input
                    type="email"
                    required
                    value={megaEmail}
                    onChange={(e) => setMegaEmail(e.target.value)}
                    placeholder="e.g. user@gmail.com"
                    className="w-full bg-[#101415] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-rose-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#c1c6d7] mb-1.5 uppercase tracking-wider">
                    MEGA Master Password
                  </label>
                  <input
                    type="password"
                    required
                    value={megaPassword}
                    onChange={(e) => setMegaPassword(e.target.value)}
                    placeholder="Your MEGA password"
                    className="w-full bg-[#101415] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-rose-500 transition-colors"
                  />
                </div>

                <div className="pt-3 flex items-center justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowMegaModal(false)}
                    className="px-5 py-2.5 rounded-full text-xs font-bold text-[#c1c6d7] hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSavingMega}
                    className="bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs px-6 py-2.5 rounded-full shadow-lg transition-all flex items-center space-x-2 disabled:opacity-50"
                  >
                    {isSavingMega ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Authenticating MEGA...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">cloud_sync</span>
                        <span>Verify & Link MEGA</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Top Navbar */}
      <header className="h-20 border-b border-white/10 bg-[#101415]/80 backdrop-blur-xl px-8 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center space-x-6">
          <Link href="/" className="font-extrabold text-3xl text-primary tracking-tighter hover:opacity-90 transition-opacity flex items-center gap-2">
            CloudFusion
          </Link>
          <span className="text-xs font-mono px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 hidden sm:inline-flex items-center gap-1.5 font-semibold">
            <span className="material-symbols-outlined text-sm">cloud_done</span>
            Dashboard
          </span>
        </div>

        <div className="hidden md:flex gap-8 items-center text-sm font-semibold text-[#c1c6d7]">
          <button onClick={() => setActiveNav('dashboard')} className={`hover:text-primary transition-colors ${activeNav === 'dashboard' ? 'text-primary' : ''}`}>
            Overview
          </button>
          <button onClick={() => setActiveNav('files')} className={`hover:text-primary transition-colors ${activeNav === 'files' ? 'text-primary' : ''}`}>
            Cloud Sync
          </button>
          <button onClick={() => setActiveNav('analytics')} className={`hover:text-primary transition-colors ${activeNav === 'analytics' ? 'text-primary' : ''}`}>
            Analytics
          </button>
          <button onClick={() => setActiveNav('notifications')} className={`hover:text-primary transition-colors ${activeNav === 'notifications' ? 'text-primary' : ''}`}>
            Notifications
          </button>
          <button onClick={() => setActiveNav('settings')} className={`hover:text-primary transition-colors ${activeNav === 'settings' ? 'text-primary' : ''}`}>
            Settings
          </button>
        </div>

        <div className="flex items-center gap-4">
          <button className="relative text-[#c1c6d7] hover:text-white transition-colors p-2">
            <span className="material-symbols-outlined text-2xl">search</span>
          </button>

          {/* Interactive Notification Bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifDropdown(!showNotifDropdown)}
              className="relative text-[#c1c6d7] hover:text-white transition-colors p-2 rounded-xl hover:bg-white/5"
              title="Notifications"
            >
              <span className="material-symbols-outlined text-2xl">notifications</span>
              {notifications.some((n) => !n.isRead) && (
                <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-primary animate-pulse shadow-lg shadow-primary/50" />
              )}
            </button>

            {showNotifDropdown && (
              <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-[#161c1e] border border-white/20 rounded-2xl shadow-2xl p-4 z-50 animate-fadeIn">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-xl">notifications</span>
                    <h3 className="font-bold text-sm text-white">Notifications</h3>
                    {notifications.filter((n) => !n.isRead).length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-extrabold border border-primary/30">
                        {notifications.filter((n) => !n.isRead).length} new
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setShowNotifDropdown(false);
                      setActiveNav('notifications');
                    }}
                    className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                  >
                    <span>View All</span>
                    <span className="material-symbols-outlined text-xs">arrow_forward</span>
                  </button>
                </div>

                <div className="max-h-72 overflow-y-auto divide-y divide-white/5 py-2">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[#8b90a0]">No notifications at this time.</div>
                  ) : (
                    notifications.slice(0, 4).map((n) => (
                      <div
                        key={n.id}
                        onClick={() => toggleNotificationRead(n.id)}
                        className={`p-3 rounded-xl cursor-pointer transition-all flex items-start gap-3 ${
                          n.isRead
                            ? 'opacity-60 hover:opacity-100 hover:bg-white/5'
                            : 'bg-primary/5 border border-primary/10 hover:bg-primary/10'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            n.type === 'SECURITY'
                              ? 'bg-rose-500/20 text-rose-400'
                              : n.type === 'SUCCESS'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-primary/20 text-primary'
                          }`}
                        >
                          <span className="material-symbols-outlined text-lg">{n.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h4 className="text-xs font-bold text-white truncate">{n.title}</h4>
                            <span className="text-[10px] text-[#8b90a0] shrink-0">{n.timestamp}</span>
                          </div>
                          <p className="text-[11px] text-[#c1c6d7] mt-0.5 line-clamp-2">{n.message}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                  <button onClick={markAllNotificationsAsRead} className="text-[#8b90a0] hover:text-white transition-colors">
                    Mark all read
                  </button>
                  <button
                    onClick={() => {
                      setShowNotifDropdown(false);
                      setActiveNav('notifications');
                    }}
                    className="text-primary font-bold hover:underline"
                  >
                    Notification Center
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Admin Console Switcher Link */}
          {user?.role === 'ADMIN' && (
            <Link
              href="/admin"
              className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span className="material-symbols-outlined text-sm">admin_panel_settings</span>
              <span className="hidden sm:inline">Admin Console</span>
            </Link>
          )}

          {/* User Profile Pill */}
          <div className="flex items-center gap-3 bg-[#1d2022] border border-white/10 px-3 py-1.5 rounded-full">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-[#e0e3e5]">{user?.name || user?.email || 'Alex Rivera'}</div>
              <div className="text-[10px] text-[#8b90a0]">Cloud Architect</div>
            </div>
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-secondary p-[2px]">
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80"
                alt="Alex Rivera"
                className="w-full h-full rounded-full object-cover"
              />
            </div>
            <button
              onClick={handleLogout}
              title="Sign Out"
              className="ml-1 p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-full transition-colors flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-lg">logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex flex-1">
        {/* Left User Console Sidebar */}
        <aside className="w-64 border-r border-white/10 bg-[#101415] p-6 flex flex-col justify-between hidden md:flex">
          <div className="space-y-8">
            <div>
              <h2 className="font-bold text-2xl text-[#e0e3e5] tracking-tight">User Console</h2>
            </div>

            <nav className="space-y-2">
              <button
                onClick={() => setActiveNav('dashboard')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  activeNav === 'dashboard'
                    ? 'bg-[#323537] text-white border border-white/10 shadow-lg'
                    : 'text-[#c1c6d7] hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-xl">dashboard</span>
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => setActiveNav('files')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  activeNav === 'files'
                    ? 'bg-[#323537] text-white border border-white/10 shadow-lg'
                    : 'text-[#c1c6d7] hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-xl">folder</span>
                <span>Files</span>
              </button>

              <button
                onClick={() => setActiveNav('analytics')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  activeNav === 'analytics'
                    ? 'bg-[#323537] text-white border border-white/10 shadow-lg'
                    : 'text-[#c1c6d7] hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-xl">analytics</span>
                <span>Analytics</span>
              </button>

              <button
                onClick={() => setActiveNav('notifications')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  activeNav === 'notifications'
                    ? 'bg-[#323537] text-white border border-white/10 shadow-lg'
                    : 'text-[#c1c6d7] hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-xl">notifications</span>
                <span>Notifications</span>
                {notifications.some((n) => !n.isRead) && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-primary animate-pulse" />
                )}
              </button>

              <button
                onClick={() => setActiveNav('settings')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  activeNav === 'settings'
                    ? 'bg-[#323537] text-white border border-white/10 shadow-lg'
                    : 'text-[#c1c6d7] hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-xl">settings</span>
                <span>Settings</span>
              </button>

              {user?.role === 'ADMIN' && (
                <Link
                  href="/admin"
                  className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 shadow-lg shadow-purple-500/10 transition-all mt-2"
                >
                  <span className="material-symbols-outlined text-xl">admin_panel_settings</span>
                  <span>Admin Console</span>
                </Link>
              )}
            </nav>
          </div>

          <div className="space-y-4">
            <div className="space-y-2 pt-2 border-t border-white/5 text-sm font-medium text-[#c1c6d7]">
              <Link href="#" className="flex items-center space-x-3 px-4 py-2 hover:text-white transition-colors">
                <span className="material-symbols-outlined text-xl">help</span>
                <span>Help</span>
              </Link>
              <button
                onClick={handleLogout}
                className="w-full flex items-center space-x-3 px-4 py-2 hover:text-white transition-colors text-left"
              >
                <span className="material-symbols-outlined text-xl">logout</span>
                <span>Logout</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-6 md:p-10 max-w-6xl mx-auto w-full relative">
          {/* TAB: ANALYTICS PAGE (Exact match to screenshot) */}
          {activeNav === 'analytics' && (
            <div className="space-y-8 max-w-3xl mx-auto">
              {/* Header */}
              <div className="space-y-2">
                <h1 className="font-extrabold text-4xl text-[#e0e3e5] tracking-tight">Analytics</h1>
                <p className="text-sm text-[#c1c6d7]">Real-time fusion intelligence for your distributed data.</p>
              </div>

              {/* CARD 0: LIVE STORAGE SPACE CAPACITY & REMAINING QUOTA */}
              <div className="glass-panel p-8 rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-[#161c1e] to-[#101415] space-y-6 shadow-2xl relative overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-cyan-400 text-2xl">pie_chart</span>
                      <h2 className="font-extrabold text-2xl text-[#e0e3e5] tracking-tight">Storage Space & Quota Telemetry</h2>
                    </div>
                    <p className="text-xs text-[#8b90a0]">Real-time metric breakdown of total, used, and remaining free space.</p>
                  </div>

                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-bold shrink-0">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    <span>Live Quota Telemetry</span>
                  </div>
                </div>

                {/* Top 3 High Contrast Metric Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Total Quota */}
                  <div className="bg-[#1d2022] p-5 rounded-2xl border border-white/10 space-y-2">
                    <div className="flex items-center justify-between text-xs text-[#8b90a0]">
                      <span className="font-semibold">Total Capacity</span>
                      <span className="material-symbols-outlined text-lg text-[#8b90a0]">database</span>
                    </div>
                    <div className="text-3xl font-extrabold text-white tracking-tight">
                      {formatStorageBytes(storageQuota?.totalQuotaBytes)}
                    </div>
                    <div className="text-[11px] text-cyan-400 font-medium">Aggregated Cloud Pool</div>
                  </div>

                  {/* Used Space */}
                  <div className="bg-[#1d2022] p-5 rounded-2xl border border-amber-500/20 space-y-2">
                    <div className="flex items-center justify-between text-xs text-[#8b90a0]">
                      <span className="font-semibold text-amber-400">Used Space</span>
                      <span className="material-symbols-outlined text-lg text-amber-400">cloud_upload</span>
                    </div>
                    <div className="text-3xl font-extrabold text-white tracking-tight">
                      {formatStorageBytes(storageQuota?.usedQuotaBytes)}
                    </div>
                    <div className="text-[11px] text-amber-300 font-medium">
                      {calculatePercentUsed(storageQuota?.usedQuotaBytes, storageQuota?.totalQuotaBytes)}% of Total Mesh
                    </div>
                  </div>

                  {/* Free Remaining Space */}
                  <div className="bg-[#1d2022] p-5 rounded-2xl border border-emerald-500/30 space-y-2">
                    <div className="flex items-center justify-between text-xs text-[#8b90a0]">
                      <span className="font-semibold text-emerald-400">Space Remaining</span>
                      <span className="material-symbols-outlined text-lg text-emerald-400">check_circle</span>
                    </div>
                    <div className="text-3xl font-extrabold text-emerald-400 tracking-tight">
                      {formatStorageBytes(storageQuota?.freeQuotaBytes)}
                    </div>
                    <div className="text-[11px] text-emerald-300 font-medium">Available for Uploads</div>
                  </div>
                </div>

                {/* Overall Visual Utilization Bar */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-white">Overall Mesh Utilization</span>
                    <span className="text-cyan-400">
                      {calculatePercentUsed(storageQuota?.usedQuotaBytes, storageQuota?.totalQuotaBytes)}% Used
                    </span>
                  </div>

                  <div className="w-full bg-[#1d2022] h-4 rounded-full overflow-hidden p-0.5 border border-white/10">
                    <div
                      className="bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-400 h-full rounded-full transition-all duration-700 shadow-lg"
                      style={{
                        width: `${Math.max(
                          1,
                          calculatePercentUsed(storageQuota?.usedQuotaBytes, storageQuota?.totalQuotaBytes)
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Per Provider Detailed Storage Breakdown */}
                <div className="space-y-4 pt-4 border-t border-white/10">
                  <h3 className="font-bold text-base text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-cyan-400">cloud_done</span>
                    <span>Connected Provider Quota Breakdown</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Google Drive Card */}
                    <div className="bg-[#1d2022] p-4 rounded-2xl border border-white/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                            <span className="material-symbols-outlined text-lg">add_to_drive</span>
                          </div>
                          <div>
                            <div className="font-bold text-sm text-white">Google Drive</div>
                            <div className="text-[10px] text-[#8b90a0]">Workspace Cloud API</div>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                            storageQuota?.providers?.gdrive?.isConnected
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-[#323537] text-[#8b90a0] border-white/10'
                          }`}
                        >
                          {storageQuota?.providers?.gdrive?.isConnected ? 'CONNECTED' : 'DISCONNECTED'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-[#101415] p-2 rounded-xl border border-white/5">
                          <div className="text-[10px] text-[#8b90a0]">Total</div>
                          <div className="font-bold text-white mt-0.5">
                            {formatStorageBytes(storageQuota?.providers?.gdrive?.total)}
                          </div>
                        </div>
                        <div className="bg-[#101415] p-2 rounded-xl border border-white/5">
                          <div className="text-[10px] text-[#8b90a0]">Used</div>
                          <div className="font-bold text-amber-400 mt-0.5">
                            {formatStorageBytes(storageQuota?.providers?.gdrive?.used)}
                          </div>
                        </div>
                        <div className="bg-[#101415] p-2 rounded-xl border border-white/5">
                          <div className="text-[10px] text-[#8b90a0]">Free</div>
                          <div className="font-bold text-emerald-400 mt-0.5">
                            {formatStorageBytes(storageQuota?.providers?.gdrive?.free)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* MEGA Cloud Card */}
                    <div className="bg-[#1d2022] p-4 rounded-2xl border border-white/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                            <span className="material-symbols-outlined text-lg">lock</span>
                          </div>
                          <div>
                            <div className="font-bold text-sm text-white">MEGA E2EE Cloud</div>
                            <div className="text-[10px] text-[#8b90a0]">Encrypted Storage</div>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                            storageQuota?.providers?.mega?.isConnected
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-[#323537] text-[#8b90a0] border-white/10'
                          }`}
                        >
                          {storageQuota?.providers?.mega?.isConnected ? 'CONNECTED' : 'DISCONNECTED'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-[#101415] p-2 rounded-xl border border-white/5">
                          <div className="text-[10px] text-[#8b90a0]">Total</div>
                          <div className="font-bold text-white mt-0.5">
                            {formatStorageBytes(storageQuota?.providers?.mega?.total)}
                          </div>
                        </div>
                        <div className="bg-[#101415] p-2 rounded-xl border border-white/5">
                          <div className="text-[10px] text-[#8b90a0]">Used</div>
                          <div className="font-bold text-amber-400 mt-0.5">
                            {formatStorageBytes(storageQuota?.providers?.mega?.used)}
                          </div>
                        </div>
                        <div className="bg-[#101415] p-2 rounded-xl border border-white/5">
                          <div className="text-[10px] text-[#8b90a0]">Free</div>
                          <div className="font-bold text-emerald-400 mt-0.5">
                            {formatStorageBytes(storageQuota?.providers?.mega?.free)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* AWS S3 Card */}
                    <div className="bg-[#1d2022] p-4 rounded-2xl border border-white/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                            <span className="material-symbols-outlined text-lg">database</span>
                          </div>
                          <div>
                            <div className="font-bold text-sm text-white">AWS S3 Bucket</div>
                            <div className="text-[10px] text-[#8b90a0]">Object Storage</div>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                            storageQuota?.providers?.s3?.isConnected
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-[#323537] text-[#8b90a0] border-white/10'
                          }`}
                        >
                          {storageQuota?.providers?.s3?.isConnected ? 'CONNECTED' : 'DISCONNECTED'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-[#101415] p-2 rounded-xl border border-white/5">
                          <div className="text-[10px] text-[#8b90a0]">Total</div>
                          <div className="font-bold text-white mt-0.5">
                            {formatStorageBytes(storageQuota?.providers?.s3?.total)}
                          </div>
                        </div>
                        <div className="bg-[#101415] p-2 rounded-xl border border-white/5">
                          <div className="text-[10px] text-[#8b90a0]">Used</div>
                          <div className="font-bold text-amber-400 mt-0.5">
                            {formatStorageBytes(storageQuota?.providers?.s3?.used)}
                          </div>
                        </div>
                        <div className="bg-[#101415] p-2 rounded-xl border border-white/5">
                          <div className="text-[10px] text-[#8b90a0]">Free</div>
                          <div className="font-bold text-emerald-400 mt-0.5">
                            {formatStorageBytes(storageQuota?.providers?.s3?.free)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Dropbox Card */}
                    <div className="bg-[#1d2022] p-4 rounded-2xl border border-white/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                            <span className="material-symbols-outlined text-lg">folder_shared</span>
                          </div>
                          <div>
                            <div className="font-bold text-sm text-white">Dropbox</div>
                            <div className="text-[10px] text-[#8b90a0]">Direct Cloud Sync</div>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                            storageQuota?.providers?.dropbox?.isConnected
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-[#323537] text-[#8b90a0] border-white/10'
                          }`}
                        >
                          {storageQuota?.providers?.dropbox?.isConnected ? 'CONNECTED' : 'DISCONNECTED'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-[#101415] p-2 rounded-xl border border-white/5">
                          <div className="text-[10px] text-[#8b90a0]">Total</div>
                          <div className="font-bold text-white mt-0.5">
                            {formatStorageBytes(storageQuota?.providers?.dropbox?.total)}
                          </div>
                        </div>
                        <div className="bg-[#101415] p-2 rounded-xl border border-white/5">
                          <div className="text-[10px] text-[#8b90a0]">Used</div>
                          <div className="font-bold text-amber-400 mt-0.5">
                            {formatStorageBytes(storageQuota?.providers?.dropbox?.used)}
                          </div>
                        </div>
                        <div className="bg-[#101415] p-2 rounded-xl border border-white/5">
                          <div className="text-[10px] text-[#8b90a0]">Free</div>
                          <div className="font-bold text-emerald-400 mt-0.5">
                            {formatStorageBytes(storageQuota?.providers?.dropbox?.free)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Microsoft OneDrive Card */}
                    <div className="bg-[#1d2022] p-4 rounded-2xl border border-white/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                            <span className="material-symbols-outlined text-lg">cloud</span>
                          </div>
                          <div>
                            <div className="font-bold text-sm text-white">Microsoft OneDrive</div>
                            <div className="text-[10px] text-[#8b90a0]">Microsoft Graph API</div>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                            storageQuota?.providers?.onedrive?.isConnected
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-[#323537] text-[#8b90a0] border-white/10'
                          }`}
                        >
                          {storageQuota?.providers?.onedrive?.isConnected ? 'CONNECTED' : 'DISCONNECTED'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-[#101415] p-2 rounded-xl border border-white/5">
                          <div className="text-[10px] text-[#8b90a0]">Total</div>
                          <div className="font-bold text-white mt-0.5">
                            {formatStorageBytes(storageQuota?.providers?.onedrive?.total)}
                          </div>
                        </div>
                        <div className="bg-[#101415] p-2 rounded-xl border border-white/5">
                          <div className="text-[10px] text-[#8b90a0]">Used</div>
                          <div className="font-bold text-amber-400 mt-0.5">
                            {formatStorageBytes(storageQuota?.providers?.onedrive?.used)}
                          </div>
                        </div>
                        <div className="bg-[#101415] p-2 rounded-xl border border-white/5">
                          <div className="text-[10px] text-[#8b90a0]">Free</div>
                          <div className="font-bold text-emerald-400 mt-0.5">
                            {formatStorageBytes(storageQuota?.providers?.onedrive?.free)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* LIVE MULTI-CLOUD STORAGE DISTRIBUTION */}
              <div className="glass-panel p-8 rounded-3xl border border-white/10 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="font-bold text-2xl text-[#e0e3e5]">Multi-Cloud Storage Distribution</h2>
                    <p className="text-xs text-[#8b90a0] mt-1">Real-time capacity and utilization breakdown across your connected cloud storage nodes.</p>
                  </div>
                  <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 w-fit">
                    Active Storage Share
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-2">
                  {[
                    { name: 'MEGA', key: 'mega', color: 'bg-rose-500', text: 'text-rose-400', border: 'border-rose-500/30' },
                    { name: 'Google Drive', key: 'gdrive', color: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500/30' },
                    { name: 'OneDrive', key: 'onedrive', color: 'bg-cyan-500', text: 'text-cyan-400', border: 'border-cyan-500/30' },
                    { name: 'AWS S3', key: 's3', color: 'bg-amber-500', text: 'text-amber-400', border: 'border-amber-500/30' },
                    { name: 'Dropbox', key: 'dropbox', color: 'bg-blue-500', text: 'text-blue-400', border: 'border-blue-500/30' },
                  ].map((p) => {
                    const info = storageQuota?.providers?.[p.key];
                    const isConn = !!info?.isConnected;
                    const pct = isConn ? calculatePercentUsed(info?.used, info?.total) : 0;
                    return (
                      <div key={p.key} className="bg-[#1d2022] p-4 rounded-2xl border border-white/10 flex flex-col justify-between space-y-4">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold ${p.text}`}>{p.name}</span>
                          <span className={`w-2 h-2 rounded-full ${isConn ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`} />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-baseline justify-between text-xs">
                            <span className="text-white font-extrabold">{isConn ? formatStorageBytes(info?.used) : '0 GB'}</span>
                            <span className="text-[10px] text-[#8b90a0]">/ {isConn ? formatStorageBytes(info?.total) : '0 GB'}</span>
                          </div>

                          <div className="w-full bg-[#101415] h-2 rounded-full overflow-hidden border border-white/5">
                            <div
                              className={`${p.color} h-full rounded-full transition-all duration-500`}
                              style={{ width: `${Math.max(isConn ? 4 : 0, pct)}%` }}
                            />
                          </div>
                        </div>

                        <div className="text-[10px] text-[#8b90a0] flex items-center justify-between pt-1 border-t border-white/5">
                          <span>Status</span>
                          <span className={isConn ? 'text-emerald-400 font-semibold' : 'text-[#8b90a0]'}>
                            {isConn ? `${pct}% Used` : 'Offline'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SETTINGS PAGE */}
          {activeNav === 'settings' && (
            <div className="space-y-10 max-w-3xl mx-auto">
              <div className="text-center space-y-3">
                <h1 className="font-extrabold text-4xl text-[#e0e3e5] tracking-tight">Connect Your Clouds</h1>
                <p className="text-sm text-[#c1c6d7] max-w-md mx-auto leading-relaxed">
                  Securely aggregate all your digital assets into a single high-performance fusion hub.
                </p>
              </div>

              <div className="space-y-4">
                {connectors.map((conn) => (
                  <div
                    key={conn.id}
                    className="glass-panel p-5 rounded-3xl border border-white/10 flex items-center justify-between gap-4 transition-all hover:border-white/20"
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`w-12 h-12 rounded-2xl bg-[#1d2022] border flex items-center justify-center ${conn.colorClass}`}>
                        <span className="material-symbols-outlined text-2xl">{conn.icon}</span>
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-white">{conn.name}</h3>
                        <p className="text-xs text-[#8b90a0] mt-0.5">{conn.subtitle}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      {conn.isLinked ? (
                        <>
                          <span className="text-xs font-semibold text-[#c1c6d7]">Linked</span>
                          <button
                            onClick={() => toggleConnectorLink(conn.id)}
                            className="w-12 h-6 rounded-full bg-blue-600 relative transition-colors p-1 flex items-center"
                          >
                            <div className="w-4 h-4 rounded-full bg-white translate-x-6 transition-transform shadow-md" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            const token = localStorage.getItem('cloudfusion_token') || '';
                            if (conn.id === 'onedrive') {
                              window.location.href = `${API_BASE_URL}/api/storage/onedrive/login?token=${encodeURIComponent(token)}`;
                            } else if (conn.id === 'gdrive') {
                              window.location.href = `${API_BASE_URL}/api/storage/gdrive/login?token=${encodeURIComponent(token)}`;
                            } else if (conn.id === 'dropbox') {
                              window.location.href = `${API_BASE_URL}/api/storage/dropbox/login?token=${encodeURIComponent(token)}`;
                            } else if (conn.id === 's3') {
                              setShowS3Modal(true);
                            } else if (conn.id === 'mega') {
                              setShowMegaModal(true);
                            } else {
                              toggleConnectorLink(conn.id);
                            }
                          }}
                          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-6 py-2.5 rounded-full shadow-lg transition-all flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                          <span>Connect</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="glass-panel p-5 rounded-2xl border border-blue-500/30 bg-blue-950/20 text-center space-y-2">
                <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-bold">
                  <span className="material-symbols-outlined text-sm">verified_user</span>
                  <span>256-bit AES Encryption Active</span>
                </div>
                <p className="text-[11px] font-extrabold uppercase text-[#8b90a0] tracking-widest">
                  YOUR DATA NEVER LEAVES YOUR CLOUD
                </p>
              </div>

              <div className="space-y-6 pt-6 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-extrabold text-2xl text-[#e0e3e5]">Auto-Balancing & Security Engine</h2>
                    <p className="text-xs text-[#8b90a0] mt-1">Configure intelligent routing policies across your connected multi-cloud mesh.</p>
                  </div>
                  <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    Engine Active
                  </span>
                </div>

                <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-base text-white">Intelligent Auto-Balancer Routing Policy</h3>
                      <p className="text-xs text-[#8b90a0] mt-0.5">Determine how CloudFusion automatically distributes new encrypted file uploads.</p>
                    </div>
                    <span className="material-symbols-outlined text-primary text-2xl">alt_route</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                    <button
                      onClick={() => {
                        setBalanceStrategy('MAX_FREE');
                        if (typeof window !== 'undefined') localStorage.setItem('cloudfusion_balance_strategy', 'MAX_FREE');
                        setToastMessage('⚡ Auto-Balancer policy set to Max Free Quota');
                        setTimeout(() => setToastMessage(null), 3000);
                      }}
                      className={`p-4 rounded-2xl border text-left transition-all ${
                        balanceStrategy === 'MAX_FREE'
                          ? 'bg-primary/10 border-primary text-white shadow-lg ring-1 ring-primary/40'
                          : 'bg-[#1d2022] border-white/5 text-[#8b90a0] hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-primary flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm">bolt</span>
                          <span>Max Free Quota</span>
                        </div>
                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          RECOMMENDED
                        </span>
                      </div>
                      <div className="text-[11px] mt-2 text-[#c1c6d7] leading-relaxed">
                        Dynamically prioritizes the connected cloud with the highest remaining free space.
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setBalanceStrategy('LOWEST_LATENCY');
                        if (typeof window !== 'undefined') localStorage.setItem('cloudfusion_balance_strategy', 'LOWEST_LATENCY');
                        setToastMessage('🚀 Auto-Balancer policy set to Lowest Latency');
                        setTimeout(() => setToastMessage(null), 3000);
                      }}
                      className={`p-4 rounded-2xl border text-left transition-all ${
                        balanceStrategy === 'LOWEST_LATENCY'
                          ? 'bg-purple-500/10 border-purple-500 text-white shadow-lg ring-1 ring-purple-500/40'
                          : 'bg-[#1d2022] border-white/5 text-[#8b90a0] hover:text-white'
                      }`}
                    >
                      <div className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">speed</span>
                        <span>Lowest Latency</span>
                      </div>
                      <div className="text-[11px] mt-2 text-[#8b90a0] leading-relaxed">
                        Routes uploads to the provider endpoint with the fastest response and roundtrip latency.
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setBalanceStrategy('DUAL_MIRROR');
                        if (typeof window !== 'undefined') localStorage.setItem('cloudfusion_balance_strategy', 'DUAL_MIRROR');
                        setToastMessage('🛡️ Auto-Balancer policy set to Dual Mirroring (Fault-Tolerant Replicas)');
                        setTimeout(() => setToastMessage(null), 3000);
                      }}
                      className={`p-4 rounded-2xl border text-left transition-all ${
                        balanceStrategy === 'DUAL_MIRROR'
                          ? 'bg-cyan-500/10 border-cyan-500 text-white shadow-lg ring-1 ring-cyan-500/40'
                          : 'bg-[#1d2022] border-white/5 text-[#8b90a0] hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm">shield</span>
                          <span>Dual Mirroring</span>
                        </div>
                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          HIGH AVAILABILITY
                        </span>
                      </div>
                      <div className="text-[11px] mt-2 text-[#8b90a0] leading-relaxed">
                        Clones encrypted blocks across 2 clouds simultaneously. Automatic failover on download.
                      </div>
                    </button>
                  </div>

                  <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs text-[#8b90a0]">
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-emerald-400 text-base">verified</span>
                      <span>Zero-Knowledge AES-256-GCM + SHA-256 Checksums verified automatically on all routes.</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: NOTIFICATIONS PAGE */}
          {activeNav === 'notifications' && (
            <div className="space-y-8 max-w-4xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="font-extrabold text-4xl text-[#e0e3e5] tracking-tight">Notification Center</h1>
                  <p className="text-sm text-[#c1c6d7] mt-1">Real-time security logs, storage updates, and automated system alerts.</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={markAllNotificationsAsRead}
                    className="px-4 py-2 bg-[#1d2022] hover:bg-[#323537] border border-white/10 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-sm">done_all</span>
                    <span>Mark All Read</span>
                  </button>
                  <button
                    onClick={clearAllNotifications}
                    className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-sm">delete_sweep</span>
                    <span>Clear All</span>
                  </button>
                </div>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {(['ALL', 'UNREAD', 'SECURITY', 'STORAGE'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setNotifFilter(filter)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      notifFilter === filter
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                        : 'glass-panel text-[#c1c6d7] hover:text-white border border-white/10'
                    }`}
                  >
                    {filter} {filter === 'UNREAD' && `(${notifications.filter((n) => !n.isRead).length})`}
                  </button>
                ))}
              </div>

              {/* Notifications List */}
              <div className="space-y-4">
                {notifications.filter((n) => {
                  if (notifFilter === 'UNREAD') return !n.isRead;
                  if (notifFilter === 'SECURITY') return n.type === 'SECURITY';
                  if (notifFilter === 'STORAGE') return n.type === 'STORAGE';
                  return true;
                }).length === 0 ? (
                  <div className="glass-panel p-12 rounded-3xl border border-white/10 text-center space-y-3">
                    <span className="material-symbols-outlined text-5xl text-[#8b90a0]">notifications_off</span>
                    <h3 className="font-bold text-lg text-white">No notifications found</h3>
                    <p className="text-xs text-[#8b90a0] max-w-sm mx-auto">
                      You're all caught up! New system activity, storage updates, and security logs will appear here.
                    </p>
                  </div>
                ) : (
                  notifications
                    .filter((n) => {
                      if (notifFilter === 'UNREAD') return !n.isRead;
                      if (notifFilter === 'SECURITY') return n.type === 'SECURITY';
                      if (notifFilter === 'STORAGE') return n.type === 'STORAGE';
                      return true;
                    })
                    .map((n) => (
                      <div
                        key={n.id}
                        className={`glass-panel p-6 rounded-3xl border transition-all flex items-start justify-between gap-6 group ${
                          n.isRead ? 'border-white/5 opacity-75 hover:opacity-100' : 'border-blue-500/30 bg-blue-500/5 shadow-xl'
                        }`}
                      >
                        <div className="flex items-start space-x-4 flex-1">
                          <div
                            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
                              n.type === 'SECURITY'
                                ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                : n.type === 'SUCCESS'
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : n.type === 'STORAGE'
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                            }`}
                          >
                            <span className="material-symbols-outlined text-2xl">{n.icon}</span>
                          </div>

                          <div className="space-y-1.5 flex-1">
                            <div className="flex items-center space-x-3">
                              <h3 className="font-bold text-base text-white">{n.title}</h3>
                              {!n.isRead && <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />}
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                                  n.type === 'SECURITY'
                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                    : n.type === 'SUCCESS'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : n.type === 'STORAGE'
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                                }`}
                              >
                                {n.type}
                              </span>
                            </div>

                            <p className="text-sm text-[#c1c6d7] leading-relaxed">{n.message}</p>
                            <div className="text-xs text-[#8b90a0] pt-1">{n.timestamp}</div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => toggleNotificationRead(n.id)}
                            title={n.isRead ? 'Mark as unread' : 'Mark as read'}
                            className="p-2 rounded-xl text-[#8b90a0] hover:text-white hover:bg-white/5 transition-colors"
                          >
                            <span className="material-symbols-outlined text-xl">
                              {n.isRead ? 'mark_email_unread' : 'mark_email_read'}
                            </span>
                          </button>
                          <button
                            onClick={() => deleteNotification(n.id)}
                            title="Delete notification"
                            className="p-2 rounded-xl text-[#8b90a0] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          >
                            <span className="material-symbols-outlined text-xl">delete</span>
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {/* TAB 1: FILES / CLOUD SYNC PAGE */}
          {activeNav === 'files' && (
            <div className="space-y-10 max-w-4xl mx-auto">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h1 className="font-extrabold text-3xl text-[#e0e3e5] tracking-tight">Select Files</h1>
                  <span className="text-xs text-[#8b90a0] font-medium">Max size 2GB</span>
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    handleFileUpload(e.dataTransfer.files);
                  }}
                  className={`border-2 border-dashed rounded-3xl p-10 text-center transition-all glass-panel border-white/10 ${
                    dragActive ? 'border-primary bg-primary/10' : 'hover:border-primary/50'
                  }`}
                >
                  <div className="w-16 h-16 rounded-2xl bg-[#1d2022] border border-white/10 flex items-center justify-center mx-auto mb-5 shadow-xl">
                    <span className="material-symbols-outlined text-3xl text-primary">upload_file</span>
                  </div>

                  <p className="font-semibold text-base text-[#e0e3e5]">Drag and drop files here</p>
                  <p className="text-xs text-[#8b90a0] max-w-md mx-auto mt-2 leading-relaxed">
                    Select or drag single or multiple files to fuse across your cloud mesh.
                  </p>

                  <label className="inline-flex items-center gap-2 mt-6 px-8 py-3.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-xl hover:scale-105 active:scale-95 transition-transform cursor-pointer">
                    <span>+ Choose Files</span>
                    <input
                      type="file"
                      multiple
                      onChange={(e) => {
                        handleFileUpload(e.target.files);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-extrabold text-2xl text-[#e0e3e5]">Fusion Destination</h2>
                    <p className="text-xs text-[#8b90a0] mt-0.5">Select a destination or let AI auto-route to the server with the most free space</p>
                  </div>
                </div>

                {/* AI / Smart Balancer Card */}
                {(() => {
                  const candidateList = [
                    { id: 'ONEDRIVE', name: 'Microsoft OneDrive', freeBytes: Number(storageQuota?.providers?.onedrive?.free || 0), isConnected: !!storageQuota?.providers?.onedrive?.isConnected },
                    { id: 'S3', name: 'AWS S3', freeBytes: Number(storageQuota?.providers?.s3?.free || 0), isConnected: !!storageQuota?.providers?.s3?.isConnected },
                    { id: 'GDRIVE', name: 'Google Drive', freeBytes: Number(storageQuota?.providers?.gdrive?.free || 0), isConnected: !!storageQuota?.providers?.gdrive?.isConnected },
                    { id: 'DROPBOX', name: 'Dropbox', freeBytes: Number(storageQuota?.providers?.dropbox?.free || 0), isConnected: !!storageQuota?.providers?.dropbox?.isConnected },
                    { id: 'MEGA', name: 'MEGA', freeBytes: Number(storageQuota?.providers?.mega?.free || 0), isConnected: !!storageQuota?.providers?.mega?.isConnected },
                  ].filter((p) => p.isConnected);

                  candidateList.sort((a, b) => b.freeBytes - a.freeBytes);
                  const topCandidate = candidateList[0] || { id: 'ONEDRIVE', name: 'Microsoft OneDrive', freeBytes: 3972844748 };

                  return (
                    <div
                      onClick={() => setSelectedDestination('AI')}
                      className={`relative p-6 rounded-3xl cursor-pointer transition-all border ${
                        selectedDestination === 'AI'
                          ? 'bg-blue-600 text-white shadow-2xl border-blue-400/50 scale-[1.01]'
                          : 'bg-slate-900/60 border-white/10 text-slate-200 hover:border-blue-500/40'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-white text-[10px] font-extrabold tracking-wider uppercase w-fit">
                          <span className="material-symbols-outlined text-xs">auto_awesome</span>
                          <span>AI SMART LOAD BALANCER</span>
                        </div>
                        <div className="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-xs">bolt</span>
                          <span>Targeting: {topCandidate.name} ({formatStorageBytes(topCandidate.freeBytes.toString())} Free)</span>
                        </div>
                      </div>

                      <h3 className="font-extrabold text-xl">Fusion AI Auto-Route</h3>
                      <p className="text-xs opacity-90 mt-1">
                        Automatically evaluates all connected clouds and streams uploads to the node with the highest free capacity.
                      </p>
                    </div>
                  );
                })()}

                {/* Specific Provider Selector Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {/* ONEDRIVE */}
                  <div
                    onClick={() => setSelectedDestination('ONEDRIVE')}
                    className={`glass-panel p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                      selectedDestination === 'ONEDRIVE'
                        ? 'border-cyan-400 bg-cyan-500/20 shadow-xl ring-2 ring-cyan-400/40'
                        : storageQuota?.providers?.onedrive?.isConnected
                        ? 'border-cyan-500/30 bg-cyan-950/10 hover:border-cyan-400'
                        : 'border-white/5 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="material-symbols-outlined text-cyan-400 text-2xl">cloud</span>
                      {storageQuota?.providers?.onedrive?.isConnected ? (
                        <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          CONNECTED
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-[#8b90a0]">
                          OFFLINE
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-sm text-white">MS OneDrive</h4>
                    <p className="text-[10px] text-cyan-300 font-semibold mt-1">
                      {storageQuota?.providers?.onedrive?.isConnected
                        ? `${formatStorageBytes(storageQuota.providers.onedrive.free)} Free`
                        : 'Not Linked'}
                    </p>
                  </div>

                  {/* AWS S3 */}
                  <div
                    onClick={() => setSelectedDestination('S3')}
                    className={`glass-panel p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                      selectedDestination === 'S3'
                        ? 'border-amber-400 bg-amber-500/20 shadow-xl ring-2 ring-amber-400/40'
                        : storageQuota?.providers?.s3?.isConnected
                        ? 'border-amber-500/30 bg-amber-950/10 hover:border-amber-400'
                        : 'border-white/5 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="material-symbols-outlined text-amber-400 text-2xl">database</span>
                      {storageQuota?.providers?.s3?.isConnected ? (
                        <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          CONNECTED
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-[#8b90a0]">
                          OFFLINE
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-sm text-white">AWS S3</h4>
                    <p className="text-[10px] text-amber-300 font-semibold mt-1">
                      {storageQuota?.providers?.s3?.isConnected
                        ? `${formatStorageBytes(storageQuota.providers.s3.free)} Free`
                        : 'Not Linked'}
                    </p>
                  </div>

                  {/* GOOGLE DRIVE */}
                  <div
                    onClick={() => {
                      if (storageQuota?.providers?.gdrive?.isConnected) {
                        setSelectedDestination('GDRIVE');
                      } else {
                        window.location.href = `${API_BASE_URL}/api/storage/gdrive/login`;
                      }
                    }}
                    className={`glass-panel p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                      selectedDestination === 'GDRIVE'
                        ? 'border-emerald-400 bg-emerald-500/20 shadow-xl ring-2 ring-emerald-400/40'
                        : storageQuota?.providers?.gdrive?.isConnected
                        ? 'border-emerald-500/30 bg-emerald-950/10 hover:border-emerald-400'
                        : 'border-white/5 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="material-symbols-outlined text-emerald-400 text-2xl">add_to_drive</span>
                      {storageQuota?.providers?.gdrive?.isConnected ? (
                        <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          CONNECTED
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-[#8b90a0]">
                          RE-LINK
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-sm text-white">Google Drive</h4>
                    <p className="text-[10px] text-emerald-300 font-semibold mt-1">
                      {storageQuota?.providers?.gdrive?.isConnected
                        ? `${formatStorageBytes(storageQuota.providers.gdrive.free)} Free`
                        : 'Click to Connect'}
                    </p>
                  </div>

                  {/* DROPBOX */}
                  <div
                    onClick={() => {
                      if (storageQuota?.providers?.dropbox?.isConnected) {
                        setSelectedDestination('DROPBOX');
                      } else {
                        window.location.href = `${API_BASE_URL}/api/storage/dropbox/login`;
                      }
                    }}
                    className={`glass-panel p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                      selectedDestination === 'DROPBOX'
                        ? 'border-blue-400 bg-blue-500/20 shadow-xl ring-2 ring-blue-400/40'
                        : storageQuota?.providers?.dropbox?.isConnected
                        ? 'border-blue-500/30 bg-blue-950/10 hover:border-blue-400'
                        : 'border-white/5 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="material-symbols-outlined text-blue-400 text-2xl">folder_shared</span>
                      {storageQuota?.providers?.dropbox?.isConnected ? (
                        <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          CONNECTED
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-[#8b90a0]">
                          RE-LINK
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-sm text-white">Dropbox</h4>
                    <p className="text-[10px] text-blue-300 font-semibold mt-1">
                      {storageQuota?.providers?.dropbox?.isConnected
                        ? `${formatStorageBytes(storageQuota.providers.dropbox.free)} Free`
                        : 'Click to Connect'}
                    </p>
                  </div>

                  {/* MEGA */}
                  <div
                    onClick={() => setSelectedDestination('MEGA')}
                    className={`glass-panel p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                      selectedDestination === 'MEGA'
                        ? 'border-rose-400 bg-rose-500/20 shadow-xl ring-2 ring-rose-400/40'
                        : storageQuota?.providers?.mega?.isConnected
                        ? 'border-rose-500/30 bg-rose-950/10 hover:border-rose-400'
                        : 'border-white/5 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="material-symbols-outlined text-rose-400 text-2xl">lock</span>
                      {storageQuota?.providers?.mega?.isConnected ? (
                        <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          CONNECTED
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-[#8b90a0]">
                          OFFLINE
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-sm text-white">MEGA</h4>
                    <p className="text-[10px] text-rose-300 font-semibold mt-1">
                      {storageQuota?.providers?.mega?.isConnected
                        ? `${formatStorageBytes(storageQuota.providers.mega.free)} Free`
                        : 'E2EE Mesh'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setActiveNav('settings')}
                  className="w-full glass-panel py-4 rounded-3xl border border-dashed border-white/20 hover:border-white/40 flex items-center justify-center space-x-3 text-sm font-semibold text-[#c1c6d7] hover:text-white transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-xl text-primary">settings_suggest</span>
                  <span>Manage Connected Cloud Nodes in Settings</span>
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="font-extrabold text-2xl text-[#e0e3e5]">Recent Uploads</h2>
                    {uploadItems.length > 0 && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/10 text-[#c1c6d7]">
                        {showAllUploads
                          ? `Showing all ${uploadItems.length} ${uploadItems.length === 1 ? 'upload' : 'uploads'}`
                          : `Showing latest ${Math.min(5, uploadItems.length)} of ${uploadItems.length}`}
                      </span>
                    )}
                  </div>

                  {uploadItems.length > 5 && (
                    <button
                      onClick={() => setShowAllUploads((prev) => !prev)}
                      className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-primary hover:text-white border border-white/10 transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <span>{showAllUploads ? 'Close & Show Less' : `See All Uploads (${uploadItems.length})`}</span>
                      <span className="material-symbols-outlined text-sm">
                        {showAllUploads ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {uploadItems.length === 0 ? (
                    <div className="glass-panel p-8 rounded-2xl border border-white/10 text-center space-y-2">
                      <span className="material-symbols-outlined text-4xl text-[#8b90a0]">cloud_upload</span>
                      <p className="text-sm font-semibold text-white">No active uploads</p>
                      <p className="text-xs text-[#8b90a0]">Choose files above to encrypt and upload assets to your cloud mesh.</p>
                    </div>
                  ) : (
                    (showAllUploads ? uploadItems : uploadItems.slice(0, 5)).map((item) => (
                      <div key={item.id} className="glass-panel p-4 rounded-2xl border border-white/10 flex items-center justify-between gap-4">
                        <div className="flex items-center space-x-4 flex-1 min-w-0">
                          <div className="w-12 h-12 rounded-xl bg-[#1d2022] border border-white/10 flex items-center justify-center flex-shrink-0 text-primary">
                            <span className="material-symbols-outlined text-2xl">{item.icon}</span>
                          </div>

                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center space-x-3">
                              <span className="font-bold text-sm text-white truncate">{item.name}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${item.providerBadgeClass}`}>
                                {item.provider}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-xs text-[#8b90a0]">
                              <span>{item.sizeProgress}</span>
                              {item.status === 'UPLOADING' && <span className="font-mono text-primary font-bold">{item.percentage}%</span>}
                              {item.status === 'COMPLETE' && (
                                <span className="flex items-center space-x-1 text-emerald-400 font-bold">
                                  <span className="material-symbols-outlined text-sm">check_circle</span>
                                  <span>Complete</span>
                                </span>
                              )}
                            </div>

                            {item.status === 'UPLOADING' && (
                              <div className="w-full bg-[#1d2022] h-1.5 rounded-full overflow-hidden mt-1">
                                <div
                                  className="bg-blue-500 h-full transition-all duration-300"
                                  style={{ width: `${item.percentage}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          {item.status === 'COMPLETE' && (
                            <button
                              onClick={() => handleFileDownload(item.id, item.name)}
                              disabled={downloadingFileId === item.id}
                              title="Download Decrypted File"
                              className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-60"
                            >
                              {downloadingFileId === item.id ? (
                                <>
                                  <span className="material-symbols-outlined text-base animate-spin text-cyan-300">sync</span>
                                  <span>Decrypting...</span>
                                </>
                              ) : (
                                <>
                                  <span className="material-symbols-outlined text-base">cloud_download</span>
                                  <span>Download</span>
                                </>
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => removeUploadItem(item.id)}
                            className="text-[#8b90a0] hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
                          >
                            <span className="material-symbols-outlined text-lg">close</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            {/* INTERACTIVE FILE EXPLORER & VAULT */}
              <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-white/10 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="font-extrabold text-2xl text-[#e0e3e5] tracking-tight">Cloud Mesh File Explorer</h2>
                    <p className="text-xs text-[#8b90a0] mt-0.5">Explore, decrypt, preview, and rebalance all encrypted assets across your connected nodes.</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/5 border border-white/10 text-[#c1c6d7] w-fit">
                    {activities.filter((f) => {
                      const matchesSearch = !fileSearchQuery || f.fileName.toLowerCase().includes(fileSearchQuery.toLowerCase());
                      const matchesCat = matchesCategory(f, fileCategoryFilter);
                      const matchesProv = fileProviderFilter === 'ALL' || f.rawCloudProvider === fileProviderFilter;
                      return matchesSearch && matchesCat && matchesProv;
                    }).length} files displayed
                  </span>
                </div>

                {/* Search Bar & Provider Dropdown */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                    <input
                      type="text"
                      placeholder="Search files by name..."
                      value={fileSearchQuery}
                      onChange={(e) => setFileSearchQuery(e.target.value)}
                      className="w-full bg-[#101415] border border-white/10 rounded-2xl pl-10 pr-9 py-2.5 text-xs text-white placeholder:text-[#8b90a0] focus:outline-none focus:border-blue-500 transition-colors"
                    />
                    {fileSearchQuery && (
                      <button
                        onClick={() => setFileSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <select
                    value={fileProviderFilter}
                    onChange={(e) => setFileProviderFilter(e.target.value)}
                    className="bg-[#101415] border border-white/10 rounded-2xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
                  >
                    <option value="ALL">All Cloud Providers</option>
                    <option value="GOOGLE_DRIVE">Google Drive</option>
                    <option value="ONEDRIVE">Microsoft OneDrive</option>
                    <option value="DROPBOX">Dropbox</option>
                    <option value="AWS_S3">AWS S3</option>
                    <option value="MEGA">MEGA</option>
                  </select>
                </div>

                {/* Category Filter Chips */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {[
                    { id: 'ALL', label: 'All Files', icon: 'folder' },
                    { id: 'DOCS', label: 'Documents', icon: 'description' },
                    { id: 'IMAGES', label: 'Images', icon: 'image' },
                    { id: 'MEDIA', label: 'Media', icon: 'movie' },
                    { id: 'ARCHIVES', label: 'Archives', icon: 'inventory_2' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setFileCategoryFilter(cat.id as any)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 ${
                        fileCategoryFilter === cat.id
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                          : 'bg-[#101415] text-[#8b90a0] hover:text-white border border-white/5'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">{cat.icon}</span>
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>

                {/* Filtered File Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-[#e0e3e5]">
                    <thead className="text-xs font-bold text-[#8b90a0] uppercase border-b border-white/10">
                      <tr>
                        <th className="pb-4">File Name</th>
                        <th className="pb-4">Provider</th>
                        <th className="pb-4">Size</th>
                        <th className="pb-4">Uploaded</th>
                        <th className="pb-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {(() => {
                        const filtered = activities.filter((f) => {
                          const matchesSearch = !fileSearchQuery || f.fileName.toLowerCase().includes(fileSearchQuery.toLowerCase());
                          const matchesCat = matchesCategory(f, fileCategoryFilter);
                          const matchesProv = fileProviderFilter === 'ALL' || f.rawCloudProvider === fileProviderFilter;
                          return matchesSearch && matchesCat && matchesProv;
                        });

                        if (filtered.length === 0) {
                          return (
                            <tr>
                              <td colSpan={5} className="py-10 text-center text-xs text-[#8b90a0]">
                                <div className="flex flex-col items-center justify-center space-y-2">
                                  <span className="material-symbols-outlined text-4xl opacity-40">search_off</span>
                                  <p>No files match your current search or category filter.</p>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        return filtered.map((file) => (
                          <tr key={file.id} className="hover:bg-white/5 transition-colors">
                            <td className="py-4 font-semibold text-white">
                              <div className="flex items-center space-x-3">
                                <span className="material-symbols-outlined text-primary text-xl">{file.icon}</span>
                                <div className="space-y-1">
                                  <div className="font-semibold text-sm max-w-xs truncate" title={file.fileName}>{file.fileName}</div>
                                  {file.isMirrored && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                      <span className="material-symbols-outlined text-[11px]">shield</span>
                                      <span>Dual Mirrored ({file.mirrorProvider || 'Replica'})</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-4">
                              <span
                                className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                  file.cloudSource === 'Google Drive'
                                    ? 'bg-primary/10 text-primary border border-primary/20'
                                    : file.cloudSource === 'Dropbox'
                                    ? 'bg-secondary/10 text-secondary border border-secondary/20'
                                    : file.cloudSource === 'MEGA'
                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                    : file.cloudSource === 'AWS S3'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                }`}
                              >
                                {file.cloudSource}
                              </span>
                            </td>
                            <td className="py-4 text-[#c1c6d7] text-xs">{file.size}</td>
                            <td className="py-4 text-xs text-[#8b90a0]">{file.timestamp}</td>
                            <td className="py-4 text-right">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                <button
                                  onClick={() => handlePreviewFile(file)}
                                  title="Preview in Browser"
                                  className="px-2.5 py-1 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                                >
                                  <span className="material-symbols-outlined text-sm">visibility</span>
                                  <span className="hidden sm:inline">Preview</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setShareModalFile(file);
                                    setGeneratedShareUrl(null);
                                    setShareCopied(false);
                                  }}
                                  title="Generate Secure Share Link"
                                  className="px-2.5 py-1 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                                >
                                  <span className="material-symbols-outlined text-sm">share</span>
                                  <span className="hidden sm:inline">Share</span>
                                </button>
                                <button
                                  onClick={() => setMigrateModalFile(file)}
                                  title="Migrate / Move to Another Cloud"
                                  className="px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                                >
                                  <span className="material-symbols-outlined text-sm">drive_file_move</span>
                                  <span className="hidden sm:inline">Move</span>
                                </button>
                                <button
                                  onClick={() => handleFileDownload(file.id, file.fileName)}
                                  disabled={downloadingFileId === file.id}
                                  title="Download & Decrypt File"
                                  className="px-2.5 py-1 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold transition-all flex items-center gap-1 shadow-sm disabled:opacity-60"
                                >
                                  {downloadingFileId === file.id ? (
                                    <>
                                      <span className="material-symbols-outlined text-sm animate-spin text-cyan-300">sync</span>
                                      <span className="hidden sm:inline">Decrypting...</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="material-symbols-outlined text-sm">cloud_download</span>
                                      <span className="hidden sm:inline">Download</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() => handleDeleteFile(file.id, file.fileName)}
                                  title="Delete File"
                                  className="p-1 rounded-lg hover:bg-rose-500/20 text-[#8b90a0] hover:text-rose-400 transition-all"
                                >
                                  <span className="material-symbols-outlined text-base">delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 0: DASHBOARD OVERVIEW */}
          {activeNav === 'dashboard' && (
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="font-extrabold text-4xl text-[#e0e3e5] tracking-tight">User Dashboard & Cloud Intelligence</h1>
                  <p className="text-sm text-[#c1c6d7] mt-1">
                    Unified overview of your distributed architecture. Optimization required for S3 buckets.
                  </p>
                </div>

                <div className="flex items-center space-x-2 bg-[#1d2022] border border-white/10 px-4 py-2 rounded-full">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-semibold text-[#e0e3e5]">Systems Nominal</span>
                </div>
              </div>

              <div className="glass-panel rounded-3xl p-8 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden border border-white/10">
                <div className="relative w-56 h-56 flex-shrink-0 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" stroke="#1d2022" strokeWidth="12" fill="transparent" />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      stroke="#adc7ff"
                      strokeWidth="12"
                      strokeDasharray="251.2"
                      strokeDashoffset="100"
                      fill="transparent"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      stroke="#dcb8ff"
                      strokeWidth="12"
                      strokeDasharray="251.2"
                      strokeDashoffset="170"
                      fill="transparent"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      stroke="#4a8eff"
                      strokeWidth="12"
                      strokeDasharray="251.2"
                      strokeDashoffset="225"
                      fill="transparent"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <div className="text-3xl font-extrabold text-white tracking-tight">
                      {storageQuota
                        ? (Number(storageQuota.totalQuotaBytes) / 1073741824).toFixed(1)
                        : '0.0'}
                      <span className="text-sm font-semibold text-[#c1c6d7]">GB</span>
                    </div>
                    <div className="text-[11px] text-[#8b90a0] font-medium mt-0.5">Total Mesh Quota</div>
                  </div>
                </div>

                <div className="flex-1 space-y-6">
                  <div>
                    <h3 className="font-bold text-2xl text-[#e0e3e5]">Multi-Cloud Storage Mesh</h3>
                    <p className="text-sm text-[#c1c6d7] mt-2 leading-relaxed">
                      {storageQuota && Number(storageQuota.totalQuotaBytes) > 0
                        ? `Unified 5-cloud mesh active across connected providers. Free available quota: ${(Number(storageQuota.freeQuotaBytes) / 1073741824).toFixed(1)} GB.`
                        : 'Connect your cloud accounts below to aggregate free storage into a unified 52 GB pool.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <div className="bg-[#1d2022] p-2.5 rounded-2xl border border-white/5 text-center">
                      <div className="text-[10px] text-[#8b90a0] font-medium truncate">MEGA</div>
                      <div className="text-xs font-extrabold text-rose-400 mt-1">
                        {storageQuota?.providers?.mega?.isConnected
                          ? `${(Number(storageQuota.providers.mega.total) / 1073741824).toFixed(0)} GB`
                          : '0 GB'}
                      </div>
                    </div>
                    <div className="bg-[#1d2022] p-2.5 rounded-2xl border border-white/5 text-center">
                      <div className="text-[10px] text-[#8b90a0] font-medium truncate">Drive</div>
                      <div className="text-xs font-extrabold text-emerald-400 mt-1">
                        {storageQuota?.providers?.gdrive?.isConnected
                          ? `${(Number(storageQuota.providers.gdrive.total) / 1073741824).toFixed(0)} GB`
                          : '0 GB'}
                      </div>
                    </div>
                    <div className="bg-[#1d2022] p-2.5 rounded-2xl border border-white/5 text-center">
                      <div className="text-[10px] text-[#8b90a0] font-medium truncate">OneDrive</div>
                      <div className="text-xs font-extrabold text-cyan-400 mt-1">
                        {storageQuota?.providers?.onedrive?.isConnected
                          ? `${(Number(storageQuota.providers.onedrive.total) / 1073741824).toFixed(0)} GB`
                          : '0 GB'}
                      </div>
                    </div>
                    <div className="bg-[#1d2022] p-2.5 rounded-2xl border border-white/5 text-center">
                      <div className="text-[10px] text-[#8b90a0] font-medium truncate">AWS S3</div>
                      <div className="text-xs font-extrabold text-amber-400 mt-1">
                        {storageQuota?.providers?.s3?.isConnected
                          ? `${(Number(storageQuota.providers.s3.total) / 1073741824).toFixed(0)} GB`
                          : '0 GB'}
                      </div>
                    </div>
                    <div className="bg-[#1d2022] p-2.5 rounded-2xl border border-white/5 text-center">
                      <div className="text-[10px] text-[#8b90a0] font-medium truncate">Dropbox</div>
                      <div className="text-xs font-extrabold text-blue-400 mt-1">
                        {storageQuota?.providers?.dropbox?.isConnected
                          ? `${(Number(storageQuota.providers.dropbox.total) / 1073741824).toFixed(0)} GB`
                          : '0 GB'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="glass-panel rounded-3xl p-8 border border-white/10 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-2xl text-[#e0e3e5]">Recent Activity</h3>
                    {activities.length > 0 && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/10 text-[#c1c6d7]">
                        {showAllActivities
                          ? `Showing all ${activities.length} ${activities.length === 1 ? 'file' : 'files'}`
                          : `Showing latest ${Math.min(5, activities.length)} of ${activities.length}`}
                      </span>
                    )}
                  </div>

                  {activities.length > 5 ? (
                    <button
                      onClick={() => setShowAllActivities((prev) => !prev)}
                      className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-primary hover:text-white border border-white/10 transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <span>{showAllActivities ? 'Close & Show Less' : `See All Activity (${activities.length})`}</span>
                      <span className="material-symbols-outlined text-sm">
                        {showAllActivities ? 'expand_less' : 'expand_more'}
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setActiveNav('files')}
                      className="text-xs font-semibold text-[#c1c6d7] hover:text-primary transition-colors"
                    >
                      File Explorer
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-[#e0e3e5]">
                    <thead className="text-xs font-bold text-[#8b90a0] uppercase border-b border-white/10">
                      <tr>
                        <th className="pb-4">File Name</th>
                        <th className="pb-4">Cloud Source</th>
                        <th className="pb-4">Size</th>
                        <th className="pb-4">Timestamp</th>
                        <th className="pb-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {activities.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-xs text-[#8b90a0]">
                            No activity recorded yet. Upload files above to view real-time multi-cloud operations.
                          </td>
                        </tr>
                      ) : (
                        (showAllActivities ? activities : activities.slice(0, 5)).map((act) => (
                          <tr key={act.id} className="hover:bg-white/5 transition-colors">
                            <td className="py-4 font-semibold text-white">
                              <div className="flex items-center space-x-3">
                                <span className="material-symbols-outlined text-primary text-xl">{act.icon}</span>
                                <div className="space-y-1">
                                  <div className="font-semibold text-sm">{act.fileName}</div>
                                  {act.isMirrored && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                      <span className="material-symbols-outlined text-[11px]">shield</span>
                                      <span>Dual Mirrored ({act.mirrorProvider || 'Replica'})</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-4">
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-bold ${
                                  act.cloudSource === 'Google Drive'
                                    ? 'bg-primary/10 text-primary border border-primary/20'
                                    : act.cloudSource === 'Dropbox'
                                    ? 'bg-secondary/10 text-secondary border border-secondary/20'
                                    : act.cloudSource === 'MEGA'
                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                    : act.cloudSource === 'AWS S3'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                }`}
                              >
                                {act.cloudSource}
                              </span>
                            </td>
                            <td className="py-4 text-[#c1c6d7] text-xs">{act.size}</td>
                            <td className="py-4 text-xs text-[#8b90a0]">{act.timestamp}</td>
                            <td className="py-4 text-right">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                <button
                                  onClick={() => handlePreviewFile(act)}
                                  title="Preview File"
                                  className="px-2.5 py-1 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                                >
                                  <span className="material-symbols-outlined text-sm">visibility</span>
                                  <span className="hidden sm:inline">Preview</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setShareModalFile(act);
                                    setGeneratedShareUrl(null);
                                    setShareCopied(false);
                                  }}
                                  title="Generate Secure Share Link"
                                  className="px-2.5 py-1 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                                >
                                  <span className="material-symbols-outlined text-sm">share</span>
                                  <span className="hidden sm:inline">Share</span>
                                </button>
                                <button
                                  onClick={() => setMigrateModalFile(act)}
                                  title="Migrate / Move to Another Cloud"
                                  className="px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                                >
                                  <span className="material-symbols-outlined text-sm">drive_file_move</span>
                                  <span className="hidden sm:inline">Move</span>
                                </button>
                                <button
                                  onClick={() => handleFileDownload(act.id, act.fileName)}
                                  disabled={downloadingFileId === act.id}
                                  title="Download & Decrypt File"
                                  className="px-2.5 py-1 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold transition-all flex items-center gap-1 shadow-sm disabled:opacity-60"
                                >
                                  {downloadingFileId === act.id ? (
                                    <>
                                      <span className="material-symbols-outlined text-sm animate-spin text-cyan-300">sync</span>
                                      <span className="hidden sm:inline">Decrypting...</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="material-symbols-outlined text-sm">cloud_download</span>
                                      <span className="hidden sm:inline">Download</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {activities.length > 5 && showAllActivities && (
                  <div className="pt-4 flex justify-center border-t border-white/5">
                    <button
                      onClick={() => setShowAllActivities(false)}
                      className="px-4 py-2 rounded-xl bg-[#1d2022] hover:bg-[#282b2e] text-xs font-semibold text-[#c1c6d7] hover:text-white border border-white/10 transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <span className="material-symbols-outlined text-sm">expand_less</span>
                      <span>Close & Show Less</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* GOOGLE DRIVE AUTHORIZATION MODAL */}
      {showGDriveModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-fadeIn">
          <div className="bg-[#161c1e] border border-white/20 rounded-3xl max-w-md w-full p-8 shadow-2xl space-y-6 relative overflow-hidden">
            {/* Top Graphic Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <span className="material-symbols-outlined text-3xl">add_to_drive</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-white">Google Cloud Authorization</h3>
                  <p className="text-xs text-[#8b90a0]">CloudFusion Service Integration</p>
                </div>
              </div>
              <button
                onClick={() => setShowGDriveModal(false)}
                className="text-[#8b90a0] hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-[#1d2022] p-4 rounded-2xl border border-white/10 space-y-2">
                <div className="text-xs text-[#8b90a0]">Connecting Google Account:</div>
                <div className="font-bold text-sm text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-emerald-400">account_circle</span>
                  <span>{user?.email || 'user@gmail.com'}</span>
                </div>
              </div>

              <div className="space-y-2 text-xs text-[#c1c6d7] leading-relaxed">
                <div className="flex items-center gap-2 font-bold text-emerald-400 text-sm">
                  <span className="material-symbols-outlined text-lg">database</span>
                  <span>+15 GB Free Storage Capacity</span>
                </div>
                <p>
                  Authorizing Google Cloud Services allows CloudFusion to transparently aggregate your 15 GB free workspace storage into your unified multi-cloud mesh pool.
                </p>
              </div>

              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-300 flex items-center gap-2 font-medium">
                <span className="material-symbols-outlined text-base shrink-0">verified</span>
                <span>Zero-knowledge AES-256 encryption active. Your credentials remain private.</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowGDriveModal(false)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-[#8b90a0] hover:text-[#e0e3e5] hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>

              <button
                disabled={isConnectingDrive}
                onClick={async () => {
                  setIsConnectingDrive(true);
                  await toggleConnectorLink('gdrive');
                  setIsConnectingDrive(false);
                  setShowGDriveModal(false);
                }}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
              >
                {isConnectingDrive ? (
                  <>
                    <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    <span>Linking Google Cloud...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">cloud_sync</span>
                    <span>Authorize & Link 15GB Storage</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MEGA CLOUD CONNECTION MODAL */}
      {showMegaModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-fadeIn">
          <div className="bg-[#161c1e] border border-white/20 rounded-3xl max-w-md w-full p-8 shadow-2xl space-y-6 relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <span className="material-symbols-outlined text-3xl">lock</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-white">MEGA E2EE Cloud</h3>
                  <p className="text-xs text-[#8b90a0]">Zero-Knowledge Encrypted Mesh Node</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowMegaModal(false);
                  setMegaError(null);
                }}
                className="text-[#8b90a0] hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <form onSubmit={handleConnectMega} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#c1c6d7] flex items-center justify-between">
                  <span>Registered Account Email</span>
                  <span className="text-[10px] text-rose-400 font-semibold uppercase tracking-wider">Locked to Account</span>
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">lock</span>
                  <input
                    type="email"
                    value={user?.email || ''}
                    readOnly
                    className="w-full bg-[#101415] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white font-medium opacity-80 cursor-not-allowed focus:outline-none"
                  />
                </div>
                <p className="text-[11px] text-[#8b90a0] leading-relaxed">
                  For strict isolation, only cloud accounts matching your CloudFusion email (<strong className="text-white">{user?.email}</strong>) can be linked.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#c1c6d7]">MEGA Account Password</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">key</span>
                  <input
                    type="password"
                    placeholder="Enter password for this MEGA account"
                    value={megaPassword}
                    onChange={(e) => setMegaPassword(e.target.value)}
                    required
                    className="w-full bg-[#101415] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-rose-500 transition-colors"
                  />
                </div>
              </div>

              {megaError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <span className="material-symbols-outlined text-base shrink-0">error</span>
                  <span>{megaError}</span>
                </div>
              )}

              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[11px] text-rose-300 flex items-center gap-2 font-medium">
                <span className="material-symbols-outlined text-base shrink-0">verified</span>
                <span>Adds +20 GB zero-knowledge encrypted storage to your unified cloud mesh.</span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowMegaModal(false);
                    setMegaError(null);
                  }}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-[#8b90a0] hover:text-[#e0e3e5] hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSavingMega}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20 transition-all flex items-center gap-2"
                >
                  {isSavingMega ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Authenticating MEGA...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-base">cloud_sync</span>
                      <span>Link MEGA Node (+20 GB)</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AWS S3 CONNECTION MODAL */}
      {showS3Modal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[100] animate-fadeIn">
          <div className="bg-[#161c1e] border border-white/20 rounded-3xl max-w-md w-full p-8 shadow-2xl space-y-6 relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <span className="material-symbols-outlined text-3xl">database</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-white">AWS S3 Object Bucket</h3>
                  <p className="text-xs text-[#8b90a0]">Scalable Cloud Storage Integration</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowS3Modal(false);
                  setS3Error(null);
                }}
                className="text-[#8b90a0] hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <form onSubmit={handleConnectS3} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#c1c6d7]">AWS Access Key ID</label>
                <input
                  type="text"
                  placeholder="AKIA..."
                  value={s3AccessKey}
                  onChange={(e) => setS3AccessKey(e.target.value)}
                  required
                  className="w-full bg-[#101415] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#c1c6d7]">AWS Secret Access Key</label>
                <input
                  type="password"
                  placeholder="Enter your AWS secret key"
                  value={s3SecretKey}
                  onChange={(e) => setS3SecretKey(e.target.value)}
                  required
                  className="w-full bg-[#101415] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#c1c6d7]">Region</label>
                  <input
                    type="text"
                    placeholder="eu-north-1"
                    value={s3Region}
                    onChange={(e) => setS3Region(e.target.value)}
                    required
                    className="w-full bg-[#101415] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#c1c6d7]">Bucket Name</label>
                  <input
                    type="text"
                    placeholder="my-storage-bucket"
                    value={s3Bucket}
                    onChange={(e) => setS3Bucket(e.target.value)}
                    required
                    className="w-full bg-[#101415] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
              </div>

              {s3Error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <span className="material-symbols-outlined text-base shrink-0">error</span>
                  <span>{s3Error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowS3Modal(false);
                    setS3Error(null);
                  }}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-[#8b90a0] hover:text-[#e0e3e5] hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSavingS3}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2"
                >
                  {isSavingS3 ? (
                    <>
                      <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      <span>Validating S3...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-base">cloud_sync</span>
                      <span>Link AWS S3 Bucket</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IN-BROWSER FILE PREVIEW MODAL */}
      {previewModalFile && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-[110] animate-fadeIn">
          <div className="bg-[#161c1e] border border-white/20 rounded-3xl max-w-4xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col relative overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <span className="material-symbols-outlined text-2xl">{previewModalFile.icon}</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white truncate max-w-md" title={previewModalFile.fileName}>
                    {previewModalFile.fileName}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-[#8b90a0] mt-0.5">
                    <span>{previewModalFile.size}</span>
                    <span>•</span>
                    <span className="text-purple-300 font-semibold">{previewModalFile.cloudSource}</span>
                    {previewModalFile.isMirrored && (
                      <>
                        <span>•</span>
                        <span className="text-cyan-300 font-semibold">Mirrored on {previewModalFile.mirrorProvider || 'Secondary Cloud'}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleFileDownload(previewModalFile.id, previewModalFile.fileName)}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-md"
                >
                  <span className="material-symbols-outlined text-base">cloud_download</span>
                  <span>Save to Disk</span>
                </button>
                <button
                  onClick={() => {
                    setPreviewModalFile(null);
                    setPreviewBlobUrl(null);
                    setPreviewTextContent(null);
                  }}
                  className="text-[#8b90a0] hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>
            </div>

            {/* Modal Body / Viewer */}
            <div className="flex-1 overflow-auto bg-[#101415] rounded-2xl border border-white/10 p-4 min-h-[300px] flex items-center justify-center">
              {previewLoading ? (
                <div className="text-center space-y-3">
                  <span className="material-symbols-outlined text-4xl text-purple-400 animate-spin">sync</span>
                  <p className="text-xs font-semibold text-[#c1c6d7]">Streaming & Decrypting AES-256 Payload...</p>
                </div>
              ) : previewTextContent !== null ? (
                <pre className="w-full text-xs text-[#e0e3e5] font-mono whitespace-pre-wrap break-all p-2 leading-relaxed select-text">
                  {previewTextContent}
                </pre>
              ) : previewBlobUrl && (previewModalFile.mimeType?.includes('image') || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(previewModalFile.fileName)) ? (
                <img
                  src={previewBlobUrl}
                  alt={previewModalFile.fileName}
                  className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-xl"
                />
              ) : previewBlobUrl && (previewModalFile.mimeType?.includes('pdf') || /\.pdf$/i.test(previewModalFile.fileName)) ? (
                <iframe
                  src={previewBlobUrl}
                  title={previewModalFile.fileName}
                  className="w-full h-[65vh] rounded-xl border border-white/5"
                />
              ) : previewBlobUrl && (previewModalFile.mimeType?.includes('video') || /\.(mp4|webm)$/i.test(previewModalFile.fileName)) ? (
                <video controls src={previewBlobUrl} className="max-h-[60vh] max-w-full rounded-xl shadow-xl" />
              ) : previewBlobUrl && (previewModalFile.mimeType?.includes('audio') || /\.(mp3|wav|ogg)$/i.test(previewModalFile.fileName)) ? (
                <audio controls src={previewBlobUrl} className="w-full max-w-md" />
              ) : (
                <div className="text-center space-y-3 p-6">
                  <span className="material-symbols-outlined text-5xl text-purple-400 opacity-60">visibility_off</span>
                  <h4 className="font-bold text-white text-sm">Binary Stream Decrypted Successfully</h4>
                  <p className="text-xs text-[#8b90a0] max-w-md mx-auto">
                    This file format does not support inline in-browser visual rendering, but its cryptographic payload has been verified and is ready for download.
                  </p>
                  <button
                    onClick={() => handleFileDownload(previewModalFile.id, previewModalFile.fileName)}
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all inline-flex items-center gap-2 mt-2"
                  >
                    <span className="material-symbols-outlined text-base">download</span>
                    <span>Download Decrypted Asset</span>
                  </button>
                </div>
              )}
            </div>

            {/* Cryptographic Verification Footer */}
            <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 text-[11px] text-[#8b90a0]">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <span className="material-symbols-outlined text-sm">verified_user</span>
                <span>Zero-Knowledge Decrypted: SHA-256 Verified</span>
              </div>
              {previewModalFile.checksumSHA256 && (
                <div className="font-mono text-[10px] text-slate-400 truncate max-w-md" title={previewModalFile.checksumSHA256}>
                  Hash: {previewModalFile.checksumSHA256}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CLOUD MIGRATION / REBALANCE MODAL */}
      {migrateModalFile && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-[110] animate-fadeIn">
          <div className="bg-[#161c1e] border border-white/20 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <span className="material-symbols-outlined text-2xl">drive_file_move</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white">Migrate File Node</h3>
                  <p className="text-xs text-[#8b90a0]">Seamless Cloud-to-Cloud Transfer</p>
                </div>
              </div>
              <button
                onClick={() => setMigrateModalFile(null)}
                className="text-[#8b90a0] hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-[#101415] p-3.5 rounded-2xl border border-white/10 space-y-1">
                <div className="text-[11px] text-[#8b90a0]">Selected File:</div>
                <div className="font-bold text-xs text-white truncate">{migrateModalFile.fileName}</div>
                <div className="text-[11px] text-amber-400">Current Node: {migrateModalFile.cloudSource}</div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-[#c1c6d7]">Select Target Cloud Destination:</label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { id: 'MEGA', name: 'MEGA (+25 GB Free)', isLinked: !!storageQuota?.providers?.mega?.isConnected },
                    { id: 'GOOGLE_DRIVE', name: 'Google Drive (+15 GB Free)', isLinked: !!storageQuota?.providers?.gdrive?.isConnected },
                    { id: 'ONEDRIVE', name: 'Microsoft OneDrive (+5 GB Free)', isLinked: !!storageQuota?.providers?.onedrive?.isConnected },
                    { id: 'AWS_S3', name: 'AWS S3 (Cloud Storage)', isLinked: !!storageQuota?.providers?.s3?.isConnected },
                    { id: 'DROPBOX', name: 'Dropbox (+2 GB Free)', isLinked: !!storageQuota?.providers?.dropbox?.isConnected },
                  ].map((prov) => {
                    const isCurrent = migrateModalFile.rawCloudProvider === prov.id || migrateModalFile.cloudSource.toUpperCase().includes(prov.id);
                    return (
                      <button
                        key={prov.id}
                        disabled={isCurrent}
                        onClick={() => setMigrateTargetProvider(prov.id)}
                        className={`p-3 rounded-xl border text-left text-xs font-semibold transition-all flex items-center justify-between ${
                          isCurrent
                            ? 'opacity-40 border-white/5 bg-transparent cursor-not-allowed text-[#8b90a0]'
                            : migrateTargetProvider === prov.id
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300 ring-1 ring-amber-400/40'
                            : 'bg-[#101415] border-white/5 text-[#c1c6d7] hover:border-white/20'
                        }`}
                      >
                        <span>{prov.name}</span>
                        {isCurrent ? (
                          <span className="text-[10px] font-bold text-[#8b90a0]">CURRENT</span>
                        ) : prov.isLinked ? (
                          <span className="text-[10px] font-bold text-emerald-400">CONNECTED</span>
                        ) : (
                          <span className="text-[10px] font-bold text-[#8b90a0]">AVAILABLE</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-300 leading-relaxed">
                CloudFusion streams the encrypted buffer directly to the target cloud and updates metadata records without exposing raw plaintext.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setMigrateModalFile(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-[#8b90a0] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={isMigrating}
                onClick={() => handleMigrateFile(migrateModalFile.id, migrateTargetProvider)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2"
              >
                {isMigrating ? (
                  <>
                    <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    <span>Migrating Asset...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">drive_file_move</span>
                    <span>Start Migration</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TIME-LIMITED SECURE SHARE LINK MODAL */}
      {shareModalFile && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-[110] animate-fadeIn">
          <div className="bg-[#161c1e] border border-white/20 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <span className="material-symbols-outlined text-2xl">share</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white">Time-Limited Secure Share</h3>
                  <p className="text-xs text-[#8b90a0]">Cryptographically Signed Download Link</p>
                </div>
              </div>
              <button
                onClick={() => setShareModalFile(null)}
                className="text-[#8b90a0] hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-[#101415] p-3.5 rounded-2xl border border-white/10 space-y-1">
                <div className="text-[11px] text-[#8b90a0]">Asset to Share:</div>
                <div className="font-bold text-xs text-white truncate">{shareModalFile.fileName}</div>
              </div>

              {!generatedShareUrl ? (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-[#c1c6d7]">Set Link Expiry Window:</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { hours: 1, label: '1 Hour' },
                      { hours: 24, label: '24 Hours (1 Day)' },
                      { hours: 72, label: '3 Days' },
                      { hours: 168, label: '7 Days' },
                    ].map((opt) => (
                      <button
                        key={opt.hours}
                        onClick={() => setShareExpiryHours(opt.hours)}
                        className={`p-2.5 rounded-xl border text-center text-xs font-bold transition-all ${
                          shareExpiryHours === opt.hours
                            ? 'bg-blue-600 border-blue-400 text-white shadow-md shadow-blue-500/20'
                            : 'bg-[#101415] border-white/5 text-[#8b90a0] hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <button
                    disabled={isGeneratingShare}
                    onClick={() => handleGenerateShareLink(shareModalFile.id, shareExpiryHours)}
                    className="w-full mt-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    {isGeneratingShare ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Signing Security Token...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-base">vpn_key</span>
                        <span>Generate Signed Share Link</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2 font-medium">
                    <span className="material-symbols-outlined text-base">check_circle</span>
                    <span>Secure Link generated! Valid for {shareExpiryHours} hours.</span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={generatedShareUrl}
                      className="w-full bg-[#101415] border border-white/10 rounded-xl pl-3 pr-24 py-2.5 text-xs text-white font-mono select-all focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generatedShareUrl);
                        setShareCopied(true);
                        setTimeout(() => setShareCopied(false), 3000);
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-all flex items-center gap-1 shadow-md"
                    >
                      <span className="material-symbols-outlined text-sm">{shareCopied ? 'done' : 'content_copy'}</span>
                      <span>{shareCopied ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>

                  <p className="text-[11px] text-[#8b90a0] leading-relaxed">
                    Recipients can open this link to decrypt and download the file directly in their browser without an account until it expires.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                onClick={() => setShareModalFile(null)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#1d2022] hover:bg-[#282b2e] text-white border border-white/10 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




