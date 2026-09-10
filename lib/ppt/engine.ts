import JSZip from "jszip";
import pptxgen from "pptxgenjs";
import { buildChartParts, ChartSpec } from "./chart";

export type { ChartSpec } from "./chart";

export function escapeXml(unsafe: string): string {
  if (!unsafe) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const PLACEHOLDER_RE = /\{\{([^}]+)\}\}/g;
const SLIDE_FILE_RE = /^ppt\/slides\/slide(\d+)\.xml$/;
const EMU_PER_INCH = 914400;

/** 표 플레이스홀더: `{{표:이름}}`, 차트 플레이스홀더: `{{차트:이름}}` */
export const TABLE_PREFIX = "표:";
export const CHART_PREFIX = "차트:";

export interface TableSpec {
  headers: string[];
  rows: string[][];
  /** 열 너비 비율 (없으면 균등) */
  colWeights?: number[];
  /** 잘린 행이 있을 때 마지막 행에 넣을 안내 (기본: "외 N건") */
  overflowLabel?: (hidden: number) => string;
}

export interface FillOptions {
  tables?: Record<string, TableSpec>;
  charts?: Record<string, ChartSpec>;
}

function slideFiles(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((name) => SLIDE_FILE_RE.test(name))
    .sort((a, b) => Number(a.match(SLIDE_FILE_RE)![1]) - Number(b.match(SLIDE_FILE_RE)![1]));
}

function paragraphText(paragraphXml: string): string {
  const textRegex = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g;
  let m: RegExpExecArray | null;
  let out = "";
  while ((m = textRegex.exec(paragraphXml)) !== null) out += m[1];
  return out;
}

/** 도형(<p:sp>) 전체의 텍스트 — 문단 경계는 \n */
function shapeText(shapeXml: string): string {
  const paragraphRegex = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
  const parts: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = paragraphRegex.exec(shapeXml)) !== null) parts.push(paragraphText(m[1]));
  return parts.join("\n");
}

/**
 * PowerPoint XML의 <a:p> 문단 단위로 런(<a:t>)들을 이어붙여 {{...}} 플레이스홀더를 추출합니다.
 * ({{ 와 }} 가 서로 다른 런에 걸쳐 있어도 감지됩니다.)
 */
export async function extractPlaceholders(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  const placeholders = new Set<string>();

  for (const filePath of slideFiles(zip)) {
    const file = zip.files[filePath];
    if (!file) continue;
    const xml = await file.async("text");
    const paragraphRegex = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
    let pMatch: RegExpExecArray | null;
    while ((pMatch = paragraphRegex.exec(xml)) !== null) {
      const text = paragraphText(pMatch[1]);
      let phMatch: RegExpExecArray | null;
      PLACEHOLDER_RE.lastIndex = 0;
      while ((phMatch = PLACEHOLDER_RE.exec(text)) !== null) {
        const phName = phMatch[1].trim();
        if (phName) placeholders.add(phName);
      }
    }
  }

  return Array.from(placeholders).sort();
}

/**
 * 문단 XML 하나를 치환한다.
 * - 문단 안의 모든 런 텍스트를 이어붙여 치환한 뒤, 첫 번째 텍스트 런에 결과를 쓰고 나머지 런은 비운다.
 * - 값 안의 줄바꿈(\n)은 PowerPoint가 인식하는 <a:br/>로 바꾼다. (raw LF는 줄바꿈으로 렌더링되지 않음)
 * - 첫 런의 서식(<a:rPr>)을 줄바꿈 뒤 런에도 그대로 복사한다.
 */
export function fillParagraph(paragraphXml: string, values: Record<string, string>): string {
  const fullText = paragraphText(paragraphXml);
  PLACEHOLDER_RE.lastIndex = 0;
  if (!PLACEHOLDER_RE.test(fullText)) return paragraphXml;

  const replaced = fullText.replace(PLACEHOLDER_RE, (_, key: string) => {
    const val = values[key.trim()];
    return escapeXml(val !== undefined && val !== null ? String(val) : "");
  });
  const lines = replaced.split(/\r?\n/);

  const runRegex = /<a:r>([\s\S]*?)<\/a:r>/g;
  let first = true;
  let usedRun = false;

  let result = paragraphXml.replace(runRegex, (runXml, inner: string) => {
    if (!/<a:t\b/.test(runXml)) return runXml;
    if (!first) {
      return runXml.replace(/<a:t\b([^>]*)>[\s\S]*?<\/a:t>/g, "<a:t$1></a:t>");
    }
    first = false;
    usedRun = true;
    const rPrMatch = inner.match(/<a:rPr\b[^>]*\/>|<a:rPr\b[^>]*>[\s\S]*?<\/a:rPr>/);
    const rPr = rPrMatch ? rPrMatch[0] : "";
    const tAttrs = (inner.match(/<a:t\b([^>]*)>/) || [])[1] || "";
    const runs = lines.map((line) => `<a:r>${rPr}<a:t${tAttrs}>${line}</a:t></a:r>`);
    const br = rPr ? `<a:br>${rPr}</a:br>` : "<a:br/>";
    return runs.join(br);
  });

  if (!usedRun) {
    let firstT = true;
    result = paragraphXml.replace(/<a:t\b([^>]*)>[\s\S]*?<\/a:t>/g, (_m, attrs: string) => {
      if (firstT) {
        firstT = false;
        return `<a:t${attrs}>${lines.join(" ")}</a:t>`;
      }
      return `<a:t${attrs}></a:t>`;
    });
  }
  return result;
}

