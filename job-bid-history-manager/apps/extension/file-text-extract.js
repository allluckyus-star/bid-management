/** Local .txt / .md / .docx / .pdf → plain text (no server, no capture token). */

let pdfJsLibPromise = null;

function fileBaseName(fileName) {
  return String(fileName || "")
    .replace(/\.[^.]+$/, "")
    .trim();
}

function sniffUploadKind(file, headBytes) {
  const name = String(file?.name || "").toLowerCase();
  const mime = String(file?.type || "").toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md") || mime.startsWith("text/")) return "text";
  if (name.endsWith(".docx") || mime.includes("wordprocessingml")) return "docx";
  if (name.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (headBytes?.length >= 4) {
    if (headBytes[0] === 0x50 && headBytes[1] === 0x4b) return "docx";
    if (headBytes[0] === 0x25 && headBytes[1] === 0x50 && headBytes[2] === 0x44 && headBytes[3] === 0x46) {
      return "pdf";
    }
  }
  return "unknown";
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function xmlTextFromDocx(xml) {
  const paragraphs = [];
  const paragraphRe = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  const textRe = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let paragraphMatch;
  while ((paragraphMatch = paragraphRe.exec(xml))) {
    const paragraphXml = paragraphMatch[0]
      .replace(/<w:tab[^/]*\/>/g, "\t")
      .replace(/<w:br[^/]*\/>/g, "\n");
    const runs = [];
    let textMatch;
    while ((textMatch = textRe.exec(paragraphXml))) {
      runs.push(textMatch[1]);
    }
    paragraphs.push(decodeXmlEntities(runs.join("")));
  }
  return paragraphs
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pdfItemsToLines(items) {
  const lines = [];
  let current = "";
  for (const item of items) {
    const piece = String(item?.str || "");
    if (!piece && !item?.hasEOL) continue;
    current += piece;
    if (item.hasEOL) {
      const line = current.replace(/\s+/g, " ").trim();
      if (line) lines.push(line);
      current = "";
    }
  }
  const tail = current.replace(/\s+/g, " ").trim();
  if (tail) lines.push(tail);
  if (lines.length) return lines;

  // Fallback: group by similar Y position when hasEOL is missing.
  const sorted = [...items]
    .filter((item) => String(item?.str || "").trim())
    .sort((a, b) => {
      const yDiff = (b.transform?.[5] ?? 0) - (a.transform?.[5] ?? 0);
      if (Math.abs(yDiff) > 0.5) return yDiff;
      return (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0);
    });
  let lastY = null;
  let row = [];
  for (const item of sorted) {
    const y = item.transform?.[5] ?? 0;
    if (lastY !== null && Math.abs(y - lastY) > 4) {
      const line = row.join(" ").replace(/\s+/g, " ").trim();
      if (line) lines.push(line);
      row = [];
    }
    row.push(String(item.str || "").trim());
    lastY = y;
  }
  const lastLine = row.join(" ").replace(/\s+/g, " ").trim();
  if (lastLine) lines.push(lastLine);
  return lines;
}

async function extractDocxTextLocal(arrayBuffer) {
  if (typeof JSZip === "undefined") {
    throw new Error("DOCX reader is not loaded. Reload the extension.");
  }
  const zip = await JSZip.loadAsync(arrayBuffer);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("Invalid DOCX: missing document body.");
  const xml = await entry.async("string");
  const text = xmlTextFromDocx(xml);
  if (!text) throw new Error("No readable text found in DOCX.");
  return text;
}

async function getPdfJsLib() {
  if (pdfJsLibPromise) return pdfJsLibPromise;
  const libUrl =
    typeof chrome !== "undefined" && chrome.runtime?.getURL
      ? chrome.runtime.getURL("vendor/pdf.min.mjs")
      : "vendor/pdf.min.mjs";
  pdfJsLibPromise = import(libUrl).then((lib) => {
    const workerUrl =
      typeof chrome !== "undefined" && chrome.runtime?.getURL
        ? chrome.runtime.getURL("vendor/pdf.worker.min.mjs")
        : "vendor/pdf.worker.min.mjs";
    lib.GlobalWorkerOptions.workerSrc = workerUrl;
    return lib;
  });
  return pdfJsLibPromise;
}

async function extractPdfTextLocal(arrayBuffer) {
  const pdfjs = await getPdfJsLib();
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const parts = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const pageLines = pdfItemsToLines(content.items);
    if (pageLines.length) parts.push(pageLines.join("\n"));
  }
  const text = parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error("No readable text found in PDF.");
  return text;
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
async function extractTextFromUploadFile(file) {
  if (!file) throw new Error("No file selected.");
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const kind = sniffUploadKind(file, head);
  if (kind === "text") return String(await file.text());
  const buffer = await file.arrayBuffer();
  if (kind === "docx") return extractDocxTextLocal(buffer);
  if (kind === "pdf") return extractPdfTextLocal(buffer);
  throw new Error("Use .txt, .md, .docx, or .pdf");
}

extractTextFromUploadFile.fileBaseName = fileBaseName;
