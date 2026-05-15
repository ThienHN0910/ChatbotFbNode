import type { BotCommandHandler } from '../commands.js';

export const helpCommandHandler: BotCommandHandler = {
  name: 'help',
  aliases: ['h', 'help'],
  async handle(context) {
    const helpLines = [
      '/about - Thông tin nhanh về bot',
      '/ask <question> - Hỏi Gemini (RAG + AI)',
      '/echo <text> - Nhại lại tin nhắn',
      '/time - Trả về giờ hệ thống (Asia/Ho_Chi_Minh)',
      '/weather [day] [location] - Thời tiết hôm nay hoặc tối đa 5 ngày tới (mặc định Đà Nẵng)',
      '/uptime - Thời gian bot đã chạy',
      '/ping - Kiểm tra độ trễ',
      '/fb, /link - Trả về links của Động',
      '/me - Hiển thị tên Facebook và ID của bạn',
      '/random - Tỉ lệ ngẫu nhiên (0-100%) hoặc /random <min> <max>',
      '/pick [-n <số lượng>] -l item1; item2; item3 - Chọn ngẫu nhiên trong danh sách',
      '/mem - Thống kê số người đã nhắn bot',
      '/top - Top gửi tin nhắn',
      '/history - Lịch sử 10 tin nhắn gần nhất',
      '/h, /help - Hiện trợ giúp'
    ];

    await context.send(helpLines.join('\n'));
  }
};