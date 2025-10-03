import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Division = "ESG" | "GDT" | "GVC" | "MSG_US" | "MIXED";

interface DivisionBadgeProps {
  division: Division;
  className?: string;
}

const divisionColors: Record<Division, string> = {
  ESG: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100",
  GDT: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  GVC: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100",
  MSG_US: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
  MIXED: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100",
};

const divisionLabels: Record<Division, string> = {
  ESG: "ESG",
  GDT: "GDT",
  GVC: "GVC",
  MSG_US: "MSG US",
  MIXED: "MIXED",
};

export function DivisionBadge({ division, className }: DivisionBadgeProps) {
  return (
    <Badge className={cn(divisionColors[division], className)} variant="secondary">
      {divisionLabels[division]}
    </Badge>
  );
}
