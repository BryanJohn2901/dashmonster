// Exporta um elemento do DOM como PNG ou PDF para compartilhamento.
// Usa html2canvas (DOM → canvas) e jsPDF (canvas → PDF A4).

export type ReportFormat = "pdf" | "png";

function sanitize(name: string): string {
  return name.replace(/[^\w\-.]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "relatorio";
}

/**
 * Captura `el` e baixa como PNG ou PDF.
 * Resolve a cor de fundo a partir do --dm-bg-page (ou #0b1437 fallback) para
 * não sair com fundo transparente/preto.
 */
export async function exportReport(
  el: HTMLElement,
  opts: { format: ReportFormat; fileName: string },
): Promise<void> {
  const [{ default: html2canvas }] = await Promise.all([import("html2canvas")]);

  const bg =
    getComputedStyle(document.documentElement).getPropertyValue("--dm-bg-page").trim() ||
    getComputedStyle(el).backgroundColor ||
    "#0b1437";

  const canvas = await html2canvas(el, {
    backgroundColor: bg,
    scale: Math.min(2, window.devicePixelRatio || 1.5),
    useCORS: true,
    logging: false,
    windowWidth: el.scrollWidth,
  });

  const fileName = sanitize(opts.fileName);

  if (opts.format === "png") {
    const url = canvas.toDataURL("image/png");
    triggerDownload(url, `${fileName}.png`);
    return;
  }

  // PDF: encaixa o canvas na largura A4, paginando se a altura exceder.
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;
  const imgData = canvas.toDataURL("image/png");

  let remaining = imgH;
  let position = 0;
  while (remaining > 0) {
    pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
    remaining -= pageH;
    if (remaining > 0) { pdf.addPage(); position -= pageH; }
  }
  pdf.save(`${fileName}.pdf`);
}

function triggerDownload(url: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
