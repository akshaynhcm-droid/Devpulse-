import { nanoid } from "nanoid";

export function safeGetPath(rawUrl: string): string | null {
  if (!rawUrl) return null;
  try {
    const fullUrl = rawUrl.startsWith("http")
      ? rawUrl
      : "https://example.com" +
        (rawUrl.startsWith("/") ? rawUrl : "/" + rawUrl);
    return new URL(fullUrl).pathname;
  } catch {
    return null;
  }
}

export function generateRealFindings(collectionData: any) {
  const findings: Array<{
    id: string;
    title: string;
    severity: "Critical" | "High" | "Medium" | "Low";
    description: string;
    category: string;
    remediation: string;
    cweId: string;
  }> = [];

  const items: any[] = collectionData.item || [];
  const openApiPaths = collectionData.paths || {};

  // Process Postman-style items
  items.forEach((item: any) => {
    const url = item.request?.url?.raw || item.request?.url || "";
    const headers: any[] = item.request?.header || [];
    const method: string = (item.request?.method || "").toUpperCase();
    const displayUrl = typeof url === "string" ? url : url?.raw || "";

    // OWASP A02 - Cryptographic Failures: HTTP instead of HTTPS
    if (displayUrl.startsWith("http://")) {
      findings.push({
        id: nanoid(),
        title: "Cleartext HTTP Communication",
        severity: "High",
        description:
          "Endpoint " + displayUrl + " transmits data over unencrypted HTTP.",
        category: "Cryptographic Failures (OWASP A02)",
        remediation:
          "Enforce HTTPS on all endpoints. Set up HTTP → HTTPS redirect on your server or load balancer.",
        cweId: "CWE-319",
      });
    }

    // OWASP A07 - Authentication: mutating endpoint without auth header
    if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      const hasAuth = headers.some(
        (h: any) =>
          typeof h.key === "string" &&
          (h.key.toLowerCase().includes("authorization") ||
            h.key.toLowerCase().includes("x-api-key") ||
            h.key.toLowerCase().includes("api-key"))
      );
      if (!hasAuth) {
        findings.push({
          id: nanoid(),
          title: "Unauthenticated State-Changing Request",
          severity: "Critical",
          description:
            method +
            " " +
            (displayUrl || "endpoint") +
            " has no Authorization or API-Key header, making it vulnerable to unauthorized writes.",
          category: "Broken Authentication (OWASP A07)",
          remediation:
            "Add an Authorization: Bearer <token> or X-API-Key header. Validate server-side on every request.",
          cweId: "CWE-306",
        });
      }
    }

    // OWASP A01 - Broken Access Control: integer IDs in URL path (IDOR risk)
    const path = safeGetPath(displayUrl);
    if (path && /\/\d+/.test(path)) {
      findings.push({
        id: nanoid(),
        title: "Potential Insecure Direct Object Reference (IDOR)",
        severity: "Medium",
        description:
          "Endpoint " +
          path +
          " uses a sequential integer ID, which could allow unauthorized access to other users' resources.",
        category: "Broken Access Control (OWASP A01)",
        remediation:
          "Replace integer IDs with UUIDs. Always verify the authenticated user owns the resource before returning data.",
        cweId: "CWE-639",
      });
    }

    // OWASP A05 - Security Misconfiguration: debug or test headers present
    const hasDebugHeader = headers.some(
      (h: any) =>
        typeof h.key === "string" &&
        (h.key.toLowerCase().startsWith("x-debug") ||
          h.key.toLowerCase() === "x-forwarded-for")
    );
    if (hasDebugHeader) {
      findings.push({
        id: nanoid(),
        title: "Debug Headers Exposed in Request",
        severity: "Low",
        description:
          "Request to " +
          (displayUrl || "endpoint") +
          " includes debug headers that should never appear in production traffic.",
        category: "Security Misconfiguration (OWASP A05)",
        remediation:
          "Remove debug headers (X-Debug-*, X-Forwarded-For) before deploying to production.",
        cweId: "CWE-489",
      });
    }

    // OWASP A09 - Security Logging: missing request ID / correlation ID header
    if (method !== "GET") {
      const hasCorrelation = headers.some(
        (h: any) =>
          typeof h.key === "string" &&
          (h.key.toLowerCase().includes("x-request-id") ||
            h.key.toLowerCase().includes("x-correlation-id") ||
            h.key.toLowerCase().includes("request-id"))
      );
      if (!hasCorrelation) {
        findings.push({
          id: nanoid(),
          title: "Missing Request Correlation ID",
          severity: "Low",
          description:
            method +
            " " +
            (displayUrl || "endpoint") +
            " does not include a correlation/request ID header, making audit trail incomplete.",
          category: "Security Logging Failures (OWASP A09)",
          remediation:
            "Include X-Request-ID or X-Correlation-ID headers for all non-GET requests to ensure full request traceability.",
          cweId: "CWE-778",
        });
      }
    }
  });

  // Process OpenAPI paths for additional checks
  Object.entries(openApiPaths).forEach(([pathStr, pathItem]: [string, any]) => {
    Object.entries(pathItem || {}).forEach(
      ([httpMethod, operation]: [string, any]) => {
        if (["get", "post", "put", "delete", "patch"].includes(httpMethod)) {
          const hasSecurity =
            (operation.security && operation.security.length > 0) ||
            (collectionData.security && collectionData.security.length > 0);
          if (!hasSecurity && httpMethod !== "get") {
            findings.push({
              id: nanoid(),
              title: "OpenAPI Endpoint Missing Security Scheme",
              severity: "High",
              description:
                httpMethod.toUpperCase() +
                " " +
                pathStr +
                " has no security scheme defined in the OpenAPI spec.",
              category: "Broken Authentication (OWASP A07)",
              remediation:
                "Add a security: [] block to this operation referencing your securitySchemes (e.g. bearerAuth).",
              cweId: "CWE-306",
            });
          }
        }
      }
    );
  });

  return findings;
}

