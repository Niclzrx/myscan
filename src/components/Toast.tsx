import { Icon } from "./icons";

export type ToastTone = "success" | "warn" | "danger" | "info";

export interface ToastMessage {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastProps {
  toast: ToastMessage;
  onClose: () => void;
}

const ICON = {
  success: "check" as const,
  warn: "alert" as const,
  danger: "alert" as const,
  info: "info" as const,
};

export function Toast({ toast, onClose }: ToastProps) {
  return (
    <div className={`toast tone-${toast.tone}`} role="status">
      <Icon name={ICON[toast.tone]} size={17} />
      <span>{toast.message}</span>
      <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
