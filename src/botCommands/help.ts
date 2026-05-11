import type { BotCommandHandler } from '../commands.js';

export const helpCommandHandler: BotCommandHandler = {
  name: 'help',
  aliases: ['h', 'help'],
  async handle(context) {
    const helpLines = [
      '/ask <question> - Hỏi Gemini (RAG + AI)',
      '/about - Thông tin nhanh về bot',
      '/echo <text> - Nhại lại tin nhắn',
      '/time, /gio, /keo - Trả về giờ hệ thống (Asia/Ho_Chi_Minh)',
      '/uptime - Thời gian bot đã chạy',
      '/ping - Kiểm tra độ trễ',
      '/fb, /link - Trả về links của Động',
      '/me - Hiển thị tên Facebook và ID của bạn',
      '/random - Tỉ lệ ngẫu nhiên (0-100%) hoặc /random <min> <max>',
      '/mem - Thống kê số người đã nhắn bot',
      '/top - Top gửi tin nhắn',
      '/history - Lịch sử 10 tin nhắn gần nhất',
      '/h, /help - Hiện trợ giúp'
    ];

    await context.send(helpLines.join('\n'));
  }
};