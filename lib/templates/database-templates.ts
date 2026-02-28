import { DatabaseRelationship, DatabaseTable } from "@/lib/schema/node";

export type DatabaseTemplate = {
  id: string;
  label: string;
  tables: DatabaseTable[];
  relationships: DatabaseRelationship[];
};

const eCommerceTables: DatabaseTable[] = [
  {
    id: "users",
    name: "users",
    indexes: ["email", "created_at"],
    fields: [
      { id: "users_id", name: "id", type: "uuid", isPrimaryKey: true, nullable: false },
      { id: "users_email", name: "email", type: "string", nullable: false },
      { id: "users_name", name: "name", type: "string", nullable: false },
      { id: "users_created_at", name: "created_at", type: "datetime", nullable: false },
    ],
  },
  {
    id: "products",
    name: "products",
    indexes: ["sku", "category", "is_active"],
    fields: [
      { id: "products_id", name: "id", type: "uuid", isPrimaryKey: true, nullable: false },
      { id: "products_sku", name: "sku", type: "string", nullable: false },
      { id: "products_name", name: "name", type: "string", nullable: false },
      { id: "products_price", name: "price", type: "decimal", nullable: false },
      { id: "products_inventory", name: "inventory_count", type: "int", nullable: false },
      { id: "products_is_active", name: "is_active", type: "boolean", nullable: false, defaultValue: "true" },
    ],
  },
  {
    id: "orders",
    name: "orders",
    indexes: ["user_id", "status", "created_at"],
    fields: [
      { id: "orders_id", name: "id", type: "uuid", isPrimaryKey: true, nullable: false },
      { id: "orders_user_id", name: "user_id", type: "uuid", nullable: false, isForeignKey: true, references: { table: "users", field: "id" } },
      { id: "orders_total", name: "total_amount", type: "decimal", nullable: false },
      { id: "orders_status", name: "status", type: "string", nullable: false },
      { id: "orders_created_at", name: "created_at", type: "datetime", nullable: false },
    ],
  },
  {
    id: "payments",
    name: "payments",
    indexes: ["order_id", "provider", "status"],
    fields: [
      { id: "payments_id", name: "id", type: "uuid", isPrimaryKey: true, nullable: false },
      { id: "payments_order_id", name: "order_id", type: "uuid", nullable: false, isForeignKey: true, references: { table: "orders", field: "id" } },
      { id: "payments_provider", name: "provider", type: "string", nullable: false },
      { id: "payments_status", name: "status", type: "string", nullable: false },
      { id: "payments_amount", name: "amount", type: "decimal", nullable: false },
    ],
  },
  {
    id: "inventory",
    name: "inventory",
    indexes: ["product_id", "warehouse_code"],
    fields: [
      { id: "inventory_id", name: "id", type: "uuid", isPrimaryKey: true, nullable: false },
      { id: "inventory_product_id", name: "product_id", type: "uuid", nullable: false, isForeignKey: true, references: { table: "products", field: "id" } },
      { id: "inventory_warehouse", name: "warehouse_code", type: "string", nullable: false },
      { id: "inventory_qty", name: "quantity", type: "int", nullable: false },
      { id: "inventory_updated", name: "updated_at", type: "datetime", nullable: false },
    ],
  },
];

const eCommerceRelationships: DatabaseRelationship[] = [
  { id: "rel_orders_users", type: "one_to_many", fromTableId: "orders", toTableId: "users", fromFieldId: "orders_user_id", toFieldId: "users_id", onDelete: "restrict" },
  { id: "rel_payments_orders", type: "one_to_many", fromTableId: "payments", toTableId: "orders", fromFieldId: "payments_order_id", toFieldId: "orders_id", onDelete: "cascade" },
  { id: "rel_inventory_products", type: "one_to_many", fromTableId: "inventory", toTableId: "products", fromFieldId: "inventory_product_id", toFieldId: "products_id", onDelete: "restrict" },
];

