import { useState } from 'react';
import { useStore } from '../store';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle, Undo2 } from 'lucide-react';

const MAX_VISIBLE = 3;

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const colors = {
  success: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400',
  error: 'border-rose-500/50 bg-rose-500/10 text-rose-400',
  info: 'border-brand-500/50 bg-brand-500/10 text-brand-400',
  warning: 'border-amber-500/50 bg-amber-500/10 text-amber-400',
};

export function Notifications() {
  const { notifications, removeNotification } = useStore();
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());

  const visible = notifications.slice(-MAX_VISIBLE);

  const handleDismiss = (id: string) => {
    setDismissingIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      removeNotification(id);
      setDismissingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 250);
  };

  if (visible.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {visible.map((n) => {
        const Icon = icons[n.type];
        const isDismissing = dismissingIds.has(n.id);
        return (
          <div
            key={n.id}
            className={`${isDismissing ? 'notification-exit' : 'notification-enter'} flex items-center gap-3 px-4 py-3 rounded-lg border ${colors[n.type]} backdrop-blur-sm shadow-xl`}
          >
            <Icon size={16} className="shrink-0" />
            <span className="text-sm font-medium flex-1">{n.message}</span>
            {n.action && (
              <button
                onClick={() => { n.action!.onClick(); handleDismiss(n.id); }}
                className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold hover:bg-white/10 transition-colors"
              >
                <Undo2 size={12} />
                {n.action.label}
              </button>
            )}
            <button
              onClick={() => handleDismiss(n.id)}
              className="shrink-0 hover:opacity-70 transition-opacity"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