export function detectShadowAPIs(collectionData: any) {
  const shadowAPIs: Array<{
    endpoint: string;
    method: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    reason: string;
    recommendation: string;
  }> = [];

  const items: any[] = collectionData.item || [];
  const riskyKeywords = [
    "debug",
    "test",
    "internal",
    "admin",
    "hidden",
    "dev",
    "beta",
    "staging",
    "old",
    "backup",
    "temp",
    "tmp",
    "legacy",
  ];
  const safePrefixes = [
    "/api/v1",
    "/api/v2",
    "/api/v3",
    "/public",
    "/v1",
    "/v2",
    "/v3",
  ];
  const seen = new Set<string>();

  items.forEach((item: any) => {
    const method = (item.request?.method || "GET").toUpperCase();
    const rawUrl = item.request?.url?.raw || item.request?.url || "";
    const displayUrl = typeof rawUrl === "string" ? rawUrl : rawUrl?.raw || "";
    const path = safeGetPath(displayUrl) || "/";

    const key = method + ":" + path;
    if (seen.has(key)) return;
    seen.add(key);

    const lowerPath = path.toLowerCase();
    const matchedKeyword = riskyKeywords.find(k => lowerPath.includes(k));
    const isUnusualPath = !safePrefixes.some(prefix =>
      lowerPath.startsWith(prefix)
    );
    const isDestructiveWithoutPrefix =
      (method === "DELETE" || method === "PUT") &&
      !safePrefixes.some(p => lowerPath.startsWith(p));
    const isUndocumentedAdminOp =
      (lowerPath.includes("admin") || lowerPath.includes("internal")) &&
      ["DELETE", "PUT", "POST"].includes(method);

    let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
    let reason = "";
    let recommendation = "";

    if (isUndocumentedAdminOp) {
      riskLevel = "CRITICAL";
      reason =
        "Admin/internal endpoint detected with destructive " +
        method +
        " operation";
      recommendation =
        "Document all admin endpoints in your API spec and restrict access via authentication/authorization.";
    } else if (isDestructiveWithoutPrefix) {
      riskLevel = "HIGH";
      reason =
        "Destructive " +
        method +
        " endpoint without standard API versioning prefix";
      recommendation =
        "Add API versioning prefix (/api/v1) and document this endpoint.";
    } else if (matchedKeyword) {
      riskLevel = "MEDIUM";
      reason = "Endpoint path contains risky keyword: " + matchedKeyword;
      recommendation =
        "Review if " +
        matchedKeyword +
        " endpoint should be publicly accessible or documented.";
    } else if (isUnusualPath) {
      riskLevel = "LOW";
      reason = "Endpoint uses non-standard path pattern";
      recommendation =
        "Consider using standard REST conventions with API versioning.";
    }

    if (
      matchedKeyword ||
      isUnusualPath ||
      isDestructiveWithoutPrefix ||
      isUndocumentedAdminOp
    ) {
      shadowAPIs.push({
        endpoint: path,
        method,
        riskLevel,
        reason,
        recommendation,
      });
    }
  });

  return shadowAPIs;
}

