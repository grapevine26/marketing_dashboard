import JSZip from "jszip";
import pptxgen from "pptxgenjs";

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
const SLIDE_FILE_RE = /^ppt\/slides\/slide\d+\.xml$/;

function slideFiles(zip: JSZip): string[] {
  return Object.keys(zip.files).filter((name) => SLIDE_FILE_RE.test(name));
}

function paragraphText(paragraphXml: string): string {
  const textRegex = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g;
  let m: RegExpExecArray | null;
  let out = "";
  while ((m = textRegex.exec(paragraphXml)) !== null) out += m[1];
  return out;
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
    // 런 요소 없이 <a:t>만 있는 특수 케이스(<a:fld> 등): 첫 <a:t>에 통째로 쓰고 나머지는 비운다.
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

/**
 * 런 분할(<a:t>) 문제를 해결하며 플레이스홀더를 치환하는 PPT 템플릿 채우기 엔진
 */
export async function fillTemplate(
  buffer: Buffer,
  values: Record<string, string>
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);

  for (const filePath of slideFiles(zip)) {
    const file = zip.files[filePath];
    if (!file) continue;
    const xml = await file.async("text");
    const replaced = xml.replace(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/g, (paragraphXml) =>
      fillParagraph(paragraphXml, values)
    );
    if (replaced !== xml) zip.file(filePath, replaced);
  }

  return await zip.generateAsync({ type: "nodebuffer" });
}

/**
 * 시스템 기본 내장 PPT 템플릿 생성기 (kind: event | sns)
 */
export async function generateDefaultPptBuffer(kind: "event" | "sns"): Promise<Buffer> {
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
  } else {
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
  }

  const out = await pptx.write({ outputType: "nodebuffer" });
  return out as Buffer;
}
