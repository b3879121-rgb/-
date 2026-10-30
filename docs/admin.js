// 展示版：資料存在瀏覽器 localStorage，匯出為 CSV
const DEMO_KEY = "maple_demo_orders";
const demoRead = () => { try { return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]"); } catch { return []; } };
const demoWrite = (a) => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(a)); } catch {} };
const ST = { new: "新訂單", preparing: "製作中", done: "已完成", cancelled: "已取消" };
const PY = { cash: "現金", card: "刷卡" };
const guard = (v) => (typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? "'" + v : v);
const csvCell = (v) => '"' + String(guard(v) ?? "").replace(/"/g, '""') + '"';
const api = {
  exportLabel: "匯出 CSV",
  async orders(status, date) {
    const all = demoRead();
    if (status === "active") return all.filter((o) => o.status === "new" || o.status === "preparing").reverse();
    return all.filter((o) => o.status === status && o.date === date);
  },
  async setStatus(id, status) {
    const all = demoRead();
    const o = all.find((x) => x.order_id === id);
    if (o) o.status = status;
    demoWrite(all);
  },
  async summary(date) {
    const all = demoRead();
    const done = all.filter((o) => o.status === "done" && o.date === date);
    const sum = (arr) => arr.reduce((s, o) => s + o.total, 0);
    const by = {};
    for (const o of done) for (const i of o.items) {
      by[i.item_name] = by[i.item_name] || { name: i.item_name, qty: 0, amount: 0 };
      by[i.item_name].qty += i.qty; by[i.item_name].amount += i.subtotal;
    }
    return {
      date, done: done.length, revenue: sum(done),
      cash: sum(done.filter((o) => o.payment === "cash")), card: sum(done.filter((o) => o.payment === "card")),
      cancelled: all.filter((o) => o.status === "cancelled" && o.date === date).length,
      pending: all.filter((o) => o.status === "new" || o.status === "preparing").length,
      items: Object.values(by).sort((a, b) => b.qty - a.qty),
    };
  },
  exportFile(date) {
    const rows = [["單號", "時間", "姓名", "電話", "取餐方式", "地址", "付款方式", "狀態", "餐點", "備註", "金額"]];
    for (const o of demoRead().filter((x) => x.date === date).reverse()) {
      rows.push([o.order_id, o.created_at, o.customer_name, o.phone, o.fulfillment === "delivery" ? "外送" : "到店自取",
        o.address, PY[o.payment], ST[o.status], o.items.map((i) => `${i.item_name}×${i.qty}`).join("、"), o.note, o.total]);
    }
    const csv = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `orders_${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};
// ===== UI =====
(() => {
  const $ = (id) => document.getElementById(id);
  const LABEL = { new: "新訂單", preparing: "製作中", done: "已完成", cancelled: "已取消" };
  const PAY = { cash: "現金", card: "刷卡" };
  const ACTIONS = {
    new: [["preparing", "開始製作", "go"], ["cancelled", "取消訂單", "no"]],
    preparing: [["done", "完成出單", "go"], ["cancelled", "取消訂單", "no"]],
    done: [["preparing", "還原為製作中", ""]],
    cancelled: [["new", "還原為新訂單", ""]],
  };
  const p2 = (n) => String(n).padStart(2, "0");
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
  const money = (n) => "$" + Number(n).toLocaleString("zh-TW");
  // 客人輸入的文字一律先跳脫，避免被當成 HTML 執行
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let view = "active";

  $("date").value = todayStr();
  $("export").textContent = api.exportLabel;

  function renderSummary(s) {
    const tiles = [
      ["main", money(s.revenue), "營業額"], ["", s.done, "完成單數"],
      ["", money(s.cash), "現金"], ["", money(s.card), "刷卡"],
      ["", s.cancelled, "取消單數"], ["", s.pending, "進行中"],
    ];
    $("stats").innerHTML = tiles.map(([c, v, l]) => `<div class="tile ${c}"><b>${esc(v)}</b><span>${l}</span></div>`).join("");
    $("top-items").innerHTML = s.items.length
      ? `<ul class="top">${s.items.map((i) => `<li><span>${esc(i.name)} × ${i.qty}</span><span>${money(i.amount)}</span></li>`).join("")}</ul>`
      : "";
  }

  function card(o) {
    const items = o.items.map((i) => `<li>${esc(i.item_name)} × ${i.qty}（$${i.subtotal}）</li>`).join("");
    const where = o.fulfillment === "delivery" ? "外送：" + esc(o.address) : "到店自取";
    const acts = (ACTIONS[o.status] || []).map(([to, text, cls]) =>
      `<button type="button" class="act ${cls}" data-id="${esc(o.order_id)}" data-to="${to}">${text}</button>`).join("");
    return `
      <article class="order ${o.status === "new" ? "is-new" : ""}">
        <header>
          <span class="oid">${esc(o.order_id)}</span>
          <span>${esc(o.created_at)}｜${LABEL[o.status] || ""}</span>
        </header>
        <div><strong>${esc(o.customer_name)}</strong>　${esc(o.phone)}</div>
        <div class="info">${where}</div>
        <ul>${items}</ul>
        ${o.note ? `<div class="info">備註：${esc(o.note)}</div>` : ""}
        <div class="foot">
          <span class="sum">$${o.total}</span>
          <span class="badge pay">${PAY[o.payment] || ""}</span>
          ${o.n8n_sent ? "" : '<span class="badge">n8n 通知未送出</span>'}
          <div class="acts">${acts}</div>
        </div>
      </article>`;
  }

  async function refresh() {
    const date = $("date").value || todayStr();
    try {
      const [orders, sum] = await Promise.all([api.orders(view, date), api.summary(date)]);
      renderSummary(sum);
      $("meta").textContent = view === "active"
        ? `進行中 ${orders.length} 筆（每 30 秒自動更新）`
        : `${date} ${LABEL[view]} ${orders.length} 筆`;
      $("orders").innerHTML = orders.map(card).join("") || "<p>目前沒有訂單。</p>";
    } catch {
      $("meta").textContent = "載入失敗。";
    }
  }

  function flash(text) {
    $("flash").textContent = text;
    setTimeout(() => { if ($("flash").textContent === text) $("flash").textContent = ""; }, 4000);
  }

  $("orders").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-to]");
    if (!b) return;
    const to = b.dataset.to, id = b.dataset.id;
    if (to === "cancelled" && !confirm(`確定要取消訂單 ${id} 嗎？`)) return;
    b.disabled = true;
    try {
      await api.setStatus(id, to);
      flash(to === "done" ? `訂單 ${id} 已移到「已完成」，金額已計入當日營業額。` : `訂單 ${id} 已更新為「${LABEL[to]}」。`);
    } catch {
      flash("更新失敗，請重新整理後再試。");
    }
    refresh();
  });

  $("filters").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-s]");
    if (!b) return;
    view = b.dataset.s;
    document.querySelectorAll("#filters button").forEach((x) => x.classList.toggle("on", x === b));
    refresh();
  });

  $("date").addEventListener("change", refresh);
  $("export").addEventListener("click", () => api.exportFile($("date").value || todayStr()));

  refresh();
  setInterval(refresh, 30000);
})();
