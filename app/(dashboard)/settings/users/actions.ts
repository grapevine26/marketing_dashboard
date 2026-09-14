"use server";

import { revalidatePath } from "next/cache";
import {
  approveUser,
  blockUser,
  unblockUser,
  setUserRole,
  resetUserPassword,
  deleteUser,
} from "@/lib/auth/users";
import { rotateSignupInviteCode } from "@/lib/auth/settings";
import type { UserRole } from "@/lib/auth/session";
import { type ActionResult, runAdminAction, runOwnerAction } from "@/lib/actions/result";

/**
 * 사용자 관리 서버 액션.
 *
 * 전부 `runAdminAction` 을 거친다. 화면에서 버튼을 숨기는 것만으로는 부족하고,
 * 서버 액션은 화면을 건너뛰고 직접 호출될 수 있어서 여기가 진짜 경계다.
 * 콜백이 받는 값이 현재 관리자이므로 그대로 `actor` 로 넘긴다.
 *
 * "마지막 관리자", "자기 자신" 같은 제한은 `lib/auth/users.ts` 가 ValidationError 로 막는다.
 * 여기서 또 검사하지 않는다. 두 군데에 같은 규칙을 두면 한쪽만 고치는 일이 생긴다.
 * ValidationError 메시지는 runAction 이 그대로 화면에 내려준다.
 */

const USERS_PATH = "/settings/users";

export async function approveUserAction(userId: string): Promise<ActionResult<null>> {
  const res = await runAdminAction(async (admin) => {
    await approveUser(admin, userId);
    return null;
  });
  revalidatePath(USERS_PATH);
  return res;
}

/** 거절은 계정 삭제와 같다. 대기 중인 계정은 남겨둘 이유가 없다. */
export async function rejectUserAction(userId: string): Promise<ActionResult<null>> {
  const res = await runAdminAction(async (admin) => {
    await deleteUser(admin, userId);
    return null;
  });
  revalidatePath(USERS_PATH);
  return res;
}

export async function blockUserAction(userId: string): Promise<ActionResult<null>> {
  const res = await runAdminAction(async (admin) => {
    await blockUser(admin, userId);
    return null;
  });
  revalidatePath(USERS_PATH);
  return res;
}

export async function unblockUserAction(userId: string): Promise<ActionResult<null>> {
  const res = await runAdminAction(async (admin) => {
    await unblockUser(admin, userId);
    return null;
  });
  revalidatePath(USERS_PATH);
  return res;
}

export async function setUserRoleAction(userId: string, role: UserRole): Promise<ActionResult<null>> {
  const res = await runAdminAction(async (admin) => {
    await setUserRole(admin, userId, role);
    return null;
  });
  revalidatePath(USERS_PATH);
  return res;
}

/**
 * 비밀번호 초기화. 이메일이 없어 자동으로 전달할 방법이 없으므로
 * 관리자가 임시 비밀번호를 정하고, 화면에서 한 번 보고 직접 알려준다.
 * 임시값은 서버에 따로 저장하지 않는다.
 */
export async function resetPasswordAction(userId: string, password: string): Promise<ActionResult<null>> {
  const res = await runAdminAction(async (admin) => {
    await resetUserPassword(admin, userId, password);
    return null;
  });
  revalidatePath(USERS_PATH);
  return res;
}

export async function deleteUserAction(userId: string): Promise<ActionResult<null>> {
  const res = await runAdminAction(async (admin) => {
    await deleteUser(admin, userId);
    return null;
  });
  revalidatePath(USERS_PATH);
  return res;
}

/**
 * 가입 초대 코드를 새로 만든다. **대표 관리자만.**
 *
 * 코드를 아는 사람만 가입 신청을 할 수 있으므로, 코드를 바꿀 수 있다는 것은
 * 누구를 들일지 정하는 권한과 같다. 그래서 관리자가 아니라 대표로 좁힌다.
 */
export async function rotateInviteCodeAction(): Promise<ActionResult<{ code: string }>> {
  const res = await runOwnerAction(async (owner) => ({ code: await rotateSignupInviteCode(owner) }));
  revalidatePath(USERS_PATH);
  return res;
}
