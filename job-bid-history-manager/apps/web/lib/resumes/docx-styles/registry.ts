export type DocxStyleId = "calibri" | "chad-taylor" | "chad-taylor-pdf" | "flowcv" | "flowcv-source";

export type DocxStyleOption = {
  id: DocxStyleId;
  label: string;
  description: string;
};

export const DOCX_STYLE_OPTIONS: DocxStyleOption[] = [
  {
    id: "calibri",
    label: "Calibri (default)",
    description: "Two-column header with Calibri typography.",
  },
  {
    id: "chad-taylor",
    label: "Professional Times",
    description: "Right-aligned header, Times New Roman, narrative role intros.",
  },
  {
    id: "chad-taylor-pdf",
    label: "Roboto",
    description: "Montserrat headings, Roboto body, blue accent, pipe contact row.",
  },
  {
    id: "flowcv",
    label: "FlowCV Modern",
    description: "Open Sans, accent headings, inline contact row, two-column skills.",
  },
  {
    id: "flowcv-source",
    label: "FlowCV Source Sans",
    description: "Source Sans Pro, centered header, black section titles, dates and location on one line.",
  },
];

export function normalizeDocxStyleId(value?: string | null): DocxStyleId {
  const id = String(value ?? "").trim().toLowerCase();
  if (id === "chad-taylor" || id === "chad" || id === "times" || id === "professional-times") {
    return "chad-taylor";
  }
  if (
    id === "chad-taylor-pdf" ||
    id === "chad-taylor-pdf-style" ||
    id === "chad-pdf" ||
    id === "roboto"
  ) {
    return "chad-taylor-pdf";
  }
  if (id === "flowcv" || id === "flow-cv" || id === "flow") {
    return "flowcv";
  }
  if (
    id === "flowcv-source" ||
    id === "flowcv-pro" ||
    id === "source-sans" ||
    id === "flowcv-classic"
  ) {
    return "flowcv-source";
  }
  return "calibri";
}
