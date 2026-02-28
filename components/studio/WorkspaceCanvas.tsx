"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { PropertyInspector } from "@/components/panels/PropertyInspector";
import { DatabaseSchemaDesigner } from "@/components/panels/DatabaseSchemaDesigner";
import { DatabaseQueryBuilder } from "@/components/panels/DatabaseQueryBuilder";
import { useStore, type NodeKind } from "@/store/useStore";

const FlowCanvas = dynamic(() => import("@/components/canvas/FlowCanvas"), {
  ssr: false,
});

const STORAGE_KEYS = {
  leftSidebarCollapsed: "ermiz.leftSidebarCollapsed",
  rightSidebarCollapsed: "ermiz.rightSidebarCollapsed",
  leftSidebarWidth: "ermiz.leftSidebarWidth",
  inspectorWidth: "ermiz.inspectorWidth",
};

const DEFAULT_LEFT_WIDTH = 236;
const DEFAULT_INSPECTOR_WIDTH = 320;
const clampLeftWidth = (value: number) =>
  Math.max(200, Math.min(420, value || DEFAULT_LEFT_WIDTH));
const clampInspectorWidth = (value: number) =>
  Math.max(260, Math.min(520, value || DEFAULT_INSPECTOR_WIDTH));

export type SidebarItem = {
  kind: NodeKind;
  label: string;
  icon: string;
  hoverColor: string;
  mono?: boolean;
  hint?: string;
};

