import { describe, it, expect } from "vitest";
import { hasTestDb } from "./test-db";
import {
  normalizeUsername,
  isValidUsername,
  usernameToEmail,
  emailToUsername,
  validatePassword,
  validateDisplayName,
  INTERNAL_EMAIL_DOMAIN,
} from "@/lib/auth/username";
import { ValidationError } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";

/**
 * 아이디는 사용자가 직접 적는 값이고, 그게 곧 Supabase 의 이메일이 된다.
 * 규칙이 느슨하면 이상한 이메일이 만들어지거나 같은 사람이 두 계정을 갖게 된다.
 */
describe("아이디 규칙", () => {
  it("영문 소문자로 시작하는 3~30자만 통과한다", () => {
    expect(isValidUsername("kim")).toBe(true);
    expect(isValidUsername("kim_manager_01")).toBe(true);
    expect(isValidUsername("a".repeat(30))).toBe(true);

    expect(isValidUsername("ab")).toBe(false); // 너무 짧다
    expect(isValidUsername("a".repeat(31))).toBe(false); // 너무 길다
    expect(isValidUsername("1kim")).toBe(false); // 숫자로 시작
    expect(isValidUsername("_kim")).toBe(false); // 밑줄로 시작
    expect(isValidUsername("김매니저")).toBe(false); // 한글
    expect(isValidUsername("kim manager")).toBe(false); // 공백
    expect(isValidUsername("kim@manager")).toBe(false); // 이메일 모양
    expect(isValidUsername("kim.manager")).toBe(false); // 점
  });

  it("대문자로 적어도 같은 계정이 되도록 소문자로 낮춘다", () => {
    expect(normalizeUsername("KimManager")).toBe("kimmanager");
    expect(normalizeUsername("  KIM_01  ")).toBe("kim_01");
  });

  it("규칙에 어긋나면 ValidationError 를 던진다", () => {
    expect(() => normalizeUsername("ab")).toThrow(ValidationError);
    expect(() => normalizeUsername("김매니저")).toThrow(ValidationError);
    expect(() => normalizeUsername(123)).toThrow(ValidationError);
    expect(() => normalizeUsername(null)).toThrow(ValidationError);
  });
});

describe("내부용 이메일 변환", () => {
  it("아이디를 이메일로 바꾸고 되돌린다", () => {
    const email = usernameToEmail("kimmanager");
    expect(email).toBe(`kimmanager@${INTERNAL_EMAIL_DOMAIN}`);
    expect(emailToUsername(email)).toBe("kimmanager");
  });

  it("값이 없으면 빈 문자열이다", () => {
    expect(emailToUsername(null)).toBe("");
    expect(emailToUsername(undefined)).toBe("");
  });
});

describe("비밀번호와 이름", () => {
  it("비밀번호는 8자 이상이어야 한다", () => {
    expect(validatePassword("12345678")).toBe("12345678");
    expect(() => validatePassword("1234567")).toThrow(ValidationError);
    expect(() => validatePassword("")).toThrow(ValidationError);
    expect(() => validatePassword(undefined)).toThrow(ValidationError);
    expect(() => validatePassword("a".repeat(201))).toThrow(ValidationError);
  });

  it("이름은 비어 있을 수 없고 50자 이내다", () => {
    expect(validateDisplayName("  김매니저 ")).toBe("김매니저");
    expect(() => validateDisplayName("   ")).toThrow(ValidationError);
    expect(() => validateDisplayName("가".repeat(51))).toThrow(ValidationError);
  });
});

/**
 * 여기부터는 실제 Supabase 계정을 만들어서 확인한다.
 * 가입 트리거가 프로필을 만들어주는지까지 같이 검증하려면 진짜 경로로 가야 한다.
 */