// ---------- 표 / 차트 삽입 ----------

interface Box {
  x: number;
  y: number;
  cx: number;
  cy: number;
}

const DEFAULT_BOX: Box = { x: Math.round(0.75 * EMU_PER_INCH), y: Math.round(1.4 * EMU_PER_INCH), cx: Math.round(11.8 * EMU_PER_INCH), cy: Math.round(5.4 * EMU_PER_INCH) };

function shapeBox(shapeXml: string): Box {
  const m = shapeXml.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>/);
  if (!m) return DEFAULT_BOX;
  const box = { x: Number(m[1]), y: Number(m[2]), cx: Number(m[3]), cy: Number(m[4]) };
  if (box.cx < EMU_PER_INCH || box.cy < EMU_PER_INCH / 2) return DEFAULT_BOX;
  return box;
}

function nextShapeId(slideXml: string): number {
  let max = 1;
  const re = /<p:cNvPr\b[^>]*\bid="(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slideXml)) !== null) max = Math.max(max, Number(m[1]));
  return max + 1;
}

function tableCell(text: string, opts: { header?: boolean; align?: "l" | "r" | "ctr" }): string {
  const fill = opts.header ? "E2E8F0" : "FFFFFF";
  const color = opts.header ? "0F172A" : "1E293B";
  const line = (tag: string) => `<a:${tag} w="6350"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:${tag}>`;
  return (
    `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="${opts.align || "l"}"/>` +
    `<a:r><a:rPr lang="ko-KR" sz="1100" b="${opts.header ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr>` +
    `<a:t>${escapeXml(text)}</a:t></a:r></a:p></a:txBody>` +
    `<a:tcPr marL="54864" marR="54864" marT="27432" marB="27432">${line("lnL")}${line("lnR")}${line("lnT")}${line("lnB")}` +
    `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></a:tcPr></a:tc>`
  );
}

/** `<p:sp>` 자리에 들어갈 표 graphicFrame XML */
export function buildTableFrame(spec: TableSpec, box: Box, id: number): string {
  const cols = spec.headers.length;
  const weights = spec.colWeights && spec.colWeights.length === cols ? spec.colWeights : Array(cols).fill(1);
  const totalW = weights.reduce((a, b) => a + b, 0);
  const colWidths = weights.map((w) => Math.floor((box.cx * w) / totalW));

  const headerH = Math.round(0.42 * EMU_PER_INCH);
  const rowH = Math.round(0.36 * EMU_PER_INCH);
  const maxRows = Math.max(1, Math.floor((box.cy - headerH) / rowH));
  let rows = spec.rows;
  if (rows.length > maxRows) {
    const hidden = rows.length - (maxRows - 1);
    const label = spec.overflowLabel ? spec.overflowLabel(hidden) : `외 ${hidden}건`;
    rows = [...rows.slice(0, maxRows - 1), [label, ...Array(cols - 1).fill("")]];
  }

  const numeric = (s: string) => /^[\d,.]+\s*[가-힣%]*$/.test(s.trim()) && s.trim() !== "" && s.trim() !== "-";
  const headerRow = `<a:tr h="${headerH}">${spec.headers.map((h) => tableCell(h, { header: true })).join("")}</a:tr>`;
  const bodyRows = rows
    .map((r) => `<a:tr h="${rowH}">${spec.headers.map((_, i) => tableCell(r[i] ?? "", { align: numeric(r[i] ?? "") ? "r" : "l" })).join("")}</a:tr>`)
    .join("");

  return (
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/>` +
    `<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${headerH + rowH * rows.length}"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/>` +
    `<a:tblGrid>${colWidths.map((w) => `<a:gridCol w="${w}"/>`).join("")}</a:tblGrid>${headerRow}${bodyRows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
  );
}

function buildChartFrame(box: Box, id: number, relId: string): string {
  return (
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Chart ${id}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">` +
    `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${relId}"/>` +
    `</a:graphicData></a:graphic></p:graphicFrame>`
  );
}

