import { Button } from "@/components/ui/button";
import { Pin, Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type PinButtonProps = {
  isPinned: boolean;
  isLocked: boolean;
  onClick: () => void;
};

export function PinButton({ isPinned, isLocked, onClick }: PinButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 transition-all duration-200",
              isPinned && "text-blue-600 hover:text-blue-700 hover:bg-blue-50",
              !isPinned && !isLocked && "text-slate-500 hover:text-slate-700 hover:bg-slate-100",
              isLocked && "text-slate-400 cursor-not-allowed"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            disabled={isLocked}
          >
            {isLocked ? (
              <Lock className="h-4 w-4" />
            ) : isPinned ? (
              <Pin className="h-4 w-4 fill-current" />
            ) : (
              <Pin className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="bg-slate-900 text-white border-slate-700">
          {isLocked ? "Contact admin to unpin" : isPinned ? "Unpin account" : "Pin account"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
