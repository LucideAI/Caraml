import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, subtitle, icon, className = 'max-w-md', children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-content w-full mx-4 ${className}`} onClick={(e) => e.stopPropagation()}>
        {(title || icon) && (
          <div className="flex items-center justify-between p-6 pb-0">
            <div className="flex items-center gap-3">
              {icon}
              <div>
                {title && <h2 className="text-lg font-bold text-t-primary">{title}</h2>}
                {subtitle && <p className="text-sm text-t-muted mt-1">{subtitle}</p>}
              </div>
            </div>
            <button onClick={onClose} className="btn-icon">
              <X size={20} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
