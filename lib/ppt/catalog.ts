import type { PptTemplateKind } from "@/lib/db/types";
import { CHART_PREFIX, TABLE_PREFIX, marker } from "./markers";

/**
 * 템플릿에 넣을 수 있는 **표·차트 목록**.
 *
 * 자유 입력칸(`{{항목명}}`)과 달리 이것들은 값을 사람이 쓰지 않는다. 내보낼 때 앱이 그
 * 자리의 도형을 지우고 데이터를 그려 넣는다. 그래서 **이름이 정해져 있어야** 하고,
 * 그 이름을 담당자가 알 수 있어야 한다 — 이 목록이 템플릿 업로드 화면에 그대로 뜬다.
 *
 * **이 파일은 브라우저에도 간다.** 무거운 것을 import 하지 말 것(그래서 마커 상수를
 * `markers.ts` 로 따로 뺐다. engine.ts 를 가져오면 JSZip 이 번들에 딸려온다).
 *
 * 새 표를 더할 때는 두 곳을 같이 고쳐야 한다 — 여기(이름과 설명)와 `extras.ts`(실제 데이터).
 * 한쪽만 고치면 화면에는 있는데 안 채워지거나, 채워지는데 아무도 모르는 표가 된다.
 * `tests/unit/ppt_catalog.test.ts` 가 둘이 어긋나면 실패한다.
 */
export interface CatalogEntry {
  /** 슬라이드에 그대로 적는 값. 예: `{{표:초청명단}}` */
  marker: string;
  /** 표인가 차트인가. 화면에서 아이콘을 가른다. */
  shape: "table" | "chart";
  /** 무엇이 들어가는지. 담당자가 이것만 보고 고를 수 있어야 한다. */
  columns: string;
  /** 알아야 할 것이 있으면. 없으면 비운다. */
  note?: string;
}

const t = (name: string, columns: string, note?: string): CatalogEntry => ({
  marker: marker(TABLE_PREFIX, name),
  shape: "table",
  columns,
  note,
});
const c = (name: string, columns: string, note?: string): CatalogEntry => ({
  marker: marker(CHART_PREFIX, name),
  shape: "chart",
  columns,
  note,
});

export const PPT_CATALOG: Record<PptTemplateKind, CatalogEntry[]> = {
  event: [
    t("초청명단", "이름 · SNS 계정 · RSVP · 당일 참석", "연락처는 들어가지 않습니다. 광고주에게 나갈 수 있는 문서입니다."),
    t("체크리스트", "준비 항목 · 담당자 · 마감일 · 완료 여부"),
  ],
  sns: [
    t("콘텐츠", "발행 예정일 · 제목 · 상태 · 담당자"),
    c("월별성과", "월별 게시 건수와 조회수", "발행 예정일 기준입니다. 계정 화면의 월별 성과와 같은 기준입니다."),
  ],
  report: [
    t("인플루언서", "이름 · SNS 계정 · 진행 단계 · 업로드 링크 · 조회수 · 인게이지먼트"),
    c("성과", "조회수 상위 10명의 조회수·인게이지먼트 막대 차트"),
  ],
};

/** 그 종류에서 쓸 수 있는 마커인가. 화면 안내와 테스트가 쓴다. */
export function catalogFor(kind: PptTemplateKind): CatalogEntry[] {
  return PPT_CATALOG[kind] ?? [];
}
