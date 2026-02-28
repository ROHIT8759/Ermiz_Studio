"use client";

type StudioFooterProps = {
  isCompactViewport: boolean;
  statusText: string;
  creditUsedPercent: number;
  saveState: string;
  commitStatus: string;
};

export function StudioFooter({
  isCompactViewport,
  statusText,
  creditUsedPercent,
  saveState,
  commitStatus,
}: StudioFooterProps) {
  return (
    <footer
      style={{
        minHeight: isCompactViewport ? 30 : 28,
        flexShrink: 0,
        background: "color-mix(in srgb, var(--panel) 94%, #0c111a 6%)",
        borderTop: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        padding: isCompactViewport ? "4px 10px" : "0 16px",
        fontSize: 11,
        color: "var(--muted)",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {statusText}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "2px 8px",
            color: "var(--secondary)",
          }}
        >
          Credits Used: {creditUsedPercent}%
        </span>
        {!isCompactViewport && (
          <span
            style={{
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "2px 8px",
              color: "var(--secondary)",
            }}
          >
            Save: {saveState}
          </span>
        )}
        {!isCompactViewport && (
          <span
            style={{
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "2px 8px",
              color: "var(--secondary)",
            }}
          >
            Commit: {commitStatus}
          </span>
        )}
      </div>
    </footer>
  );
}
