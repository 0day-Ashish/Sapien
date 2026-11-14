import { isValidElement, type ReactNode } from "react";

// Turns the docs' JSX into plain Markdown for agents (/docs.md, /docs/<slug>.md, /llms-full.txt). It walks the element
// tree the way a reader would: block tags become paragraphs and list items, links keep their href, and decorative
// parts (aria-hidden, SVG) are dropped. Plain function components are expanded; anything that can't be called
// (client components, components with hooks) falls back to its children.

const BLOCK = new Set(["p", "div", "section", "article", "aside", "header", "footer", "ul", "ol", "dl", "table", "thead", "tbody", "blockquote", "figure", "figcaption"]);
const SKIP = new Set(["svg", "img", "picture", "video", "audio", "script", "style", "button", "input", "select", "textarea"]);

type Props = Record<string, unknown> & { children?: ReactNode };

function text(node: ReactNode, base: string): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) {
    let out = "";
    let prevWasElement = false;
    for (const child of node) {
      const piece = text(child, base);
      if (!piece) continue;
      // Two elements side by side (a title span then a body span) need a gap; JSX text already carries its own spaces.
      if (prevWasElement && isValidElement(child) && out && !/\s$/.test(out) && !/^\s/.test(piece)) out += " ";
      out += piece;
      prevWasElement = isValidElement(child);
    }
    return out;
  }
  if (!isValidElement(node)) return "";

  const props = (node.props ?? {}) as Props;
  if (props["aria-hidden"] === "true" || props["aria-hidden"] === true) return "";
  const type = node.type;

  if (typeof type === "function") {
    try {
      // A component that renders (DocCard) draws its own link from its href, so it isn't wrapped again here.
      return text((type as (p: Props) => ReactNode)(props), base);
    } catch {
      // One that can't be called outside React (next/link uses hooks) keeps its children and its href.
      return wrapLink(text(props.children, base), props.href, base);
    }
  }
  if (typeof type !== "string") return wrapLink(text(props.children, base), props.href, base);
  if (SKIP.has(type)) return "";

  const inner = text(props.children, base);
  switch (type) {
    case "h1": return `\n\n# ${inner.trim()}\n\n`;
    case "h2": return `\n\n## ${inner.trim()}\n\n`;
    case "h3": return `\n\n### ${inner.trim()}\n\n`;
    case "h4": case "h5": case "h6": return `\n\n#### ${inner.trim()}\n\n`;
    case "li": return `\n- ${inner.trim().replace(/\n+/g, " ")}`;
    case "dt": return `\n- **${inner.trim()}**: `;
    case "dd": return inner.trim();
    case "tr": return `\n| ${inner.trim()} |`;
    case "td": case "th": return ` ${inner.trim()} |`;
    case "br": return "\n";
    case "code": return `\`${inner}\``;
    case "strong": case "b": return `**${inner}**`;
    case "em": case "i": return `*${inner}*`;
    case "a": return wrapLink(inner, props.href, base);
    default:
      return BLOCK.has(type) ? `\n\n${inner}\n\n` : inner;
  }
}

function wrapLink(label: string, href: unknown, base: string) {
  if (typeof href !== "string" || !label.trim()) return label;
  // Link renders an <a> with the same href: keep only the outermost link.
  label = label.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  const url = href.startsWith("/") ? `${base}${href}` : href;
  return `[${label.trim()}](${url})`;
}

/** Markdown for any React tree. `base` makes site-relative links absolute. */
export function toMarkdown(node: ReactNode, base: string): string {
  return text(node, base)
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
