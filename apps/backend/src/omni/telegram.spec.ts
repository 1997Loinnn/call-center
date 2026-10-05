import { parseTelegramUpdate, TG_BUTTON_STATUS, TgUpdate } from './telegram';

const update = (message: Partial<NonNullable<TgUpdate['message']>>): TgUpdate => ({
  update_id: 1,
  message: { message_id: 7, date: 0, chat: { id: 555, type: 'private' }, from: { id: 555, first_name: 'Aziz', last_name: 'Karimov', username: 'aziz' }, ...message },
});

describe('parseTelegramUpdate', () => {
  it('oddiy matn', () => {
    expect(parseTelegramUpdate(update({ text: ' Arizam qachon tayyor? ' }))).toEqual({
      chatId: '555',
      messageId: '7',
      contactName: 'Aziz Karimov',
      username: '@aziz',
      intent: { kind: 'message', text: 'Arizam qachon tayyor?', attachments: [] },
    });
  });

  it('/start va holat tugmasi', () => {
    expect(parseTelegramUpdate(update({ text: '/start' }))?.intent).toEqual({ kind: 'start' });
    expect(parseTelegramUpdate(update({ text: TG_BUTTON_STATUS }))?.intent).toEqual({ kind: 'status_help' });
  });

  it("o'z kontaktini yuborsa raqam tasdiqlangan", () => {
    expect(parseTelegramUpdate(update({ contact: { phone_number: '998901234567', first_name: 'Aziz', user_id: 555 } }))?.intent).toEqual({
      kind: 'contact',
      phone: '+998901234567',
      verified: true,
    });
    expect(parseTelegramUpdate(update({ contact: { phone_number: '+998911112233', first_name: 'Boshqa', user_id: 9 } }))?.intent).toEqual(
      expect.objectContaining({ verified: false }),
    );
  });

  it('rasm izoh bilan, guruh xabari va bo\'sh xabar', () => {
    expect(parseTelegramUpdate(update({ photo: [{ file_id: 'a', file_size: 10 }, { file_id: 'b', file_size: 900 }], caption: 'Hujjat' }))?.intent).toEqual({
      kind: 'message',
      text: 'Hujjat',
      attachments: [{ type: 'photo', fileName: 'rasm.jpg', sizeBytes: 900 }],
    });
    expect(parseTelegramUpdate(update({ chat: { id: -1, type: 'group' }, text: 'salom' }))).toBeNull();
    expect(parseTelegramUpdate(update({ text: '' }))).toBeNull();
  });
});
