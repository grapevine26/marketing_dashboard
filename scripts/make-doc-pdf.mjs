#!/usr/bin/env node
/**
 * docs/ 의 HTML 문서를 PDF 로 만든다.
 *
 *   npm run doc:pdf
 *
 * 문서를 워드로 따로 관리하지 않는 이유: 기록 정책이 바뀌면 코드와 문서가 어긋난다.
 * HTML 을 저장소에 두고 여기서 찍어내면, 문서를 고친 사실이 커밋에 남는다.
 *
 * 테스트에 쓰는 Playwright 의 크로미움으로 인쇄한다. 새 도구를 더 들이지 않는다.
 */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";

const DOCS = [
  { html: "docs/activity-log-guide.html", pdf: "docs/RB-Global-활동기록-안내.pdf" },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const doc of DOCS) {
    const src = path.resolve(doc.html);
    if (!fs.existsSync(src)) {
      console.error(`${doc.html} 이 없습니다.`);
      process.exitCode = 1;
      continue;
    }
    await page.goto(pathToFileURL(src).href, { waitUntil: "networkidle" });
    await page.pdf({
      path: doc.pdf,
      format: "A4",
      printBackground: true,
      // 여백은 HTML 의 @page 가 정한다. 여기서 또 주면 두 번 들어간다.
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate:
        '<div style="width:100%;font-size:7pt;color:#9598a3;padding:0 16mm;text-align:right;font-family:sans-serif">' +
        '<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
    const kb = Math.round(fs.statSync(doc.pdf).size / 1024);
    console.log(`${doc.pdf}  (${kb}KB)`);
  }
} finally {
  await browser.close();
}
