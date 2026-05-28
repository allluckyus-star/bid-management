import type { JobFilters, Tag } from "@jbhm/shared";

import { motion, AnimatePresence } from "framer-motion";


import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { useTeamTimezone } from "@/context/team-context";
import { cn } from "@/lib/utils";



export type FilterState = JobFilters & {

  tagNames: string[];

};



type Props = {

  filters: FilterState;

  allTags: Tag[];

  capturedByUsers: string[];

  onChange: (next: Partial<FilterState>) => void;

  onSearch: () => void;

  onClear: () => void;

};



export function FilterBar({

  filters,

  allTags,

  capturedByUsers,

  onChange,

  onSearch,

  onClear,

}: Props) {
  const teamTimezone = useTeamTimezone();

  const searchCount = Object.values(filters.column_search ?? {}).filter((v) => v?.trim()).length;
  const inCount = Object.values(filters.column_in ?? {}).filter((v) => v?.length).length;
  const columnCount = searchCount + inCount;

  const activeCount =

    columnCount +

    filters.tagNames.length +

    (filters.captured_by ? 1 : 0) +

    (filters.date_from || filters.date_to ? 1 : 0);



  const toggleTag = (name: string) => {

    const set = new Set(filters.tagNames);

    if (set.has(name)) set.delete(name);

    else set.add(name);

    onChange({ tagNames: [...set] });

    setTimeout(onSearch, 0);

  };



  return (

    <div className="mb-4 space-y-3">

      <p className="text-xs text-muted-foreground">

        In the table header: <strong>filter</strong> (checkbox values), <strong>sort</strong>{" "}
        (click: ascending → descending → off), and <strong>search</strong> (text). Tag and date
        filters below apply to the whole table. Dates use team timezone ({teamTimezone}).

      </p>



      <div className="flex flex-wrap items-center gap-3">

        <label className="flex items-center gap-2 text-xs text-muted-foreground">

          User

          <select

            className="h-8 rounded-md border border-input bg-background px-2 text-sm"

            value={filters.captured_by ?? ""}

            onChange={(e) => {

              onChange({ captured_by: e.target.value || undefined });

              setTimeout(onSearch, 0);

            }}

          >

            <option value="">All users</option>

            {capturedByUsers.map((u) => (

              <option key={u} value={u}>

                {u}

              </option>

            ))}

          </select>

        </label>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">

          From

          <input

            type="date"

            className="h-8 rounded-md border border-input bg-background px-2 text-sm"

            value={filters.date_from?.slice(0, 10) ?? ""}

            onChange={(e) => {

              onChange({

                date_from: e.target.value || undefined,

              });

              setTimeout(onSearch, 0);

            }}

          />

        </label>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">

          To

          <input

            type="date"

            className="h-8 rounded-md border border-input bg-background px-2 text-sm"

            value={filters.date_to?.slice(0, 10) ?? ""}

            onChange={(e) => {

              onChange({

                date_to: e.target.value || undefined,

              });

              setTimeout(onSearch, 0);

            }}

          />

        </label>

        <Button variant="outline" onClick={onClear} disabled={activeCount === 0}>

          Clear all filters

        </Button>

      </div>



      {allTags.length > 0 && (

        <div className="flex flex-wrap gap-2">

          <span className="text-xs text-muted-foreground self-center">Tags:</span>

          {allTags.map((tag) => {

            const active = filters.tagNames.includes(tag.name);

            return (

              <button key={tag.id} type="button" onClick={() => toggleTag(tag.name)}>

                <Badge

                  variant={active ? "default" : "outline"}

                  className={cn("cursor-pointer transition-transform hover:scale-105", active && "ring-2 ring-ring")}

                  style={tag.color && active ? { backgroundColor: tag.color } : undefined}

                >

                  {tag.name}

                </Badge>

              </button>

            );

          })}

        </div>

      )}



      <AnimatePresence>

        {activeCount > 0 && (

          <motion.div

            initial={{ opacity: 0, height: 0 }}

            animate={{ opacity: 1, height: "auto" }}

            exit={{ opacity: 0, height: 0 }}

            className="flex flex-wrap items-center gap-2"

          >

            <span className="text-xs font-medium text-muted-foreground">Active:</span>

            {columnCount > 0 && (

              <Badge variant="secondary">{columnCount} column filter(s)</Badge>

            )}

            {filters.captured_by && (

              <Badge variant="secondary">User: {filters.captured_by}</Badge>

            )}

            {(filters.date_from || filters.date_to) && (

              <Badge variant="secondary">date range</Badge>

            )}

            {filters.tagNames.map((t) => (

              <Badge key={t} variant="secondary">

                #{t}

              </Badge>

            ))}

          </motion.div>

        )}

      </AnimatePresence>

    </div>

  );

}


