# AI Realtime Bot Server (Groq)

Server Node.js nhận trạng thái game và trả về hành vi bot theo thời gian thực.

## Yêu cầu
- Node.js 18+
- Groq API Key

## Cài đặt
```bash
npm install
```

## Cấu hình
Tạo file `.env` (hoặc set biến môi trường) với nội dung:
```
GROQ_API_KEY=your_key_here
GROQ_BASE_URL=https://api.groq.com/openai/v1
MODEL=llama-3.1-8b-instant
PORT=3001
CLIENT_TOKEN=optional_client_token
```

## Chạy
```bash
npm start
```

## API
- `GET /health` kiểm tra trạng thái
- `POST /decide` nhận trạng thái và trả về action bot

Headers tùy chọn:
- `x-client-id`: định danh client (để server tách state)
- `x-client-token`: nếu bạn đặt `CLIENT_TOKEN` thì client phải gửi token này

Payload mẫu:
```json
{
  "player": { "pos": { "x": 0, "y": 2, "z": 0 }, "hp": 100 },
  "bot": { "id": 0, "pos": { "x": 10, "y": 2, "z": 5 }, "hp": 100 },
  "zone": { "radius": 350, "phase": 1 }
}
```

Response mẫu:
```json
{
  "ok": true,
  "action": {
    "move": { "x": 0.3, "z": -0.7 },
    "aim": { "x": 0.1, "y": 0.0, "z": -0.9 },
    "shoot": true,
    "sprint": false,
    "jump": false,
    "target": "player"
  }
}
```
