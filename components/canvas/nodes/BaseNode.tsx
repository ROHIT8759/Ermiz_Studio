import React from "react";
import { clsx } from "clsx";

interface BaseNodeProps {
  selected?: boolean;
  type: string;
  label: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function BaseNode({
  selected,
  type,
  label,
  children,
  footer,
  className,
}: BaseNodeProps) {
  return (
    <div className={clsx("ermiz-node", selected && "selected", className)}>
      {/* Header */}
      <div className="ermiz-node-header">
        {type && <span className="ermiz-node-type">{type}</span>}
        <div className="ermiz-node-label">{label}</div>
      </div>

      {/* Body */}
      <div className="ermiz-node-body">{children}</div>

      {/* Footer */}
      {footer && <div className="ermiz-node-footer">{footer}</div>}
    </div>
  );
}
