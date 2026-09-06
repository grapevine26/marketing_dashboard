"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

/**
 * 파일 다운로드 버튼. 단순 <a href>와 달리 서버가 4xx/5xx로 한국어 에러를 돌려주면
 * 파일 대신 그 메시지를 화면에 보여준다 (실패를 조용히 삼키지 않기 위함).
 */
export default function DownloadFileButton({
  href,
  label,
  className,
  fallbackFilename = "download",
  icon = true,
}: {
  href: string;
  label: string;
  className?: string;
  fallbackFilename?: string;
  icon?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(href, { cache: "no-store" });
      if (!res.ok) {
        const text = (await res.text()).trim();
        setError(text || `다운로드에 실패했습니다. (HTTP ${res.status})`);
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const star = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const plain = disposition.match(/filename="?([^";]+)"?/i);
      let filename = fallbackFilename;
      try {
        filename = star ? decodeURIComponent(star[1]) : plain ? plain[1] : fallbackFilename;
      } catch {
        filename = fallbackFilename;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error(err);
      setError("다운로드 중 네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={
          className ||
          "px-4 py-2 rounded-xl bg-surface2 hover:bg-surface border border-border text-text-sub hover:text-text text-xs font-semibold inline-flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
        }
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon ? <Download className="w-3.5 h-3.5" /> : null}
        <span>{label}</span>
      </button>
      {error && <span className="text-[11px] text-red-400 max-w-xs text-right">{error}</span>}
    </div>
  );
}
