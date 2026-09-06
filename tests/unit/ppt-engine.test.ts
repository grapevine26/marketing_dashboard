import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { extractPlaceholders, fillTemplate, fillParagraph, escapeXml, generateDefaultPptBuffer } from "@/lib/ppt/engine";

/** 최소 pptx 픽스처: 슬라이드 1장, 런이 쪼개진 플레이스홀더 + 미디어 파일 포함 */
async function buildFixture(slideXmlBody: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`);
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>${slideXmlBody}</p:spTree></p:cSld></p:sld>`
  );
  zip.file("ppt/media/image1.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return zip.generateAsync({ type: "nodebuffer" });
}

const SPLIT_RUN_PARAGRAPH =
  `<a:p><a:r><a:rPr lang="ko-KR" b="1"/><a:t>브랜드: {{</a:t></a:r><a:r><a:rPr lang="ko-KR"/><a:t>브랜드명</a:t></a:r><a:r><a:rPr lang="ko-KR"/><a:t>}} 런칭</a:t></a:r></a:p>`;
const SIMPLE_PARAGRAPH = `<a:p><a:r><a:rPr lang="ko-KR"/><a:t>{{행사명}}</a:t></a:r></a:p>`;
const PLAIN_PARAGRAPH = `<a:p><a:r><a:rPr lang="ko-KR"/><a:t>그대로 유지</a:t></a:r></a:p>`;

async function slideXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file("ppt/slides/slide1.xml")!.async("text");
}

describe("PPT 엔진", () => {
  it("런이 쪼개진 플레이스홀더도 추출한다", async () => {
    const buf = await buildFixture(`<p:sp><p:txBody>${SPLIT_RUN_PARAGRAPH}${SIMPLE_PARAGRAPH}${PLAIN_PARAGRAPH}</p:txBody></p:sp>`);
    expect(await extractPlaceholders(buf)).toEqual(["브랜드명", "행사명"]);
  });

  it("런 경계를 넘는 플레이스홀더를 치환하고 나머지 런은 비운다", async () => {
    const buf = await buildFixture(`<p:sp><p:txBody>${SPLIT_RUN_PARAGRAPH}${SIMPLE_PARAGRAPH}${PLAIN_PARAGRAPH}</p:txBody></p:sp>`);
    const out = await fillTemplate(buf, { 브랜드명: "글로우랩", 행사명: "VIP 나잇" });
    const xml = await slideXml(out);
    expect(xml).not.toContain("{{");
    expect(xml).toContain("<a:t>브랜드: 글로우랩 런칭</a:t>");
    expect(xml).toContain("<a:t>VIP 나잇</a:t>");
    expect(xml).toContain("<a:t>그대로 유지</a:t>");
    // 첫 런의 서식(b="1")이 유지된다
    expect(xml).toContain(`<a:rPr lang="ko-KR" b="1"/><a:t>브랜드: 글로우랩 런칭</a:t>`);
  });

  it("값이 없는 플레이스홀더는 빈 문자열로 치환한다", async () => {
    const buf = await buildFixture(`<p:sp><p:txBody>${SIMPLE_PARAGRAPH}</p:txBody></p:sp>`);
    const xml = await slideXml(await fillTemplate(buf, {}));
    expect(xml).toContain("<a:t></a:t>");
    expect(xml).not.toContain("{{");
  });

  it("XML 특수문자를 이스케이프한다", async () => {
    const buf = await buildFixture(`<p:sp><p:txBody>${SIMPLE_PARAGRAPH}</p:txBody></p:sp>`);
    const xml = await slideXml(await fillTemplate(buf, { 행사명: `A & B <C> "D"` }));
    expect(xml).toContain("A &amp; B &lt;C&gt; &quot;D&quot;");
    expect(escapeXml("'")).toBe("&apos;");
  });

  it("값 안의 줄바꿈은 <a:br>로 바꾸고 서식을 복사한다", () => {
    const out = fillParagraph(SIMPLE_PARAGRAPH, { 행사명: "1행\n2행\n3행" });
    expect(out).toBe(
      `<a:p><a:r><a:rPr lang="ko-KR"/><a:t>1행</a:t></a:r><a:br><a:rPr lang="ko-KR"/></a:br><a:r><a:rPr lang="ko-KR"/><a:t>2행</a:t></a:r><a:br><a:rPr lang="ko-KR"/></a:br><a:r><a:rPr lang="ko-KR"/><a:t>3행</a:t></a:r></a:p>`
    );
    expect(out).not.toMatch(/<a:t>[^<]*\n[^<]*<\/a:t>/);
  });

  it("출력물은 유효한 ZIP이고 ppt/media가 보존된다", async () => {
    const buf = await buildFixture(`<p:sp><p:txBody>${SIMPLE_PARAGRAPH}</p:txBody></p:sp>`);
    const out = await fillTemplate(buf, { 행사명: "x" });
    expect(out.subarray(0, 2).toString("latin1")).toBe("PK");
    const zip = await JSZip.loadAsync(out);
    expect(zip.file("ppt/media/image1.png")).not.toBeNull();
  });

  it("내장 기본 템플릿은 정해진 플레이스홀더를 갖는다", async () => {
    const evt = await extractPlaceholders(await generateDefaultPptBuffer("event"));
    expect(evt).toEqual(["브랜드명", "프로그램", "행사개요", "행사명", "행사일시", "행사장소"].sort());
    const sns = await extractPlaceholders(await generateDefaultPptBuffer("sns"));
    expect(sns).toEqual(["계약기간", "브랜드명", "운영목표", "월별계획", "채널명", "콘텐츠방향성", "타겟오디언스"].sort());
  }, 20000);
});
