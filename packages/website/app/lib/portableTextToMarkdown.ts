export interface PtSpan {
  _type: 'span';
  text: string;
  marks?: string[];
}

export interface PtMarkDef {
  _key: string;
  _type: string;
  href?: string;
}

export interface PtBlock {
  _type: 'block';
  style?: string;
  listItem?: 'bullet' | 'number';
  level?: number;
  children?: PtSpan[];
  markDefs?: PtMarkDef[];
}

export interface PtImage {
  _type: 'image';
  asset?: { _ref: string };
  alt?: string;
  caption?: string;
}

export type PtNode =
  | PtBlock
  | PtImage
  | { _type: 'gameEmbed'; gameSlug?: string; title?: string }
  | { _type: 'audioPlayer'; audioUrl?: string; title?: string }
  | { _type: string; [key: string]: unknown };

export interface ToMarkdownOptions {
  resolveImageUrl?: (value: PtImage) => string;
  siteUrl?: string;
}

const DECORATORS: Record<string, string> = {
  strong: '**',
  em: '*',
  code: '`',
};

function serializeSpan(span: PtSpan, markDefs: PtMarkDef[]): string {
  let text = span.text ?? '';
  const marks = span.marks ?? [];
  for (const mark of marks) {
    const wrap = DECORATORS[mark];
    if (wrap) text = `${wrap}${text}${wrap}`;
  }
  for (const mark of marks) {
    const def = markDefs.find((d) => d._key === mark);
    if (def && def._type === 'link' && def.href) {
      text = `[${text}](${def.href})`;
    }
  }
  return text;
}

function serializeBlock(block: PtBlock): string {
  const markDefs = block.markDefs ?? [];
  const inner = (block.children ?? []).map((c) => serializeSpan(c, markDefs)).join('');
  if (block.listItem) {
    const indent = '  '.repeat(Math.max(0, (block.level ?? 1) - 1));
    const bullet = block.listItem === 'number' ? '1.' : '-';
    return `${indent}${bullet} ${inner}`;
  }
  switch (block.style) {
    case 'h1':
      return `# ${inner}`;
    case 'h2':
      return `## ${inner}`;
    case 'h3':
      return `### ${inner}`;
    case 'h4':
      return `#### ${inner}`;
    case 'blockquote':
      return `> ${inner}`;
    default:
      return inner;
  }
}

export function portableTextToMarkdown(
  blocks: PtNode[] | undefined | null,
  options: ToMarkdownOptions = {}
): string {
  if (!blocks || blocks.length === 0) return '';
  const siteUrl = options.siteUrl ?? 'https://kynantokoro.com';
  const items: { md: string; list: boolean }[] = [];

  for (const node of blocks) {
    switch (node._type) {
      case 'block':
        items.push({ md: serializeBlock(node as PtBlock), list: Boolean((node as PtBlock).listItem) });
        break;
      case 'image': {
        const img = node as PtImage;
        const url = options.resolveImageUrl ? options.resolveImageUrl(img) : img.asset?._ref ?? '';
        let md = `![${img.alt ?? ''}](${url})`;
        if (img.caption) md += `\n\n*${img.caption}*`;
        items.push({ md, list: false });
        break;
      }
      case 'gameEmbed': {
        const g = node as { gameSlug?: string; title?: string };
        if (g.gameSlug) items.push({ md: `[▶ Play: ${g.title ?? 'Game'}](${siteUrl}/projects/${g.gameSlug})`, list: false });
        break;
      }
      case 'audioPlayer': {
        const a = node as { audioUrl?: string; title?: string };
        if (a.audioUrl) items.push({ md: `[🔊 Audio: ${a.title ?? 'Audio'}](${a.audioUrl})`, list: false });
        break;
      }
      default:
        break;
    }
  }

  let out = '';
  for (let i = 0; i < items.length; i++) {
    if (i > 0) out += items[i].list && items[i - 1].list ? '\n' : '\n\n';
    out += items[i].md;
  }
  return out;
}