describe.skipIf(!hasTestDb)("사용자 관리", () => {
  /**
   * 테스트마다 아이디를 다르게 만든다.
   *
   * 테스트 사이에 계정을 지우기는 하지만, 같은 아이디를 곧바로 다시 쓰면 인증 서버의
   * 정리가 끝나기 전에 다음 테스트가 시작해 서로 물린다. 아이디를 겹치지 않게 하면
   * 그 결합 자체가 사라진다.
   */
  let seq = 0;
  const uid = (base: string) => `${base}_${Date.now().toString(36)}_${seq++}`;

  /**
   * 조건이 맞을 때까지 잠깐 기다린다.
   *
   * 계정 생성·삭제는 인증 서버를 거쳐 DB 에 반영되므로, 호출이 끝난 직후에 읽으면
   * 가끔 아직 안 보인다. 실제 사용에서는 사람이 화면을 넘기는 시간이 있어 드러나지 않지만
   * 테스트는 곧바로 읽기 때문에 여기서만 기다려준다.
   */
  async function until<T>(what: string, fn: () => Promise<T | null>, tries = 20): Promise<T> {
    for (let i = 0; i < tries; i++) {
      const value = await fn();
      if (value !== null && value !== undefined) return value;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`기다렸지만 확인되지 않았습니다: ${what}`);
  }

  /** 가입시키고 프로필 id 를 돌려준다. 승인 상태는 pending 으로 시작한다. */
  async function signUp(username: string, displayName: string): Promise<string> {
    const { signUpUser } = await import("@/lib/auth/users");
    const { db } = await import("@/lib/db/client");
    await signUpUser({ username, display_name: displayName, password: "test-password-1234" });
    return until(`프로필 생성(${username})`, async () => {
      const res = await db().from("profiles").select("id").eq("username", username).maybeSingle<{ id: string }>();
      if (res.error) throw new Error(`프로필 조회 실패(${username}): ${res.error.message}`);
      return res.data?.id ?? null;
    });
  }

  async function makeActive(username: string, displayName: string, role: "owner" | "admin" | "staff"): Promise<SessionUser> {
    const { db } = await import("@/lib/db/client");
    const id = await signUp(username, displayName);
    await db().from("profiles").update({ role, status: "active" }).eq("id", id);
    return { id, username, display_name: displayName, role, status: "active" };
  }

  /** 기존 테스트가 쓰는 이름. 대표 관리자를 만든다. */
  async function makeActiveAdmin(username: string, displayName: string): Promise<SessionUser> {
    return makeActive(username, displayName, "owner");
  }

  it("가입하면 트리거가 대기 상태의 프로필을 만든다", async () => {
    const { getUsers, countPendingUsers } = await import("@/lib/auth/users");
    const name = uid("newbie");
    await signUp(name, "신입");

    const users = await getUsers();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ username: name, display_name: "신입", role: "staff", status: "pending" });
    expect(await countPendingUsers()).toBe(1);
  });

  it("같은 아이디로 두 번 가입할 수 없다", async () => {
    const { signUpUser } = await import("@/lib/auth/users");
    const name = uid("taken");
    await signUp(name, "먼저");
    await expect(
      signUpUser({ username: name, display_name: "나중", password: "test-password-1234" })
    ).rejects.toThrow(/이미 쓰이고 있는 아이디/);
  });

  it("승인하면 상태와 승인자가 남고 감사 로그가 기록된다", async () => {
    const { getUsers, approveUser, countPendingUsers } = await import("@/lib/auth/users");
    const { getAuditLogs } = await import("@/lib/db");

    const boss = await makeActiveAdmin(uid("boss"), "관리자");
    const newbieId = await signUp(uid("newbie"), "신입");

    expect(await countPendingUsers()).toBe(1);
    await approveUser(boss, newbieId);
    expect(await countPendingUsers()).toBe(0);

    const newbie = (await getUsers()).find((u) => u.id === newbieId)!;
    expect(newbie.status).toBe("active");
    expect(newbie.approved_at).toBeTruthy();
    expect(newbie.approved_by_name).toBe("관리자");

    const entry = (await getAuditLogs({ limit: 20 })).find((l) => l.action === "user.approved");
    expect(entry).toBeDefined();
    expect(entry!.entity_type).toBe("user");
    expect(entry!.actor_name).toBe("관리자");
  });

  it("차단하면 쓸 수 없는 상태가 되고, 해제하면 돌아온다", async () => {
    const { getUsers, approveUser, blockUser, unblockUser } = await import("@/lib/auth/users");
    const boss = await makeActiveAdmin(uid("boss"), "관리자");
    const staffId = await signUp(uid("staff"), "직원");
    await approveUser(boss, staffId);

    await blockUser(boss, staffId);
    expect((await getUsers()).find((u) => u.id === staffId)!.status).toBe("blocked");

    await unblockUser(boss, staffId);
    expect((await getUsers()).find((u) => u.id === staffId)!.status).toBe("active");
  });

  /**
   * 해제는 두 곳(profiles.status, 인증 쪽 잠금)을 건드리는데 뒤쪽만 실패할 수 있다.
   * 그때 관리자가 화면에서 할 수 있는 일은 [차단 해제]를 한 번 더 누르는 것뿐이다.
   * 전에는 `if (target.status === "active") return;` 이 그 재시도를 통째로 삼켜서
   * 잠금 해제가 다시 나가지도 않았다. 여기서 그 조기 return 이 돌아오는 것을 막는다.
   */
  it("이미 활성인 계정에 차단 해제를 다시 불러도 통과하고, 기록은 한 번만 쌓인다", async () => {
    const { getUsers, approveUser, blockUser, unblockUser } = await import("@/lib/auth/users");
    const { getAuditLogs } = await import("@/lib/db");
    const boss = await makeActiveAdmin(uid("boss"), "관리자");
    const staffId = await signUp(uid("staff"), "직원");
    await approveUser(boss, staffId);
    await blockUser(boss, staffId);

    await unblockUser(boss, staffId);
    expect((await getUsers()).find((u) => u.id === staffId)!.status).toBe("active");

    // 두 번째 호출. 인증 쪽 잠금 해제를 다시 시도하고, 성공했으니 조용히 끝난다.
    await expect(unblockUser(boss, staffId)).resolves.toBeUndefined();
    expect((await getUsers()).find((u) => u.id === staffId)!.status).toBe("active");

    // 다만 DB 쓰기와 감사 로그는 건너뛴다. 같은 줄이 두 번 쌓이면 정작 볼 기록이 묻힌다.
    const unblocks = (await getAuditLogs({ limit: 50 })).filter((l) => l.action === "user.unblocked");
    expect(unblocks).toHaveLength(1);
  });

  it("등급 변경은 대표 관리자만 할 수 있다", async () => {
    const { setUserRole, getUsers } = await import("@/lib/auth/users");
    const owner = await makeActive(uid("owner"), "대표", "owner");
    const admin = await makeActive(uid("admin"), "관리자", "admin");
    const staff = await makeActive(uid("staff"), "직원", "staff");

    // 관리자는 등급을 못 바꾼다.
    await expect(setUserRole(admin, staff.id, "admin")).rejects.toThrow(/대표 관리자만/);

    // 대표는 올리고 내릴 수 있다.
    await setUserRole(owner, staff.id, "admin");
    expect((await getUsers()).find((u) => u.id === staff.id)!.role).toBe("admin");
    await setUserRole(owner, staff.id, "staff");
    expect((await getUsers()).find((u) => u.id === staff.id)!.role).toBe("staff");

    // 대표를 새로 세울 수도 있다.
    await setUserRole(owner, admin.id, "owner");
    expect((await getUsers()).find((u) => u.id === admin.id)!.role).toBe("owner");
  });

  it("관리자는 직원만 관리한다. 대표와 다른 관리자는 건드릴 수 없다", async () => {
    const { blockUser, deleteUser, resetUserPassword, getUsers } = await import("@/lib/auth/users");
    const owner = await makeActive(uid("owner"), "대표", "owner");
    const admin = await makeActive(uid("admin"), "관리자", "admin");
    const other = await makeActive(uid("other"), "다른 관리자", "admin");
    const staff = await makeActive(uid("staff"), "직원", "staff");

    await expect(blockUser(admin, owner.id)).rejects.toThrow(/대표 관리자만/);
    await expect(deleteUser(admin, other.id)).rejects.toThrow(/대표 관리자만/);
    await expect(resetUserPassword(admin, owner.id, "new-password-123")).rejects.toThrow(/대표 관리자만/);

    // 직원은 다룰 수 있다.
    await blockUser(admin, staff.id);
    expect((await getUsers()).find((u) => u.id === staff.id)!.status).toBe("blocked");
  });

  it("마지막 대표 관리자는 내리거나 차단하거나 지울 수 없다", async () => {
    const { setUserRole, blockUser, deleteUser, getUsers } = await import("@/lib/auth/users");
    const first = await makeActive(uid("ownerone"), "대표 하나", "owner");
    const second = await makeActive(uid("ownertwo"), "대표 둘", "owner");

    // 대표가 둘일 때는 서로 내릴 수 있다.
    await setUserRole(first, second.id, "admin");
    expect((await getUsers()).find((u) => u.id === second.id)!.role).toBe("admin");

    // 이제 대표가 하나뿐이다.
    await expect(setUserRole(first, first.id, "admin")).rejects.toThrow(/자기 자신/);
    const stillOwner = { ...second, role: "owner" as const };
    await expect(setUserRole(stillOwner, first.id, "staff")).rejects.toThrow(/마지막 대표 관리자/);
    await expect(blockUser(stillOwner, first.id)).rejects.toThrow(/마지막 대표 관리자/);
    await expect(deleteUser(stillOwner, first.id)).rejects.toThrow(/마지막 대표 관리자/);
  });

  it("자기 자신은 차단·삭제할 수 없다", async () => {
    const { blockUser, deleteUser } = await import("@/lib/auth/users");
    const me = await makeActiveAdmin(uid("me"), "나");
    await makeActiveAdmin(uid("other"), "다른 관리자"); // 마지막 관리자 규칙에 걸리지 않게 한 명 더

    await expect(blockUser(me, me.id)).rejects.toThrow(/자기 자신/);
    await expect(deleteUser(me, me.id)).rejects.toThrow(/자기 자신/);
  });

  it("계정을 지우면 프로필도 사라지지만 감사 로그는 남는다", async () => {
    const { getUsers, deleteUser } = await import("@/lib/auth/users");
    const { getAuditLogs } = await import("@/lib/db");
    const boss = await makeActiveAdmin(uid("boss"), "관리자");
    const goneId = await signUp(uid("gone"), "떠날 사람");

    await deleteUser(boss, goneId);
    await until("프로필 삭제", async () => ((await getUsers()).some((u) => u.id === goneId) ? null : true));
    expect((await getUsers()).some((u) => u.id === goneId)).toBe(false);

    const entry = (await getAuditLogs({ limit: 20 })).find((l) => l.action === "user.deleted");
    expect(entry).toBeDefined();
    expect(entry!.summary).toContain("떠날 사람");
  });

  it("비밀번호를 초기화하면 새 비밀번호로 바뀐다", async () => {
    const { resetUserPassword } = await import("@/lib/auth/users");
    const boss = await makeActiveAdmin(uid("boss"), "관리자");
    const name = uid("forgetful");
    const userId = await signUp(name, "깜빡이");

    await resetUserPassword(boss, userId, "brand-new-password");

    // 실제로 바뀌었는지는 그 비밀번호로 로그인해서 확인한다.
    //
    // 로그인은 반드시 **따로 만든 클라이언트**로 해야 한다. 공용 관리자 클라이언트로 로그인하면
    // 그 클라이언트의 인증 토큰이 로그인한 사용자 것으로 바뀌고, 그 뒤의 모든 조회가 그 권한으로
    // 나가면서 RLS 에 막힌다. 실제로 뒤따르는 테스트들이 조용히 깨졌다.
    const { createClient } = await import("@supabase/supabase-js");
    const throwaway = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await throwaway.auth.signInWithPassword({
      email: usernameToEmail(name),
      password: "brand-new-password",
    });
    expect(error).toBeNull();
    expect(data.user?.id).toBe(userId);

    await expect(resetUserPassword(boss, userId, "short")).rejects.toThrow(ValidationError);
  });

  it("본인은 자기 이름을 바꿀 수 있다. 등급과 무관하다", async () => {
    const { updateMyDisplayName } = await import("@/lib/auth/profile");
    const { getUsers } = await import("@/lib/auth/users");
    const staff = await makeActive(uid("namer"), "옛 이름", "staff");

    await updateMyDisplayName(staff, "  새 이름  ");
    expect((await getUsers()).find((u) => u.id === staff.id)!.display_name).toBe("새 이름");

    await expect(updateMyDisplayName(staff, "   ")).rejects.toThrow(ValidationError);
    await expect(updateMyDisplayName(staff, "가".repeat(51))).rejects.toThrow(ValidationError);
  });

  it("비밀번호 변경은 현재 비밀번호를 맞혀야 한다", async () => {
    const { changeMyPassword } = await import("@/lib/auth/profile");
    const { createClient } = await import("@supabase/supabase-js");
    const name = uid("pwchanger");
    const me = await makeActive(name, "비번 주인", "staff");

    // 틀린 현재 비밀번호는 막힌다. 로그인한 브라우저를 빌린 사람이 계정을 가져가지 못하게 한다.
    await expect(changeMyPassword(me, "wrong-password", "brand-new-pass-1")).rejects.toThrow(/현재 비밀번호/);
    // 같은 값으로는 못 바꾼다.
    await expect(changeMyPassword(me, "test-password-1234", "test-password-1234")).rejects.toThrow(/다른 것으로/);
    // 너무 짧아도 막힌다.
    await expect(changeMyPassword(me, "test-password-1234", "short")).rejects.toThrow(ValidationError);

    await changeMyPassword(me, "test-password-1234", "brand-new-pass-1");

    const fresh = () =>
      createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    const oldTry = await fresh().auth.signInWithPassword({
      email: usernameToEmail(name),
      password: "test-password-1234",
    });
    expect(oldTry.error).not.toBeNull();
    const newTry = await fresh().auth.signInWithPassword({
      email: usernameToEmail(name),
      password: "brand-new-pass-1",
    });
    expect(newTry.error).toBeNull();
  });

  it("숨긴 계정은 목록과 대기자 수에서 빠지되 권한은 그대로다", async () => {
    const { getUsers, countPendingUsers, approveUser } = await import("@/lib/auth/users");
    const { db } = await import("@/lib/db/client");

    const owner = await makeActive(uid("visible"), "보이는 대표", "owner");
    const hidden = await makeActive(uid("maint"), "유지보수", "owner");
    const waiting = await signUp(uid("waiting"), "대기자");

    expect((await getUsers()).length).toBe(3);
    expect(await countPendingUsers()).toBe(1);

    await db().from("profiles").update({ hidden: true }).eq("id", hidden.id);

    // 목록에서 빠진다.
    const visible = await getUsers();
    expect(visible.some((u) => u.id === hidden.id)).toBe(false);
    expect(visible.length).toBe(2);

    // 권한은 그대로다. 숨긴 계정도 승인할 수 있다.
    await approveUser(hidden, waiting);
    expect((await getUsers()).find((u) => u.id === waiting)!.status).toBe("active");
    expect(await countPendingUsers()).toBe(0);

    // 승인자 이름은 숨긴 계정이라도 제대로 붙는다.
    expect((await getUsers()).find((u) => u.id === waiting)!.approved_by_name).toBe("유지보수");

    // 마지막 대표 보호에도 그대로 들어간다. 대표가 둘이므로 하나는 내릴 수 있다.
    const { setUserRole } = await import("@/lib/auth/users");
    await setUserRole(hidden, owner.id, "admin");
    expect((await getUsers()).find((u) => u.id === owner.id)!.role).toBe("admin");
  });

  it("숨긴 대기자는 배지에 세지 않는다", async () => {
    const { countPendingUsers } = await import("@/lib/auth/users");
    const { db } = await import("@/lib/db/client");
    const id = await signUp(uid("hiddenwait"), "숨은 대기자");
    expect(await countPendingUsers()).toBe(1);
    await db().from("profiles").update({ hidden: true }).eq("id", id);
    expect(await countPendingUsers()).toBe(0);
  });

  it("직원을 한 번에 대표 관리자로 올릴 수 있다", async () => {
    const { setUserRole, getUsers } = await import("@/lib/auth/users");
    const owner = await makeActive(uid("boss"), "대표", "owner");
    const staff = await makeActive(uid("newbie"), "직원", "staff");

    // 관리자를 거치지 않고 바로 올라간다.
    await setUserRole(owner, staff.id, "owner");
    expect((await getUsers()).find((u) => u.id === staff.id)!.role).toBe("owner");

    // 한 번에 직원으로 내릴 수도 있다.
    await setUserRole(owner, staff.id, "staff");
    expect((await getUsers()).find((u) => u.id === staff.id)!.role).toBe("staff");
  });

  it("차단과 삭제는 다르다. 차단은 되돌아오고 삭제는 계정이 사라진다", async () => {
    const { blockUser, unblockUser, deleteUser, getUsers, approveUser } = await import("@/lib/auth/users");
    const { getAuditLogs } = await import("@/lib/db");
    const owner = await makeActive(uid("boss"), "대표", "owner");

    // 차단: 계정은 남고 상태만 바뀐다. 되돌리면 그대로 돌아온다.
    const blockedName = uid("blocked");
    const blocked = await makeActive(blockedName, "차단될 사람", "staff");
    await blockUser(owner, blocked.id);
    const afterBlock = (await getUsers()).find((u) => u.id === blocked.id)!;
    expect(afterBlock.status).toBe("blocked");
    expect(afterBlock.display_name).toBe("차단될 사람");
    await unblockUser(owner, blocked.id);
    expect((await getUsers()).find((u) => u.id === blocked.id)!.status).toBe("active");

    // 삭제: 계정 자체가 사라진다.
    const goneName = uid("gone");
    const goneId = await signUp(goneName, "지워질 사람");
    await approveUser(owner, goneId);
    await deleteUser(owner, goneId);
    expect((await getUsers()).some((u) => u.id === goneId)).toBe(false);

    // 지운 아이디는 다시 쓸 수 있다. 차단은 그렇지 않다.
    const { signUpUser } = await import("@/lib/auth/users");
    await expect(signUpUser({ username: goneName, display_name: "새 사람", password: "test-password-1234" }))
      .resolves.toMatchObject({ username: goneName });
    await expect(signUpUser({ username: blockedName, display_name: "겹침", password: "test-password-1234" }))
      .rejects.toThrow(/이미 쓰이고 있는 아이디/);

    // 기록은 둘 다 남는다.
    const actions = (await getAuditLogs({ limit: 50 })).map((l) => l.action);
    expect(actions).toContain("user.blocked");
    expect(actions).toContain("user.deleted");
  });

  it("없는 사용자에게는 아무 동작도 하지 않는다", async () => {
    const { approveUser } = await import("@/lib/auth/users");
    const boss = await makeActiveAdmin(uid("boss"), "관리자");
    await expect(approveUser(boss, "없는-id")).rejects.toThrow(/찾을 수 없습니다/);
    await expect(approveUser(boss, "eeeeeeee-0000-4000-8000-000000000009")).rejects.toThrow(/찾을 수 없습니다/);
  });
});

