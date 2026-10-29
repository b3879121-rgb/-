(() => {
  const $ = (id) => document.getElementById(id);
  const money = (n) => "$" + n.toLocaleString("zh-TW");
  const store = {
    get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  let menu = [];
  const qty = {};

  async function loadMenu() {
    try {
      menu = await (await fetch("/api/menu")).json();
    } catch {
      $("menu").textContent = "菜單載入失敗，請重新整理頁面。";
      return;
    }
    let html = "", cat = "";
    for (const m of menu) {
      if (m.cat !== cat) { cat = m.cat; html += `<h3 class="cat">${m.cat}</h3>`; }
      html += `
        <div class="row">
          <img src="${m.img}" alt="${m.name}" loading="lazy">
          <div class="info"><div class="name">${m.name}</div><div class="note">${m.note}</div></div>
          <div class="price">${money(m.price)}</div>
          <div class="stepper" role="group" aria-label="${m.name}數量">
            <button type="button" data-id="${m.id}" data-d="-1" aria-label="減少一份${m.name}">−</button>
            <output id="q-${m.id}">0</output>
            <button type="button" data-id="${m.id}" data-d="1" aria-label="增加一份${m.name}">+</button>
          </div>
        </div>`;
    }
    $("menu").innerHTML = html;
    render();
  }

  function render() {
    let total = 0, count = 0, html = "";
    for (const m of menu) {
      const q = qty[m.id] || 0;
      $("q-" + m.id).textContent = q;
      document.querySelector(`[data-id="${m.id}"][data-d="-1"]`).disabled = q === 0;
      document.querySelector(`[data-id="${m.id}"][data-d="1"]`).disabled = q >= 20;
      if (q) {
        total += m.price * q; count += q;
        html += `<li><span>${m.name} × ${q}</span><span>${money(m.price * q)}</span></li>`;
      }
    }
    $("lines").innerHTML = html || "<li class='empty'>還沒選餐點，從菜單加入。</li>";
    $("total").textContent = money(total);
    $("bar-sum").textContent = count ? `${count} 樣｜${money(total)}` : "尚未選餐";
  }

  $("menu").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-id]");
    if (!b) return;
    const id = b.dataset.id;
    qty[id] = Math.min(20, Math.max(0, (qty[id] || 0) + Number(b.dataset.d)));
    render();
  });

  $("bar-go").addEventListener("click", () => $("slip").scrollIntoView({ behavior: "smooth" }));

  document.querySelectorAll("[name=fulfillment]").forEach((r) =>
    r.addEventListener("change", () => { $("address-wrap").hidden = r.value !== "delivery" || !r.checked; }));

  // 記住常客的姓名與電話
  $("name").value = store.get("maple_name");
  $("phone").value = store.get("maple_phone");

  function say(text, isError) {
    $("msg").textContent = text;
    $("msg").classList.toggle("error", !!isError);
  }

  $("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const items = Object.entries(qty).filter(([, q]) => q > 0).map(([id, q]) => ({ id, qty: q }));
    if (!items.length) return say("請至少選一樣餐點", true);

    const f = new FormData($("form"));
    const body = {
      name: f.get("name"), phone: f.get("phone"), note: f.get("note"),
      fulfillment: f.get("fulfillment"), address: f.get("address"), items,
    };
    $("submit").disabled = true;
    say("送出中…");
    try {
      const res = await fetch("/api/order", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "送出失敗，請稍後再試");
      store.set("maple_name", body.name);
      store.set("maple_phone", body.phone);
      $("done-id").textContent = data.order_id;
      $("done-total").textContent = data.total;
      $("order-view").hidden = true;
      $("done-view").hidden = false;
      $("slip").scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      say(err.message, true);
    } finally {
      $("submit").disabled = false;
    }
  });

  $("again").addEventListener("click", () => {
    for (const k in qty) delete qty[k];
    $("note").value = "";
    say("");
    render();
    $("done-view").hidden = true;
    $("order-view").hidden = false;
  });

  loadMenu();
})();
