import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { fillTemplate, generateDefaultPptBuffer, extractPlaceholders, buildTableFrame } from "@/lib/ppt/engine";

async function buildFixture(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`
  );
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`
  );
  const sp = (id: number, text: string) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Box ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="1828800"/><a:ext cx="9144000" cy="3657600"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="ko-KR"/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>${sp(2, "{{제목}}")}${sp(3, "{{표:목록}}")}${sp(4, "{{차트:성과}}")}</p:spTree></p:cSld></p:sld>`
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("PPT 표/차트 삽입", () => {
  it("표 플레이스홀더 도형이 표 graphicFrame으로 바뀐다", async () => {
    const out = await fillTemplate(await buildFixture(), { 제목: "T" }, {
      tables: { "표:목록": { headers: ["이름", "값"], rows: [["A", "1"], ["B & C", "2"]] } },
    });
    const zip = await JSZip.loadAsync(out);
    const xml = await zip.file("ppt/slides/slide1.xml")!.async("text");
    expect(xml).not.toContain("{{표:목록}}");
    expect(xml).toContain('uri="http://schemas.openxmlformats.org/drawingml/2006/table"');
    expect(xml).toContain("<a:t>B &amp; C</a:t>");
    expect(xml).toContain("<a:t>T</a:t>");
    // 원래 도형 위치를 그대로 쓴다
    expect(xml).toContain('<a:off x="914400" y="1828800"/>');
  });

  it("차트 플레이스홀더는 네이티브 차트 파트로 이식되고 rels/content-types가 갱신된다", async () => {
    const out = await fillTemplate(await buildFixture(), {}, {
      charts: { "차트:성과": { categories: ["A", "B"], series: [{ name: "조회수", values: [10, 20] }] } },
    });
    const zip = await JSZip.loadAsync(out);
    const xml = await zip.file("ppt/slides/slide1.xml")!.async("text");
    expect(xml).not.toContain("{{차트:성과}}");
    expect(xml).toContain('uri="http://schemas.openxmlformats.org/drawingml/2006/chart"');
    expect(xml).toMatch(/r:id="rIdChartMm\d+"/);
    expect(zip.file("ppt/charts/chartMm1.xml")).not.toBeNull();
    expect(zip.file("ppt/charts/_rels/chartMm1.xml.rels")).not.toBeNull();
    expect(zip.file("ppt/embeddings/Microsoft_Excel_Worksheet_Mm1.xlsx")).not.toBeNull();
    const rels = await zip.file("ppt/slides/_rels/slide1.xml.rels")!.async("text");
    expect(rels).toContain("relationships/chart");
    expect(rels).toContain("../charts/chartMm1.xml");
    const ct = await zip.file("[Content_Types].xml")!.async("text");
    expect(ct).toContain('PartName="/ppt/charts/chartMm1.xml"');
    expect(ct).toContain('Extension="xlsx"');
  }, 20000);

  it("데이터가 없으면 안내 문구로 대체된다", async () => {
    const out = await fillTemplate(await buildFixture(), {}, {
      tables: { "표:목록": { headers: ["이름"], rows: [] } },
      charts: { "차트:성과": { categories: [], series: [] } },
    });
    const xml = await (await JSZip.loadAsync(out)).file("ppt/slides/slide1.xml")!.async("text");
    expect(xml).not.toContain("{{");
    expect((xml.match(/표시할 데이터가 없습니다/g) || []).length).toBe(2);
  });

  it("행이 넘치면 마지막 행에 안내를 넣고 잘라낸다", () => {
    const rows = Array.from({ length: 40 }, (_, i) => [`행${i}`, "1"]);
    const xml = buildTableFrame(
      { headers: ["이름", "값"], rows, overflowLabel: (n) => `외 ${n}명` },
      { x: 0, y: 0, cx: 9144000, cy: 3657600 },
      5
    );
    expect(xml).toMatch(/외 \d+명/);
    expect(xml).not.toContain("행39");
  });

  it("내장 보고서 템플릿은 표·차트 플레이스홀더를 갖는다", async () => {
    const phs = await extractPlaceholders(await generateDefaultPptBuffer("report"));
    expect(phs).toContain("표:인플루언서");
    expect(phs).toContain("차트:성과");
    expect(phs).toContain("보고서제목");
    expect(phs).toContain("총평");
  }, 20000);
});
