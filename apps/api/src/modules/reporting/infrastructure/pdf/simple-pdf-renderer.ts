export interface PdfKpiItem {
  readonly label: string;
  readonly value: string;
}

export interface PdfTableSection {
  readonly title: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface PdfReportData {
  readonly reportTitle: string;
  readonly organizationName: string;
  readonly dateRange: string;
  readonly generatedAt: string;
  readonly kpis: readonly PdfKpiItem[];
  readonly sections?: readonly PdfTableSection[];
}

export interface ReportPdfRenderer {
  renderSummaryPdf(data: PdfReportData): Promise<Buffer>;
}

function escapePdfText(text: string): string {
  // Replace non-printable/control chars and escape PDF literals ( \ , ( , ) )
  return text
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

interface PageContent {
  readonly stream: string;
}

export class SimplePdfRenderer implements ReportPdfRenderer {
  async renderSummaryPdf(data: PdfReportData): Promise<Buffer> {
    const pageWidth = 612; // 8.5 x 11 inches in points
    const pageHeight = 792;
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;

    const pages: PageContent[] = [];
    let currentOps: string[] = [];
    let y = pageHeight - margin;

    const startNewPage = () => {
      if (currentOps.length > 0) {
        pages.push({ stream: currentOps.join('\n') });
        currentOps = [];
      }
      y = pageHeight - margin;
    };

    const drawText = (
      text: string,
      x: number,
      yPos: number,
      font: 'F1' | 'F2',
      size: number,
      color: [number, number, number] = [0, 0, 0],
    ) => {
      const [r, g, b] = color;
      currentOps.push(
        `BT /${font} ${size} Tf ${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg 1 0 0 1 ${x} ${yPos} Tm (${escapePdfText(text)}) Tj ET`,
      );
    };

    const drawLine = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      color: [number, number, number] = [0.8, 0.8, 0.8],
      width = 1,
    ) => {
      const [r, g, b] = color;
      currentOps.push(
        `${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`,
      );
    };

    const drawRect = (
      x: number,
      yPos: number,
      w: number,
      h: number,
      fillColor?: [number, number, number],
      strokeColor?: [number, number, number],
    ) => {
      if (fillColor) {
        const [r, g, b] = fillColor;
        currentOps.push(
          `${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg ${x} ${yPos} ${w} ${h} re f`,
        );
      }
      if (strokeColor) {
        const [r, g, b] = strokeColor;
        currentOps.push(
          `${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} RG 1 w ${x} ${yPos} ${w} ${h} re S`,
        );
      }
    };

    // PAGE 1: Header
    drawText(data.organizationName.toUpperCase(), margin, y, 'F2', 12, [0.3, 0.4, 0.5]);
    y -= 22;
    drawText(data.reportTitle, margin, y, 'F2', 20, [0.1, 0.1, 0.2]);
    y -= 16;
    drawText(
      `Period: ${data.dateRange}   |   Generated: ${data.generatedAt}`,
      margin,
      y,
      'F1',
      9,
      [0.4, 0.4, 0.4],
    );
    y -= 12;
    drawLine(margin, y, margin + contentWidth, y, [0.2, 0.4, 0.8], 2);
    y -= 24;

    // KPIs grid (3 columns)
    if (data.kpis.length > 0) {
      drawText('EXECUTIVE SUMMARY', margin, y, 'F2', 11, [0.2, 0.3, 0.4]);
      y -= 14;

      const cols = 3;
      const kpiCardWidth = (contentWidth - (cols - 1) * 10) / cols;
      const kpiCardHeight = 46;

      for (let i = 0; i < data.kpis.length; i++) {
        const kpi = data.kpis[i];
        if (!kpi) continue;
        const colIdx = i % cols;
        const rowIdx = Math.floor(i / cols);
        const cardX = margin + colIdx * (kpiCardWidth + 10);
        const cardY = y - (rowIdx + 1) * (kpiCardHeight + 8);

        // Card background
        drawRect(cardX, cardY, kpiCardWidth, kpiCardHeight, [0.96, 0.97, 0.98], [0.85, 0.88, 0.92]);
        // Value (bold, large)
        drawText(kpi.value, cardX + 10, cardY + 22, 'F2', 15, [0.1, 0.2, 0.4]);
        // Label (smaller, muted)
        drawText(kpi.label, cardX + 10, cardY + 8, 'F1', 8, [0.4, 0.45, 0.5]);
      }

      const totalKpiRows = Math.ceil(data.kpis.length / cols);
      y -= totalKpiRows * (kpiCardHeight + 8) + 16;
    }

    // Sections & Tables
    if (data.sections && data.sections.length > 0) {
      for (const section of data.sections) {
        if (y < margin + 80) {
          startNewPage();
        }

        y -= 10;
        drawText(section.title.toUpperCase(), margin, y, 'F2', 11, [0.2, 0.3, 0.4]);
        y -= 14;

        const colCount = Math.max(1, section.headers.length);
        const colWidth = contentWidth / colCount;
        const rowHeight = 18;

        // Header row
        drawRect(
          margin,
          y - rowHeight,
          contentWidth,
          rowHeight,
          [0.9, 0.92, 0.95],
          [0.75, 0.8, 0.85],
        );
        for (let c = 0; c < colCount; c++) {
          const headerText = section.headers[c] ?? '';
          drawText(
            headerText,
            margin + c * colWidth + 6,
            y - rowHeight + 5,
            'F2',
            8,
            [0.1, 0.2, 0.3],
          );
        }
        y -= rowHeight;

        // Data rows
        for (let r = 0; r < section.rows.length; r++) {
          if (y < margin + 40) {
            startNewPage();
            // Re-draw header on next page
            drawText(`${section.title} (cont.)`, margin, y, 'F2', 10, [0.3, 0.4, 0.5]);
            y -= 14;
            drawRect(
              margin,
              y - rowHeight,
              contentWidth,
              rowHeight,
              [0.9, 0.92, 0.95],
              [0.75, 0.8, 0.85],
            );
            for (let c = 0; c < colCount; c++) {
              drawText(
                section.headers[c] ?? '',
                margin + c * colWidth + 6,
                y - rowHeight + 5,
                'F2',
                8,
                [0.1, 0.2, 0.3],
              );
            }
            y -= rowHeight;
          }

          const rowData = section.rows[r] ?? [];
          const bg: [number, number, number] = r % 2 === 0 ? [1, 1, 1] : [0.97, 0.98, 0.99];
          drawRect(margin, y - rowHeight, contentWidth, rowHeight, bg, [0.88, 0.9, 0.92]);

          for (let c = 0; c < colCount; c++) {
            const cellVal = String(rowData[c] ?? '');
            drawText(
              cellVal,
              margin + c * colWidth + 6,
              y - rowHeight + 5,
              'F1',
              8,
              [0.2, 0.2, 0.2],
            );
          }
          y -= rowHeight;
        }

        y -= 12;
      }
    }

    // Push last page
    if (currentOps.length > 0) {
      pages.push({ stream: currentOps.join('\n') });
    }

    // Build PDF Document structure
    return this.buildPdfBinary(pages, data.organizationName);
  }

  private buildPdfBinary(pages: PageContent[], orgName: string): Buffer {
    const totalPages = pages.length;
    const objects: string[] = [];

    // Obj 1: Catalog
    // Obj 2: Pages
    // Obj 3: Font Helvetica
    // Obj 4: Font Helvetica-Bold
    // For each page:
    // Obj 4 + 2*i + 1: Page
    // Obj 4 + 2*i + 2: Content Stream

    const font1Obj = '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj';
    const font2Obj = '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj';

    const pageObjIds: number[] = [];
    const pageObjects: string[] = [];
    const streamObjects: string[] = [];

    for (let i = 0; i < totalPages; i++) {
      const pageId = 5 + i * 2;
      const streamId = 5 + i * 2 + 1;
      pageObjIds.push(pageId);

      const content = pages[i]?.stream ?? '';
      // Add footer
      const footerText = `Vehicle Management System  |  ${orgName}  |  Page ${i + 1} of ${totalPages}`;
      const footerOp = `\nBT /F1 8 Tf 0.5 0.5 0.5 rg 1 0 0 1 40 25 Tm (${escapePdfText(footerText)}) Tj ET`;
      const fullStream = content + footerOp;
      const streamLen = Buffer.byteLength(fullStream, 'latin1');

      pageObjects.push(
        `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${streamId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>\nendobj`,
      );

      streamObjects.push(
        `${streamId} 0 obj\n<< /Length ${streamLen} >>\nstream\n${fullStream}\nendstream\nendobj`,
      );
    }

    const pagesKids = pageObjIds.map((id) => `${id} 0 R`).join(' ');
    const catalogObj = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj';
    const pagesObj = `2 0 obj\n<< /Type /Pages /Kids [ ${pagesKids} ] /Count ${totalPages} >>\nendobj`;

    objects.push(catalogObj);
    objects.push(pagesObj);
    objects.push(font1Obj);
    objects.push(font2Obj);

    for (let i = 0; i < totalPages; i++) {
      const p = pageObjects[i];
      const s = streamObjects[i];
      if (p) objects.push(p);
      if (s) objects.push(s);
    }

    // Assemble file with xref table
    const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    let offset = Buffer.byteLength(header, 'latin1');
    const offsets: number[] = [0]; // obj 0 is special

    const bodyParts: string[] = [];
    for (const obj of objects) {
      offsets.push(offset);
      bodyParts.push(obj + '\n');
      offset += Buffer.byteLength(obj + '\n', 'latin1');
    }

    const startXref = offset;
    let xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
    for (let i = 1; i < offsets.length; i++) {
      const off = offsets[i] ?? 0;
      xref += `${String(off).padStart(10, '0')} 00000 n \n`;
    }

    const trailer = `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;

    const fullPdf = header + bodyParts.join('') + xref + trailer;
    return Buffer.from(fullPdf, 'latin1');
  }
}
