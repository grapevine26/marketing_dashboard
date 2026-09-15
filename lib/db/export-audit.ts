import { insertAuditLog } from "./audit";

/**
 * 광고주가 공유 링크로 파일을 받아간 사실을 활동 기록에 남긴다.
 *
 * **남기는 것은 "언제, 무엇을, 몇 건" 뿐이다. 누구인지는 남기지 않는다.**
 * 광고주는 계정이 없어 링크만 들고 온다. IP 를 적어도 같은 사람이 회사 PC·노트북·폰에서
 * 받으면 서로 다른 값이 되고, 같은 사무실의 다른 사람은 같은 값이 된다. 즉 IP 로도
 * "누구" 는 알 수 없다. 알 수 없는 것을 적으려고 개인정보를 하나 더 모으지 않는다.
 *
 * 그래서 이 기록의 쓸모는 **"평소와 다른가"** 다. 하루 두어 번이 정상인데 새벽에 수십 번
 * 찍혀 있으면 링크가 샌 것이고, 그때 토큰을 재발급하면 옛 링크가 즉시 죽는다.
 * 사고가 났을 때 "언제부터 몇 건이 나갔나" 를 말할 수 있는 근거이기도 하다.
 *
 * 기록에 실패해도 내려받기는 그대로 진행한다. 로그 때문에 광고주가 파일을 못 받으면
 * 원래 막으려던 것보다 큰 문제가 된다.
 */
export async function logCompanyExport(params: {
  campaignId: string;
  /** 사람이 읽을 이름. "지원자 명단", "배송/방문 관리시트" 처럼. */
  what: string;
  /** 파일 형식. csv | xlsx */
  format: string;
  /** 파일에 담긴 행 수. */
  rows: number;
}): Promise<void> {
  try {
    await insertAuditLog({
      campaign_id: params.campaignId,
      entity_type: "campaign",
      entity_id: params.campaignId,
      action: "company.exported",
      actor_type: "company",
      summary: `광고주가 공유 링크로 ${params.what}을(를) 내려받았습니다. (${params.rows}건, ${params.format})`,
      details: { what: params.what, format: params.format, rows: params.rows },
    });
  } catch {
    /* 기록은 부가 기능이다. 내려받기를 막지 않는다. */
  }
}