export type SidebarSection = {
  id: string;
  title: string;
  muted?: boolean;
  items: SidebarItem[];
};
export function WorkspaceCanvas({
  sections,
  flatList = false,
  showSearch = false,
  isDatabaseWorkspace = false,
}: {
  sections: SidebarSection[];
  flatList?: boolean;
  showSearch?: boolean;
  isDatabaseWorkspace?: boolean;
}) {
  const addNode = useStore((state) => state.addNode);
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});
  const [componentSearch, setComponentSearch] = useState("");
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [inspectorWidth, setInspectorWidth] = useState(DEFAULT_INSPECTOR_WIDTH);
  const resizeStateRef = useRef<{
    side: "left" | "right" | null;
    startX: number;
    startWidth: number;
  }>({
    side: null,
    startX: 0,
    startWidth: 0,
  });

  const sidebarItemStyle: React.CSSProperties = {
    // base layout — visual states handled by .sidebar-item CSS class
  };

  const flatItems = useMemo(
    () =>
      sections.flatMap((section) =>
        section.items.map((item, index) => ({
          ...item,
          key: `${section.id}-${item.kind}-${item.label}-${index}`,
          muted: section.muted ?? false,
        })),
      ),
    [sections],
  );

  const filteredFlatItems = useMemo(() => {
    if (!flatList) return flatItems;
    const query = componentSearch.trim().toLowerCase();
    if (!query) return flatItems;
    return flatItems.filter(
      (item) =>
        item.label.toLowerCase().includes(query) ||
        item.kind.toLowerCase().includes(query) ||
        (item.hint?.toLowerCase().includes(query) ?? false),
    );
  }, [componentSearch, flatItems, flatList]);

  useEffect(() => {
    // Load saved widths and collapsed states from localStorage after mount
    if (typeof window !== "undefined") {
      const isNarrow = window.matchMedia("(max-width: 1024px)").matches;

      const savedLeftCollapsed = localStorage.getItem(STORAGE_KEYS.leftSidebarCollapsed);
      const savedRightCollapsed = localStorage.getItem(STORAGE_KEYS.rightSidebarCollapsed);

      const nextLeftCollapsed = isNarrow ? true : savedLeftCollapsed === "1";
      const nextInspectorCollapsed = isNarrow ? true : savedRightCollapsed === "1";
      const storedLeftWidth = Number(localStorage.getItem(STORAGE_KEYS.leftSidebarWidth));
      const nextLeftWidth = storedLeftWidth
        ? clampLeftWidth(storedLeftWidth)
        : DEFAULT_LEFT_WIDTH;
      const storedInspectorWidth = Number(localStorage.getItem(STORAGE_KEYS.inspectorWidth));
      const nextInspectorWidth = storedInspectorWidth
        ? clampInspectorWidth(storedInspectorWidth)
        : DEFAULT_INSPECTOR_WIDTH;

      const frame = window.requestAnimationFrame(() => {
        setIsLeftSidebarCollapsed(nextLeftCollapsed);
        setIsInspectorCollapsed(nextInspectorCollapsed);
        setLeftSidebarWidth(nextLeftWidth);
        setInspectorWidth(nextInspectorWidth);
      });

      return () => {
        window.cancelAnimationFrame(frame);
      };
    }
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state.side) return;

      if (state.side === "left") {
        const nextWidth = Math.max(200, Math.min(420, state.startWidth + (event.clientX - state.startX)));
        setLeftSidebarWidth(nextWidth);
      } else {
        const nextWidth = Math.max(260, Math.min(520, state.startWidth + (state.startX - event.clientX)));
        setInspectorWidth(nextWidth);
      }
    };

    const handleMouseUp = () => {
      resizeStateRef.current.side = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 1024px)");
    const updateViewport = (event?: MediaQueryListEvent) => {
      const isNarrow = event ? event.matches : mediaQuery.matches;
      setIsNarrowViewport(isNarrow);
    };
    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => {
      mediaQuery.removeEventListener("change", updateViewport);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.leftSidebarCollapsed,
        isLeftSidebarCollapsed ? "1" : "0",
      );
      localStorage.setItem(
        STORAGE_KEYS.rightSidebarCollapsed,
        isInspectorCollapsed ? "1" : "0",
      );
      localStorage.setItem(STORAGE_KEYS.leftSidebarWidth, String(leftSidebarWidth));
      localStorage.setItem(STORAGE_KEYS.inspectorWidth, String(inspectorWidth));
    } catch {
      // ignore storage errors
    }
  }, [isLeftSidebarCollapsed, isInspectorCollapsed, leftSidebarWidth, inspectorWidth]);

  useEffect(() => {
    const handleLayoutShortcuts = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "b") {
        event.preventDefault();
        setIsLeftSidebarCollapsed((prev) => !prev);
      }
      if (key === "i") {
        event.preventDefault();
        setIsInspectorCollapsed((prev) => !prev);
      }
      if (key === "0") {
        event.preventDefault();
        setIsLeftSidebarCollapsed(false);
        setIsInspectorCollapsed(false);
        setLeftSidebarWidth(DEFAULT_LEFT_WIDTH);
        setInspectorWidth(DEFAULT_INSPECTOR_WIDTH);
      }
    };
    window.addEventListener("keydown", handleLayoutShortcuts);
    return () => {
      window.removeEventListener("keydown", handleLayoutShortcuts);
    };
  }, []);

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0, height: "100%", overflow: "hidden", position: "relative" }}>
      {isNarrowViewport && (!isLeftSidebarCollapsed || !isInspectorCollapsed) && (
        <button
          type="button"
          aria-label="Close open panel"
          onClick={() => {
            setIsLeftSidebarCollapsed(true);
            setIsInspectorCollapsed(true);
          }}
          style={{
            position: "absolute",
            inset: 0,
            border: "none",
            margin: 0,
            padding: 0,
            background: "rgba(8, 12, 18, 0.48)",
            zIndex: 24,
            cursor: "pointer",
          }}
        />
      )}

      {isNarrowViewport && (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            right: 10,
            display: "flex",
            justifyContent: "space-between",
            zIndex: 26,
            pointerEvents: "none",
          }}
        >
          <button
            type="button"
            aria-label={isLeftSidebarCollapsed ? "Open component library" : "Close component library"}
            title={isLeftSidebarCollapsed ? "Open library" : "Close library"}
            onClick={() => {
              setIsLeftSidebarCollapsed((prev) => !prev);
              setIsInspectorCollapsed(true);
            }}
            style={{
              width: 32,
              height: 32,
              border: "1px solid var(--border)",
              background: isLeftSidebarCollapsed
                ? "var(--floating)"
                : "color-mix(in srgb, var(--primary) 18%, var(--floating) 82%)",
              color: isLeftSidebarCollapsed ? "var(--muted)" : "var(--primary)",
              borderRadius: 8,
              fontSize: 16,
              lineHeight: 1,
              cursor: "pointer",
              pointerEvents: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "var(--shadow-soft)",
              flexShrink: 0,
            }}
          >
            ≡
          </button>
          <button
            type="button"
            aria-label={isInspectorCollapsed ? "Open inspector" : "Close inspector"}
            title={isInspectorCollapsed ? "Open inspector" : "Close inspector"}
            onClick={() => {
              setIsInspectorCollapsed((prev) => !prev);
              setIsLeftSidebarCollapsed(true);
            }}
            style={{
              width: 32,
              height: 32,
              border: "1px solid var(--border)",
              background: isInspectorCollapsed
                ? "var(--floating)"
                : "color-mix(in srgb, var(--primary) 18%, var(--floating) 82%)",
              color: isInspectorCollapsed ? "var(--muted)" : "var(--primary)",
              borderRadius: 8,
              fontSize: 14,
              lineHeight: 1,
              cursor: "pointer",
              pointerEvents: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "var(--shadow-soft)",
              flexShrink: 0,
            }}
          >
            ⊞
          </button>
        </div>
      )}

      {isLeftSidebarCollapsed ? (
        <button
          type="button"
          onClick={() => setIsLeftSidebarCollapsed(false)}
          aria-label="Expand left sidebar"
          style={{
            width: 22,
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            background: "color-mix(in srgb, var(--panel) 92%, #0b0f16 8%)",
            color: "var(--muted)",
            cursor: "pointer",
            display: isNarrowViewport ? "none" : "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ›
        </button>
      ) : (
        <div
          style={{
            position: isNarrowViewport ? "absolute" : "relative",
            top: isNarrowViewport ? 0 : undefined,
            left: 0,
            bottom: isNarrowViewport ? 0 : undefined,
            display: "flex",
            height: isNarrowViewport ? undefined : "100%",
            maxHeight: isNarrowViewport ? undefined : "100%",
            minHeight: 0,
            zIndex: isNarrowViewport ? 26 : 20,
          }}
        >
          <button
            type="button"
            onClick={() => setIsLeftSidebarCollapsed(true)}
            aria-label="Collapse left sidebar"
            style={{
              position: "absolute",
              top: "50%",
              right: isNarrowViewport ? 8 : -12,
              transform: "translateY(-50%)",
              zIndex: 30,
              border: "1px solid var(--border)",
              background: "var(--floating)",
              color: "var(--muted)",
              borderRadius: 8,
              width: 24,
              height: 24,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ‹
          </button>

          <aside
            className="sidebar-scroll sidebar-panel"
            onWheel={(e) => {
              // Prevent canvas zoom while scrolling sidebar, but allow native scroll
              const target = e.currentTarget;
              const isScrollable = target.scrollHeight > target.clientHeight;
              if (isScrollable) {
                e.stopPropagation();
              }
            }}
            style={{
              width: leftSidebarWidth,
              maxWidth: isNarrowViewport ? "calc(100vw - 32px)" : undefined,
              flexShrink: 0,
              height: "100%",
              maxHeight: "100%",
              minHeight: 0,
              borderRight: "1px solid var(--border)",
              background: "color-mix(in srgb, var(--panel) 92%, #0b0f16 8%)",
              paddingTop: isNarrowViewport ? 48 : 12,
              paddingRight: 8,
              paddingBottom: 16,
              paddingLeft: 12,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              scrollbarGutter: "stable",
            }}
          >
            {flatList ? (
              <>
                {showSearch && (
                  <div
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      background: "var(--floating)",
                      padding: 8,
                    }}
                  >
                    <input
                      type="text"
                      value={componentSearch}
                      onChange={(e) => setComponentSearch(e.target.value)}
                      placeholder="Search components..."
                      style={{
                        width: "100%",
                        border: "1px solid var(--border)",
                        background: "var(--panel)",
                        color: "var(--foreground)",
                        borderRadius: 8,
                        padding: "7px 9px",
                        fontSize: 12,
                        outline: "none",
                      }}
                    />
                  </div>
                )}
                <div
                  className="sidebar-section"
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    background: "color-mix(in srgb, var(--panel) 85%, #0b1018 15%)",
                    padding: 8,
                    display: "grid",
                    gap: 6,
                  }}
                >
                  {filteredFlatItems.map((item) => (
                    <div
                      key={item.key}
                      className="sidebar-item"
                      style={{ color: item.muted ? "var(--muted)" : "var(--secondary)" }}
                      onClick={() => addNode(item.kind)}
                      onMouseOver={(e) => { e.currentTarget.style.color = item.hoverColor; }}
                      onMouseOut={(e) => { e.currentTarget.style.color = item.muted ? "var(--muted)" : "var(--secondary)"; }}
                    >
                      <span style={{ fontSize: 12 }}>{item.icon}</span>
                      <span
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          minWidth: 0,
                          overflow: "hidden",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            fontFamily: item.mono ? "monospace" : "inherit",
                            lineHeight: 1.2,
                            whiteSpace: "nowrap",
                            textOverflow: "ellipsis",
                            overflow: "hidden",
                          }}
                        >
                          {item.label}
                        </span>
                        {item.hint && (
                          <span
                            style={{
                              fontSize: 10,
                              color: "var(--muted)",
                              whiteSpace: "nowrap",
                              textOverflow: "ellipsis",
                              overflow: "hidden",
                            }}
                          >
                            {item.hint}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                  {filteredFlatItems.length === 0 && (
                    <div
                      style={{
                        padding: "8px 10px",
                        fontSize: 11,
                        color: "var(--muted)",
                        textAlign: "center",
                      }}
                    >
                      No components match your search.
                    </div>
                  )}
                </div>
              </>
            ) : (
              sections.map((section) => (
                <div
                  className="sidebar-section"
                  key={section.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    background: "color-mix(in srgb, var(--panel) 85%, #0b1018 15%)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "9px 10px",
                      borderBottom: collapsedSections[section.id]
                        ? "none"
                        : "1px solid var(--border)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedSections((prev) => ({
                          ...prev,
                          [section.id]: !prev[section.id],
                        }))
                      }
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "var(--muted)",
                        cursor: "pointer",
                        padding: 0,
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span>{collapsedSections[section.id] ? "▸" : "▾"}</span>
                      <span>{section.title}</span>
                    </button>
                    <span style={{ fontSize: 10, color: "var(--muted)" }}>
                      {section.items.length}
                    </span>
                  </div>
                  {!collapsedSections[section.id] && (
                    <div
                      style={{
                        padding: 8,
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      {section.items.map((item, index) => (
                        <div
                          key={`${section.id}-${item.kind}-${item.label}-${index}`}
                          className="sidebar-item"
                          style={{ color: section.muted ? "var(--muted)" : "var(--secondary)" }}
                          onClick={() => addNode(item.kind)}
                          onMouseOver={(e) => { e.currentTarget.style.color = item.hoverColor; }}
                          onMouseOut={(e) => { e.currentTarget.style.color = section.muted ? "var(--muted)" : "var(--secondary)"; }}
                        >
                          <span style={{ fontSize: 12 }}>{item.icon}</span>
                          <span
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                              minWidth: 0,
                              overflow: "hidden",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12,
                                fontFamily: item.mono ? "monospace" : "inherit",
                                lineHeight: 1.2,
                                whiteSpace: "nowrap",
                                textOverflow: "ellipsis",
                                overflow: "hidden",
                              }}
                            >
                              {item.label}
                            </span>
                            {item.hint && (
                              <span
                                style={{
                                  fontSize: 10,
                                  color: "var(--muted)",
                                  whiteSpace: "nowrap",
                                  textOverflow: "ellipsis",
                                  overflow: "hidden",
                                }}
                              >
                                {item.hint}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </aside>
        </div>
      )}

      {!isLeftSidebarCollapsed && (
        <div
          onMouseDown={(event) => {
            resizeStateRef.current = {
              side: "left",
              startX: event.clientX,
              startWidth: leftSidebarWidth,
            };
          }}
          style={{
            width: 6,
            cursor: "col-resize",
            flexShrink: 0,
            background: "transparent",
            borderRight: "1px solid color-mix(in srgb, var(--border) 70%, transparent)",
            display: isNarrowViewport ? "none" : "block",
          }}
        />
      )}

      <main
        style={{
          flex: 1,
          position: "relative",
          background: "var(--background)",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          <FlowCanvas />
        </div>
        {isDatabaseWorkspace && (
          <>
            <DatabaseSchemaDesigner />
            <DatabaseQueryBuilder />
          </>
        )}
      </main>

      {isInspectorCollapsed ? (
        <button
          type="button"
          onClick={() => setIsInspectorCollapsed(false)}
          aria-label="Expand inspector"
          style={{
            width: 22,
            flexShrink: 0,
            borderLeft: "1px solid var(--border)",
            background: "color-mix(in srgb, var(--panel) 92%, #0b0f16 8%)",
            color: "var(--muted)",
            cursor: "pointer",
            display: isNarrowViewport ? "none" : "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ‹
        </button>
      ) : (
        <div
          style={{
            position: isNarrowViewport ? "absolute" : "relative",
            top: isNarrowViewport ? 0 : undefined,
            right: 0,
            bottom: isNarrowViewport ? 0 : undefined,
            display: "flex",
            zIndex: isNarrowViewport ? 26 : undefined,
          }}
        >
          <div
            onMouseDown={(event) => {
              resizeStateRef.current = {
                side: "right",
                startX: event.clientX,
                startWidth: inspectorWidth,
              };
            }}
            style={{
              width: 6,
              cursor: "col-resize",
              flexShrink: 0,
              background: "transparent",
              borderLeft: "1px solid color-mix(in srgb, var(--border) 70%, transparent)",
              display: isNarrowViewport ? "none" : "block",
            }}
          />
          <button
            type="button"
            onClick={() => setIsInspectorCollapsed(true)}
            aria-label="Collapse inspector"
            style={{
              position: "absolute",
              top: "50%",
              left: isNarrowViewport ? 8 : -12,
              transform: "translateY(-50%)",
              zIndex: 2,
              border: "1px solid var(--border)",
              background: "var(--floating)",
              color: "var(--muted)",
              borderRadius: 8,
              width: 24,
              height: 24,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ›
          </button>
          <PropertyInspector
            width={isNarrowViewport ? Math.min(inspectorWidth, 360) : inspectorWidth}
          />
        </div>
      )}
    </div>
  );
}

