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

// 퇴장 애니메이션 길이. **한 곳에서만 정한다.**
// 예전에는 세 숫자가 따로 놀았다 — 카드의 transition 은 240ms, 카드가 스스로 사라지는
// setTimeout 은 160ms, 스토어(addToast)의 제거 타이머는 duration 정각이었다.
// 그래서 스토어가 duration 에 토스트를 목록에서 빼 버리면 카드는 퇴장을 시작하지도 못하고
// 그 자리에서 사라졌다. 이제 transition·unmount 지연이 이 값을 함께 쓰고,
// 스토어 타이머는 그 뒤(duration + EXIT_MS)로 미뤄 안전망 역할만 한다.
const EXIT_MS = 240;

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

  // 표시 시간(duration)은 그대로다. 실제로 사라지게 하는 쪽은 카드(ToastItemView)이고,
  // 이 타이머는 카드가 마운트되지 않은 경우(컨테이너 없음 등)를 대비한 안전망이라
  // 퇴장 애니메이션이 끝나는 시점까지 기다렸다가 목록에서 뺀다. removeToast 는 여러 번 불려도 안전하다.
  if (duration > 0 && typeof window !== "undefined") {
    setTimeout(() => {
      removeToast(id);
    }, duration + EXIT_MS);
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

// 서버 렌더에는 토스트가 없다. 다만 **매번 새 배열을 돌려주면 안 된다.**
// useSyncExternalStore 는 값이 같은지 참조로 비교해서, 호출마다 새 배열이면 끝없이 다시 그린다.
// React 가 경고를 띄우던 자리다. 상수 하나를 계속 돌려준다.
const EMPTY_TOASTS: ToastItem[] = [];

function getServerSnapshot() {
  return EMPTY_TOASTS;
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
    // 아래 transition 과 **같은 값**을 쓴다. 더 짧으면 애니메이션 도중에 사라진다.
    setTimeout(() => {
      onDismiss(t.id);
    }, EXIT_MS);
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
        transition: `transform ${EXIT_MS}ms var(--ease-out), opacity ${EXIT_MS}ms var(--ease-out)`,
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

