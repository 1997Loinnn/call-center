import { BadRequestException } from '@nestjs/common';
import { scoreOf } from './qa.module';

describe('scoreOf', () => {
  const checklist = [
    { item: 'Salomlashish', max: 10 },
    { item: "Ma'lumot", max: 30 },
  ];

  it("bandlar yig'indisi 100 ballik shkalaga", () => {
    expect(scoreOf(checklist, [10, 30]).total).toBe(100);
    expect(scoreOf(checklist, [5, 15])).toEqual({
      total: 50,
      items: [
        { item: 'Salomlashish', max: 10, score: 5 },
        { item: "Ma'lumot", max: 30, score: 15 },
      ],
    });
  });

  it("band soni mos kelmasa yoki ball oshsa — xato", () => {
    expect(() => scoreOf(checklist, [10])).toThrow(BadRequestException);
    expect(() => scoreOf(checklist, [11, 0])).toThrow("ko'pi bilan 10");
  });
});
