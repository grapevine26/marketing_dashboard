"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ManagedUser } from "@/lib/auth/users";
import { ROLE_LABELS, type UserRole, type UserStatus } from "@/lib/auth/roles";
import { MIN_PASSWORD_LENGTH, PASSWORD_RULE_TEXT } from "@/lib/auth/username";
import type { ActionResult } from "@/lib/actions/result";
import {
  approveUserAction,
  rejectUserAction,
  blockUserAction,
  unblockUserAction,
  setUserRoleAction,
  resetPasswordAction,
  deleteUserAction,
} from "./actions";
import { safeCall } from "@/lib/actions/safeCall";
import { toast } from "@/components/Toast";
import {
  AlertTriangle,
  Ban,
  Check,
  Clock,
  Copy,
  Crown,
  KeyRound,
  Loader2,
  RotateCcw,
  Shield,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCheck,
  Users,
  UserX,
  X,
} from "lucide-react";

/**
 * 관리자용 사용자 관리 화면.
 *
 * 서버가 이미 막는 규칙(마지막 관리자, 자기 자신)을 화면에서 다시 계산하지 않는다.
 * 실패하면 서버가 준 메시지를 그대로 보여준다. 같은 규칙을 두 곳에 두면 한쪽만 고치게 된다.
 * 다만 본인 줄의 차단·삭제 버튼은 눌러도 반드시 실패하므로 아예 감춘다.
 */

interface UsersClientProps {
  initialUsers: ManagedUser[];
  /** 현재 로그인한 관리자. 본인 줄을 구분하는 데 쓴다. */
  currentUserId: string;
  /** 내 등급. 관리자는 직원만 관리할 수 있어 버튼 구성이 달라진다. */
  myRole: UserRole;
}

/** 확인 모달이 필요한 동작. 되돌리기 어렵거나 권한을 잃는 것들만 여기 있다. */
type ConfirmKind = "reject" | "block" | "delete" | "demote";

interface ConfirmState {
  kind: ConfirmKind;
  user: ManagedUser;
  /** 강등 확인일 때 어떤 등급으로 내릴지. */
  nextRole?: UserRole;
}

const GROUPS: { status: UserStatus; label: string; hint: string }[] = [
  { status: "pending", label: "승인 대기", hint: "승인해야 대시보드를 쓸 수 있습니다." },
  { status: "active", label: "활성", hint: "지금 대시보드를 쓸 수 있는 계정입니다." },
  { status: "blocked", label: "차단됨", hint: "로그인해도 이용이 중지된 계정입니다." },
];

const BTN =
  "px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed";
const BTN_GO = `${BTN} bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600 shadow-sm`;
const BTN_PLAIN = `${BTN} bg-surface2 hover:bg-surface3 text-text-sub hover:text-text border-border`;
const BTN_RISK = `${BTN} bg-surface2 hover:bg-rose-500/10 text-text-sub hover:text-rose-400 border-border`;

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

/** 확인 모달 문구. 무슨 일이 일어나는지 분명히 적는다. */
function confirmCopy(state: ConfirmState): {
  title: string;
  lead: string;
  detail: string;
  confirmLabel: string;
  tone: "danger" | "warn";
} {
  const who = `${state.user.display_name}(@${state.user.username})`;
  const nextRole = state.nextRole;
  switch (state.kind) {
    case "reject":
      return {
        title: "가입 신청 거절",
        lead: `${who}의 가입 신청을 거절할까요?`,
        detail:
          "계정이 삭제됩니다. 되돌릴 수 없고, 다시 쓰려면 본인이 처음부터 새로 가입해야 합니다.",
        confirmLabel: "거절하고 삭제",
        tone: "danger",
      };
    case "block":
      return {
        title: "계정 차단",
        lead: `${who} 계정을 차단할까요?`,
        detail:
          "차단되면 로그인은 되지만 대시보드가 열리지 않고 이용 중지 안내만 보입니다. 계정과 데이터는 그대로 남고, 언제든 차단을 해제할 수 있습니다.",
        confirmLabel: "차단",
        tone: "warn",
      };
    case "delete":
      return {
        title: "계정 영구 삭제",
        lead: `${who} 계정을 영구 삭제할까요?`,
        detail:
          "로그인 정보와 프로필이 완전히 사라집니다. 이 작업은 되돌릴 수 없습니다. 잠시 막아두려는 것이라면 삭제 대신 차단을 쓰세요.",
        confirmLabel: "영구 삭제",
        tone: "danger",
      };
    case "demote": {
      const to = nextRole ?? "staff";
      return {
        title: "등급 내리기",
        lead: `${who}의 등급을 [${ROLE_LABELS[to]}](으)로 내릴까요?`,
        detail:
          to === "staff"
            ? "사용자 관리와 활동 기록에 더 이상 들어올 수 없습니다. 대시보드의 나머지 기능은 그대로 씁니다."
            : "등급 변경과 다른 관리자에 대한 조치를 더 이상 할 수 없습니다. 직원 관리와 활동 기록은 그대로 볼 수 있습니다.",
        confirmLabel: "등급 내리기",
        tone: "warn",
      };
    }
  }
}

