"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PptTemplate,
  PptTemplateKind,
  PPT_TEMPLATE_KIND_LABELS,
  MAX_PPT_TEMPLATE_BYTES,
  buildTemplatePathname,
} from "@/lib/db/types";
import {
  uploadPptTemplateAction,
  uploadPptTemplateReplacementAction,
  confirmPptTemplateUploadAction,
  deletePptTemplateAction,
  updatePptTemplateMetaAction,
  preparePptTemplateReplaceAction,
  confirmPptTemplateReplaceAction,
  restoreBuiltinPptTemplatesAction,
} from "./actions";
import { Upload, Trash2, Loader2, Lock, Pencil, Download, RefreshCw, Check, X, RotateCcw } from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export default function PptTemplatesClient({
  initialTemplates,
  clientUpload,
  initialHiddenBuiltinCount,
}: {
  initialTemplates: PptTemplate[];
  /** 지워져서 목록에 없는 기본 내장 템플릿 수. 0보다 크면 되살리기 버튼을 보여준다. */
  initialHiddenBuiltinCount: number;
  /**
   * Blob 저장소가 붙어 있으면 pptx 를 브라우저에서 저장소로 바로 보낸다.
   * Vercel 함수는 요청 본문을 4.5MB 로 자르는데, 이미지가 든 pptx 는 그보다 쉽게 커진다.
   */
  clientUpload: boolean;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<PptTemplate[]>(initialTemplates);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PptTemplateKind>("event");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editKind, setEditKind] = useState<PptTemplateKind>("event");
  const [savingEdit, setSavingEdit] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [hiddenBuiltinCount, setHiddenBuiltinCount] = useState(initialHiddenBuiltinCount);

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

    try {
      return await safeCall(confirmPptTemplateUploadAction({ templateId, kind, name: name.trim() }));
    } catch (err) {
      return { ok: false as const, error: `등록에 실패했습니다. (${err instanceof Error ? err.message : String(err)})` };
    }
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

    // finally 로 반드시 잠금을 푼다. 여기서 예외가 새면 버튼이 영구히 비활성으로 남고
    // 화면에는 아무 설명도 안 뜬다. 새로고침 전까지 아무것도 못 하게 된다.
    try {
      const res = clientUpload ? await uploadDirect() : await safeCall(uploadPptTemplateAction(fd));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTemplates((prev) => [...prev, res.data.template]);
      setName("");
      setFile(null);
      setFileKey((k) => k + 1);
      setNotice(res.data.warning || `템플릿이 등록되었습니다. 감지된 치환 항목 ${res.data.template.placeholders.length}개.`);
    } catch (err) {
      setError(`업로드 중 오류가 발생했습니다. (${err instanceof Error ? err.message : String(err)})`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (t: PptTemplate) => {
    const message = t.builtin
      ? `"${t.name}"을(를) 목록에서 지울까요? 기본 템플릿이라 언제든 되살릴 수 있습니다.`
      : `"${t.name}" 템플릿을 삭제할까요? 이 템플릿을 쓰는 운영안은 PPT를 다운로드할 수 없게 됩니다.`;
    if (!confirm(message)) return;
    setError(null);
    setNotice(null);
    const res = await safeCall(deletePptTemplateAction(t.id));
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    if (t.builtin) setHiddenBuiltinCount((n) => n + 1);
  };

  const handleRestoreBuiltins = async () => {
    setError(null);
    const res = await safeCall(restoreBuiltinPptTemplatesAction());
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setHiddenBuiltinCount(0);
    setNotice(`기본 템플릿 ${res.data.restored}개를 되살렸습니다. 새로고침하면 목록에 나타납니다.`);
    router.refresh();
  };

  const startEdit = (t: PptTemplate) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditKind(t.kind);
    setError(null);
    setNotice(null);
  };

  const handleSaveEdit = async (t: PptTemplate) => {
    if (!editName.trim()) return;
    setSavingEdit(true);
    setError(null);
    try {
      const res = await safeCall(updatePptTemplateMetaAction({ id: t.id, name: editName.trim(), kind: editKind }));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTemplates((prev) => prev.map((x) => (x.id === t.id ? res.data : x)));
      setEditingId(null);
      setNotice("템플릿 정보를 수정했습니다.");
    } finally {
      setSavingEdit(false);
    }
  };

  /**
   * 파일만 갈아끼운다. 템플릿 id 가 그대로라 이 템플릿을 쓰던 운영안이 계속 붙어 있다.
   * 지웠다 새로 올리면 id 가 바뀌어 그 연결이 끊긴다.
   */
  const handleReplaceFile = async (t: PptTemplate, replacement: File) => {
    setError(null);
    setNotice(null);
    if (replacement.size > MAX_PPT_TEMPLATE_BYTES) {
      setError("템플릿 파일은 15MB 이하만 업로드할 수 있습니다.");
      return;
    }
    setReplacingId(t.id);
    try {
      const prep = await safeCall(preparePptTemplateReplaceAction(t.id));
      if (!prep.ok) {
        setError(prep.error);
        return;
      }

      if (clientUpload) {
        try {
          const { upload } = await import("@vercel/blob/client");
          await upload(prep.data.pathname, replacement, {
            access: "private",
            handleUploadUrl: "/api/ppt-templates/upload",
            contentType: PPTX_MIME,
          });
        } catch (err) {
          setError(`업로드에 실패했습니다. (${err instanceof Error ? err.message : String(err)})`);
          return;
        }
      } else {
        const fd = new FormData();
        fd.append("file", replacement);
        fd.append("fileKey", prep.data.fileKey);
        const up = await safeCall(uploadPptTemplateReplacementAction(fd));
        if (!up.ok) {
          setError(up.error);
          return;
        }
      }

      const res = await safeCall(
        confirmPptTemplateReplaceAction({ templateId: t.id, fileKey: prep.data.fileKey })
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTemplates((prev) => prev.map((x) => (x.id === t.id ? res.data.template : x)));
      setNotice(
        res.data.warning ||
          `파일을 교체했습니다. 감지된 치환 항목 ${res.data.template.placeholders.length}개. 이 템플릿을 쓰던 운영안은 그대로 유지됩니다.`
      );
    } finally {
      setReplacingId(null);
    }
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
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-text-2">등록된 템플릿 목록 ({templates.length})</h2>
          {hiddenBuiltinCount > 0 && (
            <button
              type="button"
              onClick={handleRestoreBuiltins}
              className="px-3 py-1.5 rounded-lg bg-surface2 border border-border text-text-sub hover:text-text text-[11px] font-semibold inline-flex items-center gap-1.5 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              지운 기본 템플릿 {hiddenBuiltinCount}개 되살리기
            </button>
          )}
        </div>
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
                  <div className="flex items-center gap-1">
                    <a
                      href={`/api/ppt-templates/${t.id}/download`}
                      className="px-2 py-1 rounded-lg text-text-sub hover:text-text hover:bg-surface2 text-[11px] font-semibold inline-flex items-center gap-1 transition"
                      title="원본 pptx 내려받기"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">받기</span>
                    </a>
                    {!t.builtin && (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(t)}
                          className="px-2 py-1 rounded-lg text-text-sub hover:text-text hover:bg-surface2 text-[11px] font-semibold inline-flex items-center gap-1 transition"
                          title="이름과 종류 수정"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">수정</span>
                        </button>
                        <label
                          className={`px-2 py-1 rounded-lg text-text-sub hover:text-text hover:bg-surface2 text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer ${replacingId === t.id ? "opacity-50 pointer-events-none" : ""}`}
                          title="템플릿을 쓰던 운영안을 그대로 둔 채 파일만 교체합니다"
                        >
                          {replacingId === t.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden sm:inline">파일 교체</span>
                          <input
                            type="file"
                            className="hidden"
                            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                            onChange={(e) => {
                              const picked = e.target.files?.[0];
                              e.target.value = "";
                              if (picked) void handleReplaceFile(t, picked);
                            }}
                          />
                        </label>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(t)}
                      className="px-2 py-1 rounded-lg text-text-sub hover:text-red-400 hover:bg-surface2 text-[11px] font-semibold inline-flex items-center gap-1 transition"
                      title={t.builtin ? "목록에서 지우기 (되살릴 수 있습니다)" : "삭제"}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">삭제</span>
                    </button>
                  </div>
                </div>
                {editingId === t.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-bg border border-border text-text text-sm"
                      placeholder="템플릿 이름"
                    />
                    <select
                      value={editKind}
                      onChange={(e) => setEditKind(e.target.value as PptTemplateKind)}
                      className="w-full px-3 py-2 rounded-xl bg-bg border border-border text-text text-sm"
                    >
                      {(Object.keys(PPT_TEMPLATE_KIND_LABELS) as PptTemplateKind[]).map((k) => (
                        <option key={k} value={k}>{PPT_TEMPLATE_KIND_LABELS[k]} 템플릿</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={savingEdit || !editName.trim()}
                        onClick={() => handleSaveEdit(t)}
                        className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        저장
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 rounded-lg bg-surface2 text-text-sub text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <h3 className="text-base font-bold text-text">{t.name}</h3>
                )}
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
