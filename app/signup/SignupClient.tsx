"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";
import { PASSWORD_RULE_TEXT, USERNAME_RULE_TEXT } from "@/lib/auth/username";
import { signupAction } from "../login/actions";

const inputCls =
  "w-full px-3.5 py-3 sm:py-2.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-blue-500";

export default function SignupClient() {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 확인란이 다른 건 서버까지 갈 것도 없다. 여기서 막는다.
    if (password !== passwordConfirm) {
      setError("비밀번호가 서로 다릅니다. 다시 확인해주세요.");
      return;
    }

    setSubmitting(true);
    const res = await safeCall(
      signupAction({ username, display_name: displayName, password, invite_code: inviteCode })
    );
    setSubmitting(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(res.data.username);
  };

  if (done) {
    return (
      <div className="w-full max-w-sm bg-surface border border-border rounded-2xl sm:rounded-3xl p-5 sm:p-8 space-y-4 text-center shadow-2xl">
        <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h1 className="text-base sm:text-lg font-bold text-text">가입 신청이 접수되었습니다</h1>
        <p className="text-xs text-text-sub leading-relaxed">
          아이디 <span className="font-mono font-bold text-text-2">{done}</span> 로 신청했습니다.
        </p>
        <p className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-text-2 leading-relaxed">
          <span className="font-bold text-warn">관리자 승인 후 이용할 수 있습니다.</span>
          <br />
          승인이 끝나면 아래 로그인 화면에서 바로 들어올 수 있습니다.
        </p>
        <Link
          href="/login"
          className="w-full py-3.5 sm:py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-500/25 transition inline-flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          로그인 화면으로
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm bg-surface border border-border rounded-2xl sm:rounded-3xl p-5 sm:p-8 space-y-5 shadow-2xl"
    >
      <div className="text-center space-y-2 pb-4 border-b border-border">
        <div className="w-12 h-12 rounded-2xl bg-bg border border-border flex items-center justify-center mx-auto shadow-inner">
          <UserPlus className="w-5 h-5 text-blue-400" />
        </div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-text tracking-tight">RB Global 가입 신청</h1>
        <p className="text-xs text-text-sub leading-relaxed">
          가입 후 관리자 승인을 받아야 이용할 수 있습니다.
        </p>
      </div>

      <div className="space-y-3">
        {/* 초대 코드가 맨 위다. 없으면 나머지를 채워도 소용없으니 먼저 묻는다. */}
        <div className="space-y-1">
          <label htmlFor="signup-invite-code" className="text-xs font-semibold text-text-2">
            초대 코드
          </label>
          <input
            id="signup-invite-code"
            name="invite_code"
            type="text"
            required
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="관리자에게 받은 8자 코드"
            className={`${inputCls} font-mono tracking-widest uppercase`}
          />
          <p className="text-[11px] text-text-muted leading-relaxed">
            초대 코드는 관리자에게 받을 수 있습니다. 대소문자는 구분하지 않습니다.
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="signup-username" className="text-xs font-semibold text-text-2">
            아이디
          </label>
          <input
            id="signup-username"
            name="username"
            type="text"
            required
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="예: kimmanager"
            className={inputCls}
          />
          <p className="text-[11px] text-text-muted leading-relaxed">{USERNAME_RULE_TEXT}</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="signup-name" className="text-xs font-semibold text-text-2">
            이름
          </label>
          <input
            id="signup-name"
            name="display_name"
            type="text"
            required
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="화면에 표시될 이름"
            className={inputCls}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="signup-password" className="text-xs font-semibold text-text-2">
            비밀번호
          </label>
          <input
            id="signup-password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
          />
          <p className="text-[11px] text-text-muted leading-relaxed">{PASSWORD_RULE_TEXT}</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="signup-password-confirm" className="text-xs font-semibold text-text-2">
            비밀번호 확인
          </label>
          <input
            id="signup-password-confirm"
            name="password_confirm"
            type="password"
            required
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            className={inputCls}
          />
          {passwordConfirm.length > 0 && password !== passwordConfirm && (
            <p className="text-[11px] text-rose-400 leading-relaxed">비밀번호가 서로 다릅니다.</p>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <p className="text-text-2 leading-relaxed break-words">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3.5 sm:py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-500/25 transition disabled:opacity-50 inline-flex items-center justify-center gap-2 active:scale-[0.98]"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
        <span>가입 신청하기</span>
      </button>

      <p className="text-center text-xs text-text-sub pt-1">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="font-bold text-accent-link hover:underline">
          로그인
        </Link>
      </p>
    </form>
  );
}
