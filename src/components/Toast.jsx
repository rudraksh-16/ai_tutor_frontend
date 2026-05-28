import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

export const Toast = ({ message, onDismiss }) => {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div className="toast-error">
      <AlertCircle size={16} />
      <span>{message}</span>
      <button onClick={onDismiss} className="toast-dismiss">×</button>
    </div>
  );
};
