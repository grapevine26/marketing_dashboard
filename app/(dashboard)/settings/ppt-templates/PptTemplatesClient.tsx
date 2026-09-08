"use client";

import { useState } from "react";
import {
  PptTemplate,
  PptTemplateKind,
  PPT_TEMPLATE_KIND_LABELS,
  MAX_PPT_TEMPLATE_BYTES,
  buildTemplatePathname,
} from "@/lib/db/types";
import { uploadPptTemplateAction, confirmPptTemplateUploadAction, deletePptTemplateAction } from "./actions";
import { Upload, Trash2, Loader2, Lock } from "lucide-react";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export default function PptTemplatesClient({
  initialTemplates,
  clientUpload,
}: {
  initialTemplates: PptTemplate[];
  /**
   * Blob 저장소가 붙어 있으면 pptx 를 브라우저에서 저장소로 바로 보낸다.
   * Vercel 함수는 요청 본문을 4.5MB 로 자르는데, 이미지가 든 pptx 는 그보다 쉽게 커진다.
   */
  clientUpload: boolean;
}) {
  const [templates, setTemplates] = useState<PptTemplate[]>(initialTemplates);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PptTemplateKind>("event");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** 파일을 브라우저에서 저장소로 바로 보낸 뒤, 서버에는 등록만 요청한다. */
  const uploadDirect = async () => {
    if (!file) return { ok: false as const, error: "파일을 선택해주세요." };
    if (file.size > MAX_PPT_TEMPLATE_BYTES) {
      return { ok: false as const, error: "템플릿 파일은 15MB 이하만 업로드할 수 있습니다." };
    }

    const templateId = crypto.randomUUID();
    try {
      const { upload } = await import("@vercel/blob/client");
      await upload(buildTemplatePathname(templateId), file, {
        access: "private",
        handleUploadUrl: "/api/ppt-templates/upload",
        contentType: PPTX_MIME,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false as const, error: `업로드에 실패했습니다. (${msg})` };
    }

    return confirmPptTemplateUploadAction({ templateId, kind, name: name.trim() });
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name.trim()) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", name.trim());
    fd.append("kind", kind);

    const res = clientUpload ? await uploadDirect() : await uploadPptTemplateAction(fd);
    setUploading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setTemplates((prev) => [...prev, res.data.template]);
    setName("");
    setFile(null);
    setFileKey((k) => k + 1);
    setNotice(res.data.warning || `템플릿이 등록되었습니다. 감지된 치환 항목 ${res.data.template.placeholders.length}개.`);
  };

  const handleDelete = async (t: PptTemplate) => {
    if (!confirm(`"${t.name}" 템플릿을 삭제할까요? 이 템플릿을 쓰는 운영안은 PPT를 다운로드할 수 없게 됩니다.`)) return;
    setError(null);
    const res = await deletePptTemplateAction(t.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setTemplates((prev) => prev.filter((x) => x.id !== t.id));
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleUpload} className="p-6 rounded-3xl bg-surface border border-border space-y-4 shadow-xl">
        <h2 className="text-sm font-bold text-text flex items-center gap-2">
          <Upload className="w-4 h-4 text-warn" />
          <span>새 파워포인트 (.pptx) 템플릿 업로드</span>
        </h2>
        <p className="text-xs text-text-sub">
          슬라이드 텍스트에 <code className="text-warn bg-bg px-1.5 py-0.5 rounded font-mono">{"{{브랜드명}}"}</code> 같은 치환 표시를 넣어 만든 .pptx를 올리면 자동으로 감지됩니다. 디자인은 그대로 보존됩니다.
          결과보고서 템플릿에서는 <code className="text-warn bg-bg px-1.5 py-0.5 rounded font-mono">{"{{표:인플루언서}}"}</code>, <code className="text-warn bg-bg px-1.5 py-0.5 rounded font-mono">{"{{차트:성과}}"}</code>를 넣은 도형 자리에 표와 차트가 들어갑니다.
        </p>

        {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}
        {notice && <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-warn-soft text-xs font-semibold">{notice}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            required
            placeholder="템플릿 명칭 (예: 2026 프리미엄 행사 운영안)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-amber-500"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as PptTemplateKind)}
            className="px-3.5 py-2.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-amber-500 font-semibold"
          >
            {(Object.keys(PPT_TEMPLATE_KIND_LABELS) as PptTemplateKind[]).map((k) => (
              <option key={k} value={k}>{PPT_TEMPLATE_KIND_LABELS[k]} 템플릿</option>
            ))}
          </select>
          <input
            key={fileKey}
            type="file"
            required
            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="px-3.5 py-2 rounded-xl bg-bg border border-border text-text-sub text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:bg-surface2 file:text-text"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={uploading || !file || !name.trim()}
            className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span>템플릿 등록 및 분석</span>
          </button>
        </div>
      </form>

      <div className="space-y-3">
        <h2 className="text-sm font-bold text-text-2">등록된 템플릿 목록 ({templates.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="p-5 rounded-3xl bg-surface border border-border space-y-3 shadow-md flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-warn border border-amber-500/20 text-xs font-semibold">
                      {PPT_TEMPLATE_KIND_LABELS[t.kind]}
                    </span>
                    {t.builtin && (
                      <span className="px-2 py-0.5 rounded-full bg-surface2 text-text-sub border border-border text-[10px] font-semibold inline-flex items-center gap-1">
                        <Lock className="w-3 h-3" /> 기본 내장
                      </span>
                    )}
                  </div>
                  {!t.builtin && (
                    <button type="button" onClick={() => handleDelete(t)} className="p-1 rounded text-text-muted hover:text-red-400" title="삭제">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <h3 className="text-base font-bold text-text">{t.name}</h3>
                <div className="space-y-1">
                  <span className="text-[11px] text-text-muted block font-medium">감지된 치환 항목 ({t.placeholders.length}):</span>
                  <div className="flex flex-wrap gap-1.5">
                    {t.placeholders.length === 0 ? (
                      <span className="text-[11px] text-warn">치환 항목 없음</span>
                    ) : (
                      t.placeholders.map((ph) => (
                        <span key={ph} className="px-2 py-0.5 rounded bg-bg border border-border text-warn-soft/80 font-mono text-[10px]">{`{{${ph}}}`}</span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border text-[11px] text-text-muted font-mono">
                등록일: {new Date(t.uploaded_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
