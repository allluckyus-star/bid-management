const JBHM_DOWNLOAD_REQUEST = "JBHM_DOWNLOAD_REQUEST";
const JBHM_DOWNLOAD_RESPONSE = "JBHM_DOWNLOAD_RESPONSE";

function waitForExtensionDownload(
  requestId: string,
  buffer: ArrayBuffer,
  filename: string,
  mimeType: string,
): Promise<{ ok: boolean; downloadPath?: string }> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve({ ok: false });
    }, 12_000);

    function onMessage(event: MessageEvent) {
      if (event.source !== window) return;
      const data = event.data as {
        type?: string;
        requestId?: string;
        ok?: boolean;
        downloadPath?: string;
      };
      if (data?.type !== JBHM_DOWNLOAD_RESPONSE || data.requestId !== requestId) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve({ ok: data.ok === true, downloadPath: data.downloadPath });
    }

    window.addEventListener("message", onMessage);
    window.postMessage(
      {
        type: JBHM_DOWNLOAD_REQUEST,
        requestId,
        filename,
        mimeType,
        buffer,
      },
      "*",
      [buffer],
    );
  });
}

function downloadBlobInBrowser(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Download via extension into Downloads/username-YYYY-MM-DD/ when the extension is installed.
 * Falls back to a normal browser download in the default folder.
 */
export async function downloadResumeWithSubfolder(
  url: string,
  leafFilename: string,
): Promise<{ usedExtension: boolean; downloadPath?: string }> {
  const absoluteUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
  const res = await fetch(absoluteUrl, { credentials: "include" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const buffer = await blob.arrayBuffer();
  const mimeType =
    blob.type ||
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  const requestId = crypto.randomUUID();
  const ext = await waitForExtensionDownload(requestId, buffer, leafFilename, mimeType);
  if (ext.ok) {
    return { usedExtension: true, downloadPath: ext.downloadPath };
  }

  downloadBlobInBrowser(blob, leafFilename);
  return { usedExtension: false };
}
