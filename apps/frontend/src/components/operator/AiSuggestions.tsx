import { BulbOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Tag, Tooltip } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { AiSuggestion, TicketType } from '../../api/types';

const DEBOUNCE_MS = 600;

/**
 * Tavsif matnidan tavsiyalar (F-AI-02/04): mavzu, hudud va kalit so'z ogohlantirishi. Operator bosib qabul qiladi —
 * hech narsa avtomatik o'zgarmaydi.
 */
export default function AiSuggestions({ text, topics, regionId, districtId, type, onTopic, onPlace, onType }: {
  text: string | undefined;
  topics: number[] | undefined;
  regionId: number | undefined;
  districtId: number | undefined;
  type: TicketType | undefined;
  onTopic: (id: number) => void;
  onPlace: (regionId: number, districtId?: number) => void;
  onType: (type: TicketType) => void;
}) {
  const [data, setData] = useState<AiSuggestion | null>(null);

  useEffect(() => {
    const value = text?.trim() ?? '';
    if (value.length < 15) {
      setData(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .post<AiSuggestion>('/ai/suggest', { text: value })
        .then((res) => !cancelled && setData(res.data))
        .catch(() => !cancelled && setData(null));
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text]);

  if (!data) return null;
  const newTopics = data.topics.filter((t) => t.id !== topics?.[0]);
  const placeNew = data.region && (data.region.id !== regionId || (data.district && data.district.id !== districtId));
  const corruption = data.flags.find((f) => f.key === 'corruption');
  if (!newTopics.length && !placeNew && !data.flags.length) return null;

  return (
    <div className="ai-suggest" aria-live="polite">
      {(newTopics.length > 0 || placeNew) && (
        <div className="ai-suggest-row">
          <span className="ai-suggest-label">
            <BulbOutlined /> Tavsiya
          </span>
          {newTopics.map((t) => (
            <Tooltip key={t.id} title={`${t.parent?.nameUz ?? ''} · ehtimol ${Math.round(t.probability * 100)}% · bosib asosiy mavzu qilish`}>
              <Tag className="ai-chip" onClick={() => onTopic(t.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onTopic(t.id)}>
                {t.name} <span className="ai-chip-p">{Math.round(t.probability * 100)}%</span>
              </Tag>
            </Tooltip>
          ))}
          {placeNew && data.region && (
            <Tag
              className="ai-chip"
              role="button"
              tabIndex={0}
              onClick={() => onPlace(data.region!.id, data.district?.id)}
              onKeyDown={(e) => e.key === 'Enter' && onPlace(data.region!.id, data.district?.id)}
            >
              {data.district ? `${data.district.name}, ${data.region.name}` : data.region.name}
            </Tag>
          )}
        </div>
      )}
      {data.flags.map((f) => (
        <div key={f.key} className="ai-suggest-row ai-flag">
          <WarningOutlined />
          <span>
            <b>{f.label}</b>: {f.words.join(', ')}
          </span>
          {f === corruption && type !== 'CORRUPTION' && (
            <Button size="small" type="link" onClick={() => onType('CORRUPTION')}>
              Turini «Korrupsiya» qilish
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
