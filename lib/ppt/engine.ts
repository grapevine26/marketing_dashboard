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
 */
export async function generateDefaultPptBuffer(kind: BuiltinKind): Promise<Buffer> {
  const pptx = new pptxgen();
  // 아래 좌표(x 0.8 + w 11.7 등)는 13.33 x 7.5 인치 기준. LAYOUT_16x9(10 x 5.625)로 두면 오른쪽이 잘린다.
  pptx.layout = "LAYOUT_WIDE";

  if (kind === "event") {
    const slide1 = pptx.addSlide();
    slide1.background = { color: "090A0C" };
    slide1.addText("EVENT OPERATION PLAN", { x: 0.8, y: 1.8, w: 11.5, h: 0.4, fontSize: 13, color: "38BDF8", bold: true });
    slide1.addText("{{브랜드명}} - {{행사명}}", { x: 0.8, y: 2.3, w: 11.7, h: 1.5, fontSize: 28, color: "FFFFFF", bold: true, valign: "middle" });
    slide1.addText("행사 일시: {{행사일시}}   |   장소: {{행사장소}}", { x: 0.8, y: 4.2, w: 11.5, h: 0.6, fontSize: 14, color: "94A3B8" });

    const slide2 = pptx.addSlide();
    slide2.background = { color: "0D0E12" };
    slide2.addText("01. 행사 개요 및 기획 의도", { x: 0.8, y: 0.8, w: 11.5, h: 0.5, fontSize: 20, color: "38BDF8", bold: true });
    slide2.addText("{{행사개요}}", { x: 0.8, y: 1.6, w: 11.7, h: 5.0, fontSize: 14, color: "F1F5F9", lineSpacing: 26, valign: "top" });

    const slide3 = pptx.addSlide();
    slide3.background = { color: "0D0E12" };
    slide3.addText("02. 주요 프로그램 & VIP 세션 타임테이블", { x: 0.8, y: 0.8, w: 11.5, h: 0.5, fontSize: 20, color: "818CF8", bold: true });
    slide3.addText("{{프로그램}}", { x: 0.8, y: 1.6, w: 11.7, h: 5.2, fontSize: 13, color: "F1F5F9", lineSpacing: 24, valign: "top" });
  } else if (kind === "sns") {
    const slide1 = pptx.addSlide();
    slide1.background = { color: "090A0C" };
    slide1.addText("SNS OPERATION STRATEGY", { x: 0.8, y: 1.8, w: 11.5, h: 0.4, fontSize: 13, color: "0EA5E9", bold: true });
    slide1.addText("{{브랜드명}} 공식 SNS 채널 운영 제안서", { x: 0.8, y: 2.3, w: 11.7, h: 1.5, fontSize: 28, color: "FFFFFF", bold: true, valign: "middle" });
    slide1.addText("운영 채널: {{채널명}}   |   계약 기간: {{계약기간}}", { x: 0.8, y: 4.2, w: 11.5, h: 0.6, fontSize: 14, color: "94A3B8" });

    const slide2 = pptx.addSlide();
    slide2.background = { color: "0D0E12" };
    slide2.addText("01. 운영 목표 & 핵심 타겟", { x: 0.8, y: 0.8, w: 11.5, h: 0.5, fontSize: 20, color: "0EA5E9", bold: true });
    slide2.addText("■ 운영 목표\n{{운영목표}}\n\n■ 핵심 타겟 오디언스\n{{타겟오디언스}}", { x: 0.8, y: 1.6, w: 11.7, h: 5.0, fontSize: 13, color: "F1F5F9", lineSpacing: 24, valign: "top" });

    const slide3 = pptx.addSlide();
    slide3.background = { color: "0D0E12" };
    slide3.addText("02. 콘텐츠 방향성 & 월간 발행 계획", { x: 0.8, y: 0.8, w: 11.5, h: 0.5, fontSize: 20, color: "38BDF8", bold: true });
    slide3.addText("■ 콘텐츠 기획 및 비주얼 방향성\n{{콘텐츠방향성}}\n\n■ 월별 주요 프로모션 및 발행 계획\n{{월별계획}}", { x: 0.8, y: 1.6, w: 11.7, h: 5.0, fontSize: 13, color: "F1F5F9", lineSpacing: 24, valign: "top" });
  } else {
    // 결과보고서: 표지 → KPI → 총평 → 차트 → 인플루언서 표
    const dark = "1E293B";
    const slide1 = pptx.addSlide();
    slide1.background = { color: dark };
    slide1.addText("CAMPAIGN RESULT REPORT", { x: 0.8, y: 1.8, w: 11.5, h: 0.4, fontSize: 13, color: "60A5FA", bold: true });
    slide1.addText("{{보고서제목}}", { x: 0.8, y: 2.3, w: 11.7, h: 1.5, fontSize: 30, color: "FFFFFF", bold: true, valign: "middle" });
    slide1.addText("브랜드: {{브랜드명}}   |   캠페인: {{캠페인명}} ({{캠페인유형}})   |   생성일: {{생성일시}}", { x: 0.8, y: 4.2, w: 11.7, h: 0.6, fontSize: 14, color: "94A3B8" });

    const slide2 = pptx.addSlide();
    slide2.addText("캠페인 핵심 성과 요약", { x: 0.8, y: 0.6, w: 11.5, h: 0.6, fontSize: 24, bold: true, color: dark });
    const kpis: [string, string][] = [
      ["총 지원자 수", "{{총지원자}}명"],
      ["최종 선정 (예비)", "{{최종선정}}명 ({{예비선정}})"],
      ["업로드 완료", "{{업로드완료}}건"],
      ["총 누적 조회수", "{{총조회수}}회"],
      ["인게이지먼트 (비율)", "{{총인게이지먼트}} ({{인게이지먼트율}}%)"],
    ];
    kpis.forEach(([label, val], idx) => {
      const x = 0.8 + idx * 2.4;
      slide2.addShape(pptx.ShapeType.rect, { x, y: 1.6, w: 2.2, h: 1.8, fill: { color: "F8FAFC" }, line: { color: "E2E8F0", width: 1 } });
      slide2.addText(label, { x, y: 1.8, w: 2.2, h: 0.4, fontSize: 12, color: "64748B", align: "center" });
      slide2.addText(val, { x, y: 2.3, w: 2.2, h: 0.7, fontSize: 18, bold: true, color: "0F172A", align: "center", valign: "middle" });
    });
    slide2.addText("성과 분석 및 총평", { x: 0.8, y: 3.9, w: 11.5, h: 0.4, fontSize: 16, bold: true, color: "334155" });
    slide2.addText("{{총평}}", { x: 0.8, y: 4.35, w: 11.7, h: 2.8, fontSize: 12, color: "475569", valign: "top", lineSpacing: 20 });

    const slide3 = pptx.addSlide();
    slide3.addText("인플루언서별 성과 (조회수 / 인게이지먼트)", { x: 0.8, y: 0.6, w: 11.5, h: 0.6, fontSize: 24, bold: true, color: dark });
    slide3.addText("{{차트:성과}}", { x: 0.8, y: 1.4, w: 11.7, h: 5.6, fontSize: 12, color: "94A3B8" });

    const slide4 = pptx.addSlide();
    slide4.addText("참여 인플루언서 리스트", { x: 0.8, y: 0.6, w: 11.5, h: 0.6, fontSize: 24, bold: true, color: dark });
    slide4.addText("{{표:인플루언서}}", { x: 0.8, y: 1.4, w: 11.7, h: 5.6, fontSize: 12, color: "94A3B8" });
  }

  const out = await pptx.write({ outputType: "nodebuffer" });
  return out as Buffer;
}
