"use client";

import React, { useSyncExternalStore } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastOptions {
  description?: string;
  duration?: number;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  description?: string;
  duration: number;
}

type Listener = () => void;

let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function addToast(type: ToastType, message: string, options?: ToastOptions): string {
  const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const duration = options?.duration ?? 3500;

  const item: ToastItem = {
    id,
    type,
    message,
    description: options?.description,
    duration,
  };

  // 최대 5개 유지 (오래된 것부터 제거)
  toasts = [...toasts.slice(-4), item];
  emitChange();

  if (duration > 0 && typeof window !== "undefined") {
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }

  return id;
}

export function removeToast(id: string) {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length !== toasts.length) {
    toasts = next;
    emitChange();
  }
}

export function clearToasts() {
  if (toasts.length > 0) {
    toasts = [];
    emitChange();
  }
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return toasts;
}

function getServerSnapshot() {
  return [];
}

/** 명령형 토스트 발송 유틸 */
export const toast = {
  success: (message: string, options?: ToastOptions) => addToast("success", message, options),
  error: (message: string, options?: ToastOptions) => addToast("error", message, options),
  info: (message: string, options?: ToastOptions) => addToast("info", message, options),
  warning: (message: string, options?: ToastOptions) => addToast("warning", message, options),
  dismiss: (id: string) => removeToast(id),
  clear: () => clearToasts(),
};

/** React 컴포넌트 내에서 호출할 수 있는 훅 */
export function useToast() {
  return toast;
}

const TYPE_CONFIG = {
  success: {
    icon: CheckCircle2,
    iconColor: "text-emerald-400",
    bgBadge: "bg-emerald-500/15 border border-emerald-500/30",
    cardBorder: "border-emerald-500/30",
  },
  error: {
    icon: AlertCircle,
    iconColor: "text-rose-400",
    bgBadge: "bg-rose-500/15 border border-rose-500/30",
    cardBorder: "border-rose-500/30",
  },
  warning: {
    icon: AlertTriangle,
    iconColor: "text-amber-400",
    bgBadge: "bg-amber-500/15 border border-amber-500/30",
    cardBorder: "border-amber-500/30",
  },
  info: {
    icon: Info,
    iconColor: "text-blue-400",
    bgBadge: "bg-blue-500/15 border border-blue-500/30",
    cardBorder: "border-blue-500/30",
  },
};

function ToastItemView({
  toast: t,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const [mounted, setMounted] = React.useState(false);
  const [exiting, setExiting] = React.useState(false);

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClose = React.useCallback(() => {
    if (exiting) return;
    setExiting(true);
    setTimeout(() => {
      onDismiss(t.id);
    }, 160); // 160ms snappy exit budget
  }, [exiting, onDismiss, t.id]);

  React.useEffect(() => {
    if (t.duration <= 0) return;
    const timer = setTimeout(() => {
      handleClose();
    }, t.duration);
    return () => clearTimeout(timer);
  }, [t.duration, handleClose]);

  const config = TYPE_CONFIG[t.type] || TYPE_CONFIG.info;
  const Icon = config.icon;
  const isVisible = mounted && !exiting;

  return (
    <div
      role="status"
      style={{
        transition: "transform 240ms var(--ease-out), opacity 240ms var(--ease-out)",
        transform: isVisible
          ? "translateY(0) scale(1)"
          : "translateY(-8px) scale(0.96)",
        opacity: isVisible ? 1 : 0,
        willChange: "transform, opacity",
      }}
      className={`pointer-events-auto flex items-start gap-3 p-3.5 sm:p-4 rounded-2xl bg-surface/95 backdrop-blur-md border ${config.cardBorder} shadow-2xl shadow-black/25 text-xs`}
    >
      <div className={`p-1.5 rounded-xl shrink-0 ${config.bgBadge}`}>
        <Icon className={`w-4 h-4 ${config.iconColor}`} />
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        <p className="font-bold text-text text-xs sm:text-sm leading-snug break-words">
          {t.message}
        </p>
        {t.description && (
          <p className="text-text-sub text-[11px] sm:text-xs mt-0.5 leading-relaxed break-words">
            {t.description}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={handleClose}
        style={{
          transition: "transform 160ms var(--ease-out), background-color 160ms var(--ease-out)",
        }}
        className="p-1 rounded-lg text-text-muted hover:text-text hover:bg-surface2 active:scale-95 shrink-0 ml-1"
        aria-label="알림 닫기"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/**
 * 전역 토스트 렌더링 컨테이너
 * app/layout.tsx 또는 대시보드 레이아웃의 최상단에 마운트한다.
 */
export function ToastContainer() {
  const activeToasts = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (activeToasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 pointer-events-none max-w-[calc(100vw-2rem)] sm:max-w-sm w-full"
      aria-live="polite"
      aria-atomic="false"
      role="region"
      aria-label="알림 메시지"
    >
      {activeToasts.map((t) => (
        <ToastItemView key={t.id} toast={t} onDismiss={removeToast} />
      ))}
    </div>
  );
}

