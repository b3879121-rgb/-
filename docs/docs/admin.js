(() => {
  const LABEL = { new: "新訂單", preparing: "製作中", done: "已完成", cancelled: "已取消" };
  let status = "";
  // 客人輸入的文字一律先跳脫，避免被當成 HTML 執行
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function load() {
    const meta = document.getElementById("meta");
    try {
      const res = await fetch("/api/admin/orders?status=" + status);
      if (!res.ok) throw new Error();
      const orders = await res.json();
      meta.textContent = `共 ${orders.length} 筆（每 30 秒自動更新）`;
      document.getElementById("orders").innerHTML = orders.map(card).join("") || "<p>目前沒有訂單。</p>";
    } catch {
      meta.textContent = "載入失敗，請確認資料庫已啟動。";
    }
  }

  function card(o) {
    const items = o.items.map((i) => `<li>${esc(i.item_name)} × ${i.qty}（$${i.subtotal}）</li>`).join("");
    const where = o.fulfillment === "delivery" ? "外送：" + esc(o.address) : "到店自取";
    const opts = Object.entries(LABEL).map(([k, v]) => `<option value="${k}"${k === o.status ? " selected" : ""}>${v}</option>`).join("");
    return `
      <article class="order ${o.status === "new" ? "is-new" : ""}">
        <header>
          <span class="oid">${esc(o.order_id)}</span>
          <span>${esc(o.created_at)}</span>
        </header>
        <div><strong>${esc(o.customer_name)}</strong>　${esc(o.phone)}</div>
        <div class="info">${where}</div>
        <ul>${items}</ul>
        ${o.note ? `<div class="info">備註：${esc(o.note)}</div>` : ""}
        <div class="foot">
          <span class="sum">$${o.total}</span>
          ${o.n8n_sent ? "" : '<span class="badge">n8n 通知未送出</span>'}
          <select data-id="${esc(o.order_id)}" aria-label="訂單狀態">${opts}</select>
        </div>
      </article>`;
  }

  document.getElementById("orders").addEventListener("change", async (e) => {
    const sel = e.target.closest("select[data-id]");
    if (!sel) return;
    await fetch(`/api/admin/orders/${encodeURIComponent(sel.dataset.id)}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: sel.value }),
    });
    load();
  });

  document.getElementById("filters").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-s]");
    if (!b) return;
    status = b.dataset.s;
    document.querySelectorAll("#filters button").forEach((x) => x.classList.toggle("on", x === b));
    load();
  });

  load();
  setInterval(load, 30000);
})();
