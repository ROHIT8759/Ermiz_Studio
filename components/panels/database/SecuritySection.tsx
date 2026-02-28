"use client";

import React, { useState } from "react";
import { DatabaseBlock } from "@/lib/schema/node";

type SecuritySectionProps = {
  database: DatabaseBlock;
  onChange: (updates: Partial<DatabaseBlock>) => void;
  inputStyle: React.CSSProperties;
  sectionStyle: React.CSSProperties;
};

export function SecuritySection({
  database,
  onChange,
  inputStyle,
  sectionStyle,
}: SecuritySectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [roleNameDraft, setRoleNameDraft] = useState("");
  const [rolePermDraft, setRolePermDraft] = useState("");
  const [allowedIpDraft, setAllowedIpDraft] = useState("");

  const security = database.security || {
    roles: [],
    encryption: { atRest: false, inTransit: false },
    network: { vpcId: "", allowedIPs: [] },
    auditLogging: false,
  };

  return (
    <div style={sectionStyle}>
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        style={{
          border: "none",
          background: "transparent",
          color: "var(--muted)",
          padding: 0,
          cursor: "pointer",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: isExpanded ? 8 : 0,
        }}
      >
        <span>{isExpanded ? "▾" : "▸"}</span>
        <span>Security</span>
      </button>

      {isExpanded && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>
              Roles & Permissions
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                value={roleNameDraft}
                onChange={(e) => setRoleNameDraft(e.target.value)}
                placeholder="Role name"
                style={{ ...inputStyle, flex: 1 }}
              />
              <input
                type="text"
                value={rolePermDraft}
                onChange={(e) => setRolePermDraft(e.target.value)}
                placeholder="read, write, delete"
                style={{ ...inputStyle, flex: 1.3 }}
              />
              <button
                type="button"
                onClick={() => {
                  const roleName = roleNameDraft.trim();
                  if (!roleName) return;
                  const permissions = rolePermDraft
                    .split(",")
                    .map((perm) => perm.trim())
                    .filter(Boolean);
                  onChange({
                    security: {
                      ...security,
                      roles: [...(security.roles || []), { name: roleName, permissions }],
                    },
                  });
                  setRoleNameDraft("");
                  setRolePermDraft("");
                }}
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--floating)",
                  color: "var(--foreground)",
                  borderRadius: 4,
                  padding: "4px 8px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Add
              </button>
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              {(security.roles || []).map((role, index) => (
                <div
                  key={`${role.name}-${index}`}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    background: "var(--panel)",
                    padding: "5px 8px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 11, color: "var(--foreground)" }}>{role.name}</span>
                  <span style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(role.permissions || []).join(", ") || "no permissions"}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        security: {
                          ...security,
                          roles: (security.roles || []).filter((_, i) => i !== index),
                        },
                      })
                    }
                    style={{
                      marginLeft: "auto",
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--muted)",
                      borderRadius: 4,
                      padding: "2px 6px",
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={security.encryption.atRest}
                onChange={(e) =>
                  onChange({
                    security: {
                      ...security,
                      encryption: {
                        ...security.encryption,
                        atRest: e.target.checked,
                      },
                    },
                  })
                }
              />
              Encryption at rest
            </label>
            <label style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={security.encryption.inTransit}
                onChange={(e) =>
                  onChange({
                    security: {
                      ...security,
                      encryption: {
                        ...security.encryption,
                        inTransit: e.target.checked,
                      },
                    },
                  })
                }
              />
              Encryption in transit
            </label>
            <label style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={security.auditLogging}
                onChange={(e) =>
                  onChange({
                    security: {
                      ...security,
                      auditLogging: e.target.checked,
                    },
                  })
                }
              />
              Audit logging
            </label>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <input
              type="text"
              value={security.network.vpcId}
              onChange={(e) =>
                onChange({
                  security: {
                    ...security,
                    network: {
                      ...security.network,
                      vpcId: e.target.value,
                    },
                  },
                })
              }
              placeholder="VPC ID"
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                value={allowedIpDraft}
                onChange={(e) => setAllowedIpDraft(e.target.value)}
                placeholder="Add allowed IP/CIDR"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                onClick={() => {
                  const value = allowedIpDraft.trim();
                  if (!value) return;
                  if ((security.network.allowedIPs || []).includes(value)) {
                    setAllowedIpDraft("");
                    return;
                  }
                  onChange({
                    security: {
                      ...security,
                      network: {
                        ...security.network,
                        allowedIPs: [...(security.network.allowedIPs || []), value],
                      },
                    },
                  });
                  setAllowedIpDraft("");
                }}
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--floating)",
                  color: "var(--foreground)",
                  borderRadius: 4,
                  padding: "4px 8px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Add
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(security.network.allowedIPs || []).map((ip) => (
                <button
                  key={ip}
                  type="button"
                  onClick={() =>
                    onChange({
                      security: {
                        ...security,
                        network: {
                          ...security.network,
                          allowedIPs: (security.network.allowedIPs || []).filter(
                            (value) => value !== ip,
                          ),
                        },
                      },
                    })
                  }
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--panel)",
                    color: "var(--secondary)",
                    borderRadius: 999,
                    padding: "2px 8px",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  {ip} x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

