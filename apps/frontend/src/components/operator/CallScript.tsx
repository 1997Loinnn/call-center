import { Button, Card } from 'antd';
import { useState } from 'react';

/** Suhbat skripti: operator suhbatni bosqichma-bosqich olib boradi. Matnlar namuna, bilimlar bazasidan olinadi. */
export default function CallScript({ routeName, slaDays }: { routeName?: string; slaDays?: number }) {
  const [step, setStep] = useState(0);
  const target = routeName ?? "mas'ul bo'linma";
  const term = slaDays ? `${slaDays} kun` : "belgilangan muddat";
  const steps: [string, string][] = [
    ['Salomlashish', '«Assalomu alaykum! Kadastr agentligi 1097 ishonch telefoni. Sizga qanday yordam bera olaman?»'],
    ['Shaxsni aniqlash', "«Murojaatni rasmiylashtirish uchun ism-familiyangiz va qaysi hududdan qo'ng'iroq qilayotganingizni ayta olasizmi?»"],
    ['Masalani aniqlash', "«Qaysi ko'chmas mulk yoki ariza haqida gap ketmoqda? Kadastr yoki ariza raqami bormi?» Javobni «Tavsif»ga yozing."],
    ["Yo'naltirish", `«Murojaatingiz ${target}ga yuboriladi. Ijro muddati — ${term}. Murojaat raqamini SMS orqali yuboramiz.»`],
    ['Xayrlashish', "«Yana savollaringiz bormi? 1097 ga qo'ng'iroq qilganingiz uchun rahmat!»"],
  ];

  return (
    <Card size="small" title="Suhbat skripti" extra={<span className="mono panel-note">{step + 1} / {steps.length}</span>}>
      <ol className="script-steps">
        {steps.map(([title], i) => (
          <li key={title}>
            <button
              type="button"
              className={`script-step${i === step ? ' is-current' : ''}${i < step ? ' is-done' : ''}`}
              aria-current={i === step ? 'step' : undefined}
              onClick={() => setStep(i)}
            >
              <span className="script-no mono">{i + 1}</span>
              {title}
            </button>
          </li>
        ))}
      </ol>
      <p className="script-text" aria-live="polite">
        {steps[step][1]}
      </p>
      <div className="panel-actions">
        <Button block disabled={step === 0} onClick={() => setStep(step - 1)}>
          Oldingi
        </Button>
        <Button block disabled={step === steps.length - 1} onClick={() => setStep(step + 1)}>
          Keyingi
        </Button>
      </div>
    </Card>
  );
}