export function calculateRiskScore(findings: any[]) {
  let score = 0;
  for (const finding of findings) {
    if (finding.severity === "Critical") score += 30;
    else if (finding.severity === "High") score += 20;
    else if (finding.severity === "Medium") score += 10;
    else if (finding.severity === "Low") score += 5;
  }
  return Math.min(100, score);
}

export function getRiskLevel(
  score: number
): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

export function generatePCIDSSRequirements(collectionData: any) {
  const items: any[] = collectionData.item || [];
  const paths = collectionData.paths || {};
  const allItems = [
    ...items.map((i: any) => ({
      url: i.request?.url?.raw || i.request?.url || "",
      method: (i.request?.method || "GET").toUpperCase(),
      headers: i.request?.header || [],
    })),
    ...Object.entries(paths).flatMap(([path, methods]: [string, any]) =>
      Object.entries(methods || {})
        .filter(([m]) => ["get", "post", "put", "delete", "patch"].includes(m))
        .map(([method, op]: [string, any]) => ({
          url: path,
          method: method.toUpperCase(),
          headers: [],
          hasSecurity: !!(
            op?.security?.length || collectionData.security?.length
          ),
        }))
    ),
  ];

  const requirements = [];

  // Req 1: TLS for all connections
  const hasHttp = allItems.some((i: any) => {
    const url = typeof i.url === "string" ? i.url : "";
    return url.startsWith("http://");
  });
  requirements.push({
    id: "PCI-1.1",
    title: "TLS for All Connections",
    description: "All API endpoints must use HTTPS/TLS for data transmission.",
    status: hasHttp ? "not_met" : "met",
  });

  // Req 2: Authentication for sensitive operations
  const writeOpsWithoutAuth = allItems.filter(
    (i: any) =>
      ["POST", "PUT", "DELETE", "PATCH"].includes(i.method) &&
      !i.headers.some(
        (h: any) =>
          h.key?.toLowerCase().includes("authorization") ||
          h.key?.toLowerCase().includes("api-key")
      )
  );
  requirements.push({
    id: "PCI-2.1",
    title: "Authentication for Write Operations",
    description: "All POST/PUT/DELETE operations must require authentication.",
    status: writeOpsWithoutAuth.length > 0 ? "not_met" : "met",
  });

  // Req 3: No debug endpoints in production
  const hasDebug = allItems.some((i: any) => {
    const url = (typeof i.url === "string" ? i.url : "").toLowerCase();
    return (
      url.includes("debug") || url.includes("test") || url.includes("internal")
    );
  });
  requirements.push({
    id: "PCI-3.1",
    title: "No Debug/Test Endpoints",
    description:
      "Debug, test, and internal endpoints must not be exposed in production.",
    status: hasDebug ? "not_met" : "met",
  });

  // Req 4: Input validation (check for obvious injection patterns)
  const hasQueryParams = allItems.some((i: any) => {
    const url = typeof i.url === "string" ? i.url : "";
    return url.includes("?") || url.includes("{");
  });
  requirements.push({
    id: "PCI-4.1",
    title: "Input Validation",
    description: "All user input must be validated before processing.",
    status: hasQueryParams ? "manual_review" : "met",
  });

  // Req 5: Audit logging
  requirements.push({
    id: "PCI-5.1",
    title: "Audit Logging",
    description: "All access to cardholder data must be logged.",
    status: "manual_review",
  });

  return requirements;
}

