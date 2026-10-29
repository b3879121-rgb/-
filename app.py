import os
import re
import secrets
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from functools import wraps

import pymysql
import requests
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, render_template, request
from werkzeug.middleware.proxy_fix import ProxyFix

load_dotenv()
app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1)  # 部署在雲端時取得客人的真實 IP

N8N_URL = os.environ.get("N8N_WEBHOOK_URL", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
DB_NAME = os.environ.get("DB_NAME") or os.environ.get("MYSQLDATABASE") or "maple_orders"
DB = dict(
    host=os.environ.get("DB_HOST") or os.environ.get("MYSQLHOST") or "localhost",
    port=int(os.environ.get("DB_PORT") or os.environ.get("MYSQLPORT") or 3306),
    user=os.environ.get("DB_USER") or os.environ.get("MYSQLUSER") or "root",
    password=os.environ.get("DB_PASSWORD") or os.environ.get("MYSQLPASSWORD") or "",
    charset="utf8mb4",
    cursorclass=pymysql.cursors.DictCursor,
)
TW = timezone(timedelta(hours=8))
STATUSES = ("new", "preparing", "done", "cancelled")


def photo(path, size=240):
    return f"https://images.unsplash.com/{path}?auto=format&fit=crop&w={size}&h={size}&q=75"


HERO_IMG = "https://images.unsplash.com/photo-1535898331935-2d274aff0fbc?auto=format&fit=crop&w=1600&h=700&q=75"

MENU = [
    {"id": "lurou", "cat": "主食", "name": "滷肉飯", "price": 55, "note": "古早味肉燥，淋在白飯上", "img": photo("photo-1679279726946-a158b8bcaa23")},
    {"id": "jitui", "cat": "主食", "name": "雞腿便當", "price": 110, "note": "附三樣配菜", "img": photo("photo-1786201188628-db52cdadb037")},
    {"id": "paigu", "cat": "主食", "name": "排骨便當", "price": 100, "note": "附三樣配菜", "img": photo("photo-1568717099337-5aaecc090548")},
    {"id": "qingcai", "cat": "配菜與湯", "name": "燙青菜", "price": 40, "note": "當日時蔬", "img": photo("photo-1771573042838-8b3adf17562e")},
    {"id": "ludan", "cat": "配菜與湯", "name": "滷蛋", "price": 15, "note": "每日現滷", "img": photo("photo-1587217518657-fa94faff4e7e")},
    {"id": "gongwan", "cat": "配菜與湯", "name": "貢丸湯", "price": 40, "note": "手打貢丸", "img": photo("photo-1706740006781-3ca0149307e5")},
    {"id": "zhenzhu", "cat": "飲料", "name": "珍珠奶茶", "price": 55, "note": "可選大杯", "img": photo("photo-1734770580735-796a00e42cb2")},
    {"id": "lvcha", "cat": "飲料", "name": "無糖綠茶", "price": 30, "note": "冷飲", "img": photo("photo-1637273484093-3e205aed2c59")},
]
MENU_BY_ID = {m["id"]: m for m in MENU}


# ---------- MySQL ----------
def conn():
    return pymysql.connect(database=DB_NAME, **DB)


def init_db():
    try:
        c = pymysql.connect(**DB)
        with c.cursor() as cur:
            cur.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}` "
                        "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        c.close()
    except pymysql.err.OperationalError as e:
        if e.args[0] != 1044:  # 1044 = 沒有建立資料庫的權限，直接用現成的資料庫
            raise
    c = conn()
    with c.cursor() as cur:
        cur.execute("""CREATE TABLE IF NOT EXISTS orders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_id VARCHAR(10) NOT NULL UNIQUE,
            customer_name VARCHAR(50) NOT NULL,
            phone VARCHAR(12) NOT NULL,
            fulfillment ENUM('pickup','delivery') NOT NULL,
            address VARCHAR(200) NOT NULL DEFAULT '',
            note VARCHAR(200) NOT NULL DEFAULT '',
            total INT NOT NULL,
            status ENUM('new','preparing','done','cancelled') NOT NULL DEFAULT 'new',
            n8n_sent TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
        cur.execute("""CREATE TABLE IF NOT EXISTS order_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_id VARCHAR(10) NOT NULL,
            item_id VARCHAR(20) NOT NULL,
            item_name VARCHAR(50) NOT NULL,
            price INT NOT NULL,
            qty INT NOT NULL,
            subtotal INT NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
    c.commit()
    c.close()


def save_order(o):
    c = conn()
    try:
        with c.cursor() as cur:
            cur.execute(
                "INSERT INTO orders (order_id, customer_name, phone, fulfillment, address,"
                " note, total, created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                (o["order_id"], o["customer"]["name"], o["customer"]["phone"], o["fulfillment"],
                 o["address"], o["note"], o["total"], o["created_at"][:19].replace("T", " ")))
            cur.executemany(
                "INSERT INTO order_items (order_id, item_id, item_name, price, qty, subtotal)"
                " VALUES (%s,%s,%s,%s,%s,%s)",
                [(o["order_id"], i["id"], i["name"], i["price"], i["qty"], i["subtotal"])
                 for i in o["items"]])
        c.commit()
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()


def notify_n8n(order):
    if not N8N_URL:
        return False
    try:
        r = requests.post(N8N_URL, json=order, timeout=10)
        if not r.ok:
            app.logger.error("n8n returned %s: %s", r.status_code, r.text[:300])
        return r.ok
    except requests.RequestException:
        app.logger.exception("n8n unreachable")
        return False


_hits = {}


def too_many(ip, limit=6, window=600):
    now = time.time()
    hits = [t for t in _hits.get(ip, []) if now - t < window]
    if len(hits) >= limit:
        _hits[ip] = hits
        return True
    hits.append(now)
    _hits[ip] = hits
    return False


# ---------- 客人 ----------
@app.get("/")
def index():
    return render_template("index.html", hero=HERO_IMG)


@app.get("/api/menu")
def get_menu():
    return jsonify(MENU)


@app.post("/api/order")
def create_order():
    if too_many(request.remote_addr):
        return jsonify(error="送出太頻繁，請稍後再試"), 429
    d = request.get_json(silent=True) or {}
    name = str(d.get("name", "")).strip()[:50]
    phone = re.sub(r"[\s-]", "", str(d.get("phone", "")))
    note = str(d.get("note", "")).strip()[:200]
    ful = d.get("fulfillment")
    addr = str(d.get("address", "")).strip()[:200]

    if not name:
        return jsonify(error="請填寫姓名"), 400
    if not re.fullmatch(r"\d{8,12}", phone):
        return jsonify(error="電話格式不正確，請輸入 8–12 位數字"), 400
    if ful not in ("pickup", "delivery"):
        return jsonify(error="請選擇取餐方式"), 400
    if ful == "delivery" and not addr:
        return jsonify(error="外送請填寫地址"), 400

    items, total = [], 0
    for row in d.get("items", []):
        m = MENU_BY_ID.get(row.get("id"))
        try:
            q = int(row.get("qty", 0))
        except (TypeError, ValueError):
            q = 0
        if not m or not 1 <= q <= 20:
            continue
        total += m["price"] * q
        items.append({"id": m["id"], "name": m["name"], "price": m["price"],
                      "qty": q, "subtotal": m["price"] * q})
    if not items:
        return jsonify(error="請至少選一樣餐點"), 400

    order = {
        "order_id": "A" + uuid.uuid4().hex[:6].upper(),
        "created_at": datetime.now(TW).isoformat(timespec="seconds"),
        "customer": {"name": name, "phone": phone},
        "fulfillment": ful,
        "address": addr if ful == "delivery" else "",
        "note": note,
        "items": items,
        "total": total,
    }

    try:
        save_order(order)  # 資料庫是訂單的唯一記錄
    except Exception:
        app.logger.exception("save order failed")
        return jsonify(error="訂單儲存失敗，請稍後再試"), 500

    if notify_n8n(order):  # 通知失敗不影響訂單，後台會顯示「通知未送出」
        c = conn()
        with c.cursor() as cur:
            cur.execute("UPDATE orders SET n8n_sent=1 WHERE order_id=%s", (order["order_id"],))
        c.commit()
        c.close()

    return jsonify(order_id=order["order_id"], total=total)


# ---------- 店家後台 ----------
def admin_only(f):
    @wraps(f)
    def wrapper(*a, **k):
        if not ADMIN_PASSWORD:
            return Response("請先在 .env 設定 ADMIN_PASSWORD", 503)
        auth = request.authorization
        ok = auth and secrets.compare_digest((auth.password or "").encode(), ADMIN_PASSWORD.encode())
        if not ok:
            return Response("需要登入", 401, {"WWW-Authenticate": 'Basic realm="admin"'})
        return f(*a, **k)
    return wrapper


@app.get("/admin")
@admin_only
def admin():
    return render_template("admin.html")


@app.get("/api/admin/orders")
@admin_only
def admin_orders():
    status = request.args.get("status")
    c = conn()
    try:
        with c.cursor() as cur:
            if status in STATUSES:
                cur.execute("SELECT * FROM orders WHERE status=%s ORDER BY id DESC LIMIT 100", (status,))
            else:
                cur.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 100")
            orders = cur.fetchall()
            if orders:
                ids = [o["order_id"] for o in orders]
                cur.execute("SELECT * FROM order_items WHERE order_id IN (%s)"
                            % ",".join(["%s"] * len(ids)), ids)
                by = {}
                for it in cur.fetchall():
                    by.setdefault(it["order_id"], []).append(it)
                for o in orders:
                    o["items"] = by.get(o["order_id"], [])
                    o["created_at"] = o["created_at"].strftime("%m/%d %H:%M")
    finally:
        c.close()
    return jsonify(orders)


@app.post("/api/admin/orders/<order_id>/status")
@admin_only
def admin_set_status(order_id):
    status = (request.get_json(silent=True) or {}).get("status")
    if status not in STATUSES:
        return jsonify(error="狀態不正確"), 400
    c = conn()
    with c.cursor() as cur:
        cur.execute("UPDATE orders SET status=%s WHERE order_id=%s", (status, order_id))
    c.commit()
    c.close()
    return jsonify(ok=True)


def start_db(retries=10):
    for _ in range(retries):
        try:
            init_db()
            return
        except pymysql.err.OperationalError as e:
            if e.args[0] in (2003, 2006, 2013):  # 資料庫還沒啟動好，等一下再試
                app.logger.warning("MySQL 尚未就緒，3 秒後重試")
                time.sleep(3)
                continue
            sys.exit(f"無法連線 MySQL：{e}\n請確認帳號密碼正確（本機看 .env，雲端看環境變數）。")
    sys.exit("無法連線 MySQL，請確認資料庫服務已啟動。")


start_db()

if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1", port=int(os.environ.get("PORT", 5000)))
