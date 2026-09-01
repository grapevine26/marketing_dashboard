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

/**
 * PowerPoint XML의 <a:p> 문단 단위로 런(<a:t>)들을 이어붙여 {{...}} 플레이스홀더를 추출합니다.
 */
export async function extractPlaceholders(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  const placeholders = new Set<string>();

  const slideFiles = Object.keys(zip.files).filter((name) =>
    name.startsWith("ppt/slides/slide") && name.endsWith(".xml")
  );

  for (const filePath of slideFiles) {
    const file = zip.files[filePath];
    if (!file) continue;

    const xml = await file.async("text");
    const paragraphRegex = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
    let pMatch: RegExpExecArray | null;

    while ((pMatch = paragraphRegex.exec(xml)) !== null) {
      const pContent = pMatch[1];
      const textRegex = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g;
      let tMatch: RegExpExecArray | null;
      let paragraphText = "";

      while ((tMatch = textRegex.exec(pContent)) !== null) {
        paragraphText += tMatch[1];
      }

      const phRegex = /\{\{([^}]+)\}\}/g;
      let phMatch: RegExpExecArray | null;
      while ((phMatch = phRegex.exec(paragraphText)) !== null) {
        const phName = phMatch[1].trim();
        if (phName) {
          placeholders.add(phName);
        }
      }
    }
  }

  return Array.from(placeholders).sort();
}

/**
 * 런 분할(<a:t>) 문제를 해결하며 플레이스홀더를 치환하는 PPT 템플릿 채우기 엔진
 */
export async function fillTemplate(
  buffer: Buffer,
  values: Record<string, string>
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);

  const slideFiles = Object.keys(zip.files).filter((name) =>
    name.startsWith("ppt/slides/slide") && name.endsWith(".xml")
  );

  for (const filePath of slideFiles) {
    const file = zip.files[filePath];
    if (!file) continue;

    let xml = await file.async("text");

    xml = xml.replace(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/g, (paragraphXml) => {
      const textRegex = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g;
      let tMatch: RegExpExecArray | null;
      let fullParagraphText = "";

      while ((tMatch = textRegex.exec(paragraphXml)) !== null) {
        fullParagraphText += tMatch[1];
      }

      if (!/\{\{([^}]+)\}\}/.test(fullParagraphText)) {
        return paragraphXml;
      }

      const replacedText = fullParagraphText.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
        const trimmedKey = key.trim();
        const val = values[trimmedKey];
        return escapeXml(val !== undefined ? val : "");
      });

      let first = true;
      return paragraphXml.replace(/<a:t\b([^>]*)>([\s\S]*?)<\/a:t>/g, (_m, attrs) => {
        if (first) {
          first = false;
          return `<a:t${attrs}>${replacedText}</a:t>`;
        }
        return `<a:t${attrs}></a:t>`;
      });
    });

    zip.file(filePath, xml);
  }

  return await zip.generateAsync({ type: "nodebuffer" });
}

/**
 * 시스템 기본 내장 PPT 템플릿 생성기 (kind: event | sns)
 */
export async function generateDefaultPptBuffer(kind: "event" | "sns"): Promise<Buffer> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";

  if (kind === "event") {
    // Slide 1: Cover
    const slide1 = pptx.addSlide();
    slide1.background = { color: "090A0C" };
    slide1.addText("EVENT OPERATION PLAN", {
      x: 1.0,
      y: 1.5,
      w: 8.0,
      h: 0.5,
      fontSize: 14,
      color: "3B82F6",
      bold: true,
    });
    slide1.addText("{{브랜드명}} - {{행사명}}", {
      x: 1.0,
      y: 2.2,
      w: 8.0,
      h: 1.2,
      fontSize: 32,
      color: "FFFFFF",
      bold: true,
    });
    slide1.addText("행사 일시: {{행사일시}}  |  장소: {{행사장소}}", {
      x: 1.0,
      y: 4.0,
      w: 8.0,
      h: 0.6,
      fontSize: 16,
      color: "94A3B8",
    });

    // Slide 2: Overview & Program
    const slide2 = pptx.addSlide();
    slide2.background = { color: "0D0E12" };
    slide2.addText("01. 행사 개요 및 기획 의도", {
      x: 0.8,
      y: 0.8,
      w: 8.0,
      h: 0.5,
      fontSize: 20,
      color: "3B82F6",
      bold: true,
    });
    slide2.addText("{{행사개요}}", {
      x: 0.8,
      y: 1.6,
      w: 8.4,
      h: 1.8,
      fontSize: 14,
      color: "E2E8F0",
      lineSpacing: 24,
    });
    slide2.addText("02. 주요 프로그램 & VIP 세션", {
      x: 0.8,
      y: 3.6,
      w: 8.0,
      h: 0.5,
      fontSize: 20,
      color: "6366F1",
      bold: true,
    });
    slide2.addText("{{프로그램}}", {
      x: 0.8,
      y: 4.3,
      w: 8.4,
      h: 2.0,
      fontSize: 14,
      color: "E2E8F0",
      lineSpacing: 24,
    });
  } else {
    // SNS Template
    // Slide 1: Cover
    const slide1 = pptx.addSlide();
    slide1.background = { color: "090A0C" };
    slide1.addText("SNS OPERATION STRATEGY", {
      x: 1.0,
      y: 1.5,
      w: 8.0,
      h: 0.5,
      fontSize: 14,
      color: "0EA5E9",
      bold: true,
    });
    slide1.addText("{{브랜드명}} 공식 SNS 운영 제안서", {
      x: 1.0,
      y: 2.2,
      w: 8.0,
      h: 1.2,
      fontSize: 32,
      color: "FFFFFF",
      bold: true,
    });
    slide1.addText("운영 채널: {{채널명}}  |  계약 기간: {{계약기간}}", {
      x: 1.0,
      y: 4.0,
      w: 8.0,
      h: 0.6,
      fontSize: 16,
      color: "94A3B8",
    });

    // Slide 2: Target & Strategy
    const slide2 = pptx.addSlide();
    slide2.background = { color: "0D0E12" };
    slide2.addText("01. 운영 목표 & 핵심 타겟", {
      x: 0.8,
      y: 0.8,
      w: 8.0,
      h: 0.5,
      fontSize: 20,
      color: "0EA5E9",
      bold: true,
    });
    slide2.addText("운영 목표:\n{{운영목표}}\n\n핵심 타겟:\n{{타겟오디언스}}", {
      x: 0.8,
      y: 1.5,
      w: 8.4,
      h: 2.0,
      fontSize: 13,
      color: "E2E8F0",
      lineSpacing: 22,
    });
    slide2.addText("02. 콘텐츠 방향성 & 월간 발행 계획", {
      x: 0.8,
      y: 3.8,
      w: 8.0,
      h: 0.5,
      fontSize: 20,
      color: "38BDF8",
      bold: true,
    });
    slide2.addText("콘텐츠 방향성:\n{{콘텐츠방향성}}\n\n월간 발행 계획:\n{{월별계획}}", {
      x: 0.8,
      y: 4.5,
      w: 8.4,
      h: 2.0,
      fontSize: 13,
      color: "E2E8F0",
      lineSpacing: 22,
    });
  }

  const out = await pptx.write({ outputType: "nodebuffer" });
  return out as Buffer;
}