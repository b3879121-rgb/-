// ===== API LAYER =====（展示版會換成瀏覽器儲存的版本）
const api = {
  exportLabel: "匯出 Excel",
  async orders(status, date) {
    const r = await fetch(`/api/admin/orders?status=${status}&date=${date}`);
    if (!r.ok) throw new Error();
    return r.json();
  },
  async setStatus(id, status) {
    const r = await fetch(`/api/admin/orders/${encodeURIComponent(id)}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    if (!r.ok) throw new Error();
  },
  async summary(date) {
    const r = await fetch(`/api/admin/summary?date=${date}`);
    if (!r.ok) throw new Error();
    return r.json();
  },
  exportFile(date) { window.location.href = `/admin/export.xlsx?date=${date}`; },
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
      $("meta").textContent = "載入失敗，請確認資料庫已啟動。";
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