const saasTables: DatabaseTable[] = [
  {
    id: "tenants",
    name: "tenants",
    indexes: ["slug", "plan", "created_at"],
    fields: [
      { id: "tenants_id", name: "id", type: "uuid", isPrimaryKey: true, nullable: false },
      { id: "tenants_slug", name: "slug", type: "string", nullable: false },
      { id: "tenants_name", name: "name", type: "string", nullable: false },
      { id: "tenants_plan", name: "plan", type: "string", nullable: false },
      { id: "tenants_created", name: "created_at", type: "datetime", nullable: false },
    ],
  },
  {
    id: "users",
    name: "users",
    indexes: ["tenant_id", "email", "role"],
    fields: [
      { id: "saas_users_id", name: "id", type: "uuid", isPrimaryKey: true, nullable: false },
      { id: "saas_users_tenant", name: "tenant_id", type: "uuid", nullable: false, isForeignKey: true, references: { table: "tenants", field: "id" } },
      { id: "saas_users_email", name: "email", type: "string", nullable: false },
      { id: "saas_users_role", name: "role", type: "string", nullable: false },
      { id: "saas_users_created", name: "created_at", type: "datetime", nullable: false },
    ],
  },
  {
    id: "subscriptions",
    name: "subscriptions",
    indexes: ["tenant_id", "status", "current_period_end"],
    fields: [
      { id: "subs_id", name: "id", type: "uuid", isPrimaryKey: true, nullable: false },
      { id: "subs_tenant", name: "tenant_id", type: "uuid", nullable: false, isForeignKey: true, references: { table: "tenants", field: "id" } },
      { id: "subs_status", name: "status", type: "string", nullable: false },
      { id: "subs_seats", name: "seats", type: "int", nullable: false },
      { id: "subs_period_end", name: "current_period_end", type: "datetime", nullable: false },
    ],
  },
  {
    id: "usage_metrics",
    name: "usage_metrics",
    indexes: ["tenant_id", "metric_name", "recorded_at"],
    fields: [
      { id: "usage_id", name: "id", type: "uuid", isPrimaryKey: true, nullable: false },
      { id: "usage_tenant", name: "tenant_id", type: "uuid", nullable: false, isForeignKey: true, references: { table: "tenants", field: "id" } },
      { id: "usage_metric", name: "metric_name", type: "string", nullable: false },
      { id: "usage_value", name: "metric_value", type: "float", nullable: false },
      { id: "usage_recorded", name: "recorded_at", type: "datetime", nullable: false },
    ],
  },
];

const saasRelationships: DatabaseRelationship[] = [
  { id: "rel_users_tenants", type: "one_to_many", fromTableId: "users", toTableId: "tenants", fromFieldId: "saas_users_tenant", toFieldId: "tenants_id", onDelete: "cascade" },
  { id: "rel_subs_tenants", type: "one_to_many", fromTableId: "subscriptions", toTableId: "tenants", fromFieldId: "subs_tenant", toFieldId: "tenants_id", onDelete: "cascade" },
  { id: "rel_usage_tenants", type: "one_to_many", fromTableId: "usage_metrics", toTableId: "tenants", fromFieldId: "usage_tenant", toFieldId: "tenants_id", onDelete: "cascade" },
];

const analyticsTables: DatabaseTable[] = [
  {
    id: "events",
    name: "events",
    indexes: ["session_id", "event_name", "occurred_at"],
    fields: [
      { id: "events_id", name: "id", type: "uuid", isPrimaryKey: true, nullable: false },
      { id: "events_session", name: "session_id", type: "uuid", nullable: false, isForeignKey: true, references: { table: "sessions", field: "id" } },
      { id: "events_name", name: "event_name", type: "string", nullable: false },
      { id: "events_payload", name: "payload", type: "json", nullable: true },
      { id: "events_at", name: "occurred_at", type: "datetime", nullable: false },
    ],
  },
  {
    id: "sessions",
    name: "sessions",
    indexes: ["user_id", "started_at", "country_code"],
    fields: [
      { id: "sessions_id", name: "id", type: "uuid", isPrimaryKey: true, nullable: false },
      { id: "sessions_user", name: "user_id", type: "uuid", nullable: true },
      { id: "sessions_started", name: "started_at", type: "datetime", nullable: false },
      { id: "sessions_ended", name: "ended_at", type: "datetime", nullable: true },
      { id: "sessions_country", name: "country_code", type: "string", nullable: true },
    ],
  },
  {
    id: "page_views",
    name: "page_views",
    indexes: ["session_id", "path", "viewed_at"],
    fields: [
      { id: "pv_id", name: "id", type: "uuid", isPrimaryKey: true, nullable: false },
      { id: "pv_session", name: "session_id", type: "uuid", nullable: false, isForeignKey: true, references: { table: "sessions", field: "id" } },
      { id: "pv_path", name: "path", type: "string", nullable: false },
      { id: "pv_referrer", name: "referrer", type: "string", nullable: true },
      { id: "pv_viewed", name: "viewed_at", type: "datetime", nullable: false },
    ],
  },
  {
    id: "conversions",
    name: "conversions",
    indexes: ["session_id", "conversion_type", "converted_at"],
    fields: [
      { id: "conv_id", name: "id", type: "uuid", isPrimaryKey: true, nullable: false },
      { id: "conv_session", name: "session_id", type: "uuid", nullable: false, isForeignKey: true, references: { table: "sessions", field: "id" } },
      { id: "conv_type", name: "conversion_type", type: "string", nullable: false },
      { id: "conv_value", name: "conversion_value", type: "decimal", nullable: true },
      { id: "conv_at", name: "converted_at", type: "datetime", nullable: false },
    ],
  },
];

