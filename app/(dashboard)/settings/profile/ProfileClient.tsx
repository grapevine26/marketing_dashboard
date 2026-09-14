"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS, type SessionUser } from "@/lib/auth/roles";
import { MIN_PASSWORD_LENGTH, PASSWORD_RULE_TEXT } from "@/lib/auth/username";
import { updateMyNameAction, changeMyPasswordAction } from "./actions";
import { safeCall } from "@/lib/actions/safeCall";
import { toast } from "@/components/Toast";
import { Check, Crown, KeyRound, Loader2, Shield, ShieldCheck } from "lucide-react";

const ROLE_ICONS = { owner: Crown, admin: ShieldCheck, staff: Shield } as const;

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  // 서버 렌더(UTC)와 브라우저(KST)가 다른 날짜를 내면 하이드레이션 경고가 난다. 시간대를 고정한다.
  return new Date(iso).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function ProfileClient({
  me,
  createdAt,
  approvedAt,
}: {
  me: SessionUser;
  createdAt: string | null;
  approvedAt: string | null;
}) {
  const router = useRouter();

  const [name, setName] = useState(me.display_name);
  const [savingName, setSavingName] = useState(false);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const RoleIcon = ROLE_ICONS[me.role];
  const nameChanged = name.trim() !== me.display_name && name.trim() !== "";

  const saveName = async () => {
    setSavingName(true);
    const res = await safeCall(updateMyNameAction(name));
    setSavingName(false);
    if (!res.ok) return toast.error(res.error || "이름을 바꾸지 못했습니다.");
    toast.success(`이름을 [${res.data.display_name}](으)로 바꿨습니다.`);
    // 사이드바에도 이름이 있으므로 서버에서 다시 받아온다.
    router.refresh();
  };

  const savePassword = async () => {
    setPwError(null);
    if (next !== confirm) {
      setPwError("새 비밀번호가 서로 다릅니다.");
      return;
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setPwError(PASSWORD_RULE_TEXT);
      return;
    }
    setSavingPw(true);
    const res = await safeCall(changeMyPasswordAction({ current, next }));
    setSavingPw(false);
    if (!res.ok) {
      setPwError(res.error || "비밀번호를 바꾸지 못했습니다.");
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    toast.success("비밀번호를 바꿨습니다.");
  };

  const INPUT =
    "w-full px-3 py-2 rounded-xl bg-surface2 border border-border text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-blue-500/40";

  return (
    <div className="space-y-4">
      {/* 바꿀 수 없는 정보 */}
      <section className="p-5 rounded-2xl bg-surface border border-border space-y-3">
        <h2 className="text-sm font-bold text-text">계정</h2>
        <dl className="grid grid-cols-[5rem_1fr] gap-y-2.5 text-xs">
          <dt className="text-text-muted">아이디</dt>
          <dd className="text-text font-mono">@{me.username}</dd>

          <dt className="text-text-muted">등급</dt>
          <dd>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 ${
                me.role === "owner"
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                  : me.role === "admin"
                  ? "bg-violet-500/15 text-violet-400 border border-violet-500/25"
                  : "bg-surface2 text-text-sub border border-border"
              }`}
            >
              <RoleIcon className="w-3 h-3" />
              {ROLE_LABELS[me.role]}
            </span>
          </dd>

          <dt className="text-text-muted">가입일</dt>
          <dd className="text-text-sub font-mono">{formatDate(createdAt)}</dd>

          <dt className="text-text-muted">승인일</dt>
          <dd className="text-text-sub font-mono">{formatDate(approvedAt)}</dd>
        </dl>
        <p className="text-[11px] text-text-muted pt-1 border-t border-border">
          아이디와 등급은 바꿀 수 없습니다. 등급 변경이 필요하면 대표 관리자에게 요청하세요.
        </p>
      </section>

      {/* 이름 */}
      <section className="p-5 rounded-2xl bg-surface border border-border space-y-3">
        <div>
          <h2 className="text-sm font-bold text-text">이름</h2>
          <p className="text-[11px] text-text-sub mt-0.5">
            화면과 활동 기록에 이 이름으로 표시됩니다.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            className={INPUT}
            placeholder="화면에 표시될 이름"
          />
          <button
            type="button"
            onClick={saveName}
            disabled={!nameChanged || savingName}
            className="px-4 py-2 rounded-xl bg-accent2/15 text-accent2 border border-accent2/25 text-xs font-bold hover:bg-accent2/25 transition disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 shrink-0"
          >
            {savingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            저장
          </button>
        </div>
      </section>

      {/* 비밀번호 */}
      <section className="p-5 rounded-2xl bg-surface border border-border space-y-3">
        <div>
          <h2 className="text-sm font-bold text-text flex items-center gap-1.5">
            <KeyRound className="w-4 h-4 text-text-sub" />
            비밀번호 변경
          </h2>
          <p className="text-[11px] text-text-sub mt-0.5">
            지금 쓰는 비밀번호를 함께 입력해야 합니다. 잊었다면 관리자에게 초기화를 요청하세요.
          </p>
        </div>

        <div className="space-y-2">
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={INPUT}
            placeholder="현재 비밀번호"
            autoComplete="current-password"
          />
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={INPUT}
            placeholder={`새 비밀번호 (${MIN_PASSWORD_LENGTH}자 이상)`}
            autoComplete="new-password"
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={INPUT}
            placeholder="새 비밀번호 확인"
            autoComplete="new-password"
          />
        </div>

        {pwError && (
          <p className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
            {pwError}
          </p>
        )}

        <button
          type="button"
          onClick={savePassword}
          disabled={!current || !next || !confirm || savingPw}
          className="w-full py-2.5 rounded-xl bg-surface2 border border-border text-xs font-bold text-text hover:bg-surface3 transition disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
        >
          {savingPw ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
          비밀번호 바꾸기
        </button>
      </section>
    </div>
  );
}