describe("화면 접근 등급", () => {
  it("활동 기록은 대표 관리자만, 사용자 관리는 관리자까지 본다", async () => {
    const { isManager, isOwner } = await import("@/lib/auth/roles");

    // 사용자 관리
    expect(isManager("owner")).toBe(true);
    expect(isManager("admin")).toBe(true);
    expect(isManager("staff")).toBe(false);

    // 활동 기록. 관리자에게 열려 있으면 안 된다.
    expect(isOwner("owner")).toBe(true);
    expect(isOwner("admin")).toBe(false);
    expect(isOwner("staff")).toBe(false);
  });

  it("활동 기록 화면은 대표 관리자 전용 가드를 쓴다", async () => {
    // 가드를 requireAdmin 으로 되돌리면 관리자도 보게 된다. 그 실수를 여기서 잡는다.
    const { readFileSync } = await import("node:fs");
    const page = readFileSync("app/(dashboard)/settings/activity/page.tsx", "utf8");
    expect(page).toContain("requireOwner()");
    expect(page).not.toContain("requireAdmin()");
  });
});

describe("라우트 핸들러 인증", () => {
  it("모든 route.ts 가 자체 인증 또는 토큰·시크릿 검사를 가진다", async () => {
    // 프록시는 쿠키 유무만 보고, 레이아웃은 route.ts 를 감싸지 않는다.
    // 그래서 route.ts 는 파일 안에서 직접 막아야 한다. 새 라우트를 만들며 잊는 것을 여기서 잡는다.
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const routes: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name === "route.ts") routes.push(p);
      }
    };
    walk("app");
    expect(routes.length).toBeGreaterThan(5);

    const unguarded = routes.filter((p) => {
      const src = readFileSync(p, "utf8");
      const guarded =
        src.includes("requireApiUser()") ||
        src.includes("CRON_SECRET") ||
        // 미디어 조회는 첨부가 속한 계정의 공유 토큰으로 막는다
        (p.includes("media") && src.includes("token"));
      return !guarded;
    });
    expect(unguarded).toEqual([]);
  });
});

