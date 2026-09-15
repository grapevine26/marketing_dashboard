"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useMounted } from "./useMounted";
import { createPortal } from "react-dom";
import { Download, Monitor, Smartphone, X, Check } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * 지금 앱 창(독립 실행형)으로 보고 있는가.
 *
 * 브라우저가 알려주는 값이라 우리 상태가 아니다. 그래서 effect 로 읽어 상태에 옮기지 않고
 * useSyncExternalStore 로 그때그때 묻는다. 설치 직후 앱 창으로 전환되는 순간에도
 * 바로 반영된다(전에는 새로고침해야 사라졌다).
 */
function standaloneQuery(): MediaQueryList {
  return window.matchMedia("(display-mode: standalone)");
}

function subscribeStandalone(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = standaloneQuery();
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS 사파리는 display-mode 대신 navigator.standalone 으로 알려준다.
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return standaloneQuery().matches || iosStandalone;
}

const getStandaloneOnServer = () => false;

export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [installed, setInstalled] = useState(false);
  const mounted = useMounted();
  const isStandalone = useSyncExternalStore(subscribeStandalone, getStandalone, getStandaloneOnServer);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!showGuide) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowGuide(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showGuide]);

  if (isStandalone) {
    return null; // 이미 앱 창으로 실행 중인 경우 표시하지 않음
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-text-sub hover:text-text hover:bg-surface2 transition border border-transparent hover:border-border group"
        title="데스크톱 및 모바일 앱으로 설치"
      >
        <div className="flex items-center gap-2.5">
          <Download className="w-4 h-4 text-accent-link group-hover:scale-110 transition shrink-0" />
          <span>{installed ? "앱 설치 완료" : "데스크톱/모바일 앱 설치"}</span>
        </div>
        {installed ? (
          <Check className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-surface2 text-text-muted">
            PWA
          </span>
        )}
      </button>

      {/* 설치 안내 모달 — document.body에 포탈로 띄워 사이드바 transform 제한 없이 전체 화면에 띄운다 */}
      {showGuide && mounted && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
              onClick={() => setShowGuide(false)}
            >
              <div
                className="w-full max-w-md bg-surface border border-border rounded-3xl p-6 space-y-5 shadow-2xl font-sans animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Download className="w-5 h-5 text-accent-link" />
                    <h3 className="text-base font-bold text-text">RB Global 앱 설치 안내</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowGuide(false)}
                    className="p-1 rounded-lg text-text-muted hover:text-text hover:bg-surface2"
                    aria-label="닫기"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4 text-xs text-text-2 leading-relaxed">
                  <div className="p-3.5 rounded-2xl bg-bg border border-border space-y-2">
                    <div className="flex items-center gap-2 font-bold text-text">
                      <Monitor className="w-4 h-4 text-blue-400" />
                      <span>PC / 데스크톱 (Chrome, Edge, Whale)</span>
                    </div>
                    <p className="text-text-sub">
                      브라우저 주소창 우측 상단의 <strong>[설치 아이콘(⊕)]</strong>을 누르거나, 브라우저 메뉴(⋮)에서 <strong>[RB Global 설치]</strong>를 클릭하시면 브라우저 주소창 없는 독립형 데스크톱 앱 창으로 실행됩니다.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-bg border border-border space-y-2">
                    <div className="flex items-center gap-2 font-bold text-text">
                      <Smartphone className="w-4 h-4 text-accent2" />
                      <span>모바일 (iOS Safari, Android Chrome)</span>
                    </div>
                    <p className="text-text-sub">
                      <strong>아이폰(Safari)</strong>: 하단 공유 버튼(↑) 터치 후 <strong>[홈 화면에 추가]</strong>를 선택하세요.<br />
                      <strong>안드로이드(Chrome)</strong>: 메뉴(⋮) 터치 후 <strong>[앱 설치]</strong> 또는 <strong>[홈 화면에 추가]</strong>를 선택하세요.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="w-full py-2.5 rounded-xl bg-accent-brand text-accent-on font-bold text-xs hover:brightness-110 active:scale-95 transition"
                >
                  확인
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
