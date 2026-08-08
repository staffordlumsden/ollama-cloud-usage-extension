const AUTH_MARKER = /\bCloud usage\b/i;

export class OllamaAuthError extends Error {
  constructor(message = "Your Ollama browser session is not signed in.") {
    super(message);
    this.name = "OllamaAuthError";
  }
}

function decodeHtml(value = "") {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    if (code[0] === "#") {
      const radix = code[1]?.toLowerCase() === "x" ? 16 : 10;
      const digits = radix === 16 ? code.slice(2) : code.slice(1);
      const point = Number.parseInt(digits, radix);
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

function textContent(fragment = "") {
  return decodeHtml(
    fragment
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function readAttribute(attributes, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = attributes.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match ? decodeHtml(match[2]) : null;
}

function parsePercent(html, label) {
  const match = html.match(new RegExp(`aria-label=["']${label} usage\\s+(\\d+(?:\\.\\d+)?)%\\s+used["']`, "i"));
  return match ? Number(match[1]) : null;
}

function findUsageSection(html, label, nextLabel = null) {
  const startMatch = new RegExp(`>${label} usage<`, "i").exec(html);
  if (!startMatch) return "";
  const start = startMatch.index;
  let end = html.length;
  if (nextLabel) {
    const next = new RegExp(`>${nextLabel} usage<`, "i").exec(html.slice(start + startMatch[0].length));
    if (next) end = start + startMatch[0].length + next.index;
  } else {
    const script = html.indexOf("<script", start);
    if (script >= 0) end = script;
  }
  return html.slice(start, end);
}

function parseReset(section) {
  const match = section.match(/\bdata-time\s*=\s*(["'])([^"']+)\1/i);
  if (!match) return null;
  const timestamp = Date.parse(match[2]);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function parseIdentity(html) {
  const emailMatch = html.match(/<h2\b[^>]*\bid\s*=\s*(["'])header-email\1[^>]*>([\s\S]*?)<\/h2>/i);
  const email = emailMatch ? textContent(emailMatch[2]) : null;

  let username = null;
  if (emailMatch) {
    const beforeEmail = html.slice(Math.max(0, emailMatch.index - 1800), emailMatch.index);
    const links = [...beforeEmail.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
    for (const link of links.reverse()) {
      const href = readAttribute(link[1], "href");
      const candidate = textContent(link[2]);
      if (href && /^\/[a-z0-9][\w.-]*$/i.test(href) && !["/settings", "/pricing", "/download", "/docs", "/search"].includes(href) && candidate) {
        username = candidate;
        break;
      }
    }
  }

  if (!username) {
    const navMatch = html.match(/<nav\b[^>]*\bid\s*=\s*(["'])user-nav\1[^>]*>([\s\S]*?)<\/nav>/i);
    if (navMatch) {
      for (const link of navMatch[2].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
        if (readAttribute(link[1], "href") === "/settings") {
          username = textContent(link[2]);
          if (username) break;
        }
      }
    }
  }

  if (!email) {
    const fallback = html.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
    return { username, email: fallback?.[0] ?? null };
  }
  return { username, email };
}

function parseSubscription(html) {
  const headingAt = html.search(/>\s*Cloud usage\s*</i);
  const area = headingAt >= 0 ? html.slice(headingAt, headingAt + 1800) : html;
  for (const span of area.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span\s*>/gi)) {
    const className = readAttribute(span[1], "class") ?? "";
    if (/\bcapitalize\b/.test(className)) {
      const value = textContent(span[2]);
      if (value) return value;
    }
  }
  return "Unknown";
}

function parseWeeklyModels(section) {
  const byModel = new Map();
  for (const tag of section.matchAll(/<[^>]+\bdata-usage-segment\b[^>]*>/gi)) {
    const model = readAttribute(tag[0], "data-model");
    const requests = Number.parseInt(readAttribute(tag[0], "data-requests") ?? "", 10);
    if (!model || !Number.isFinite(requests)) continue;
    byModel.set(model, (byModel.get(model) ?? 0) + requests);
  }
  return [...byModel.entries()]
    .map(([model, requests]) => ({ model, requests }))
    .sort((a, b) => b.requests - a.requests || a.model.localeCompare(b.model));
}

export function parseOllamaSettings(html) {
  if (typeof html !== "string" || !AUTH_MARKER.test(html)) {
    throw new OllamaAuthError();
  }

  const sessionSection = findUsageSection(html, "Session", "Weekly");
  const weeklySection = findUsageSection(html, "Weekly");
  const identity = parseIdentity(html);

  return {
    username: identity.username,
    email: identity.email,
    subscription: parseSubscription(html),
    session: {
      percent: parsePercent(html, "Session"),
      resetsAt: parseReset(sessionSection),
    },
    weekly: {
      percent: parsePercent(html, "Weekly"),
      resetsAt: parseReset(weeklySection),
    },
    models: parseWeeklyModels(weeklySection),
  };
}
