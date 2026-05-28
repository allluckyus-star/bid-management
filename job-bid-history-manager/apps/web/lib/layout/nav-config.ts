import {
  LayoutDashboard,
  Puzzle,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Match pathname prefix for active state */
  match?: "exact" | "prefix";
};

export function teamNavItems(teamId: string): NavItem[] {
  const base = `/team/${teamId}`;
  return [
    {
      label: "Overview",
      href: `${base}/dashboard`,
      icon: LayoutDashboard,
      match: "exact",
    },
    {
      label: "Extension",
      href: `${base}/dashboard/extension`,
      icon: Puzzle,
      match: "prefix",
    },
    {
      label: "Settings",
      href: `${base}/dashboard/settings`,
      icon: Settings,
      match: "prefix",
    },
  ];
}

export type PageMeta = {
  title: string;
  subtitle?: string;
};

export function pageMetaForPath(pathname: string, teamId: string): PageMeta {
  const base = `/team/${teamId}/dashboard`;
  if (pathname === base) {
    return {
      title: "Overview",
      subtitle: "Captured jobs, timeline, and team stats",
    };
  }
  if (pathname.startsWith(`${base}/applications`)) {
    return {
      title: "Applications",
      subtitle: "Browse and manage captured job applications",
    };
  }
  if (pathname.startsWith(`${base}/extension`)) {
    return {
      title: "Extension setup",
      subtitle: "Install the Chrome extension and manage capture tokens",
    };
  }
  if (pathname.startsWith(`${base}/analytics`)) {
    return {
      title: "Analytics",
      subtitle: "Bid volume timeline by team member",
    };
  }
  if (pathname.startsWith(`${base}/settings`)) {
    return {
      title: "Settings",
      subtitle: "Team preferences and workspace configuration",
    };
  }
  if (pathname.startsWith(`/team/${teamId}/resumes`)) {
    return {
      title: "Resume library",
      subtitle: "Upload .docx files for ChatGPT optimization",
    };
  }
  if (pathname.startsWith(`/team/${teamId}/jd`)) {
    return {
      title: "JD Source",
      subtitle: "Job description for resume prompts and the extension",
    };
  }
  return { title: "Dashboard" };
}
