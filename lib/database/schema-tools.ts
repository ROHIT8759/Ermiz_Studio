import { DatabaseBlock } from "@/lib/schema/node";

const mapFieldTypeToSql = (
  fieldType: string,
  dialect: "postgresql" | "mysql" | "sqlite",
): string => {
  if (dialect === "sqlite") {
    if (fieldType === "boolean") return "INTEGER";
    if (fieldType === "json") return "TEXT";
    if (fieldType === "date") return "TEXT";
    if (fieldType === "number") return "REAL";
    if (fieldType === "int" || fieldType === "bigint") return "INTEGER";
    return "TEXT";
  }
  if (dialect === "mysql") {
    if (fieldType === "number") return "DOUBLE";
    if (fieldType === "date") return "DATETIME";
    if (fieldType === "json") return "JSON";
    if (fieldType === "string") return "VARCHAR(255)";
    if (fieldType === "boolean") return "BOOLEAN";
    if (fieldType === "int") return "INT";
    if (fieldType === "bigint") return "BIGINT";
    if (fieldType === "float") return "FLOAT";
    if (fieldType === "decimal") return "DECIMAL(10,2)";
    if (fieldType === "uuid") return "CHAR(36)";
    return "TEXT";
  }
  if (fieldType === "number") return "DOUBLE PRECISION";
  if (fieldType === "date") return "TIMESTAMP";
  if (fieldType === "json") return "JSONB";
  if (fieldType === "string") return "VARCHAR(255)";
  if (fieldType === "boolean") return "BOOLEAN";
  if (fieldType === "int") return "INTEGER";
  if (fieldType === "bigint") return "BIGINT";
  if (fieldType === "float") return "REAL";
  if (fieldType === "decimal") return "DECIMAL(10,2)";
  if (fieldType === "uuid") return "UUID";
  return "TEXT";
};

export const buildDatabaseExportPayload = (database: DatabaseBlock) => ({
  dbType: database.dbType,
  engine: database.engine || "",
  schemas: database.schemas || [],
  tables: database.tables || [],
  schemaHistory: database.schemaHistory || [],
  relationships: database.relationships || [],
  capabilities: database.capabilities,
  performance: database.performance,
  backup: database.backup,
  security: database.security,
  monitoring: database.monitoring,
  environments: database.environments,
  costEstimation: database.costEstimation,
  seeds: database.seeds || [],
  migrations: database.migrations || [],
  queries: database.queries || [],
});

export const buildDatabaseSchemaDDL = (database: DatabaseBlock) => {
  const dbType = database.dbType;
  const engine = (database.engine || "").toLowerCase();
  const dialect: "postgresql" | "mysql" | "sqlite" = engine.includes("mysql")
    ? "mysql"
    : engine.includes("sqlite")
      ? "sqlite"
      : "postgresql";

  let output = "";
  if (dbType === "sql") {
    const tables = database.tables || [];
    output = tables
      .map((table) => {
        const fieldLines = (table.fields || []).map((field) => {
          const parts: string[] = [
            `"${field.name}"`,
            mapFieldTypeToSql(String(field.type || "string"), dialect),
          ];
          if (field.nullable === false) parts.push("NOT NULL");
          if (field.defaultValue) parts.push(`DEFAULT ${field.defaultValue}`);
          return parts.join(" ");
        });
        const primaryKeys = (table.fields || [])
          .filter((field) => field.isPrimaryKey)
          .map((field) => `"${field.name}"`);
        if (primaryKeys.length > 0) {
          fieldLines.push(`PRIMARY KEY (${primaryKeys.join(", ")})`);
        }
        return `CREATE TABLE "${table.name}" (\n  ${fieldLines.join(",\n  ")}\n);`;
      })
      .join("\n\n");
  } else if (dbType === "nosql") {
    output = (database.tables || [])
      .map((table) => {
        const fields = (table.fields || [])
          .map((field) => `  ${field.name}: ${field.type}`)
          .join("\n");
        return `collection ${table.name} {\n${fields}\n}`;
      })
      .join("\n\n");
  } else if (dbType === "kv") {
    output = (database.tables || [])
      .map(
        (table) =>
          `keyspace ${table.name} // fields: ${(table.fields || []).map((f) => f.name).join(", ")}`,
      )
      .join("\n");
  } else {
    output = (database.relationships || [])
      .map(
        (rel) =>
          `(${rel.fromTableId})-[:${rel.type.toUpperCase()}]->(${rel.toTableId})`,
      )
      .join("\n");
  }

  return {
    output: output || "-- No schema data --",
    extension: dbType === "sql" ? `${dialect}.sql` : "schema.txt",
  };
};
