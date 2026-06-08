// Exporta um elemento do DOM como PNG ou PDF, com alta fidelidade.
// Usa modern-screenshot (foreignObject) → render ~1:1 com o navegador (sombras,
// fontes, gradientes). PDF via jsPDF a partir do PNG.

export type ReportFormat = "pdf" | "png";

function sanitize(name: string): string {
  return name.replace(/[^\w\-.]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "relatorio";
}

export async function exportReport(
  el: HTMLElement,
  opts: { format: ReportFormat; fileName: string },
): Promise<void> {
  const { domToCanvas } = await import("modern-screenshot");

  const canvas = await domToCanvas(el, {
    scale: Math.max(2, window.devicePixelRatio || 1),
    backgroundColor: "#0B1437",
    width: el.offsetWidth,
    height: el.offsetHeight,
  });

  const fileName = sanitize(opts.fileName);

  if (opts.format === "png") {
    triggerDownload(canvas.toDataURL("image/png"), `${fileName}.png`);
    return;
  }

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
