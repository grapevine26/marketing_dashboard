"use client";

import React, { useSyncExternalStore } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastOptions {
  description?: string;
  /** 표시 시간(ms). 비우면 종류별 기본값(DEFAULT_DURATION). `0` 이면 사람이 닫을 때까지 남는다. */
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

/**
 * 기본 표시 시간. **실패는 다르게 간다.**
 *
 * 배너 없이 토스트만 쓰는 화면이 있다(사용자 관리·활동 기록·내 정보·캠페인 연동 카드).
 * 거기서 실패가 3.5초 만에 사라지면, 승인이 안 됐는데 관리자는 됐다고 믿고 넘어간다.
 * 길게 잡아도 "놓칠 수 있다"는 성질은 그대로라, 실패만큼은 사람이 닫아야 사라지게 한다(0 = 수동).
 * 경고는 그 중간이다.
 *
 * 지금은 어느 호출부도 duration 을 직접 넘기지 않으므로 이 표가 곧 실제 동작이다.
 */
const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3500,
  info: 3500,
  warning: 6000,
  error: 0,
};

/** 한 번에 쌓이는 최대 개수. */
const MAX_TOASTS = 5;

let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();

// 카드가 마운트되지 않았을 때를 대비한 안전망 타이머. 카드가 뜨면 카드가 넘겨받는다(claimToast).
const safetyTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearSafetyTimer(id: string) {
  const timer = safetyTimers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    safetyTimers.delete(id);
  }
}

/**
 * 카드가 마운트되면 안전망 타이머를 끈다.
 *
 * 이게 없으면 마우스를 올려 타이머를 멈춰도 스토어 쪽 타이머가 그대로 흘러서
 * 읽는 도중에 목록에서 빠져 버린다. 사라지는 시점은 한쪽만 정해야 한다.
 */
function claimToast(id: string) {
  clearSafetyTimer(id);
}

/**
 * 최대 개수를 넘으면 하나 뺀다.
 *
 * 그냥 가장 오래된 것부터 빼면 일괄 작업에서 **첫 실패가 뒤따르는 성공들에 밀려난다.**
 * 실패를 못 보는 것이 가장 나쁘므로, 실패가 아닌 것부터 뺀다.
 * 다만 방금 올라온 것(맨 끝)은 건드리지 않는다 — 실패만 다섯이 쌓였다고 새 알림이
 * 뜨자마자 사라지면 아무 말도 못 하게 된다. 그때는 가장 오래된 실패를 뺀다.
 */
function withinLimit(list: ToastItem[]): ToastItem[] {
  if (list.length <= MAX_TOASTS) return list;
  const next = [...list];
  while (next.length > MAX_TOASTS) {
    const older = next.slice(0, -1);
    let idx = older.findIndex((t) => t.type !== "error");
    if (idx === -1) idx = 0;
    const dropped = next.splice(idx, 1)[0];
    if (dropped) clearSafetyTimer(dropped.id);
  }
  return next;
}

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function addToast(type: ToastType, message: string, options?: ToastOptions): string {
  const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const duration = options?.duration ?? DEFAULT_DURATION[type];

  const item: ToastItem = {
    id,
    type,
    message,
    description: options?.description,
    duration,
  };

  toasts = withinLimit([...toasts, item]);
  emitChange();

  // 표시 시간(duration)은 그대로다. 실제로 사라지게 하는 쪽은 카드(ToastItemView)이고,
  // 이 타이머는 카드가 마운트되지 않은 경우(컨테이너 없음 등)를 대비한 안전망이라
  // 퇴장 애니메이션이 끝나는 시점까지 기다렸다가 목록에서 뺀다. removeToast 는 여러 번 불려도 안전하다.
  // 카드가 뜨면 claimToast 가 이 타이머를 끈다 — 그래야 호버로 멈춘 동안 여기서 지워 버리지 않는다.
  if (duration > 0 && typeof window !== "undefined") {
    safetyTimers.set(
      id,
      setTimeout(() => {
        safetyTimers.delete(id);
        removeToast(id);
      }, duration + EXIT_MS)
    );
  }

  return id;
}

export function removeToast(id: string) {
  clearSafetyTimer(id);
  const next = toasts.filter((t) => t.id !== id);
  if (next.length !== toasts.length) {
    toasts = next;
    emitChange();
  }
}

export function clearToasts() {
  for (const id of [...safetyTimers.keys()]) clearSafetyTimer(id);
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
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    // 카드가 떴으니 사라질 시점은 이제 카드가 정한다. 스토어의 안전망 타이머를 끈다.
    claimToast(t.id);
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, [t.id]);

  // exiting 을 ref 로도 들고 있는 이유: handleClose 가 state 에 의존하면 매번 새 함수가 되고,
  // 그러면 아래 타이머 effect 가 다시 돌면서 남은 시간이 처음부터 다시 흐른다.
  const exitingRef = React.useRef(false);
  const handleClose = React.useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setExiting(true);
    // 아래 transition 과 **같은 값**을 쓴다. 더 짧으면 애니메이션 도중에 사라진다.
    setTimeout(() => {
      onDismiss(t.id);
    }, EXIT_MS);
  }, [onDismiss, t.id]);

  /**
   * 남은 시간을 들고 있다가 마우스를 올리면 멈추고 떼면 이어서 간다.
   * 읽는 도중에 사라지는 것이 가장 나쁘다. 키보드로 닫기 버튼에 들어와도(focus) 같이 멈춘다.
   */
  const remainingRef = React.useRef(t.duration);
  const startedAtRef = React.useRef(0);

  React.useEffect(() => {
    // 0 이하면 사람이 닫을 때까지 남는다(실패 알림의 기본값).
    if (t.duration <= 0) return;

    if (paused) {
      if (startedAtRef.current > 0) {
        const left = remainingRef.current - (Date.now() - startedAtRef.current);
        // 떼자마자 사라지지 않도록 최소 1초는 남겨 둔다. 아직 읽는 중일 수 있다.
        remainingRef.current = Math.max(1000, left);
        startedAtRef.current = 0;
      }
      return;
    }

    startedAtRef.current = Date.now();
    const timer = setTimeout(handleClose, remainingRef.current);
    return () => clearTimeout(timer);
  }, [t.duration, paused, handleClose]);

  const config = TYPE_CONFIG[t.type] || TYPE_CONFIG.info;
  const Icon = config.icon;
  const isVisible = mounted && !exiting;

  return (
    <div
      // 낭독은 바깥 컨테이너(aria-live)가 맡는다. 여기에 role="status" 를 또 두면
      // 살아 있는 영역이 겹쳐서 같은 문구가 두 번 읽히는 화면낭독기가 있다.
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
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

  // 비어 있어도 컨테이너는 그대로 둔다.
  // aria-live 영역은 **내용이 바뀌기 전부터 DOM 에 있어야** 화면낭독기가 그 변화를 읽는다.
  // 예전처럼 `length === 0` 에서 null 을 돌려주면 영역이 통째로 새로 생기는 셈이라,
  // 그 안의 첫 토스트는 "바뀐 내용" 이 아니라 "원래 있던 내용" 으로 취급되어 아무도 못 듣는다.
  // 빈 채로 두어도 pointer-events-none 이라 클릭을 막지 않는다.
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

