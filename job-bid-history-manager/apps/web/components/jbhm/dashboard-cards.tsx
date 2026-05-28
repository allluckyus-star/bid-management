import { motion } from "framer-motion";
import type { DashboardSummary } from "@jbhm/shared";
import { Building2, Calendar, CalendarDays, Trophy, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const cards = [
  { key: "total_bids" as const, label: "Total jobs", icon: Users },
  { key: "today_bids" as const, label: "Captured today", icon: Calendar },
  { key: "week_bids" as const, label: "This week", icon: CalendarDays },
  { key: "top_bidder" as const, label: "Top bidder", icon: Trophy, format: (v: string | null) => v ?? "—" },
  { key: "total_companies" as const, label: "Companies", icon: Building2 },
];

type Props = {
  summary: DashboardSummary | null;
  loading: boolean;
};

export function DashboardCards({ summary, loading }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card, index) => {
        const Icon = card.icon;
        const raw = summary?.[card.key];
        const value =
          card.format?.(raw as string | null) ??
          (loading ? "…" : String(raw ?? 0));

        return (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.25 }}
          >
            <Card className="overflow-hidden border-border/80 shadow-sm transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight">{value}</div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
