import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { api } from '../services/api';
import { X, Link, Copy, Check, Globe, Lock, ExternalLink, Loader2 } from 'lucide-react';

export function ShareModal() {
  const { showShareModal, setShowShareModal, currentProject, addNotification } = useStore();
  const [shareUrl, setShareUrl] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (currentProject) {
      setIsPublic(!!currentProject.is_public);
      if (currentProject.share_id) {
        setShareUrl(`${window.location.origin}/shared/${currentProject.share_id}`);
      }
    }
  }, [currentProject]);

  if (!showShareModal || !currentProject) return null;

  const handleShare = async () => {
    setIsLoading(true);
    try {
      const result = await api.shareProject(currentProject.id);
      const url = `${window.location.origin}${result.url}`;
      setShareUrl(url);
      setIsPublic(true);
      addNotification('success', 'Project shared! Link copied to clipboard');
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to share');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnshare = async () => {
    setIsLoading(true);
    try {
      await api.unshareProject(currentProject.id);
      setIsPublic(false);
      setShareUrl('');
      addNotification('info', 'Project is now private');
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to unshare');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
      <div className="modal-content w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center">
              <Link size={20} className="text-brand-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-t-primary">Share Project</h2>
              <p className="text-sm text-t-muted">"{currentProject.name}"</p>
            </div>
          </div>
          <button onClick={() => setShowShareModal(false)} className="btn-icon">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Status */}
          <div className="flex items-center gap-3 p-3 rounded-lg border" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--surface-2)' }}>
            {isPublic ? (
              <>
                <Globe size={18} className="text-emerald-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-emerald-400">Public</p>
                  <p className="text-xs text-t-faint">Anyone with the link can view this project</p>
                </div>
                <button onClick={handleUnshare} disabled={isLoading} className="btn-ghost btn-sm text-rose-400 hover:text-rose-300">
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                  Make Private
                </button>
              </>
            ) : (
              <>
                <Lock size={18} className="text-t-muted" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-t-secondary">Private</p>
                  <p className="text-xs text-t-faint">Only you can access this project</p>
                </div>
                <button onClick={handleShare} disabled={isLoading} className="btn-primary btn-sm">
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
                  Share
                </button>
              </>
            )}
          </div>

          {/* Share link */}
          {isPublic && shareUrl && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-t-secondary">Share Link</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="input flex-1 text-sm"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button onClick={handleCopyLink} className="btn-secondary shrink-0">
                  {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-brand-400 hover:text-brand-300"
              >
                Open in new tab <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
