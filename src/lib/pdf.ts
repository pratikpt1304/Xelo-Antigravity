const MAX_PDF_BYTES = 2 * 1024 * 1024;

export async function pdfToText(file: File): Promise<string> {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error('pdf_too_large');
  }
  if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
    return await file.text();
  }

  const pdfjs = await import('pdfjs-dist');
  const buf = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: buf, useWorkerFetch: false }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    pages.push(text);
  }
  return pages.join('\n');
}
