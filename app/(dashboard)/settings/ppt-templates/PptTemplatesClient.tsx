"use client";

import { useState } from "react";
import { PptTemplate } from "@/lib/db/types";
import { uploadPptTemplateAction, deletePptTemplateAction } from "./actions";
import { Upload, Trash2, FileText, CheckCircle2, Loader2, Sparkles } from "lucide-react";

export default function PptTemplatesClient({
  initialTemplates,
}: {
  initialTemplates: PptTemplate[];
}) {
  const [templates, setTemplates] = useState<PptTemplate[]>(initialTemplates);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"event" | "sns">("event");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name);
      fd.append("kind", kind);

      const res = await uploadPptTemplateAction(fd);
      setTemplates([...templates, res.template]);
      setName("");
      setFile(null);
      alert("새 PPT 템플릿이 등록되었습니다!");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("정말 이 템플릿을 삭제하시겠습니까?")) return;
    await deletePptTemplateAction(id);
    setTemplates(templates.filter((t) => t.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Upload Box */}
      <form onSubmit={handleUpload} className="p-6 rounded-3xl bg-[#131418] border border-[#22242A] space-y-4 shadow-xl">
        <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
          <Upload className="w-4 h-4 text-amber-400" />
          <span>새 파워포인트 (.pptx) 템플릿 업로드</span>
        </h2>
        <p className="text-xs text-zinc-400">
          슬라이드 내부에 <code className="text-amber-400 bg-[#090A0C] px-1.5 py-0.5 rounded font-mono">{"{{브랜드명}}"}</code> 등의 치환자가 포함된 .pptx 파일을 업로드하면 자동으로 감지됩니다.
        </p>

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
            <option value="event">행사 운영안 템플릿 (B)</option>
            <option value="sns">SNS 운영 제안서 템플릿 (C)</option>
          </select>
          <input
            type="file"
            required
            accept=".pptx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="px-3.5 py-2 rounded-xl bg-[#090A0C] border border-[#22242A] text-zinc-400 text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:bg-[#181A20] file:text-zinc-200"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={uploading || !file || !name}
            className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-md transition disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span>템플릿 등록 및 분석</span>
          </button>
        </div>
      </form>

      {/* Templates List */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-zinc-300">등록된 템플릿 목록 ({templates.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="p-5 rounded-3xl bg-[#131418] border border-[#22242A] space-y-3 shadow-md flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold">
                    {t.kind === "event" ? "인플루언서 행사(B)" : "SNS 채널 운영(C)"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    className="p-1 rounded text-zinc-500 hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <h3 className="text-base font-bold text-zinc-100">{t.name}</h3>
                <div className="space-y-1">
                  <span className="text-[11px] text-zinc-500 block font-medium">감지된 치환 항목:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {t.placeholders.map((ph) => (
                      <span key={ph} className="px-2 py-0.5 rounded bg-[#090A0C] border border-[#22242A] text-amber-300/80 font-mono text-[10px]">
                        {`{{${ph}}}`}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#22242A] text-[11px] text-zinc-500 font-mono">
                등록일: {new Date(t.uploaded_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}