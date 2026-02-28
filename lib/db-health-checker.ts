import { DatabaseBlock, DatabaseTable } from "@/lib/schema/node";

export type DatabaseHealthSeverity = "info" | "warning" | "error";

export type DatabaseHealthWarningCode =
  | "table_without_primary_key"
  | "foreign_key_missing_index"
  | "backup_not_configured"
  | "encryption_disabled_production"
  | "connection_pool_too_small"
  | "connection_pool_too_large"
  | "monitoring_thresholds_missing"
  | "query_without_conditions";

export type DatabaseHealthWarning = {
  code: DatabaseHealthWarningCode;
  severity: DatabaseHealthSeverity;
  message: string;
  target?: string;
  recommendation?: string;
  details?: Record<string, unknown>;
};

export type DatabaseHealthReport = {
  score: number;
  warnings: DatabaseHealthWarning[];
  recommendations: string[];
};

const hasConfiguredProduction = (database: DatabaseBlock) => {
  const production = database.environments?.production;
  if (!production) return false;
  return (
    Boolean(production.connectionString?.trim()) ||
    Boolean(production.provider?.region?.trim()) ||
    Boolean(production.overrides?.enabled)
  );
};

const getPoolRecommendation = (database: DatabaseBlock) => {
  const queryVolume = (database.queries || []).length;
  const iops = database.costEstimation?.estimatedIOPS || 0;

  if (iops >= 5000 || queryVolume >= 20) {
    return { min: 8, max: 40, profile: "high" as const };
  }
  if (iops >= 1500 || queryVolume >= 8) {
    return { min: 4, max: 24, profile: "moderate" as const };
  }
  return { min: 2, max: 16, profile: "low" as const };
};

const scorePenalty: Record<DatabaseHealthSeverity, number> = {
  error: 18,
  warning: 10,
  info: 4,
};

export const analyzeDatabaseHealth = (database: DatabaseBlock): DatabaseHealthReport => {
  const warnings: DatabaseHealthWarning[] = [];
  const tables = database.tables || [];
  const monitoring = database.monitoring;
  const backup = database.backup;
  const security = database.security;
  const performance = database.performance;
  const queries = database.queries || [];

  tables.forEach((table: DatabaseTable) => {
    const hasPrimaryKey = (table.fields || []).some((field) => Boolean(field.isPrimaryKey || field.primaryKey));
    if (!hasPrimaryKey) {
      warnings.push({
        code: "table_without_primary_key",
        severity: "error",
        target: table.name,
        message: `Table "${table.name}" has no primary key.`,
        recommendation: "Add a primary key field to prevent duplicates and enable fast lookups.",
        details: { tableName: table.name },
      });
    }

    const indexes = new Set((table.indexes || []).map((index) => index.trim().toLowerCase()));
    (table.fields || []).forEach((field) => {
      if (!field.isForeignKey || !field.name) return;
      if (indexes.has(field.name.toLowerCase())) return;
      warnings.push({
        code: "foreign_key_missing_index",
        severity: "warning",
        target: `${table.name}.${field.name}`,
        message: `Foreign key "${table.name}.${field.name}" is not indexed.`,
        recommendation: "Add an index for this foreign key to improve join and lookup performance.",
        details: { tableName: table.name, fieldName: field.name },
      });
    });
  });

  const backupConfigured =
    Boolean(backup?.schedule?.trim()) ||
    Boolean(backup?.pointInTimeRecovery) ||
    Boolean(backup?.multiRegion?.enabled);
  if (!backupConfigured) {
    warnings.push({
      code: "backup_not_configured",
      severity: "error",
      message: "Backups are not configured.",
      recommendation: "Enable scheduled backups and point-in-time recovery.",
    });
  }

  if (hasConfiguredProduction(database)) {
    const encryptionEnabled = Boolean(security?.encryption?.atRest) && Boolean(security?.encryption?.inTransit);
    if (!encryptionEnabled) {
      warnings.push({
        code: "encryption_disabled_production",
        severity: "error",
        message: "Encryption is not fully enabled for production.",
        recommendation: "Enable encryption at rest and in transit for production workloads.",
      });
    }
  }

  const recommendedPool = getPoolRecommendation(database);
  const poolMin = performance?.connectionPool?.min ?? 0;
  const poolMax = performance?.connectionPool?.max ?? 0;
  if (poolMin < recommendedPool.min || poolMax < recommendedPool.max) {
    warnings.push({
      code: "connection_pool_too_small",
      severity: "warning",
      message: "Connection pool appears undersized for current workload.",
      recommendation: "Increase connection pool limits to reduce contention.",
      details: { recommended: recommendedPool, current: { min: poolMin, max: poolMax } },
    });
  }
  if (recommendedPool.profile === "low" && (poolMin > 12 || poolMax > 60)) {
    warnings.push({
      code: "connection_pool_too_large",
      severity: "info",
      message: "Connection pool may be oversized for current workload.",
      recommendation: "Reduce pool size to lower memory usage and idle connections.",
      details: { recommended: recommendedPool, current: { min: poolMin, max: poolMax } },
    });
  }

  const thresholds = monitoring?.thresholds;
  const thresholdValues = thresholds
    ? [thresholds.cpuPercent, thresholds.memoryPercent, thresholds.connectionCount, thresholds.queryLatencyMs]
    : [];
  const missingThresholds =
    !thresholds ||
    thresholdValues.some((value) => !Number.isFinite(value) || value <= 0);
  if (missingThresholds) {
    warnings.push({
      code: "monitoring_thresholds_missing",
      severity: "warning",
      message: "Monitoring thresholds are missing or invalid.",
      recommendation: "Configure CPU, memory, connection, and latency thresholds.",
    });
  }

  queries.forEach((query) => {
    if (!["SELECT", "UPDATE", "DELETE"].includes(query.operation)) return;
    if (query.conditions.trim()) return;
    warnings.push({
      code: "query_without_conditions",
      severity: "warning",
      target: query.name || query.target,
      message: `Query "${query.name}" has no conditions and may scan entire table.`,
      recommendation: "Add filtering conditions or pagination to limit rows scanned.",
      details: { queryId: query.id },
    });
  });

  const recommendations = Array.from(
    new Set(
      warnings
        .map((warning) => warning.recommendation)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const score = Math.max(
    0,
    100 - warnings.reduce((total, warning) => total + scorePenalty[warning.severity], 0),
  );

  return { score, warnings, recommendations };
};

