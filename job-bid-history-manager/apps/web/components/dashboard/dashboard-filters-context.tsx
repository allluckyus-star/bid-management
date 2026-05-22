"use client";

import type {
  JobColumnSearch,
  JobColumnSelections,
  JobFilterableField,
  JobFilters,
  JobSortEntry,
  JobSortField,
} from "@jbhm/shared";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { FilterState } from "@/components/jbhm/filter-bar";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export const emptyFilters: FilterState = {
  tagNames: [],
  column_search: {},
  column_in: {},
  sort: [{ field: "captured_at", dir: "desc" }],
  captured_by: undefined,
  date_from: undefined,
  date_to: undefined,
  page: 1,
  page_size: 10,
};

type FiltersContextValue = {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  listContext: JobFilters;
  apiFilters: JobFilters;
  filterKey: string;
  pageKey: string;
  handleColumnSearchChange: (field: JobSortField, value: string) => void;
  handleColumnInChange: (field: JobFilterableField, values: string[] | undefined) => void;
  handleSortChange: (sort: JobSortEntry[]) => void;
  markFiltersCleared: () => void;
  consumeFiltersCleared: () => boolean;
};

const DashboardFiltersContext = createContext<FiltersContextValue | null>(null);

export function DashboardFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const clearedRef = useState(() => ({ flag: false }))[0];

  const debouncedSearch = useDebouncedValue(filters.column_search ?? {}, 350);

  const listContext = useMemo<JobFilters>(
    () => ({
      tags: filters.tagNames.length ? filters.tagNames : undefined,
      captured_by: filters.captured_by,
      date_from: filters.date_from,
      date_to: filters.date_to,
      column_search: debouncedSearch,
      column_in: filters.column_in,
    }),
    [
      filters.tagNames,
      filters.captured_by,
      filters.date_from,
      filters.date_to,
      filters.column_in,
      debouncedSearch,
    ],
  );

  const apiFilters = useMemo(
    () => ({
      ...listContext,
      sort: filters.sort?.length
        ? filters.sort
        : [{ field: "captured_at" as const, dir: "desc" as const }],
      page: filters.page ?? 1,
      page_size: filters.page_size ?? 10,
    }),
    [listContext, filters.sort, filters.page, filters.page_size],
  );

  const filterKey = useMemo(
    () => JSON.stringify({ listContext, sort: filters.sort }),
    [listContext, filters.sort],
  );
  const pageKey = useMemo(
    () => `${filters.page ?? 1}-${filters.page_size ?? 10}`,
    [filters.page, filters.page_size],
  );

  const handleColumnSearchChange = useCallback((field: JobSortField, value: string) => {
    setFilters((prev) => {
      const column_search: JobColumnSearch = { ...prev.column_search };
      if (value.trim()) column_search[field] = value;
      else delete column_search[field];
      return { ...prev, column_search, page: 1 };
    });
  }, []);

  const handleColumnInChange = useCallback(
    (field: JobFilterableField, values: string[] | undefined) => {
      setFilters((prev) => {
        const column_in: JobColumnSelections = { ...prev.column_in };
        if (values?.length) column_in[field] = values;
        else delete column_in[field];
        return { ...prev, column_in, page: 1 };
      });
    },
    [],
  );

  const handleSortChange = useCallback((sort: JobSortEntry[]) => {
    setFilters((prev) => ({ ...prev, sort, page: 1 }));
  }, []);

  const value = useMemo<FiltersContextValue>(
    () => ({
      filters,
      setFilters,
      listContext,
      apiFilters,
      filterKey,
      pageKey,
      handleColumnSearchChange,
      handleColumnInChange,
      handleSortChange,
      markFiltersCleared: () => {
        clearedRef.flag = true;
      },
      consumeFiltersCleared: () => {
        if (!clearedRef.flag) return false;
        clearedRef.flag = false;
        return true;
      },
    }),
    [
      filters,
      listContext,
      apiFilters,
      filterKey,
      pageKey,
      handleColumnSearchChange,
      handleColumnInChange,
      handleSortChange,
      clearedRef,
    ],
  );

  return (
    <DashboardFiltersContext.Provider value={value}>{children}</DashboardFiltersContext.Provider>
  );
}

export function useDashboardFilters() {
  const ctx = useContext(DashboardFiltersContext);
  if (!ctx) throw new Error("useDashboardFilters must be used within DashboardFiltersProvider");
  return ctx;
}
