import type { ReactNode } from "react";
import { parseBlocks, parseInline, isSafeUrl, type InlineNode } from "../utils/markdown";

// Rendert ausschließlich über JSX-Kindelemente (Text-Kinder, kein
// dangerouslySetInnerHTML) — React escaped Text-Nodes automatisch, wodurch
// rohes HTML im Nutzertext (z.B. "<script>") immer als sichtbarer Text
// landet statt interpretiert zu werden.
function renderInline(nodes: InlineNode[]): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.kind) {
      case "text":
        return n.value;
      case "code":
        return <code key={i}>{n.value}</code>;
      case "bold":
        return <strong key={i}>{renderInline(n.children)}</strong>;
      case "italic":
        return <em key={i}>{renderInline(n.children)}</em>;
      case "link":
        return isSafeUrl(n.href) ? (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
            {n.text}
          </a>
        ) : (
          // Unsichere Schemes (javascript:, data: …) bleiben Klartext statt Link.
          <span key={i}>
            [{n.text}]({n.href})
          </span>
        );
    }
  });
}

export default function MarkdownPreview({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "heading": {
            const Tag = `h${Math.min(b.level, 6)}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
            return <Tag key={i}>{renderInline(parseInline(b.text))}</Tag>;
          }
          case "codeblock":
            return (
              <pre key={i}>
                <code>{b.code}</code>
              </pre>
            );
          case "list": {
            const ListTag = b.ordered ? "ol" : "ul";
            return (
              <ListTag key={i}>
                {b.items.map((item, j) => (
                  <li key={j}>{renderInline(parseInline(item))}</li>
                ))}
              </ListTag>
            );
          }
          case "paragraph":
            return <p key={i}>{renderInline(parseInline(b.text))}</p>;
        }
      })}
    </>
  );
}
