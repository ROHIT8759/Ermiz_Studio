type CostMetrics = {
  storageGb: number;
  estimatedIOPS: number;
  backupSizeGb: number;
  replicaCount: number;
};

type PricingProfile = {
  baseMonthly: number;
  storagePerGb: number;
  iopsPerUnit: number;
  backupPerGb: number;
  replicaMonthly: number;
};

const pricingByProvider: Record<"aws" | "gcp" | "azure", PricingProfile> = {
  aws: {
    baseMonthly: 26,
    storagePerGb: 0.115,
    iopsPerUnit: 0.000065 * 730,
    backupPerGb: 0.095,
    replicaMonthly: 18,
  },
  gcp: {
    baseMonthly: 28,
    storagePerGb: 0.12,
    iopsPerUnit: 0.00006 * 730,
    backupPerGb: 0.08,
    replicaMonthly: 20,
  },
  azure: {
    baseMonthly: 30,
    storagePerGb: 0.13,
    iopsPerUnit: 0.00007 * 730,
    backupPerGb: 0.09,
    replicaMonthly: 22,
  },
};

const clamp = (value: number): number => Math.max(0, Number.isFinite(value) ? value : 0);

const detectProvider = (engine?: string): "aws" | "gcp" | "azure" => {
  const raw = (engine || "").toLowerCase();
  if (
    raw.includes("cloud sql") ||
    raw.includes("cloudsql") ||
    raw.includes("gcp")
  ) {
    return "gcp";
  }
  if (raw.includes("azure") || raw.includes("cosmos")) {
    return "azure";
  }
  return "aws";
};

const detectEngineMultiplier = (engine?: string): number => {
  const raw = (engine || "").toLowerCase();
  if (raw.includes("documentdb") || raw.includes("docdb")) return 1.25;
  if (raw.includes("mongodb")) return 1.15;
  if (raw.includes("sqlserver")) return 1.2;
  return 1;
};

export type DatabaseCostEstimate = {
  provider: "aws" | "gcp" | "azure";
  monthlyEstimate: number;
  formattedMonthlyEstimate: string;
  breakdown: {
    base: number;
    storage: number;
    iops: number;
    backup: number;
    replicas: number;
  };
};

export const estimateDatabaseMonthlyCost = (
  engine: string | undefined,
  metrics: CostMetrics,
): DatabaseCostEstimate => {
  const provider = detectProvider(engine);
  const profile = pricingByProvider[provider];
  const multiplier = detectEngineMultiplier(engine);

  const storageGb = clamp(metrics.storageGb);
  const estimatedIOPS = clamp(metrics.estimatedIOPS);
  const backupSizeGb = clamp(metrics.backupSizeGb);
  const replicaCount = clamp(metrics.replicaCount);

  const breakdown = {
    base: profile.baseMonthly,
    storage: storageGb * profile.storagePerGb,
    iops: estimatedIOPS * profile.iopsPerUnit,
    backup: backupSizeGb * profile.backupPerGb,
    replicas: replicaCount * profile.replicaMonthly,
  };

  const subtotal =
    breakdown.base +
    breakdown.storage +
    breakdown.iops +
    breakdown.backup +
    breakdown.replicas;
  const monthlyEstimate = Math.round(subtotal * multiplier * 100) / 100;

  return {
    provider,
    monthlyEstimate,
    formattedMonthlyEstimate: `$~${Math.round(monthlyEstimate)}/mo`,
    breakdown,
  };
};

