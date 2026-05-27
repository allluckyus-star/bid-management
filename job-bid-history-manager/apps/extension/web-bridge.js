/** Bridges dashboard download clicks to extension chrome.downloads (subfolder support). */
(function () {
  const REQUEST = "JBHM_DOWNLOAD_REQUEST";
  const RESPONSE = "JBHM_DOWNLOAD_RESPONSE";

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== REQUEST || !data.requestId) return;

    chrome.runtime.sendMessage(
      {
        type: "DOWNLOAD_BLOB",
        leafFilename: data.filename,
        mimeType: data.mimeType,
        buffer: data.buffer,
      },
      (response) => {
        const err = chrome.runtime.lastError;
        window.postMessage(
          {
            type: RESPONSE,
            requestId: data.requestId,
            ok: !err && response?.status === "ok",
            detail: err?.message || response?.detail,
            downloadPath: response?.downloadPath,
          },
          "*",
        );
      },
    );
  });
})();
