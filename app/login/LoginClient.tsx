"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Loader2, LogIn, LogOut } from "lucide-react";
import { safeCall } from "@/lib/actions/safeCall";
import { toast } from "@/components/Toast";
import { loginAction, logoutAction } from "./actions";

const inputCls =
  "w-full px-3.5 py-3 sm:py-2.5 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:border-blue-500";

export default function LoginClient({ next }: { next: string | null }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [persist, setPersist] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await safeCall(loginAction({ username, password, persist, next }));

    if (!res.ok) {
      // 실패했을 때만 버튼을 풀어준다. 성공하면 곧바로 화면이 바뀌므로,
      // 여기서 풀면 이동 직전에 버튼이 한 번 깜빡인다.
      setSubmitting(false);
      setError(res.error);
      return;
    }

    // 어디로 갈지는 서버가 정리해서 돌려준 값을 쓴다(오픈 리다이렉트 차단은 거기서 끝냈다).
    // replace 로 가야 뒤로가기를 눌렀을 때 로그인 화면으로 되돌아오지 않는다.
    router.replace(res.data.next || "/");
    // 서버 컴포넌트가 새 세션으로 다시 렌더되도록 한다.
    router.refresh();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm bg-surface border border-border rounded-2xl sm:rounded-3xl p-5 sm:p-8 space-y-5 shadow-2xl"
    >
      <div className="text-center space-y-2 pb-4 border-b border-border">
        <div className="w-12 h-12 rounded-2xl bg-bg border border-border flex items-center justify-center mx-auto shadow-inner">
          <LogIn className="w-5 h-5 text-blue-400" />
        </div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-text tracking-tight">RB Global 로그인</h1>
        <p className="text-xs text-text-sub">승인된 계정만 이용할 수 있습니다.</p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <label htmlFor="login-username" className="text-xs font-semibold text-text-2">
            아이디
          </label>
          <input
            id="login-username"
            name="username"
            type="text"
            required
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="아이디를 입력하세요"
            className={inputCls}
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="login-password" className="text-xs font-semibold text-text-2">
            비밀번호
          </label>
          <input
            id="login-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호를 입력하세요"
            className={inputCls}
          />
        </div>
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer text-xs text-text-sub py-1">
        <input
          type="checkbox"
          checked={persist}
          onChange={(e) => setPersist(e.target.checked)}
          className="accent-blue-600 w-4 h-4 rounded"
        />
        <span className="leading-snug">로그인 상태 유지</span>
      </label>

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
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
        <span>로그인</span>
      </button>

      <p className="text-center text-xs text-text-sub pt-1">
        계정이 없으신가요?{" "}
        <Link href="/signup" className="font-bold text-accent-link hover:underline">
          가입하기
        </Link>
      </p>
    </form>
  );
}

/**
 * 로그아웃 버튼. 대기(`/pending`)·차단(`/blocked`) 화면이 함께 쓴다.
 *
 * 이 두 화면은 서버 컴포넌트라 버튼을 직접 담을 수 없어서, 같은 인증 묶음인 여기에 두고
 * 가져다 쓴다.
 */
export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleLogout = async () => {
    setBusy(true);
    const res = await safeCall(logoutAction());
    if (!res.ok) {
      setBusy(false);
      toast.error("로그아웃하지 못했습니다.", { description: res.error });
      return;
    }
    router.replace("/login");
    // 세션이 사라진 상태로 서버 컴포넌트를 다시 그리게 한다. 이게 없으면 이전 사용자
    // 정보가 캐시에 남아 잠깐 그대로 보인다.
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      className={
        className ??
        "w-full py-3.5 sm:py-3 rounded-2xl bg-surface2 hover:bg-surface3 border border-border text-text-2 text-xs sm:text-sm font-bold transition disabled:opacity-50 inline-flex items-center justify-center gap-2 active:scale-[0.98]"
      }
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
      <span>로그아웃</span>
    </button>
  );
}
