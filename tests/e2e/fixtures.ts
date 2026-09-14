import fs from "fs";
import type { APIRequestContext, Browser, BrowserContext, Page, PlaywrightWorkerArgs } from "@playwright/test";
import { BASE_URL, SEED_FILE } from "./env";
import type { SeedData } from "./global-setup";

/**
 * global-setup.ts 가 시드한 데이터의 id·토큰. 매 실행마다 새로 만들어지므로 항상 존재한다.
 * 값은 tests/e2e/.auth/seed.json 에서 읽는다 (global-setup 이 spec 보다 먼저 쓴다).
 */
function readSeed(): SeedData {
  try {
    return JSON.parse(fs.readFileSync(SEED_FILE, "utf-8")) as SeedData;
  } catch (err) {
    throw new Error(
      `${SEED_FILE} 을 읽을 수 없습니다. globalSetup 이 먼저 돌아야 합니다 (npx playwright test 로 실행하세요). ${String(err)}`
    );
  }
}

export const SAMPLE: SeedData = readSeed();

export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/**
 * 로그인 쿠키가 없는 상태.
 *
 * 기본 설정(playwright.config.ts)은 모든 spec 을 e2e_owner 로 로그인시킨다. 공개 링크는
 * 로그인 없이 열려야 하는 것이 핵심이므로, 그 검증만큼은 쿠키를 지우고 해야 한다.
 * 로그인한 채로 열면 프록시를 통과해 버려서 "로그인 없이도 열린다"를 확인하지 못한다.
 *
 *   test.describe(..., () => { test.use({ storageState: NO_AUTH }); ... })
 */
export const NO_AUTH: { cookies: []; origins: [] } = { cookies: [], origins: [] };

/** 로그인하지 않은 브라우저 컨텍스트. 한 테스트 안에서 대시보드와 공개 링크를 함께 볼 때 쓴다. */
export async function newPublicContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
}

/** 로그인하지 않은 HTTP 클라이언트. 공개 CSV·파일 응답을 확인할 때 쓴다. */
export async function newPublicRequest(playwright: PlaywrightWorkerArgs["playwright"]): Promise<APIRequestContext> {
  return playwright.request.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
}

/**
 * 제목으로 카드 하나를 집는다.
 *
 * 카드 테두리는 화면 폭에 따라 달라진다(`rounded-2xl sm:rounded-3xl`). `div.rounded-3xl` 로
 * 집으면 데스크톱에서만 붙는 `sm:rounded-3xl` 은 클래스 이름이 달라 하나도 잡히지 않는다.
 * 그래서 클래스 문자열에 rounded-3xl 이 들어가는 div 중 그 제목을 품은 것을 쓴다.
 */
export function contentCard(page: Page, title: string) {
  return page
    .locator('div[class*="rounded-3xl"]')
    .filter({ has: page.getByRole("heading", { name: title }) })
    .last();
}

/**
 * 서버 액션이 끝날 때까지 기다리며 동작을 실행한다.
 *
 * 화면은 대부분 낙관적으로 먼저 바뀐다(버튼을 누르는 순간 상태가 바뀐 것처럼 보인다).
 * 그래서 화면만 보고 바로 다른 주소로 넘어가면, 아직 끝나지 않은 서버 저장이 끊겨
 * DB 에는 반영되지 않는다. Next 서버 액션 요청에는 `next-action` 헤더가 붙으므로
 * 그 응답을 기다린다.
 */
export async function withServerAction<T>(page: Page, action: () => Promise<T>): Promise<T> {
  const [, result] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"])),
    action(),
  ]);
  return result;
}

/**
 * 오늘(KST)에서 N일 뒤 날짜(YYYY-MM-DD).
 *
 * 테스트에 날짜를 고정해 적으면 그 날이 지나는 순간 D-day 검증이 조용히 깨진다.
 * 화면이 KST 로 그리는지 보려는 것이므로 기준일도 KST 로 잡는다.
 */
export function kstPlusDays(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 폼의 required 입력을 한 번에 채운다. 공개 폼은 필수 문항이 여러 개라 하나만 채우면 제출되지 않는다. */
export async function fillAllRequiredTextareas(page: Page, value: string): Promise<number> {
  const boxes = page.locator("textarea[required]");
  const n = await boxes.count();
  for (let i = 0; i < n; i++) {
    await boxes.nth(i).fill(i === 0 ? value : `${value} (${i + 1})`);
  }
  return n;
}
