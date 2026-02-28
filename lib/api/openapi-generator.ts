import { ApiBinding, InputField, OutputField } from "@/lib/schema/node";

// ============================================================
// OpenAPI 3.0 Generator
// ============================================================

function fieldTypeToOpenApi(field: InputField | OutputField): Record<string, unknown> {
  const base: Record<string, unknown> = { type: field.type };
  if (field.type === "object" && "properties" in field && field.properties?.length) {
    const props: Record<string, unknown> = {};
    for (const p of field.properties) {
      props[p.name] = fieldTypeToOpenApi(p as InputField);
    }
    base.properties = props;
  }
  if (field.type === "array" && "items" in field && field.items) {
    base.items = fieldTypeToOpenApi(field.items as InputField);
  }
  if ("format" in field && field.format) base.format = field.format;
  if ("pattern" in field && field.pattern) base.pattern = field.pattern;
  if ("minimum" in field && field.minimum !== undefined) base.minimum = field.minimum;
  if ("maximum" in field && field.maximum !== undefined) base.maximum = field.maximum;
  if ("minLength" in field && field.minLength !== undefined) base.minLength = field.minLength;
  if ("maxLength" in field && field.maxLength !== undefined) base.maxLength = field.maxLength;
  if ("description" in field && field.description) base.description = field.description;
  return base;
}

function buildParameters(
  pathParams: InputField[],
  queryParams: InputField[],
  headers: InputField[],
): Record<string, unknown>[] {
  const params: Record<string, unknown>[] = [];

  for (const p of pathParams) {
    params.push({
      name: p.name,
      in: "path",
      required: true,
      schema: fieldTypeToOpenApi(p),
      ...(p.description ? { description: p.description } : {}),
    });
  }
  for (const q of queryParams) {
    params.push({
      name: q.name,
      in: "query",
      required: q.required ?? false,
      schema: fieldTypeToOpenApi(q),
      ...(q.description ? { description: q.description } : {}),
    });
  }
  for (const h of headers) {
    params.push({
      name: h.name,
      in: "header",
      required: h.required ?? false,
      schema: fieldTypeToOpenApi(h),
      ...(h.description ? { description: h.description } : {}),
    });
  }

  return params;
}

function buildResponseSchema(fields: OutputField[]): Record<string, unknown> {
  if (!fields.length) return { type: "object" };
  const properties: Record<string, unknown> = {};
  for (const f of fields) {
    properties[f.name] = fieldTypeToOpenApi(f);
  }
  return { type: "object", properties };
}

function buildSecuritySchemes(
  apiNode: ApiBinding,
): Record<string, Record<string, unknown>> {
  const security = apiNode.security;
  if (!security || security.type === "none") return {};

  if (security.type === "bearer") {
    return {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    };
  }
  if (security.type === "api_key") {
    return {
      apiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: security.headerName || "X-API-Key",
      },
    };
  }
  if (security.type === "oauth2") {
    const scopes: Record<string, string> = {};
    for (const s of security.scopes || []) {
      scopes[s] = s;
    }
    return {
      oauth2Auth: {
        type: "oauth2",
        flows: {
          implicit: {
            authorizationUrl: "https://auth.example.com/oauth/authorize",
            scopes,
          },
        },
      },
    };
  }
  if (security.type === "basic") {
    return {
      basicAuth: {
        type: "http",
        scheme: "basic",
      },
    };
  }
  return {};
}

function buildSecurityRequirement(apiNode: ApiBinding): Record<string, string[]>[] {
  const security = apiNode.security;
  if (!security || security.type === "none") return [];

  if (security.type === "bearer") return [{ bearerAuth: [] }];
  if (security.type === "api_key") return [{ apiKeyAuth: [] }];
  if (security.type === "oauth2") return [{ oauth2Auth: security.scopes || [] }];
  if (security.type === "basic") return [{ basicAuth: [] }];
  return [];
}

/**
 * Generates a minimal but valid OpenAPI 3.0 spec for a REST ApiBinding node.
 * Returns {} if the protocol is not REST.
 */
