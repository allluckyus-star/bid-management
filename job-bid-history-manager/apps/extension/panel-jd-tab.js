/**
 * JD tab helpers — JD editing lives in the Preview section (panel-preview-tab.js).
 * Legacy local JD text is migrated into preview on load.
 */

function emptyJdDraft() {
  return {
    text: "",
    title: "",
    sourceUrl: "",
    sourceDomain: "",
    pageTitle: "",
    sourceMode: "manual",
    useLatestBid: false,
    textLength: 0,
    quality: "weak",
    loading: false,
  };
}