const analyticsRelationships: DatabaseRelationship[] = [
  { id: "rel_events_sessions", type: "one_to_many", fromTableId: "events", toTableId: "sessions", fromFieldId: "events_session", toFieldId: "sessions_id", onDelete: "cascade" },
  { id: "rel_page_views_sessions", type: "one_to_many", fromTableId: "page_views", toTableId: "sessions", fromFieldId: "pv_session", toFieldId: "sessions_id", onDelete: "cascade" },
  { id: "rel_conversions_sessions", type: "one_to_many", fromTableId: "conversions", toTableId: "sessions", fromFieldId: "conv_session", toFieldId: "sessions_id", onDelete: "cascade" },
];

const cmsTables: DatabaseTable[] = [
  {
    id: "authors",
    name: "authors",
    indexes: ["email", "slug"],
    fields: [
      { id: "authors_id", name: "id", type: "uuid", isPrimaryKey: true, nullable: false },
      { id: "authors_name", name: "name", type: "string", nullable: false },
      { id: "authors_email", name: "email", type: "string", nullable: false },
      { id: "authors_slug", name: "slug", type: "string", nullable: false },
    ],
  },
  {
    id: "categories",
    name: "categories",
    indexes: ["slug", "parent_id"],
    fields: [
      { id: "cat_id", name: "id", type: "uuid", isPrimaryKey: true, nullable: false },
      { id: "cat_name", name: "name", type: "string", nullable: false },
      { id: "cat_slug", name: "slug", type: "string", nullable: false },
      { id: "cat_parent", name: "parent_id", type: "uuid", nullable: true },
    ],
  },
  {
    id: "posts",
    name: "posts",
    indexes: ["author_id", "category_id", "status", "published_at"],
    fields: [
      { id: "posts_id", name: "id", type: "uuid", isPrimaryKey: true, nullable: false },
      { id: "posts_author", name: "author_id", type: "uuid", nullable: false, isForeignKey: true, references: { table: "authors", field: "id" } },
      { id: "posts_category", name: "category_id", type: "uuid", nullable: true, isForeignKey: true, references: { table: "categories", field: "id" } },
      { id: "posts_title", name: "title", type: "string", nullable: false },
      { id: "posts_status", name: "status", type: "string", nullable: false },
      { id: "posts_published", name: "published_at", type: "datetime", nullable: true },
    ],
  },
  {
    id: "media",
    name: "media",
    indexes: ["uploaded_by", "mime_type", "created_at"],
    fields: [
      { id: "media_id", name: "id", type: "uuid", isPrimaryKey: true, nullable: false },
      { id: "media_by", name: "uploaded_by", type: "uuid", nullable: false, isForeignKey: true, references: { table: "authors", field: "id" } },
      { id: "media_url", name: "url", type: "string", nullable: false },
      { id: "media_mime", name: "mime_type", type: "string", nullable: false },
      { id: "media_created", name: "created_at", type: "datetime", nullable: false },
    ],
  },
  {
    id: "tags",
    name: "tags",
    indexes: ["slug"],
    fields: [
      { id: "tags_id", name: "id", type: "uuid", isPrimaryKey: true, nullable: false },
      { id: "tags_name", name: "name", type: "string", nullable: false },
      { id: "tags_slug", name: "slug", type: "string", nullable: false },
    ],
  },
];

const cmsRelationships: DatabaseRelationship[] = [
  { id: "rel_posts_authors", type: "one_to_many", fromTableId: "posts", toTableId: "authors", fromFieldId: "posts_author", toFieldId: "authors_id", onDelete: "restrict" },
  { id: "rel_posts_categories", type: "one_to_many", fromTableId: "posts", toTableId: "categories", fromFieldId: "posts_category", toFieldId: "cat_id", onDelete: "set_null" },
  { id: "rel_media_authors", type: "one_to_many", fromTableId: "media", toTableId: "authors", fromFieldId: "media_by", toFieldId: "authors_id", onDelete: "restrict" },
];

export const databaseTemplates: DatabaseTemplate[] = [
  {
    id: "ecommerce",
    label: "E-commerce",
    tables: eCommerceTables,
    relationships: eCommerceRelationships,
  },
  {
    id: "saas",
    label: "SaaS",
    tables: saasTables,
    relationships: saasRelationships,
  },
  {
    id: "analytics",
    label: "Analytics",
    tables: analyticsTables,
    relationships: analyticsRelationships,
  },
  {
    id: "cms",
    label: "CMS",
    tables: cmsTables,
    relationships: cmsRelationships,
  },
];

export const getDatabaseTemplateById = (id: string): DatabaseTemplate | null =>
  databaseTemplates.find((template) => template.id === id) || null;

