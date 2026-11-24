function launchPrint(html: string) {
  const w = window.open("", "_blank", "width=820,height=900");
  if (w) {
    w.document.write(html);
    w.document.close();
    return true;
  }

  // Fallback inside sandboxed iframes where window.open may be blocked.
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return false;
  }
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => iframe.remove(), 2000);
    }
  }, 350);
  return true;
}

/** Opens a clean Carta/A4 printable document. */
export function printHtml(title: string, body: string) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  *{box-sizing:border-box} body{font-family:"Barlow",system-ui,sans-serif;color:#14213d;margin:24px;font-size:13px}
  h1,h2,h3{font-family:"Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase;margin:0}
  h1{font-size:26px} h2{font-size:16px;margin-top:16px;padding:4px 8px;background:#14213d;color:#f5b301;display:inline-block;border-radius:4px}
  table{width:100%;border-collapse:collapse;margin-top:8px} th,td{padding:5px 6px;border-bottom:1px solid #e5e7eb;text-align:left}
  th{font-size:11px;text-transform:uppercase;color:#6b7280} .r{text-align:right} .muted{color:#6b7280}
  .head{display:flex;gap:14px;align-items:center;border-bottom:3px solid #f5b301;padding-bottom:10px}
  .head img{width:64px;height:64px;border-radius:50%} .tot{font-size:18px;font-weight:800}
  @media print{body{margin:10mm}}
</style></head><body>${body}<script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script></body></html>`;
  return launchPrint(html);
}

/** Opens a narrow 80mm thermal ticket printable layout. */
export function printTicketHtml(title: string, body: string) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page{size:80mm auto;margin:3mm}
  *{box-sizing:border-box}
  body{font-family:"Courier New",ui-monospace,monospace;color:#000;width:72mm;margin:0 auto;padding:4mm 2mm;font-size:11px;line-height:1.35}
  .c{text-align:center} .r{text-align:right} .b{font-weight:700}
  .title{font-size:15px;font-weight:800;text-transform:uppercase;margin:0}
  .doc{font-size:13px;font-weight:800;text-transform:uppercase;margin:4px 0 2px}
  .hr{border-top:1px dashed #000;margin:6px 0}
  table{width:100%;border-collapse:collapse}
  th,td{padding:2px 0;vertical-align:top;font-size:11px}
  th{border-bottom:1px dashed #000;text-align:left;font-size:10px;text-transform:uppercase}
  .tot{font-size:14px;font-weight:800}
  .muted{font-size:10px;color:#333}
  @media print{body{width:72mm;margin:0;padding:0}}
</style></head><body>${body}<script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script></body></html>`;
  return launchPrint(html);
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
