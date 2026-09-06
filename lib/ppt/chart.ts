import JSZip from "jszip";
import pptxgen from "pptxgenjs";

export interface ChartSpec {
  type?: "bar";
  categories: string[];
  series: { name: string; values: number[] }[];
  /** 막대 색 (hex, # 없이). 시리즈 순서대로 */
  colors?: string[];
}

export interface ChartParts {
  chartXml: string;
  /** 차트 rels 원본 — 임베디드 워크북 경로는 transplant 시 다시 쓴다 */
  embeddingData: Buffer | null;
}

const EMU_PER_INCH = 914400;

/**
 * pptxgenjs로 차트 한 개짜리 임시 pptx를 만들고, 그 안의 차트 파트(chartN.xml + 임베디드 xlsx)를 꺼낸다.
 * 이 파트를 업로드된 템플릿 pptx에 이식(transplant)하면 PowerPoint가 네이티브 차트로 렌더링한다.
 */
export async function buildChartParts(spec: ChartSpec, widthEmu: number, heightEmu: number): Promise<ChartParts> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  const slide = pptx.addSlide();
  const data = spec.series.map((s) => ({ name: s.name, labels: spec.categories, values: s.values }));
  slide.addChart(pptx.ChartType.bar, data, {
    x: 0.5,
    y: 0.5,
    w: Math.max(2, widthEmu / EMU_PER_INCH),
    h: Math.max(1.5, heightEmu / EMU_PER_INCH),
    barDir: "col",
    barGrouping: "clustered",
    chartColors: spec.colors || ["2563EB", "F59E0B", "10B981", "8B5CF6"],
    showLegend: true,
    legendPos: "b",
    legendFontSize: 10,
    catAxisLabelFontSize: 10,
    valAxisLabelFontSize: 9,
    showValue: true,
    dataLabelFontSize: 9,
    dataLabelFormatCode: "#,##0",
    valAxisLabelFormatCode: "#,##0",
  });

  const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  const zip = await JSZip.loadAsync(buf);
  const chartXml = await zip.file("ppt/charts/chart1.xml")?.async("text");
  if (!chartXml) throw new Error("chart part not generated");
  const embeddingName = Object.keys(zip.files).find((n) => n.startsWith("ppt/embeddings/") && n.endsWith(".xlsx"));
  const embeddingData = embeddingName ? await zip.file(embeddingName)!.async("nodebuffer") : null;
  return { chartXml, embeddingData };
}