export default function UsersClient({ initialUsers, currentUserId, myRole }: UsersClientProps) {
  const isOwner = myRole === "owner";
  const router = useRouter();
  const [users, setUsers] = useState<ManagedUser[]>(initialUsers);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 확인 모달
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [confirmWorking, setConfirmWorking] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // 비밀번호 초기화 모달
  const [pwTarget, setPwTarget] = useState<ManagedUser | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwWorking, setPwWorking] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwIssued, setPwIssued] = useState<string | null>(null);
  const [pwCopied, setPwCopied] = useState(false);

  // router.refresh() 로 서버가 새 목록을 내려주면 화면 상태를 다시 맞춘다.
  // 승인자 이름처럼 서버만 아는 값이 있어 낙관적 갱신만으로는 부족하다.
  //
  // useEffect 가 아니라 렌더 중에 맞춘다. React 문서가 "props 가 바뀔 때 state 를 되돌리는"
  // 경우에 권하는 방식이다. effect 로 하면 화면을 한 번 그린 뒤 다시 그리게 되어 깜빡인다.
  const [syncedFrom, setSyncedFrom] = useState(initialUsers);
  if (syncedFrom !== initialUsers) {
    setSyncedFrom(initialUsers);
    setUsers(initialUsers);
  }

  const patchUser = (userId: string, patch: Partial<ManagedUser> | null) => {
    setUsers((prev) =>
      patch === null
        ? prev.filter((u) => u.id !== userId)
        : prev.map((u) => (u.id === userId ? { ...u, ...patch } : u))
    );
  };

  /** 확인 없이 바로 하는 동작(승인·차단 해제·관리자 지정). 되돌리기 쉬운 것들이다. */
  const runDirect = async (
    user: ManagedUser,
    call: () => Promise<ActionResult<null>>,
    patch: Partial<ManagedUser>,
    successMessage: string
  ) => {
    setBusyId(user.id);
    const res = await safeCall(call());
    setBusyId(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    patchUser(user.id, patch);
    toast.success(successMessage);
    router.refresh();
  };

  const handleConfirm = async () => {
    if (!confirmState) return;
    const { kind, user } = confirmState;
    setConfirmWorking(true);
    setConfirmError(null);

    const call = (): Promise<ActionResult<null>> => {
      switch (kind) {
        case "reject":
          return rejectUserAction(user.id);
        case "block":
          return blockUserAction(user.id);
        case "delete":
          return deleteUserAction(user.id);
        case "demote":
          return setUserRoleAction(user.id, confirmState.nextRole ?? "staff");
      }
    };

    const res = await safeCall(call());
    setConfirmWorking(false);
    if (!res.ok) {
      // 서버가 막은 이유(마지막 관리자 등)를 모달 안에서 그대로 보여준다.
      setConfirmError(res.error);
      return;
    }

    if (kind === "reject" || kind === "delete") {
      patchUser(user.id, null);
      toast.info(`${user.display_name}(@${user.username}) 계정을 삭제했습니다.`);
    } else if (kind === "block") {
      patchUser(user.id, { status: "blocked" });
      toast.info(`${user.display_name} 계정을 차단했습니다.`);
    } else {
      patchUser(user.id, { role: "staff" });
      toast.info(`${user.display_name}의 관리자 권한을 회수했습니다.`);
    }
    setConfirmState(null);
    router.refresh();
  };

  const closePasswordModal = () => {
    setPwTarget(null);
    setPwValue("");
    setPwError(null);
    setPwIssued(null);
    setPwCopied(false);
  };

  const handleResetPassword = async () => {
    if (!pwTarget) return;
    if (pwValue.length < MIN_PASSWORD_LENGTH) {
      setPwError(PASSWORD_RULE_TEXT);
      return;
    }
    setPwWorking(true);
    setPwError(null);
    const res = await safeCall(resetPasswordAction(pwTarget.id, pwValue));
    setPwWorking(false);
    if (!res.ok) {
      setPwError(res.error);
      return;
    }
    // 여기서만 값을 보여준다. 서버는 임시 비밀번호를 저장하지 않아 다시 꺼내올 수 없다.
    setPwIssued(pwValue);
    setPwValue("");
    toast.success(`${pwTarget.display_name}의 비밀번호를 초기화했습니다.`);
  };

  const handleCopyPassword = async () => {
    if (!pwIssued) return;
    try {
      await navigator.clipboard.writeText(pwIssued);
      setPwCopied(true);
      setTimeout(() => setPwCopied(false), 1500);
    } catch {
      toast.error("복사하지 못했습니다. 값을 직접 선택해 복사해주세요.");
    }
  };

  const confirmText = confirmState ? confirmCopy(confirmState) : null;
  const danger = confirmText?.tone === "danger";

  if (users.length === 0) {
    return (
      <div className="p-12 text-center border border-dashed border-border rounded-2xl bg-surface space-y-3">
        <Users className="w-8 h-8 text-text-muted mx-auto" />
        <p className="text-text-sub text-xs sm:text-sm">등록된 사용자가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {GROUPS.map((group) => {
        const rows = users.filter((u) => u.status === group.status);
        if (rows.length === 0) return null;

        return (
          <section key={group.status} className="space-y-2.5">
            <div className="flex items-baseline gap-2 flex-wrap px-0.5">
              <h2 className="text-sm font-bold text-text flex items-center gap-1.5">
                {group.status === "pending" && <Clock className="w-4 h-4 text-amber-400" />}
                {group.status === "active" && <UserCheck className="w-4 h-4 text-emerald-400" />}
                {group.status === "blocked" && <Ban className="w-4 h-4 text-text-muted" />}
                <span>
                  {group.label} ({rows.length})
                </span>
              </h2>
              <p className="text-[11px] text-text-muted">{group.hint}</p>
            </div>

            <div className="space-y-2">
              {rows.map((u) => {
                const isMe = u.id === currentUserId;
                const busy = busyId === u.id;
                // 관리자는 직원만 다룬다. 서버도 막지만 못 쓸 버튼을 보여줄 이유가 없다.
                const canManage = isOwner || u.role === "staff";

                return (
                  <div
                    key={u.id}
                    className={`p-4 rounded-2xl bg-surface border transition flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                      u.status === "pending" ? "border-amber-500/30" : "border-border"
                    }`}
                  >
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-text">{u.display_name}</span>
                        <span className="text-xs text-text-sub font-mono">@{u.username}</span>

                        {isMe && (
                          <span className="px-1.5 py-0.5 rounded bg-accent2/10 text-accent2 border border-accent2/20 text-[10px] font-bold">
                            나
                          </span>
                        )}

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 ${
                            u.role === "owner"
                              ? "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                              : u.role === "admin"
                              ? "bg-violet-500/15 text-violet-400 border border-violet-500/25"
                              : "bg-surface2 text-text-sub border border-border"
                          }`}
                        >
                          {u.role === "owner" ? (
                            <Crown className="w-3 h-3" />
                          ) : u.role === "admin" ? (
                            <ShieldCheck className="w-3 h-3" />
                          ) : (
                            <Shield className="w-3 h-3" />
                          )}
                          {ROLE_LABELS[u.role]}
                        </span>

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            u.status === "pending"
                              ? "bg-amber-500/15 text-amber-400"
                              : u.status === "active"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-surface3 text-text-muted"
                          }`}
                        >
                          {u.status === "pending" ? "승인 대기" : u.status === "active" ? "활성" : "차단됨"}
                        </span>
                      </div>

                      <div className="text-[11px] text-text-muted font-mono flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>가입 {formatDate(u.created_at)}</span>
                        {u.status !== "pending" && (
                          <span>
                            승인 {formatDate(u.approved_at)}
                            {u.approved_by_name ? ` · ${u.approved_by_name}` : ""}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap lg:justify-end shrink-0">
                      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted mr-0.5" />}

                      {u.status === "pending" && canManage && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              runDirect(
                                u,
                                () => approveUserAction(u.id),
                                { status: "active" },
                                `${u.display_name} 계정을 승인했습니다.`
                              )
                            }
                            className={BTN_GO}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>승인</span>
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setConfirmState({ kind: "reject", user: u });
                              setConfirmError(null);
                            }}
                            className={BTN_RISK}
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>거절</span>
                          </button>
                        </>
                      )}

                      {u.status === "active" && canManage && (
                        <>
                          {/* 등급 변경은 대표 관리자만 할 수 있다. 자기 자신은 바꿀 수 없다. */}
                          {isOwner && !isMe && (
                            <select
                              disabled={busy}
                              value={u.role}
                              onChange={(e) => {
                                const next = e.target.value as UserRole;
                                if (next === u.role) return;
                                const goingDown =
                                  (u.role === "owner" && next !== "owner") ||
                                  (u.role === "admin" && next === "staff");
                                if (goingDown) {
                                  setConfirmState({ kind: "demote", user: u, nextRole: next });
                                  setConfirmError(null);
                                  return;
                                }
                                runDirect(
                                  u,
                                  () => setUserRoleAction(u.id, next),
                                  { role: next },
                                  `${u.display_name}의 등급을 [${ROLE_LABELS[next]}](으)로 바꿨습니다.`
                                );
                              }}
                              className="px-2 py-1.5 rounded-lg bg-surface2 border border-border text-[11px] font-semibold text-text-sub focus:outline-none focus:border-blue-500/40 disabled:opacity-60"
                              title="등급 변경"
                            >
                              <option value="owner">대표 관리자</option>
                              <option value="admin">관리자</option>
                              <option value="staff">직원</option>
                            </select>
                          )}

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setPwTarget(u);
                              setPwValue("");
                              setPwError(null);
                              setPwIssued(null);
                              setPwCopied(false);
                            }}
                            className={BTN_PLAIN}
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>비밀번호 초기화</span>
                          </button>

                          {/* 본인은 차단·삭제할 수 없다. 서버도 막지만 버튼 자체를 감춘다. */}
                          {!isMe && (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setConfirmState({ kind: "block", user: u });
                                  setConfirmError(null);
                                }}
                                className={BTN_PLAIN}
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>차단</span>
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setConfirmState({ kind: "delete", user: u });
                                  setConfirmError(null);
                                }}
                                className={BTN_RISK}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>삭제</span>
                              </button>
                            </>
                          )}
                        </>
                      )}

                      {u.status === "blocked" && canManage && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              runDirect(
                                u,
                                () => unblockUserAction(u.id),
                                { status: "active" },
                                `${u.display_name} 계정의 차단을 해제했습니다.`
                              )
                            }
                            className={BTN_PLAIN}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>차단 해제</span>
                          </button>
                          {!isMe && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setConfirmState({ kind: "delete", user: u });
                                setConfirmError(null);
                              }}
                              className={BTN_RISK}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>삭제</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* 확인 모달: 거절·차단·삭제·관리자 권한 회수 */}
      {confirmState && confirmText && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className={`bg-surface border rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl ${
              danger ? "border-rose-500/30" : "border-amber-500/30"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-xl border ${
                    danger ? "bg-rose-500/10 border-rose-500/20" : "bg-amber-500/10 border-amber-500/20"
                  }`}
                >
                  <AlertTriangle className={`w-5 h-5 ${danger ? "text-rose-400" : "text-amber-400"}`} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-text">{confirmText.title}</h3>
                  <p className="text-xs text-text-sub mt-0.5">
                    {danger ? "이 작업은 취소할 수 없습니다." : "나중에 되돌릴 수 있습니다."}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={confirmWorking}
                onClick={() => setConfirmState(null)}
                className="p-1 rounded-lg text-text-muted hover:text-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-bg border border-border space-y-2 text-xs leading-relaxed">
              <p className="text-text font-semibold">{confirmText.lead}</p>
              <p className="text-text-muted">{confirmText.detail}</p>
            </div>

            {confirmError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
                {confirmError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={confirmWorking}
                onClick={() => setConfirmState(null)}
                className="px-4 py-2 rounded-xl bg-surface2 hover:bg-surface text-text-sub text-xs font-semibold border border-border transition"
              >
                취소
              </button>
              <button
                type="button"
                disabled={confirmWorking}
                onClick={handleConfirm}
                className={`px-4 py-2 rounded-xl text-white text-xs font-semibold transition inline-flex items-center gap-1.5 shadow-md ${
                  danger
                    ? "bg-rose-600 hover:bg-rose-500 shadow-rose-900/30"
                    : "bg-amber-600 hover:bg-amber-500 shadow-amber-900/30"
                }`}
              >
                {confirmWorking ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>{confirmWorking ? "처리 중..." : confirmText.confirmLabel}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 비밀번호 초기화 모달 */}
      {pwTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-accent2/10 border border-accent2/20">
                  <KeyRound className="w-5 h-5 text-accent2" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-text">비밀번호 초기화</h3>
                  <p className="text-xs text-text-sub mt-0.5">
                    {pwTarget.display_name} (@{pwTarget.username})
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={pwWorking}
                onClick={closePasswordModal}
                className="p-1 rounded-lg text-text-muted hover:text-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {pwIssued ? (
              // 초기화 성공. 서버가 임시 비밀번호를 저장하지 않으므로 이 화면이 마지막 기회다.
              <>
                <div className="p-3.5 rounded-xl bg-bg border border-emerald-500/30 space-y-2.5">
                  <p className="text-xs text-emerald-400 font-semibold inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    비밀번호가 바뀌었습니다.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 rounded-lg bg-surface2 border border-border text-sm font-mono text-text break-all select-all">
                      {pwIssued}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyPassword}
                      className={BTN_PLAIN}
                      title="클립보드에 복사"
                    >
                      {pwCopied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{pwCopied ? "복사됨" : "복사"}</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold leading-relaxed">
                  이 값을 본인에게 전달하세요. 다시 볼 수 없습니다.
                </div>

                <div className="flex items-center justify-end pt-2">
                  <button
                    type="button"
                    onClick={closePasswordModal}
                    className="px-4 py-2 rounded-xl bg-surface2 hover:bg-surface text-text text-xs font-semibold border border-border transition"
                  >
                    전달했습니다. 닫기
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="p-3.5 rounded-xl bg-bg border border-border space-y-2 text-xs leading-relaxed text-text-sub">
                  <p>
                    임시 비밀번호를 직접 정해주세요. 이메일이 없어 자동으로 알려줄 방법이 없으므로,
                    정한 값을 본인에게 직접 전달해야 합니다.
                  </p>
                  <p className="text-text-muted">{PASSWORD_RULE_TEXT}</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="temp-password" className="text-xs font-semibold text-text-sub">
                    임시 비밀번호
                  </label>
                  <input
                    id="temp-password"
                    type="text"
                    autoComplete="off"
                    value={pwValue}
                    onChange={(e) => {
                      setPwValue(e.target.value);
                      setPwError(null);
                    }}
                    placeholder={`${MIN_PASSWORD_LENGTH}자 이상`}
                    className="w-full px-3 py-2 rounded-xl bg-bg border border-border text-text text-sm font-mono focus:outline-none focus:border-accent2"
                  />
                </div>

                {pwError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
                    {pwError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    disabled={pwWorking}
                    onClick={closePasswordModal}
                    className="px-4 py-2 rounded-xl bg-surface2 hover:bg-surface text-text-sub text-xs font-semibold border border-border transition"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    disabled={pwWorking || pwValue.length < MIN_PASSWORD_LENGTH}
                    onClick={handleResetPassword}
                    className="px-4 py-2 rounded-xl bg-accent2 hover:opacity-90 text-white text-xs font-semibold transition inline-flex items-center gap-1.5 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {pwWorking ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="w-3.5 h-3.5" />
                    )}
                    <span>{pwWorking ? "변경 중..." : "비밀번호 변경"}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
