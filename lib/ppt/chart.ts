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

  // **파일명을 고정하면 안 된다.** pptxgenjs 는 차트 번호를 모듈 전역으로 센다
  // (`let _chartCounter = 0` → `chart${++_chartCounter}.xml`). 프레젠테이션을 새로 만들어도
  // 카운터는 0 으로 돌아가지 않으므로, 같은 프로세스의 두 번째 호출은 chart2.xml 을 만든다.
  // chart1.xml 을 찾도록 두면 **서버가 살아 있는 동안 첫 다운로드만 되고 그 뒤로는 전부
  // 실패한다.** 배포나 재시작 전까지 낫지 않고, 사용자에게는 이유가 보이지 않는다.
  // 그래서 이름을 찾아서 쓴다. 이 임시 pptx 에는 차트가 하나뿐이므로 첫 번째가 그것이다.
  const chartName = Object.keys(zip.files).find((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
  const chartXml = chartName ? await zip.file(chartName)!.async("text") : undefined;
  if (!chartXml) throw new Error("chart part not generated");
  const embeddingName = Object.keys(zip.files).find((n) => n.startsWith("ppt/embeddings/") && n.endsWith(".xlsx"));
  const embeddingData = embeddingName ? await zip.file(embeddingName)!.async("nodebuffer") : null;
  return { chartXml, embeddingData };
}
