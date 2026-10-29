# 楓葉小吃線上訂餐系統

[English](README.en.md)｜**繁體中文**

客人在網頁選餐下單，訂單存進 MySQL，並透過 n8n 自動寄 Gmail、寫入 Google 試算表、傳 LINE 通知店家。店家另有後台可以查看訂單、更新製作狀態。

**展示版（純前端模擬，不連資料庫與 n8n）：** https://你的帳號.github.io/order-system/

<!--
放上截圖或操作影片後，取消這段註解：
![訂餐頁](docs/screenshots/order.png)
![店家後台](docs/screenshots/admin.png)
![n8n 流程](docs/screenshots/n8n.png)
-->

## 系統架構

```mermaid
flowchart LR
    C[客人瀏覽器] -->|選餐、送出訂單| F[Flask 後端]
    F -->|寫入訂單| M[(MySQL)]
    F -->|POST webhook| N[n8n]
    N --> G[Gmail 通知]
    N --> S[Google 試算表備份]
    N --> L[LINE 通知]
    A[店家後台 /admin] -->|查詢、更新狀態| F
```

## 功能

**客人端**
- 依分類顯示照片菜單，加減份數，即時計算合計
- 自取或外送，外送需填地址；可填備註
- 記住常客的姓名與電話（localStorage）
- 手機版有底部合計列，台式復古風格介面（RWD）

**店家端 `/admin`**
- HTTP Basic 登入，密碼由環境變數設定
- 依狀態篩選訂單：新訂單、製作中、已完成、已取消
- 下拉選單更新狀態，每 30 秒自動更新
- 標示「n8n 通知未送出」的訂單，方便補發

**自動化（n8n）**
- Webhook 收到訂單後，同時觸發 Gmail、Google Sheets、LINE Messaging API 三條分支

## 設計重點

| 問題 | 做法 |
|---|---|
| 前端可以竄改價格 | 後端只接收餐點 ID 與數量，金額一律用伺服器端的菜單重新計算 |
| 外部服務失敗不該讓客人下不了單 | 先存 MySQL，再通知 n8n；n8n 失敗只記錄並標記，不回傳錯誤給客人 |
| 訂單與明細要一致 | `orders` 與 `order_items` 在同一個交易內寫入，失敗即 rollback |
| 客人輸入的文字顯示在後台 | 後台輸出前一律跳脫，避免 XSS |
| 公開下單 API 被洗單 | 依 IP 限制，10 分鐘內最多 6 筆（429） |
| SQL 注入 | 全部使用參數化查詢 |
| 密碼與金鑰外洩 | 一律由環境變數讀取，`.env` 不進版控 |

## 資料庫

```
orders        id, order_id(唯一), customer_name, phone, fulfillment, address,
              note, total, status, n8n_sent, created_at
order_items   id, order_id(外鍵, ON DELETE CASCADE), item_id, item_name,
              price, qty, subtotal
```

程式啟動時會自動建立資料庫與資料表。

## 技術

Python、Flask、PyMySQL、MySQL、n8n、HTML / CSS / JavaScript（無框架）、gunicorn

## 專案結構

```
app.py              後端：路由、驗證、MySQL、n8n 轉送、後台 API
templates/          index.html（訂餐頁）、admin.html（後台）
static/             style.css、app.js、admin.js
docs/               GitHub Pages 展示版（純前端模擬）
Procfile            雲端部署用啟動指令
.env.example        環境變數範例
```

## 在本機執行

需求：Python 3.10 以上、MySQL

```bash
pip install -r requirements.txt
cp .env.example .env      # Windows：copy .env.example .env
# 編輯 .env：填入 MySQL 密碼、後台密碼、n8n webhook 網址
python app.py
```

- 訂餐頁：http://localhost:5000
- 後台：http://localhost:5000/admin（帳號 `admin`，密碼為 `ADMIN_PASSWORD`）

### n8n 設定

Webhook 節點使用 `POST`，後面並排接 Gmail、Google Sheets、HTTP Request（LINE Messaging API），資料在 `$json.body` 底下：

```json
{
  "order_id": "A3F9C2",
  "created_at": "2026-10-29T14:30:00+08:00",
  "customer": { "name": "王小明", "phone": "0912345678" },
  "fulfillment": "pickup",
  "address": "",
  "note": "",
  "items": [{ "id": "lurou", "name": "滷肉飯", "price": 55, "qty": 2, "subtotal": 110 }],
  "total": 110
}
```

## 已知限制與可改進方向

- 菜單目前寫在 `app.py`，尚未做後台編輯
- 防洗單的計數存在記憶體，多個行程之間不共用；正式環境可改用 Redis
- 後台使用單一密碼的 Basic 認證，沒有多帳號與權限
- 尚未串接線上付款

## 圖片來源

餐點與橫幅照片來自 [Unsplash](https://unsplash.com/?utm_source=maple_order&utm_medium=referral)，攝影師：K X I T H V I S U A L S、Xavier Chng、Trista Le、Jonathan Lim、Daily Food Shot、Chinh Le Duc、Uehara Photography、Snappr、Moonyang Lin。
