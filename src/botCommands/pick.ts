import type { BotCommandHandler } from '../commands.js';
import { randomIntInclusive } from './shared.js';

export const pickCommandHandler: BotCommandHandler = {
  name: 'pick',
  aliases: ['pick'],
  async handle(context) {
    try {
      const parsed = parsePickCommand(context.messageText);

      if (!parsed.items.length) {
        await context.send('Usage: /pick [-n <số lượng>] -l item1; item2; item3');
        return;
      }

      const count = Math.min(parsed.count, parsed.items.length);
      const selectedItems = pickRandomItems(parsed.items, count);

      await context.send(
        count === 1
          ? `Chọn ngẫu nhiên: ${selectedItems[0]}`
          : `Chọn ngẫu nhiên ${count} mục: ${selectedItems.join('; ')}`
      );
    } catch (error) {
      context.logger.error('pick error', error);
      await context.send('Lỗi khi chọn ngẫu nhiên.');
    }
  }
};

function parsePickCommand(messageText: string): { count: number; items: string[] } {
  const countMatch = messageText.match(/(?:^|\s)-n\s+(\d+)(?=\s|$)/i);
  const listMatch = messageText.match(/(?:^|\s)-l\s+([\s\S]+)/i);

  const count = countMatch ? Number.parseInt(countMatch[1] ?? '1', 10) : 1;
  const rawList = listMatch?.[1] ? listMatch[1].replace(/\s+-n\s+\d+\s*$/i, '').trim() : '';
  const items = rawList
    ? rawList
        .split(';')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  return {
    count: Number.isFinite(count) && count > 0 ? count : 1,
    items
  };
}

function pickRandomItems(items: string[], count: number): string[] {
  const pool = [...items];
  const selected: string[] = [];

  while (selected.length < count && pool.length > 0) {
    const index = randomIntInclusive(0, pool.length - 1);
    const [item] = pool.splice(index, 1);

    if (item) {
      selected.push(item);
    }
  }

  return selected;
}