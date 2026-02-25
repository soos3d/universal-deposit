"use client";

import { useEffect, useCallback } from "react";
import { cn } from "../utils/cn";
import { DepositWidget, type DepositWidgetProps } from "./DepositWidget";

export interface DepositModalProps extends Omit<DepositWidgetProps, "onClose"> {
  isOpen: boolean;
  onClose: () => void;
  overlayClassName?: string;
}

export function DepositModal({
  isOpen,
  onClose,
  client,
  className,
  overlayClassName,
  theme = "dark",
  destination,
  onDestinationChange,
  showDestination,
}: DepositModalProps) {
  // client is optional - DepositWidget will use context if not provided
  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-4",
        "animate-in fade-in duration-200",
        overlayClassName
      )}
    >
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0",
          theme === "dark"
            ? "bg-black/80 backdrop-blur-sm"
            : "bg-black/50 backdrop-blur-sm"
        )}
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        className={cn(
          "relative z-10",
          "animate-in zoom-in-95 duration-200",
          className
        )}
      >
        <DepositWidget
          client={client}
          onClose={onClose}
          theme={theme}
          destination={destination}
          onDestinationChange={onDestinationChange}
          showDestination={showDestination}
        />
      </div>
    </div>
  );
}
