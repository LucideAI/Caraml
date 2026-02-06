import { useStore } from '../store';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

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

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {notifications.map((n) => {
        const Icon = icons[n.type];
        return (
          <div
            key={n.id}
            className={`notification-enter flex items-center gap-3 px-4 py-3 rounded-lg border ${colors[n.type]} backdrop-blur-sm shadow-xl`}
          >
            <Icon size={16} className="shrink-0" />
            <span className="text-sm font-medium flex-1">{n.message}</span>
            <button
              onClick={() => removeNotification(n.id)}
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