export function generateOWASPRequirements(collectionData: any) {
  const items: any[] = collectionData.item || [];
  const paths = collectionData.paths || {};
  const allItems = [
    ...items.map((i: any) => ({
      url: i.request?.url?.raw || i.request?.url || "",
      method: (i.request?.method || "GET").toUpperCase(),
      headers: i.request?.header || [],
    })),
    ...Object.entries(paths).flatMap(([path, methods]: [string, any]) =>
      Object.entries(methods || {})
        .filter(([m]) => ["get", "post", "put", "delete", "patch"].includes(m))
        .map(([method, _op]: [string, any]) => ({
          url: path,
          method: method.toUpperCase(),
          headers: [],
        }))
    ),
  ];

  return [
    {
      id: "OWASP-A01",
      title: "Broken Access Control",
      description:
        "Access control checks should be enforced server-side for every request.",
      status: allItems.some((i: any) => /\/\d+/.test(i.url))
        ? "manual_review"
        : "met",
    },
    {
      id: "OWASP-A02",
      title: "Cryptographic Failures",
      description:
        "All data transmission should use strong encryption (TLS 1.2+).",
      status: allItems.some((i: any) =>
        (typeof i.url === "string" ? i.url : "").startsWith("http://")
      )
        ? "not_met"
        : "met",
    },
    {
      id: "OWASP-A03",
      title: "Injection",
      description:
        "User-supplied data should be validated, sanitized, and escaped.",
      status: "manual_review",
    },
    {
      id: "OWASP-A04",
      title: "Insecure Design",
      description: "Security should be integrated into the design phase.",
      status: "manual_review",
    },
    {
      id: "OWASP-A05",
      title: "Security Misconfiguration",
      description:
        "Systems should be hardened with minimal features and secure defaults.",
      status: allItems.some((i: any) =>
        (typeof i.url === "string" ? i.url : "").toLowerCase().includes("debug")
      )
        ? "not_met"
        : "met",
    },
    {
      id: "OWASP-A06",
      title: "Vulnerable and Outdated Components",
      description:
        "Components should be kept up to date with known vulnerabilities patched.",
      status: "manual_review",
    },
    {
      id: "OWASP-A07",
      title: "Identification and Authentication Failures",
      description:
        "Authentication should be implemented correctly using secure mechanisms.",
      status: allItems.some(
        (i: any) =>
          ["POST", "PUT", "DELETE"].includes(i.method) &&
          !i.headers.some((h: any) =>
            h.key?.toLowerCase().includes("authorization")
          )
      )
        ? "not_met"
        : "met",
    },
    {
      id: "OWASP-A08",
      title: "Software and Data Integrity Failures",
      description:
        "Software updates and critical data should be verified for integrity.",
      status: "manual_review",
    },
    {
      id: "OWASP-A09",
      title: "Security Logging and Monitoring Failures",
      description: "Security events should be logged and monitored.",
      status: "manual_review",
    },
    {
      id: "OWASP-A10",
      title: "Server-Side Request Forgery (SSRF)",
      description: "Server-side requests should be validated and restricted.",
      status: "manual_review",
    },
  ];
}