export function generateOpenApiSpec(apiNode: ApiBinding): Record<string, unknown> {
  if (apiNode.protocol !== "rest") return {};

  const method = (apiNode.method || "GET").toLowerCase();
  const route = apiNode.route || "/";
  const pathParams = apiNode.request?.pathParams || [];
  const queryParams = apiNode.request?.queryParams || [];
  const headers = apiNode.request?.headers || [];
  const bodySchema = apiNode.request?.body?.schema || [];
  const contentType = apiNode.request?.body?.contentType || "application/json";
  const successSchema = apiNode.responses?.success?.schema || [];
  const errorSchema = apiNode.responses?.error?.schema || [];
  const successCode = String(apiNode.responses?.success?.statusCode || 200);
  const errorCode = String(apiNode.responses?.error?.statusCode || 400);

  const parameters = buildParameters(pathParams, queryParams, headers);
  const securitySchemes = buildSecuritySchemes(apiNode);
  const securityRequirement = buildSecurityRequirement(apiNode);

  const operation: Record<string, unknown> = {
    summary: apiNode.label || route,
    ...(apiNode.description ? { description: apiNode.description } : {}),
    ...(parameters.length ? { parameters } : {}),
    responses: {
      [successCode]: {
        description: "Success",
        content: {
          "application/json": {
            schema: buildResponseSchema(successSchema),
          },
        },
      },
      [errorCode]: {
        description: "Error",
        content: {
          "application/json": {
            schema: buildResponseSchema(errorSchema),
          },
        },
      },
    },
  };

  if (["post", "put", "patch"].includes(method) && bodySchema.length > 0) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const f of bodySchema) {
      properties[f.name] = fieldTypeToOpenApi(f);
      if (f.required) required.push(f.name);
    }
    const schema: Record<string, unknown> = { type: "object", properties };
    if (required.length) schema.required = required;

    operation.requestBody = {
      required: true,
      content: {
        [contentType]: { schema },
      },
    };
  }

  if (securityRequirement.length) {
    operation.security = securityRequirement;
  }

  if (apiNode.deprecated) {
    operation.deprecated = true;
  }

  const spec: Record<string, unknown> = {
    openapi: "3.0.0",
    info: {
      title: apiNode.label || "API",
      version: apiNode.version || "v1",
      ...(apiNode.description ? { description: apiNode.description } : {}),
    },
    paths: {
      [route]: {
        [method]: operation,
      },
    },
  };

  if (Object.keys(securitySchemes).length) {
    spec.components = {
      securitySchemes,
    };
  }

  return spec;
}

// ============================================================
// cURL Command Generator
// ============================================================

/**
 * Generates a cURL command for a REST ApiBinding node.
 * Returns an empty string if the protocol is not REST.
 */
export function generateCurlCommand(apiNode: ApiBinding): string {
  if (apiNode.protocol !== "rest") return "";

  const method = apiNode.method || "GET";
  const route = apiNode.route || "/";
  const baseUrl = "https://api.example.com";
  const url = `${baseUrl}${route}`;

  const lines: string[] = [`curl -X ${method} ${url}`];

  // Content-Type for body methods
  if (["POST", "PUT", "PATCH"].includes(method)) {
    const contentType = apiNode.request?.body?.contentType || "application/json";
    lines.push(`  -H "Content-Type: ${contentType}"`);
  }

  // Authorization header
  const security = apiNode.security;
  if (security && security.type !== "none") {
    if (security.type === "bearer") {
      lines.push(`  -H "Authorization: Bearer <token>"`);
    } else if (security.type === "api_key") {
      const headerName = security.headerName || "X-API-Key";
      lines.push(`  -H "${headerName}: <api-key>"`);
    } else if (security.type === "basic") {
      lines.push(`  -u "<username>:<password>"`);
    } else if (security.type === "oauth2") {
      lines.push(`  -H "Authorization: Bearer <oauth2-token>"`);
    }
  }

  // Custom headers
  for (const h of apiNode.request?.headers || []) {
    lines.push(`  -H "${h.name}: <value>"`);
  }

  // Query params appended as note
  const queryParams = apiNode.request?.queryParams || [];
  if (queryParams.length) {
    const qs = queryParams.map((q) => `${q.name}=<value>`).join("&");
    // Replace the URL to include query string
    lines[0] = `curl -X ${method} "${url}?${qs}"`;
  }

  // Body
  if (["POST", "PUT", "PATCH"].includes(method)) {
    const bodyFields = apiNode.request?.body?.schema || [];
    if (bodyFields.length > 0) {
      const bodyObj: Record<string, string> = {};
      for (const f of bodyFields) {
        bodyObj[f.name] =
          f.type === "number"
            ? "0"
            : f.type === "boolean"
              ? "false"
              : `<${f.name}>`;
      }
      const contentType = apiNode.request?.body?.contentType || "application/json";
      if (contentType === "application/json") {
        lines.push(`  -d '${JSON.stringify(bodyObj)}'`);
      } else if (contentType === "multipart/form-data") {
        for (const [k, v] of Object.entries(bodyObj)) {
          lines.push(`  -F "${k}=${v}"`);
        }
      } else {
        lines.push(`  -d "${Object.entries(bodyObj).map(([k, v]) => `${k}=${v}`).join("&")}"`);
      }
    }
  }

  return lines.join(" \\\n");
}
