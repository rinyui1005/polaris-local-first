import { Fragment, type ReactNode } from 'react';

type MarkdownProps = {
  text: string;
};

const INLINE_PATTERN = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_([^_\n]+)_|\[[^\]]+\]\([^)]+\))/g;

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    const token = match[0];
    if (index > cursor) nodes.push(<Fragment key={key++}>{text.slice(cursor, index)}</Fragment>);

    if (token.startsWith('`')) {
      nodes.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') || token.startsWith('_')) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link && /^https?:\/\//i.test(link[2])) {
        nodes.push(<a key={key++} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>);
      } else {
        nodes.push(<Fragment key={key++}>{token}</Fragment>);
      }
    }
    cursor = index + token.length;
  }

  if (cursor < text.length) nodes.push(<Fragment key={key++}>{text.slice(cursor)}</Fragment>);
  return nodes;
}

export function Markdown({ text }: MarkdownProps) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```([^\s]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index] ?? '')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <div className="cc-code" key={`code-${index}`}>
          {fence[1] ? <span className="cc-code-language">{fence[1]}</span> : null}
          <pre><code>{code.join('\n')}</code></pre>
        </div>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const Heading = `h${heading[1].length + 1}` as 'h2' | 'h3' | 'h4' | 'h5';
      blocks.push(<Heading key={`heading-${index}`}>{renderInline(heading[2])}</Heading>);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index] ?? '')) {
        quote.push((lines[index] ?? '').replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${index}`}>{quote.map((part, partIndex) => <Fragment key={partIndex}>{renderInline(part)}{partIndex < quote.length - 1 ? <br /> : null}</Fragment>)}</blockquote>);
      continue;
    }

    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^[-*+]\s+/, ''));
        index += 1;
      }
      blocks.push(<ul key={`list-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</ul>);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      blocks.push(<ol key={`ordered-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</ol>);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && (lines[index] ?? '').trim()) {
      if (paragraph.length && (/^```/.test(lines[index] ?? '') || /^(#{1,4})\s+/.test(lines[index] ?? '') || /^>\s?/.test(lines[index] ?? '') || /^[-*+]\s+/.test(lines[index] ?? '') || /^\d+\.\s+/.test(lines[index] ?? ''))) break;
      paragraph.push(lines[index] ?? '');
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{paragraph.map((part, partIndex) => <Fragment key={partIndex}>{renderInline(part)}{partIndex < paragraph.length - 1 ? <br /> : null}</Fragment>)}</p>);
  }

  return <div className="cc-markdown">{blocks}</div>;
}
