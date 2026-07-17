import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

interface EmptyStateProps {
  icon: IconName;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export default function EmptyState({ icon, title, description, action, compact = false, className = "" }: EmptyStateProps) {
  return (
    <div className={`empty-state ${compact ? "empty-state-compact" : ""} ${className}`.trim()}>
      <span className="empty-state-icon"><Icon name={icon} size={22} /></span>
      <div className="empty-state-copy">
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </div>
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
