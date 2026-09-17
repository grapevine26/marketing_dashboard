"use client";

import { useState } from "react";
import { BarChart3, Check, Copy, Table2 } from "lucide-react";
import { catalogFor } from "@/lib/ppt/catalog";
import { PPT_TEMPLATE_KIND_LABELS, type PptTemplateKind } from "@/lib/db/types";

/**
 * 고른 종류에서 쓸 수 있는 **표·차트 이름**을 보여준다.
 *
 * 자유 입력칸(`{{항목명}}`)은 아무 이름이나 적으면 그대로 입력칸이 되지만, 표와 차트는
 * 앱이 데이터를 그려 넣어야 해서 **이름이 정해져 있다**. 그 이름을 어디서도 알 수 없어서
 * 담당자가 쓰고 싶어도 쓸 수 없었다. 여기서 알려 주고 그대로 복사하게 한다.
 *
 * 목록은 `lib/ppt/catalog.ts` 한 곳에서 온다 — 화면에 따로 적어 두면 표가 늘어날 때
 * 한쪽만 바뀐다.
 */
export default function CatalogHint({ kind }: { kind: PptTemplateKind }) {
  const [copied, setCopied] = useState<string | null>(null);
  const entries = catalogFor(kind);
  if (entries.length === 0) return null;

  const handleCopy = async (marker: string) => {
    try {
      await navigator.clipboard.writeText(marker);
      setCopied(marker);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // 클립보드를 막아 둔 브라우저가 있다. 복사가 안 되면 **직접 고를 수 있게** 띄운다.
      window.prompt("아래 이름을 복사해 슬라이드에 붙여넣으세요", marker);
    }
  };

  return (
    // 목록 카드에도 같은 이름이 칩으로 떠서, 이 블록을 가리킬 수 있는 이름표가 필요하다.
    <section aria-label="쓸 수 있는 표와 차트" className="p-4 rounded-2xl bg-bg border border-border space-y-3">
      <div className="space-y-1">
        <h3 className="text-xs font-bold text-text">
          {PPT_TEMPLATE_KIND_LABELS[kind]} 템플릿에서 쓸 수 있는 표 · 차트
        </h3>
        <p className="text-[11px] text-text-sub leading-relaxed">
          아래 이름은 <strong>입력칸이 생기지 않습니다.</strong> 내보낼 때 앱이 데이터를 직접 그려 넣습니다.
          그 밖의 <code className="px-1 rounded bg-surface border border-border">{"{{항목명}}"}</code>은
          무엇이든 적으시면 그대로 입력칸이 됩니다.
        </p>
      </div>

      <ul className="space-y-1.5">
        {entries.map((e) => (
          <li key={e.marker} className="flex flex-wrap items-start gap-x-2.5 gap-y-1">
            {e.shape === "table" ? (
              <Table2 className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <BarChart3 className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
            )}
            <code className="text-[11px] font-mono font-bold text-text shrink-0">{e.marker}</code>
            <button
              type="button"
              onClick={() => handleCopy(e.marker)}
              aria-label={`${e.marker} 복사`}
              className="px-1.5 py-0.5 rounded-lg bg-surface2 hover:bg-surface3 border border-border text-[10px] font-semibold text-text-2 inline-flex items-center gap-1 shrink-0 transition"
            >
              {copied === e.marker ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copied === e.marker ? "복사됨" : "복사"}
            </button>
            <span className="text-[11px] text-text-2 basis-full sm:basis-auto">
              {e.columns}
              {e.note && <span className="block text-[10px] text-warn-soft mt-0.5">{e.note}</span>}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-text-muted leading-relaxed">
        슬라이드에 <strong>빈 텍스트 상자</strong>를 놓고 위 이름을 붙여넣으세요. 그 상자의
        <strong> 위치와 크기가 그대로</strong> 표·차트의 위치와 크기가 됩니다. 진짜 표의 칸 안에
        적으면 동작하지 않습니다.
      </p>
    </section>
  );
}