describe.skipIf(!hasTestDb)("로그인 시도 제한", () => {
  it("실패가 상한에 닿으면 잠기고, 성공하면 기록이 지워진다", async () => {
    const { hitThrottle, isThrottled, clearThrottle } = await import("@/lib/security/throttle");
    const key = `login:throttle_${Date.now().toString(36)}`;
    const policy = { maxHits: 3, windowMs: 60_000, lockMs: 60_000 };

    expect(await isThrottled([key])).toBe(false);
    expect(await hitThrottle(key, policy)).toBe(false);
    expect(await hitThrottle(key, policy)).toBe(false);
    expect(await isThrottled([key])).toBe(false);

    // 세 번째에서 상한에 닿는다.
    expect(await hitThrottle(key, policy)).toBe(true);
    expect(await isThrottled([key])).toBe(true);

    // 로그인에 성공하면 그 아이디의 기록만 지운다.
    await clearThrottle(key);
    expect(await isThrottled([key])).toBe(false);
  });

  it("창이 지나면 처음부터 다시 센다", async () => {
    const { hitThrottle, isThrottled } = await import("@/lib/security/throttle");
    const key = `login:window_${Date.now().toString(36)}`;
    // 창이 0ms 라 매 호출이 새 창이다. 상한이 2여도 영원히 잠기지 않는다.
    const policy = { maxHits: 2, windowMs: 0, lockMs: 60_000 };
    for (let i = 0; i < 5; i++) await hitThrottle(key, policy);
    expect(await isThrottled([key])).toBe(false);
  });
});

