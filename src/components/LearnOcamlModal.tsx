import { useState } from 'react';
import { useStore } from '../store';
import {
  X, Globe, Key, Loader2, Server, Unplug, AlertCircle, CheckCircle2,
  GraduationCap, Info,
} from 'lucide-react';

export function LearnOcamlModal() {
  const {
    learnOcaml, learnOcamlConnect, learnOcamlDisconnect,
    setShowLearnOcamlModal, addNotification,
  } = useStore();

  const [serverUrl, setServerUrl] = useState(
    learnOcaml.connection?.serverUrl || 'https://pf2.informatique.u-paris.fr'
  );
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  if (!learnOcaml.showConnectModal) return null;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!serverUrl.trim()) {
      setError('Please enter the server URL');
      return;
    }
    if (!token.trim()) {
      setError('Please enter your token');
      return;
    }

    // Validate token format (XXX-XXX-XXX-XXX)
    const tokenRegex = /^[A-Za-z0-9]{3}-[A-Za-z0-9]{3}-[A-Za-z0-9]{3}-[A-Za-z0-9]{3}$/;
    if (!tokenRegex.test(token.trim())) {
      setError('Token format should be XXX-XXX-XXX-XXX (e.g. H4B-SNZ-HDN-HE1)');
      return;
    }

    setIsConnecting(true);
    try {
      await learnOcamlConnect(serverUrl.trim(), token.trim().toUpperCase());
    } catch (err: any) {
      setError(err.message || 'Failed to connect');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    learnOcamlDisconnect();
    setToken('');
  };

  return (
    <div className="modal-overlay" onClick={() => setShowLearnOcamlModal(false)}>
      <div
        className="modal-content w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
              <GraduationCap size={20} className="text-orange-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-t-primary">Learn OCaml</h2>
              <p className="text-xs text-t-faint">Connect to your university instance</p>
            </div>
          </div>
          <button
            onClick={() => setShowLearnOcamlModal(false)}
            className="btn-icon"
          >
            <X size={18} />
          </button>
        </div>

        {/* Connected state */}
        {learnOcaml.connection ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span className="font-semibold text-emerald-400">Connected</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Globe size={14} className="text-t-faint shrink-0" />
                  <span className="text-t-muted">Server:</span>
                  <span className="text-t-secondary truncate">{learnOcaml.connection.serverUrl}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Key size={14} className="text-t-faint shrink-0" />
                  <span className="text-t-muted">Token:</span>
                  <span className="text-t-secondary font-mono">{learnOcaml.connection.token}</span>
                </div>
                {learnOcaml.connection.nickname && (
                  <div className="flex items-center gap-2">
                    <Server size={14} className="text-t-faint shrink-0" />
                    <span className="text-t-muted">Nickname:</span>
                    <span className="text-t-secondary">{learnOcaml.connection.nickname}</span>
                  </div>
                )}
                {learnOcaml.connection.serverVersion && (
                  <div className="flex items-center gap-2">
                    <Info size={14} className="text-t-faint shrink-0" />
                    <span className="text-t-muted">Version:</span>
                    <span className="text-t-secondary">{learnOcaml.connection.serverVersion}</span>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleDisconnect}
              className="btn w-full bg-rose-600/20 text-rose-400 hover:bg-rose-600/30 border border-rose-600/30"
            >
              <Unplug size={16} />
              Disconnect
            </button>
          </div>
        ) : (
          /* Connection form */
          <form onSubmit={handleConnect} className="space-y-4">
            {/* Info box */}
            <div className="p-3 border rounded-lg text-xs text-t-muted leading-relaxed" style={{ backgroundColor: 'var(--surface-1)', borderColor: 'var(--surface-2)' }}>
              <p>
                Connect your Learn OCaml account to synchronize exercises, submit answers,
                and view your grades directly from Caraml. You'll need your server URL
                and your personal token.
              </p>
            </div>

            {/* Server URL */}
            <div>
              <label className="block text-sm font-medium text-t-secondary mb-1.5">
                Server URL
              </label>
              <div className="relative">
                <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-t-faint" />
                <input
                  type="url"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className="input pl-10"
                  placeholder="https://pf2.informatique.u-paris.fr"
                />
              </div>
            </div>

            {/* Token */}
            <div>
              <label className="block text-sm font-medium text-t-secondary mb-1.5">
                Your Token
              </label>
              <div className="relative">
                <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-t-faint" />
                <input
                  type="text"
                  value={token}
                  onChange={(e) => {
                    // Auto-format: uppercase and allow dashes
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
                    setToken(val);
                  }}
                  className="input pl-10 font-mono tracking-wider"
                  placeholder="XXX-XXX-XXX-XXX"
                  maxLength={15}
                />
              </div>
              <p className="text-xs text-t-faint mt-1">
                Find your token on your Learn OCaml profile page
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-sm text-rose-400">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isConnecting}
              className="btn-primary w-full"
            >
              {isConnecting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Server size={16} />
                  Connect
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
