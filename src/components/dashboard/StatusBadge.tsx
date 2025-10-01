import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Status = "approval_for_pinning" | "pinned" | "approval_for_assigning" | "assigned";

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

const statusConfig: Record<Status, { label: string; className: string }> = {
  approval_for_pinning: {
    label: "Pending Pin",
    className: "bg-status-approval-pinning text-foreground",
  },
  pinned: {
    label: "Pinned",
    className: "bg-status-pinned text-primary-foreground",
  },
  approval_for_assigning: {
    label: "Pending Assign",
    className: "bg-status-approval-assigning text-foreground",
  },
  assigned: {
    label: "Assigned",
    className: "bg-status-assigned text-primary-foreground",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <Badge className={cn(config.className, className)} variant="secondary">
      {config.label}
    </Badge>
  );
}
