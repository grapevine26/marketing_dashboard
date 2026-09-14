"use server";

import { queryAuditLogs, type AuditLogFilter } from "@/lib/db/audit";
import { ActionResult, runAdminAction } from "@/lib/actions/result";
import type { AuditLogEntry } from "@/lib/db/types";

/**
 * 활동 기록 조회. 관리자만 부를 수 있다.
 *
 * 로그에는 누가 무엇을 바꿨는지, 계정 승인·차단 같은 민감한 기록까지 들어 있어
 * `runAdminAction` 으로 막는다. 화면에서 메뉴를 숨기는 것만으로는 부족하다.
 */
export async function fetchActivityAction(filter: AuditLogFilter): Promise<
  ActionResult<{ rows: AuditLogEntry[]; hasMore: boolean }>
> {
  return runAdminAction(async () => {
    return queryAuditLogs({
      entity_types: filter.entity_types,
      actor_types: filter.actor_types,
      since: filter.since,
      search: filter.search,
      limit: filter.limit ?? 50,
      offset: filter.offset ?? 0,
    });
  });
}
