'use client'

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoaderProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
  fullScreen?: boolean;
}

export function Loader({ 
  size = "md", 
  text = "Loading...", 
  className,
  fullScreen = false 
}: LoaderProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8", 
    lg: "h-12 w-12"
  };

  const content = (
    <div className={cn("flex flex-col items-center space-y-4", className)}>
      <div className="relative">
        <Loader2 className={cn("animate-spin text-primary", sizeClasses[size])} />
        <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
      </div>
      {text && (
        <p className="text-sm text-muted-foreground font-medium">{text}</p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        {content}
      </div>
    );
  }

  return content;
}

export function PageLoader({ text = "Loading page..." }: { text?: string }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <Loader size="lg" text={text} />
        </div>
      </div>
    </div>
  );
}

export function DataLoader({ text = "Loading data..." }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader text={text} />
    </div>
  );
}
