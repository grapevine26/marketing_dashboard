import ExcelJS from "exceljs";

export interface XlsxColumn {
  header: string;
  key: string;
  width?: number;
  alignment?: Partial<ExcelJS.Alignment>;
}

export interface XlsxSheetDefinition {
  name: string;
  columns: XlsxColumn[];
  rows: Record<string, unknown>[];
}

/**
 * 에이전시 및 브랜드 광고주 보고용 고품질 Excel(.xlsx) 버퍼 생성기
 * - 헤더 스타일링 (다크 슬레이트 배경, 볼드 폰트, 자동 열 너비)
 * - 상단 헤더 행 고정 (Freeze Pane)
 * - 데이터 셀 테두리 및 정렬
 */
export async function generateXlsxBuffer(
  sheets: XlsxSheetDefinition[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Global Agency Marketing Operations";
  workbook.lastModifiedBy = "Global Agency Marketing Operations";
  workbook.created = new Date();
  workbook.modified = new Date();

  for (const sheetDef of sheets) {
    const worksheet = workbook.addWorksheet(sheetDef.name, {
      views: [{ state: "frozen", ySplit: 1 }],
      properties: { defaultRowHeight: 22 },
    });

    // Columns setup
    worksheet.columns = sheetDef.columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width || Math.max(col.header.length * 2.5 + 4, 12),
    }));

    // Style Header Row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 28;
    headerRow.font = {
      name: "Pretendard, Malgun Gothic, Arial",
      size: 11,
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" }, // Dark slate
    };
    headerRow.alignment = {
      vertical: "middle",
      horizontal: "center",
    };

    // Add rows
    for (const rowData of sheetDef.rows) {
      const row = worksheet.addRow(rowData);
      row.height = 22;
      row.font = {
        name: "Pretendard, Malgun Gothic, Arial",
        size: 10,
        color: { argb: "FF0F172A" },
      };

      // Set cell alignment & border
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const colDef = sheetDef.columns[colNumber - 1];
        cell.alignment = {
          vertical: "middle",
          horizontal: colDef?.alignment?.horizontal || "left",
          wrapText: false,
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });
    }

    // Auto calculate column widths if not explicitly provided
    worksheet.columns.forEach((column) => {
      let maxLen = (column.header ? String(column.header).length * 2.5 : 10) + 4;
      column.eachCell?.({ includeEmpty: false }, (cell, rowNumber) => {
        if (rowNumber > 1 && cell.value !== undefined && cell.value !== null) {
          const valStr = String(cell.value);
          const len = valStr.length;
          const koreanCount = (valStr.match(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/g) || []).length;
          const approxWidth = len + koreanCount + 3;
          if (approxWidth > maxLen) {
            maxLen = Math.min(approxWidth, 50);
          }
        }
      });
      column.width = Math.max(maxLen, 12);
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
