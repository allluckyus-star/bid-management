import { DashboardFiltersProvider } from "@/components/dashboard/dashboard-filters-context";

type Props = {
  children: React.ReactNode;
};

export default function TeamDashboardLayout({ children }: Props) {
  return <DashboardFiltersProvider>{children}</DashboardFiltersProvider>;
}