describe.skipIf(!hasTestDb)("가입 초대 링크", () => {
  /**
   * 초대 행은 발급자를 profiles 로 참조한다. 발급자가 실재하지 않으면 만들 수 없다.
   * 그래서 테스트마다 진짜 대표 계정을 하나 만든다. 가짜 id 로는 이 경로를 확인할 수 없다.
   */
  let seq = 0;
  async function makeOwner(): Promise<SessionUser> {
    const { signUpUser } = await import("@/lib/auth/users");
    const { db } = await import("@/lib/db/client");
    const username = `inv_boss_${Date.now().toString(36)}_${seq++}`;
    await signUpUser({ username, display_name: "대표", password: "test-password-1234" });
    for (let i = 0; i < 20; i++) {
      const res = await db().from("profiles").select("id").eq("username", username).maybeSingle<{ id: string }>();
      if (res.data?.id) {
        await db().from("profiles").update({ role: "owner", status: "active" }).eq("id", res.data.id);
        return { id: res.data.id, username, display_name: "대표", role: "owner", status: "active" };
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("대표 계정을 만들지 못했습니다.");
  }

  /** 관리자 등급은 초대를 만들기 전에 막히므로 실제 계정이 필요 없다. */
  const admin: SessionUser = {
    id: "00000000-0000-4000-8000-000000000002",
    username: "manager",
    display_name: "관리자",
    role: "admin",
    status: "active",
  };

  it("링크가 없으면 아무도 가입할 수 없다", async () => {
    const { peekSignupInvite } = await import("@/lib/auth/invites");
    // 테스트마다 DB 를 비우므로 이 시점에는 초대가 하나도 없다. 그게 기본 상태다.
    expect(await peekSignupInvite("아무거나")).toBeNull();
    expect(await peekSignupInvite("")).toBeNull();
  });

  it("대표 관리자가 만든 링크만 열리고, 한 번 쓰면 죽는다", async () => {
    const { createSignupInvite, peekSignupInvite, consumeSignupInvite } = await import("@/lib/auth/invites");
    const owner = await makeOwner();

    const invite = await createSignupInvite(owner, "김담당");
    expect(invite.label).toBe("김담당");
    // 주소에 그대로 들어가는 값이라 추측이 어려워야 한다. 192비트면 base64url 로 32자다.
    expect(invite.token.length).toBeGreaterThanOrEqual(32);

    // 열어 보는 것만으로는 죽지 않는다. 새로고침 한 번에 가입을 못 하게 되면 안 된다.
    expect(await peekSignupInvite(invite.token)).not.toBeNull();
    expect(await peekSignupInvite(invite.token)).not.toBeNull();

    // 계정이 만들어지는 순간 소모된다.
    expect(await consumeSignupInvite(invite.token, "kimdamdang")).toBe(true);
    expect(await peekSignupInvite(invite.token)).toBeNull();

    // 두 번째는 실패한다. 전달받은 사람이 또 써도 열리지 않는다는 뜻이다.
    expect(await consumeSignupInvite(invite.token, "someoneelse")).toBe(false);
  });

  it("링크마다 값이 다르고, 하나를 써도 다른 링크는 살아 있다", async () => {
    const { createSignupInvite, consumeSignupInvite, peekSignupInvite, listOpenInvites } =
      await import("@/lib/auth/invites");
    const owner = await makeOwner();

    const a = await createSignupInvite(owner, "가");
    const b = await createSignupInvite(owner, "나");
    expect(a.token).not.toBe(b.token);
    expect((await listOpenInvites()).length).toBe(2);

    await consumeSignupInvite(a.token, "personA");
    expect(await peekSignupInvite(b.token)).not.toBeNull();
    const open = await listOpenInvites();
    expect(open.map((i) => i.label)).toEqual(["나"]);
  });

  it("기한이 지난 링크는 열리지 않는다", async () => {
    const { createSignupInvite, peekSignupInvite, consumeSignupInvite } = await import("@/lib/auth/invites");
    const { db } = await import("@/lib/db/client");
    const owner = await makeOwner();

    const invite = await createSignupInvite(owner, "늦은사람");
    // 기한만 과거로 돌린다. 시간을 기다리지 않고 만료 동작을 확인한다.
    await db()
      .from("signup_invites")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("token", invite.token);

    expect(await peekSignupInvite(invite.token)).toBeNull();
    expect(await consumeSignupInvite(invite.token, "toolate")).toBe(false);
  });

  it("회수하면 그 자리에서 쓸 수 없게 된다", async () => {
    const { createSignupInvite, revokeSignupInvite, peekSignupInvite } = await import("@/lib/auth/invites");
    const owner = await makeOwner();
    const invite = await createSignupInvite(owner, "취소할사람");
    await revokeSignupInvite(owner, invite.token);
    expect(await peekSignupInvite(invite.token)).toBeNull();
    // 이미 없는 링크를 또 회수하려 하면 알려준다.
    await expect(revokeSignupInvite(owner, invite.token)).rejects.toThrow(/이미 사용했거나 없는/);
  });

  it("관리자는 링크를 만들거나 회수할 수 없다", async () => {
    const { createSignupInvite, revokeSignupInvite } = await import("@/lib/auth/invites");
    await expect(createSignupInvite(admin, "몰래")).rejects.toThrow(/대표 관리자만/);
    await expect(revokeSignupInvite(admin, "아무토큰")).rejects.toThrow(/대표 관리자만/);
  });
});

describe.skipIf(!hasTestDb)("차단은 인증 쪽 계정까지 잠근다", () => {
  const PASSWORD = "test-password-1234";

  /** 실제로 로그인이 되는지 본다. 공용 클라이언트를 쓰면 그 권한이 바뀌므로 매번 새로 만든다. */
  async function canSignIn(username: string): Promise<boolean> {
    const { createClient } = await import("@supabase/supabase-js");
    const { usernameToEmail } = await import("@/lib/auth/username");
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("테스트 환경변수가 없습니다.");
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await client.auth.signInWithPassword({
      email: usernameToEmail(username),
      password: PASSWORD,
    });
    return !error;
  }

  it("차단하면 로그인 자체가 막히고, 해제하면 다시 된다", async () => {
    const { signUpUser, blockUser, unblockUser } = await import("@/lib/auth/users");
    const { db } = await import("@/lib/db/client");

    const stamp = Date.now().toString(36);
    const bossName = `ban_boss_${stamp}`;
    const targetName = `ban_target_${stamp}`;

    for (const [username, display] of [[bossName, "대표"], [targetName, "직원"]] as const) {
      await signUpUser({ username, display_name: display, password: PASSWORD });
    }
    const idOf = async (username: string): Promise<string> => {
      for (let i = 0; i < 20; i++) {
        const res = await db().from("profiles").select("id").eq("username", username).maybeSingle<{ id: string }>();
        if (res.data?.id) return res.data.id;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`프로필을 찾지 못했습니다: ${username}`);
    };
    const bossId = await idOf(bossName);
    const targetId = await idOf(targetName);
    await db().from("profiles").update({ role: "owner", status: "active" }).eq("id", bossId);
    await db().from("profiles").update({ status: "active" }).eq("id", targetId);

    const boss: SessionUser = {
      id: bossId, username: bossName, display_name: "대표", role: "owner", status: "active",
    };

    // 차단 전에는 로그인이 된다.
    expect(await canSignIn(targetName)).toBe(true);

    // 차단하면 profiles 뿐 아니라 인증 쪽 계정도 잠겨 로그인이 막힌다.
    // 이게 막히지 않으면, 이미 로그인해 둔 브라우저의 세션도 살아 있다는 뜻이다.
    await blockUser(boss, targetId);
    expect(await canSignIn(targetName)).toBe(false);

    // 해제하면 잠금도 함께 풀린다.
    await unblockUser(boss, targetId);
    expect(await canSignIn(targetName)).toBe(true);
  }, 30_000);

  /**
   * 해제가 반쪽만 성공한 상태에서 복구되는지 본다.
   *
   * 실제로는 인증 서버 호출이 실패해서 생긴다. 테스트에서 그 실패를 만들 수는 없으므로
   * **결과 상태를 직접 만든다**: 차단해서 잠금을 걸어 둔 뒤 profiles.status 만 active 로
   * 되돌린다. 그러면 화면에는 멀쩡한 활성 계정인데 당사자는 로그인을 못 하는, 바로 그 상태가 된다.
   *
   * 관리자에게 남은 유일한 수단은 [차단 해제]를 다시 누르는 것이다. 그게 통해야 한다.
   */
  it("상태만 활성이고 잠금이 남아 있어도 차단 해제를 다시 부르면 로그인이 돌아온다", async () => {
    const { signUpUser, blockUser, unblockUser } = await import("@/lib/auth/users");
    const { db } = await import("@/lib/db/client");

    const stamp = Date.now().toString(36);
    const bossName = `half_boss_${stamp}`;
    const targetName = `half_target_${stamp}`;
    for (const [username, display] of [[bossName, "대표"], [targetName, "직원"]] as const) {
      await signUpUser({ username, display_name: display, password: PASSWORD });
    }
    const idOf = async (username: string): Promise<string> => {
      for (let i = 0; i < 20; i++) {
        const res = await db().from("profiles").select("id").eq("username", username).maybeSingle<{ id: string }>();
        if (res.data?.id) return res.data.id;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`프로필을 찾지 못했습니다: ${username}`);
    };
    const bossId = await idOf(bossName);
    const targetId = await idOf(targetName);
    await db().from("profiles").update({ role: "owner", status: "active" }).eq("id", bossId);
    await db().from("profiles").update({ status: "active" }).eq("id", targetId);

    const boss: SessionUser = {
      id: bossId, username: bossName, display_name: "대표", role: "owner", status: "active",
    };

    // 차단해서 인증 쪽 잠금을 실제로 걸어 둔다.
    await blockUser(boss, targetId);
    expect(await canSignIn(targetName)).toBe(false);

    // 반쪽 성공 상태를 만든다: DB 는 활성인데 잠금은 그대로다.
    await db().from("profiles").update({ status: "active" }).eq("id", targetId);
    expect(await canSignIn(targetName)).toBe(false);

    // 관리자가 [차단 해제]를 한 번 더 누른다. 조기 return 이 있으면 여기서 아무 일도 안 일어나
    // 아래 단언이 false 로 남는다.
    await unblockUser(boss, targetId);
    expect(await canSignIn(targetName)).toBe(true);
  }, 30_000);
});

describe.skipIf(!hasTestDb)("동시 저장", () => {
  it("먼저 저장한 사람의 운영안을 덮어쓰지 않는다", async () => {
    const { createCampaign } = await import("@/lib/db/campaigns");
    const { createEvent, saveEventPlan } = await import("@/lib/db/events");
    const { OPTIMISTIC_LOCK_CONFLICT_MESSAGE } = await import("@/lib/db/optimistic-lock");
    const { BUILTIN_EVENT_TEMPLATE_ID } = await import("@/lib/db/defaults");

    const campaign = await createCampaign({ name: "동시저장 캠페인", company_name: "브랜드", campaign_type: "shipping" });
    const event = await createEvent({
      campaign_id: campaign.id, name: "행사", event_at: null, venue: null, memo: null,
    });

    // 두 사람이 같은 화면을 열었다. 둘 다 이 시각을 들고 있다.
    const first = await saveEventPlan({
      event_id: event.id, template_id: BUILTIN_EVENT_TEMPLATE_ID, field_values: { intro: "처음" },
    });
    const openedAt = first.updated_at;

    // 먼저 저장한 사람.
    const second = await saveEventPlan({
      event_id: event.id, template_id: BUILTIN_EVENT_TEMPLATE_ID, field_values: { intro: "먼저 저장" },
      expected_updated_at: openedAt,
    });
    expect(second.field_values.intro).toBe("먼저 저장");

    // 뒤늦게 저장하는 사람은 옛 시각을 들고 있어 거부된다.
    await expect(
      saveEventPlan({
        event_id: event.id, template_id: BUILTIN_EVENT_TEMPLATE_ID, field_values: { intro: "덮어쓰기" },
        expected_updated_at: openedAt,
      })
    ).rejects.toThrow(OPTIMISTIC_LOCK_CONFLICT_MESSAGE);

    // 먼저 저장한 내용이 그대로 남아 있다.
    const { getEventPlan } = await import("@/lib/db/events");
    const now = await getEventPlan(event.id);
    expect(now?.field_values.intro).toBe("먼저 저장");

    // 기준 시각을 아예 안 보내도 거부한다.
    //
    // 전에는 "옛 화면 하위 호환" 이라며 그냥 덮어쓰게 두었는데, 운영안이 아직 없는 행사를 둘이
    // 같이 열면 양쪽 다 기준 시각이 비어 있어서 뒤에 저장한 사람이 앞사람 것을 조용히 지웠다.
    // 옛 화면은 존재하지 않으므로 지킬 하위 호환도 없다.
    await expect(
      saveEventPlan({
        event_id: event.id, template_id: BUILTIN_EVENT_TEMPLATE_ID, field_values: { intro: "기준 없이" },
      })
    ).rejects.toThrow(OPTIMISTIC_LOCK_CONFLICT_MESSAGE);

    // 먼저 저장한 내용이 그대로다.
    const still = await getEventPlan(event.id);
    expect(still?.field_values.intro).toBe("먼저 저장");
  }, 30_000);
});
