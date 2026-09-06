"use client";

import { useState } from "react";
import { PptTemplate } from "@/lib/db/types";
import { uploadPptTemplateAction, deletePptTemplateAction } from "./actions";
import { Upload, Trash2, Loader2, Lock } from "lucide-react";

export default function PptTemplatesClient({ initialTemplates }: { initialTemplates: PptTemplate[] }) {
  const [templates, setTemplates] = useState<PptTemplate[]>(initialTemplates);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"event" | "sns">("event");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

    const res = await uploadPptTemplateAction(fd);
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
      <form onSubmit={handleUpload} className="p-6 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 shadow-xl">
        <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
          <Upload className="w-4 h-4 text-amber-400" />
          <span>새 파워포인트 (.pptx) 템플릿 업로드</span>
        </h2>
        <p className="text-xs text-zinc-400">
          슬라이드 텍스트에 <code className="text-amber-400 bg-[#090A0C] px-1.5 py-0.5 rounded font-mono">{"{{브랜드명}}"}</code> 같은 치환 표시를 넣어 만든 .pptx를 올리면 자동으로 감지됩니다. 디자인은 그대로 보존됩니다.
        </p>

        {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">{error}</div>}
        {notice && <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold">{notice}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            required
            placeholder="템플릿 명칭 (예: 2026 프리미엄 행사 운영안)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-amber-500"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "event" | "sns")}
            className="px-3.5 py-2.5 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-100 text-xs focus:outline-none focus:border-amber-500 font-semibold"
          >
            <option value="event">행사 운영안 템플릿</option>
            <option value="sns">SNS 운영 제안서 템플릿</option>
          </select>
          <input
            key={fileKey}
            type="file"
            required
            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="px-3.5 py-2 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-400 text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:bg-[#181A20] file:text-zinc-200"
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
        <h2 className="text-sm font-bold text-zinc-300">등록된 템플릿 목록 ({templates.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="p-5 rounded-3xl bg-[#131418] border border-[#22242A] space-y-3 shadow-md flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold">
                      {t.kind === "event" ? "인플루언서 행사" : "SNS 채널 운영"}
                    </span>
                    {t.builtin && (
                      <span className="px-2 py-0.5 rounded-full bg-[#181A20] text-zinc-400 border border-[#22242A] text-[10px] font-semibold inline-flex items-center gap-1">
                        <Lock className="w-3 h-3" /> 기본 내장
                      </span>
                    )}
                  </div>
                  {!t.builtin && (
                    <button type="button" onClick={() => handleDelete(t)} className="p-1 rounded text-zinc-500 hover:text-red-400" title="삭제">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <h3 className="text-base font-bold text-zinc-100">{t.name}</h3>
                <div className="space-y-1">
                  <span className="text-[11px] text-zinc-500 block font-medium">감지된 치환 항목 ({t.placeholders.length}):</span>
                  <div className="flex flex-wrap gap-1.5">
                    {t.placeholders.length === 0 ? (
                      <span className="text-[11px] text-amber-400">치환 항목 없음</span>
                    ) : (
                      t.placeholders.map((ph) => (
                        <span key={ph} className="px-2 py-0.5 rounded bg-[#090A0C] border border-[#22242A] text-amber-300/80 font-mono text-[10px]">{`{{${ph}}}`}</span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#22242A] text-[11px] text-zinc-500 font-mono">
                등록일: {new Date(t.uploaded_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