function buildTextFrame(text: string, box: Box, id: number): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Note ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${Math.round(0.6 * EMU_PER_INCH)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:r><a:rPr lang="ko-KR" sz="1200"><a:solidFill><a:srgbClr val="94A3B8"/></a:solidFill></a:rPr><a:t>${escapeXml(text)}</a:t></a:r></a:p></p:txBody></p:sp>`
  );
}

function ensureContentType(ctXml: string, opts: { defaultExt?: [string, string]; override?: [string, string] }): string {
  let out = ctXml;
  if (opts.defaultExt && !new RegExp(`<Default Extension="${opts.defaultExt[0]}"`).test(out)) {
    out = out.replace("</Types>", `<Default Extension="${opts.defaultExt[0]}" ContentType="${opts.defaultExt[1]}"/></Types>`);
  }
  if (opts.override && !out.includes(`PartName="${opts.override[0]}"`)) {
    out = out.replace("</Types>", `<Override PartName="${opts.override[0]}" ContentType="${opts.override[1]}"/></Types>`);
  }
  return out;
}

/**
 * 런 분할(<a:t>) 문제를 해결하며 플레이스홀더를 치환하는 PPT 템플릿 채우기 엔진.
 * `{{표:이름}}` / `{{차트:이름}}` 텍스트가 든 도형은 options.tables / options.charts 로 넘긴 표·네이티브 차트로 교체된다.
 */
export async function fillTemplate(
  buffer: Buffer,
  values: Record<string, string>,
  options: FillOptions = {}
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const tables = options.tables || {};
  const charts = options.charts || {};
  let chartCounter = Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart[^/]*\.xml$/.test(n)).length;
  let contentTypes = (await zip.file("[Content_Types].xml")?.async("text")) || "";

  for (const filePath of slideFiles(zip)) {
    const file = zip.files[filePath];
    if (!file) continue;
    let xml = await file.async("text");
    const slideNum = filePath.match(SLIDE_FILE_RE)![1];
    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
    let rels = (await zip.file(relsPath)?.async("text")) || null;
    let nextId = nextShapeId(xml);
    const pendingCharts: { key: string; box: Box; relId: string }[] = [];

    // 1) 표/차트 도형 교체
    xml = xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/g, (shapeXml) => {
      const text = shapeText(shapeXml);
      const marker = text.match(/\{\{\s*((?:표|차트):[^}]+?)\s*\}\}/);
      if (!marker) return shapeXml;
      const key = marker[1].trim();
      const box = shapeBox(shapeXml);
      const id = nextId++;
      if (key.startsWith(TABLE_PREFIX)) {
        const spec = tables[key];
        if (!spec) return buildTextFrame("", box, id);
        if (spec.rows.length === 0) return buildTextFrame("표시할 데이터가 없습니다.", box, id);
        return buildTableFrame(spec, box, id);
      }
      const spec = charts[key];
      if (!spec || spec.categories.length === 0) return buildTextFrame("표시할 데이터가 없습니다.", box, id);
      chartCounter += 1;
      const relId = `rIdChartMm${chartCounter}`;
      pendingCharts.push({ key, box, relId });
      return buildChartFrame(box, id, relId);
    });

    // 2) 차트 파트 이식
    for (let i = 0; i < pendingCharts.length; i++) {
      const { key, box, relId } = pendingCharts[i];
      const n = chartCounter - pendingCharts.length + 1 + i;
      const parts = await buildChartParts(charts[key], box.cx, box.cy);
      const chartPart = `ppt/charts/chartMm${n}.xml`;
      const embeddingPart = `ppt/embeddings/Microsoft_Excel_Worksheet_Mm${n}.xlsx`;
      zip.file(chartPart, parts.chartXml);
      if (parts.embeddingData) {
        zip.file(embeddingPart, parts.embeddingData);
        zip.file(
          `ppt/charts/_rels/chartMm${n}.xml.rels`,
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="../embeddings/Microsoft_Excel_Worksheet_Mm${n}.xlsx"/></Relationships>`
        );
        contentTypes = ensureContentType(contentTypes, { defaultExt: ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"] });
      }
      contentTypes = ensureContentType(contentTypes, { override: [`/${chartPart}`, "application/vnd.openxmlformats-officedocument.drawingml.chart+xml"] });
      const relXml = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chartMm${n}.xml"/>`;
      rels = rels
        ? rels.replace("</Relationships>", `${relXml}</Relationships>`)
        : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relXml}</Relationships>`;
    }
    if (pendingCharts.length > 0 && rels) zip.file(relsPath, rels);

    // 3) 텍스트 치환
    const replaced = xml.replace(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/g, (paragraphXml) => fillParagraph(paragraphXml, values));
    zip.file(filePath, replaced);
  }

  if (contentTypes) zip.file("[Content_Types].xml", contentTypes);
  return await zip.generateAsync({ type: "nodebuffer" });
}

// ---------- 내장 기본 템플릿 ----------

export type BuiltinKind = "event" | "sns" | "report";

/**
 * 시스템 기본 내장 PPT 템플릿 생성기 (kind: event | sns | report)
 * - event / sns: 세련된 딥 네이비 슬레이트 바탕의 다크 에디토리얼 테마 & 2단 분할 카드 레이아웃
 * - report: 광고주 임원 보고용 프리미엄 오프화이트 & 코발트 블루 대시보드 테마
 */
export async function generateDefaultPptBuffer(kind: BuiltinKind): Promise<Buffer> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";

  const fontKo = "Malgun Gothic";

  if (kind === "event") {
    // [EVENT OPERATION PLAN] - Deep Midnight Obsidian Theme
    const bgDark = "0B0F17";
    const cardBg = "161F30";
    const cardBorder = "22324D";

    // Slide 1: Cover
    const slide1 = pptx.addSlide();
    slide1.background = { color: bgDark };

    slide1.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 1.4, w: 2.6, h: 0.36, fill: { color: "0D9488" }, rectRadius: 0.18 });
    slide1.addText("EVENT OPERATION PLAN", { x: 0.8, y: 1.4, w: 2.6, h: 0.36, fontSize: 10, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontKo });

    slide1.addText("{{브랜드명}} VIP INFLUENCER EVENT", { x: 0.8, y: 1.95, w: 11.7, h: 0.4, fontSize: 13, bold: true, color: "38BDF8", fontFace: fontKo });
    slide1.addText("{{행사명}}", { x: 0.8, y: 2.45, w: 11.7, h: 1.6, fontSize: 32, bold: true, color: "FFFFFF", valign: "middle", fontFace: fontKo });

    slide1.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 4.4, w: 11.7, h: 1.2, fill: { color: cardBg }, line: { color: cardBorder, width: 1 }, rectRadius: 0.1 });
    slide1.addText("행사 일시   |   {{행사일시}}", { x: 1.2, y: 4.6, w: 5.4, h: 0.8, fontSize: 13, color: "E2E8F0", bold: true, valign: "middle", fontFace: fontKo });
    slide1.addText("개최 장소   |   {{행사장소}}", { x: 6.8, y: 4.6, w: 5.4, h: 0.8, fontSize: 13, color: "E2E8F0", bold: true, valign: "middle", fontFace: fontKo });

    slide1.addText("CONFIDENTIAL  |  PREPARED BY INFLUENCER MARKETING TEAM", { x: 0.8, y: 6.6, w: 11.7, h: 0.3, fontSize: 10, color: "475569", fontFace: fontKo });

    // Slide 2: Overview & Direction
    const slide2 = pptx.addSlide();
    slide2.background = { color: bgDark };

    slide2.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 0.5, w: 2.2, h: 0.3, fill: { color: "0284C7" }, rectRadius: 0.15 });
    slide2.addText("01. CONCEPT", { x: 0.8, y: 0.5, w: 2.2, h: 0.3, fontSize: 10, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontKo });
    slide2.addText("행사 개요 및 핵심 기획 의도", { x: 0.8, y: 0.9, w: 11.7, h: 0.5, fontSize: 22, bold: true, color: "FFFFFF", fontFace: fontKo });
    slide2.addText("브랜드 메시지 전달과 VIP 인플루언서 경험 극대화를 위한 종합 기획 방향", { x: 0.8, y: 1.4, w: 11.7, h: 0.3, fontSize: 11, color: "94A3B8", fontFace: fontKo });

    // Left Card: Concept & Message
    slide2.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 1.9, w: 5.7, h: 5.0, fill: { color: cardBg }, line: { color: cardBorder, width: 1 }, rectRadius: 0.1 });
    slide2.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 1.9, w: 5.7, h: 0.6, fill: { color: "0369A1" }, rectRadius: 0.1 });
    slide2.addText("■ 행사 기획 방향 & 콘셉트 요약", { x: 1.1, y: 1.9, w: 5.1, h: 0.6, fontSize: 12, bold: true, color: "FFFFFF", valign: "middle", fontFace: fontKo });
    slide2.addText("{{행사개요}}", { x: 1.1, y: 2.7, w: 5.1, h: 4.0, fontSize: 13, color: "F1F5F9", lineSpacing: 24, valign: "top", fontFace: fontKo });

    // Right Card: Basic info
    slide2.addShape(pptx.ShapeType.roundRect, { x: 6.8, y: 1.9, w: 5.7, h: 5.0, fill: { color: cardBg }, line: { color: cardBorder, width: 1 }, rectRadius: 0.1 });
    slide2.addShape(pptx.ShapeType.roundRect, { x: 6.8, y: 1.9, w: 5.7, h: 0.6, fill: { color: "0F766E" }, rectRadius: 0.1 });
    slide2.addText("■ 행사 기본 정보 & 체크포인트", { x: 7.1, y: 1.9, w: 5.1, h: 0.6, fontSize: 12, bold: true, color: "FFFFFF", valign: "middle", fontFace: fontKo });

    slide2.addShape(pptx.ShapeType.roundRect, { x: 7.1, y: 2.7, w: 5.1, h: 1.1, fill: { color: bgDark }, line: { color: "1E293B", width: 1 }, rectRadius: 0.08 });
    slide2.addText("행사 일시", { x: 7.3, y: 2.8, w: 4.7, h: 0.3, fontSize: 10, color: "38BDF8", bold: true, fontFace: fontKo });
    slide2.addText("{{행사일시}}", { x: 7.3, y: 3.1, w: 4.7, h: 0.6, fontSize: 13, color: "FFFFFF", bold: true, fontFace: fontKo });

    slide2.addShape(pptx.ShapeType.roundRect, { x: 7.1, y: 4.0, w: 5.1, h: 1.1, fill: { color: bgDark }, line: { color: "1E293B", width: 1 }, rectRadius: 0.08 });
    slide2.addText("개최 장소", { x: 7.3, y: 4.1, w: 4.7, h: 0.3, fontSize: 10, color: "14B8A6", bold: true, fontFace: fontKo });
    slide2.addText("{{행사장소}}", { x: 7.3, y: 4.4, w: 4.7, h: 0.6, fontSize: 13, color: "FFFFFF", bold: true, fontFace: fontKo });

    slide2.addShape(pptx.ShapeType.roundRect, { x: 7.1, y: 5.3, w: 5.1, h: 1.3, fill: { color: bgDark }, line: { color: "1E293B", width: 1 }, rectRadius: 0.08 });
    slide2.addText("주최 브랜드", { x: 7.3, y: 5.4, w: 4.7, h: 0.3, fontSize: 10, color: "F59E0B", bold: true, fontFace: fontKo });
    slide2.addText("{{브랜드명}} 공식 주최 행사", { x: 7.3, y: 5.7, w: 4.7, h: 0.7, fontSize: 12, color: "E2E8F0", fontFace: fontKo });

    // Slide 3: Program Timetable
    const slide3 = pptx.addSlide();
    slide3.background = { color: bgDark };

    slide3.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 0.5, w: 2.2, h: 0.3, fill: { color: "6366F1" }, rectRadius: 0.15 });
    slide3.addText("02. TIMETABLE", { x: 0.8, y: 0.5, w: 2.2, h: 0.3, fontSize: 10, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontKo });
    slide3.addText("주요 프로그램 & VIP 세션 타임테이블", { x: 0.8, y: 0.9, w: 11.7, h: 0.5, fontSize: 22, bold: true, color: "FFFFFF", fontFace: fontKo });
    slide3.addText("시간대별 행사 진행 순서 및 현장 참여 인터랙션 계획", { x: 0.8, y: 1.4, w: 11.7, h: 0.3, fontSize: 11, color: "94A3B8", fontFace: fontKo });

    slide3.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 1.9, w: 11.7, h: 5.0, fill: { color: cardBg }, line: { color: cardBorder, width: 1 }, rectRadius: 0.1 });
    slide3.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 1.9, w: 11.7, h: 0.6, fill: { color: "4F46E5" }, rectRadius: 0.1 });
    slide3.addText("■ 상세 타임라인 및 세션별 운영 계획", { x: 1.1, y: 1.9, w: 11.1, h: 0.6, fontSize: 12, bold: true, color: "FFFFFF", valign: "middle", fontFace: fontKo });
    slide3.addText("{{프로그램}}", { x: 1.2, y: 2.7, w: 10.9, h: 4.0, fontSize: 13, color: "F1F5F9", lineSpacing: 24, valign: "top", fontFace: fontKo });
  } else if (kind === "sns") {
    // [SNS OPERATION STRATEGY] - Tech Midnight Navy Theme
    const bgDark = "0A0E1A";
    const cardBg = "141C2E";
    const cardBorder = "1F2D4A";

    // Slide 1: Cover
    const slide1 = pptx.addSlide();
    slide1.background = { color: bgDark };

    slide1.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 1.4, w: 2.6, h: 0.36, fill: { color: "0284C7" }, rectRadius: 0.18 });
    slide1.addText("SNS STRATEGY PROPOSAL", { x: 0.8, y: 1.4, w: 2.6, h: 0.36, fontSize: 10, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontKo });

    slide1.addText("{{브랜드명}} 공식 소셜 미디어 채널 육성 및 콘텐츠 전략", { x: 0.8, y: 1.95, w: 11.7, h: 0.4, fontSize: 13, bold: true, color: "38BDF8", fontFace: fontKo });
    slide1.addText("{{브랜드명}} 공식 SNS 운영 제안서", { x: 0.8, y: 2.45, w: 11.7, h: 1.6, fontSize: 32, bold: true, color: "FFFFFF", valign: "middle", fontFace: fontKo });

    slide1.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 4.4, w: 11.7, h: 1.2, fill: { color: cardBg }, line: { color: cardBorder, width: 1 }, rectRadius: 0.1 });
    slide1.addText("운영 채널   |   {{채널명}}", { x: 1.2, y: 4.6, w: 5.4, h: 0.8, fontSize: 13, color: "E2E8F0", bold: true, valign: "middle", fontFace: fontKo });
    slide1.addText("계약 기간   |   {{계약기간}}", { x: 6.8, y: 4.6, w: 5.4, h: 0.8, fontSize: 13, color: "E2E8F0", bold: true, valign: "middle", fontFace: fontKo });

    slide1.addText("CONFIDENTIAL  |  PREPARED BY SOCIAL MEDIA MARKETING AGENCY", { x: 0.8, y: 6.6, w: 11.7, h: 0.3, fontSize: 10, color: "475569", fontFace: fontKo });

    // Slide 2: Goals & Target Audience
    const slide2 = pptx.addSlide();
    slide2.background = { color: bgDark };

    slide2.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 0.5, w: 2.2, h: 0.3, fill: { color: "0284C7" }, rectRadius: 0.15 });
    slide2.addText("01. STRATEGY", { x: 0.8, y: 0.5, w: 2.2, h: 0.3, fontSize: 10, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontKo });
    slide2.addText("운영 목표 및 핵심 타겟 오디언스 정의", { x: 0.8, y: 0.9, w: 11.7, h: 0.5, fontSize: 22, bold: true, color: "FFFFFF", fontFace: fontKo });
    slide2.addText("채널 성장 KPI 지표 수립 및 타겟 고객 페르소나 분석", { x: 0.8, y: 1.4, w: 11.7, h: 0.3, fontSize: 11, color: "94A3B8", fontFace: fontKo });

    // Left Card (Goals)
    slide2.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 1.9, w: 5.7, h: 5.0, fill: { color: cardBg }, line: { color: cardBorder, width: 1 }, rectRadius: 0.1 });
    slide2.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 1.9, w: 5.7, h: 0.6, fill: { color: "0369A1" }, rectRadius: 0.1 });
    slide2.addText("■ 정량/정성 운영 목표 & KPI", { x: 1.1, y: 1.9, w: 5.1, h: 0.6, fontSize: 12, bold: true, color: "FFFFFF", valign: "middle", fontFace: fontKo });
    slide2.addText("{{운영목표}}", { x: 1.1, y: 2.7, w: 5.1, h: 4.0, fontSize: 13, color: "F1F5F9", lineSpacing: 24, valign: "top", fontFace: fontKo });

    // Right Card (Target Audience)
    slide2.addShape(pptx.ShapeType.roundRect, { x: 6.8, y: 1.9, w: 5.7, h: 5.0, fill: { color: cardBg }, line: { color: cardBorder, width: 1 }, rectRadius: 0.1 });
    slide2.addShape(pptx.ShapeType.roundRect, { x: 6.8, y: 1.9, w: 5.7, h: 0.6, fill: { color: "4338CA" }, rectRadius: 0.1 });
    slide2.addText("■ 핵심 타겟 오디언스 & 페르소나", { x: 7.1, y: 1.9, w: 5.1, h: 0.6, fontSize: 12, bold: true, color: "FFFFFF", valign: "middle", fontFace: fontKo });
    slide2.addText("{{타겟오디언스}}", { x: 7.1, y: 2.7, w: 5.1, h: 4.0, fontSize: 13, color: "F1F5F9", lineSpacing: 24, valign: "top", fontFace: fontKo });

    // Slide 3: Content Direction & Monthly Roadmap
    const slide3 = pptx.addSlide();
    slide3.background = { color: bgDark };

    slide3.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 0.5, w: 2.2, h: 0.3, fill: { color: "0D9488" }, rectRadius: 0.15 });
    slide3.addText("02. ROADMAP", { x: 0.8, y: 0.5, w: 2.2, h: 0.3, fontSize: 10, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontKo });
    slide3.addText("콘텐츠 비주얼 방향성 및 월별 실행 계획", { x: 0.8, y: 0.9, w: 11.7, h: 0.5, fontSize: 22, bold: true, color: "FFFFFF", fontFace: fontKo });
    slide3.addText("차별화된 비주얼 톤앤매너와 월별 프로모션/피드 구성 계획", { x: 0.8, y: 1.4, w: 11.7, h: 0.3, fontSize: 11, color: "94A3B8", fontFace: fontKo });

    // Left Card (Content Direction)
    slide3.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 1.9, w: 5.7, h: 5.0, fill: { color: cardBg }, line: { color: cardBorder, width: 1 }, rectRadius: 0.1 });
    slide3.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 1.9, w: 5.7, h: 0.6, fill: { color: "0F766E" }, rectRadius: 0.1 });
    slide3.addText("■ 콘텐츠 기획 및 비주얼 방향성", { x: 1.1, y: 1.9, w: 5.1, h: 0.6, fontSize: 12, bold: true, color: "FFFFFF", valign: "middle", fontFace: fontKo });
    slide3.addText("{{콘텐츠방향성}}", { x: 1.1, y: 2.7, w: 5.1, h: 4.0, fontSize: 13, color: "F1F5F9", lineSpacing: 24, valign: "top", fontFace: fontKo });

    // Right Card (Monthly Schedule)
    slide3.addShape(pptx.ShapeType.roundRect, { x: 6.8, y: 1.9, w: 5.7, h: 5.0, fill: { color: cardBg }, line: { color: cardBorder, width: 1 }, rectRadius: 0.1 });
    slide3.addShape(pptx.ShapeType.roundRect, { x: 6.8, y: 1.9, w: 5.7, h: 0.6, fill: { color: "0369A1" }, rectRadius: 0.1 });
    slide3.addText("■ 월별 주요 프로모션 및 발행 계획", { x: 7.1, y: 1.9, w: 5.1, h: 0.6, fontSize: 12, bold: true, color: "FFFFFF", valign: "middle", fontFace: fontKo });
    slide3.addText("{{월별계획}}", { x: 7.1, y: 2.7, w: 5.1, h: 4.0, fontSize: 13, color: "F1F5F9", lineSpacing: 24, valign: "top", fontFace: fontKo });
  } else {
    // [CAMPAIGN RESULT REPORT] - Executive Off-White & Navy Theme
    const navyCover = "0F172A";
    const lightBg = "F8FAFC";
    const cardLine = "E2E8F0";

    // Slide 1: Cover
    const slide1 = pptx.addSlide();
    slide1.background = { color: navyCover };

    slide1.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 1.4, w: 2.8, h: 0.36, fill: { color: "2563EB" }, rectRadius: 0.18 });
    slide1.addText("CAMPAIGN RESULT REPORT", { x: 0.8, y: 1.4, w: 2.8, h: 0.36, fontSize: 10, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontKo });

    slide1.addText("브랜드: {{브랜드명}}   |   캠페인: {{캠페인명}} ({{캠페인유형}})", { x: 0.8, y: 1.95, w: 11.7, h: 0.4, fontSize: 13, bold: true, color: "60A5FA", fontFace: fontKo });
    slide1.addText("{{보고서제목}}", { x: 0.8, y: 2.45, w: 11.7, h: 1.6, fontSize: 32, bold: true, color: "FFFFFF", valign: "middle", fontFace: fontKo });

    slide1.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 4.4, w: 11.7, h: 1.2, fill: { color: "1E293B" }, line: { color: "334155", width: 1 }, rectRadius: 0.1 });
    slide1.addText("캠페인명: {{캠페인명}}   |   브랜드: {{브랜드명}}", { x: 1.2, y: 4.6, w: 6.0, h: 0.8, fontSize: 13, color: "E2E8F0", bold: true, valign: "middle", fontFace: fontKo });
    slide1.addText("보고서 생성일: {{생성일시}}", { x: 7.4, y: 4.6, w: 4.7, h: 0.8, fontSize: 13, color: "94A3B8", align: "right", valign: "middle", fontFace: fontKo });

    slide1.addText("CONFIDENTIAL  |  INFLUENCER SEEDING CAMPAIGN FINAL PERFORMANCE AUDIT", { x: 0.8, y: 6.6, w: 11.7, h: 0.3, fontSize: 10, color: "64748B", fontFace: fontKo });

    // Slide 2: Performance Summary & Insights
    const slide2 = pptx.addSlide();
    slide2.background = { color: lightBg };

    slide2.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 0.45, w: 2.2, h: 0.28, fill: { color: "2563EB" }, rectRadius: 0.14 });
    slide2.addText("01. SUMMARY", { x: 0.8, y: 0.45, w: 2.2, h: 0.28, fontSize: 9, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontKo });
    slide2.addText("캠페인 핵심 성과 대시보드 및 총평", { x: 0.8, y: 0.78, w: 11.7, h: 0.45, fontSize: 21, bold: true, color: "0F172A", fontFace: fontKo });
    slide2.addText("지원자 풀 규모, 최종 선정 크리에이터 완주율 및 누적 도달 성과 종합", { x: 0.8, y: 1.25, w: 11.7, h: 0.28, fontSize: 11, color: "64748B", fontFace: fontKo });

    // 5 KPI Cards
    const kpis: [string, string, string][] = [
      ["총 지원자 수", "{{총지원자}}명", "2563EB"],
      ["최종 선정 (예비)", "{{최종선정}}명 ({{예비선정}})", "0284C7"],
      ["업로드 완료", "{{업로드완료}}건", "059669"],
      ["총 누적 조회수", "{{총조회수}}회", "D97706"],
      ["인게이지먼트 (비율)", "{{총인게이지먼트}} ({{인게이지먼트율}}%)", "7C3AED"],
    ];
    kpis.forEach(([label, val, accent], idx) => {
      const x = 0.8 + idx * 2.42;
      slide2.addShape(pptx.ShapeType.roundRect, { x, y: 1.6, w: 2.22, h: 1.65, fill: { color: "FFFFFF" }, line: { color: cardLine, width: 1 }, rectRadius: 0.08 });
      slide2.addShape(pptx.ShapeType.rect, { x, y: 1.6, w: 2.22, h: 0.06, fill: { color: accent } });
      slide2.addText(label, { x, y: 1.78, w: 2.22, h: 0.35, fontSize: 11, color: "64748B", align: "center", fontFace: fontKo });
      slide2.addText(val, { x, y: 2.15, w: 2.22, h: 0.8, fontSize: 16, bold: true, color: "0F172A", align: "center", valign: "middle", fontFace: fontKo });
    });

    // Summary Card
    slide2.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 3.45, w: 11.7, h: 3.6, fill: { color: "FFFFFF" }, line: { color: cardLine, width: 1 }, rectRadius: 0.1 });
    slide2.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 3.45, w: 11.7, h: 0.5, fill: { color: "F1F5F9" }, rectRadius: 0.1 });
    slide2.addText("■ 캠페인 종합 성과 분석 및 전략적 시사점", { x: 1.1, y: 3.45, w: 11.1, h: 0.5, fontSize: 12, bold: true, color: "1E293B", valign: "middle", fontFace: fontKo });
    slide2.addText("{{총평}}", { x: 1.1, y: 4.1, w: 11.1, h: 2.8, fontSize: 12, color: "334155", valign: "top", lineSpacing: 22, fontFace: fontKo });

    // Slide 3: Chart
    const slide3 = pptx.addSlide();
    slide3.background = { color: lightBg };

    slide3.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 0.45, w: 2.2, h: 0.28, fill: { color: "2563EB" }, rectRadius: 0.14 });
    slide3.addText("02. CHARTS", { x: 0.8, y: 0.45, w: 2.2, h: 0.28, fontSize: 9, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontKo });
    slide3.addText("인플루언서별 성과 분석 (조회수 / 인게이지먼트 TOP 10)", { x: 0.8, y: 0.78, w: 11.7, h: 0.45, fontSize: 21, bold: true, color: "0F172A", fontFace: fontKo });
    slide3.addText("상위 성과 크리에이터 순위 및 게시물 반응 지표 비교 분석", { x: 0.8, y: 1.25, w: 11.7, h: 0.28, fontSize: 11, color: "64748B", fontFace: fontKo });

    slide3.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 1.6, w: 11.7, h: 5.4, fill: { color: "FFFFFF" }, line: { color: cardLine, width: 1 }, rectRadius: 0.1 });
    slide3.addText("{{차트:성과}}", { x: 1.0, y: 1.8, w: 11.3, h: 5.0, fontSize: 12, color: "94A3B8" });

    // Slide 4: Table
    const slide4 = pptx.addSlide();
    slide4.background = { color: lightBg };

    slide4.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 0.45, w: 2.2, h: 0.28, fill: { color: "2563EB" }, rectRadius: 0.14 });
    slide4.addText("03. CREATORS", { x: 0.8, y: 0.45, w: 2.2, h: 0.28, fontSize: 9, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: fontKo });
    slide4.addText("캠페인 참여 인플루언서 전체 명단 및 성과 현황", { x: 0.8, y: 0.78, w: 11.7, h: 0.45, fontSize: 21, bold: true, color: "0F172A", fontFace: fontKo });
    slide4.addText("최종 선정 인플루언서의 콘텐츠 게시 링크 및 세부 정량 성과 기록", { x: 0.8, y: 1.25, w: 11.7, h: 0.28, fontSize: 11, color: "64748B", fontFace: fontKo });

    slide4.addShape(pptx.ShapeType.roundRect, { x: 0.8, y: 1.6, w: 11.7, h: 5.4, fill: { color: "FFFFFF" }, line: { color: cardLine, width: 1 }, rectRadius: 0.1 });
    slide4.addText("{{표:인플루언서}}", { x: 1.0, y: 1.8, w: 11.3, h: 5.0, fontSize: 12, color: "94A3B8" });
  }

  const out = await pptx.write({ outputType: "nodebuffer" });
  return out as Buffer;
}
