import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['90 123 45 67', '+998901234567'],
    ['998901234567', '+998901234567'],
    ['+998 (90) 123-45-67', '+998901234567'],
    ['1097', '1097'],
    ['1001', '1001'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});
