import type { ReactNode } from 'react';

/**
 * Bilimlar bazasi maqolasi matni: oddiy matn, "- " bilan boshlangan qatorlar ro'yxat bo'ladi.
 * HTML ishlatilmaydi — matn React orqali chiqadi (XSS xavfi yo'q).
 */
export default function ArticleBody({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`}>
          {list.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^[-•]\s+/.test(trimmed)) {
      list.push(trimmed.replace(/^[-•]\s+/, ''));
      continue;
    }
    flush();
    if (trimmed) blocks.push(<p key={`p-${blocks.length}`}>{trimmed}</p>);
  }
  flush();
  return <div className="article-body">{blocks}</div>;
}
