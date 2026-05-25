"use client";

import { createContext, useContext, type ReactNode } from "react";

export type TableEditField =
  | "captured_by"
  | "company_name"
  | "job_title"
  | "location"
  | "salary_text"
  | "source_url";

export type TableEditState = {
  key: string;
  jobId: string;
  field: TableEditField;
  draft: string;
} | null;

type Ctx = {
  edit: TableEditState;
  setEdit: (next: TableEditState) => void;
};

const TableCellEditContext = createContext<Ctx | null>(null);

export function TableCellEditProvider({
  edit,
  setEdit,
  children,
}: {
  edit: TableEditState;
  setEdit: (next: TableEditState) => void;
  children: ReactNode;
}) {
  return (
    <TableCellEditContext.Provider value={{ edit, setEdit }}>
      {children}
    </TableCellEditContext.Provider>
  );
}

export function useTableCellEdit() {
  const ctx = useContext(TableCellEditContext);
  if (!ctx) {
    throw new Error("useTableCellEdit must be used within TableCellEditProvider");
  }
  return ctx;
}
