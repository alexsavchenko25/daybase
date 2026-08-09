// Minimaler, sicherer Markdown-Parser für Notes/Journal-Vorschau.
// Bewusst kein Dependency (marked/react-markdown o.ä.): die unterstützte
// Teilmenge ist klein und fest (Headings, Bold, Italic, Listen, Links,
// Inline-Code, Codeblöcke) — dafür reicht ein ~100-Zeilen-Parser, der direkt
// React-Knoten statt HTML-Strings erzeugt. Dadurch gibt es strukturell keinen
// dangerouslySetInnerHTML-Pfad und damit keine XSS-Fläche über den Inhalt
// (siehe components/MarkdownPreview.tsx).

export type InlineNode =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "bold"; children: InlineNode[] }
  | { kind: "italic"; children: InlineNode[] }
  | { kind: "link"; href: string; text: string };

export type BlockNode =
  | { kind: "heading"; level: number; text: string }
  | { kind: "codeblock"; code: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "paragraph"; text: string };

// Nur http(s)/mailto — blockt javascript:/data: u.ä. in [text](href).
export function isSafeUrl(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href.trim());
}

// Eigenes RegExp-Objekt pro Aufruf (statt eines geteilten module-level
// Patterns) — sonst würde der rekursive Aufruf für Bold/Italic-Inhalte den
// `lastIndex` der äußeren Schleife überschreiben.
function inlineRegex(): RegExp {
  return /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|(?<!\w)_([^_]+)_(?!\w)/g;
}

export function parseInline(src: string): InlineNode[] {
  const re = inlineRegex();
  const nodes: InlineNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > lastIndex) nodes.push({ kind: "text", value: src.slice(lastIndex, m.index) });
    if (m[1] !== undefined) nodes.push({ kind: "code", value: m[1] });
    else if (m[2] !== undefined) nodes.push({ kind: "link", href: m[3], text: m[2] });
    else if (m[4] !== undefined) nodes.push({ kind: "bold", children: parseInline(m[4]) });
    else if (m[5] !== undefined) nodes.push({ kind: "italic", children: parseInline(m[5]) });
    else if (m[6] !== undefined) nodes.push({ kind: "italic", children: parseInline(m[6]) });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < src.length) nodes.push({ kind: "text", value: src.slice(lastIndex) });
  return nodes;
}

function isListLine(line: string): boolean {
  return /^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line);
}
function isOrderedListLine(line: string): boolean {
  return /^\s*\d+\.\s+/.test(line);
}

export function parseBlocks(src: string): BlockNode[] {
  const lines = src.split(/\r?\n/);
  const blocks: BlockNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block (``` … ```). Unbeendete Fences laufen bis zum
    // Dokument-Ende statt Inhalt zu verlieren.
    if (/^```/.test(line)) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ kind: "codeblock", code: codeLines.join("\n") });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (isListLine(line)) {
      const ordered = isOrderedListLine(line);
      const items: string[] = [];
      while (i < lines.length && isListLine(lines[i]) && isOrderedListLine(lines[i]) === ordered) {
        items.push(lines[i].replace(/^\s*(?:[-*]|\d+\.)\s+/, ""));
        i++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    // Paragraph: fortlaufende Zeilen bis zur nächsten Sonderzeile, mit
    // Leerzeichen verbunden (Soft-Wrap-Zeilen bleiben ein Absatz).
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i]) &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !isListLine(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ kind: "paragraph", text: paraLines.join(" ") });
  }
  return blocks;
}
