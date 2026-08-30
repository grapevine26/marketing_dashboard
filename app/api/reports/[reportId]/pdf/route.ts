import { NextRequest, NextResponse } from "next/server";
import { getReportById } from "@/lib/db";
import { generateReportPDF } from "@/lib/reports/pdf";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params;
  const report = await getReportById(reportId);
  if (!report) {
    return new NextResponse("Report not found", { status: 404 });
  }

  try {
    const pdfBuffer = await generateReportPDF(report);
    const filename = encodeURIComponent(`${report.title}.pdf`);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  } catch (error) {
    console.error("PDF generation failed:", error);
    return new NextResponse("Failed to generate PDF", { status: 500 });
  }
}