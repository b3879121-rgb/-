const MENU = [
  { id: "lurou", cat: "主食", name: "滷肉飯", price: 55, note: "古早味肉燥，淋在白飯上", img: "https://images.unsplash.com/photo-1679279726946-a158b8bcaa23?auto=format&fit=crop&w=240&h=240&q=75" },
  { id: "jitui", cat: "主食", name: "雞腿便當", price: 110, note: "附三樣配菜", img: "https://images.unsplash.com/photo-1786201188628-db52cdadb037?auto=format&fit=crop&w=240&h=240&q=75" },
  { id: "paigu", cat: "主食", name: "排骨便當", price: 100, note: "附三樣配菜", img: "https://images.unsplash.com/photo-1568717099337-5aaecc090548?auto=format&fit=crop&w=240&h=240&q=75" },
  { id: "qingcai", cat: "配菜與湯", name: "燙青菜", price: 40, note: "當日時蔬", img: "https://images.unsplash.com/photo-1771573042838-8b3adf17562e?auto=format&fit=crop&w=240&h=240&q=75" },
  { id: "ludan", cat: "配菜與湯", name: "滷蛋", price: 15, note: "每日現滷", img: "https://images.unsplash.com/photo-1587217518657-fa94faff4e7e?auto=format&fit=crop&w=240&h=240&q=75" },
  { id: "gongwan", cat: "配菜與湯", name: "貢丸湯", price: 40, note: "手打貢丸", img: "https://images.unsplash.com/photo-1706740006781-3ca0149307e5?auto=format&fit=crop&w=240&h=240&q=75" },
  { id: "zhenzhu", cat: "飲料", name: "珍珠奶茶", price: 55, note: "可選大杯", img: "https://images.unsplash.com/photo-1734770580735-796a00e42cb2?auto=format&fit=crop&w=240&h=240&q=75" },
  { id: "lvcha", cat: "飲料", name: "無糖綠茶", price: 30, note: "冷飲", img: "https://images.unsplash.com/photo-1637273484093-3e205aed2c59?auto=format&fit=crop&w=240&h=240&q=75" }
];

const DEMO_KEY = "maple_demo_orders";
const demoRead = () => { try { return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]"); } catch { return []; } };
const demoWrite = (a) => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(a.slice(0, 200))); } catch {} };

// 展示版：驗證規則與後端相同，訂單存在瀏覽器 localStorage
function saveLocal(b) {
  const name = (b.name || "").trim();
  const phone = (b.phone || "").replace(/[\s-]/g, "");
  if (!name) throw new Error("請填寫姓名");
  if (!/^\d{8,12}$/.test(phone)) throw new Error("電話格式不正確，請輸入 8–12 位數字");
  if (b.fulfillment === "delivery" && !(b.address || "").trim()) throw new Error("外送請填寫地址");
  if (!["cash", "card"].includes(b.payment)) throw new Error("請選擇付款方式");
  const lines = b.items.map((i) => {
    const m = MENU.find((x) => x.id === i.id);
    return { item_id: m.id, item_name: m.name, qty: i.qty, subtotal: m.price * i.qty };
  });
  const total = lines.reduce((s, l) => s + l.subtotal, 0);
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  const order = {
    order_id: "A" + Math.random().toString(16).slice(2, 8).toUpperCase(),
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    created_at: `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`,
    customer_name: name, phone, fulfillment: b.fulfillment, payment: b.payment,
    address: b.fulfillment === "delivery" ? b.address.trim() : "",
    note: (b.note || "").trim(), total, status: "new", n8n_sent: 1, items: lines,
  };
  const all = demoRead();
  all.unshift(order);
  demoWrite(all);
  return { order_id: order.order_id, total };
}

(() => {
  const $ = (id) => document.getElementById(id);
  const money = (n) => "$" + n.toLocaleString("zh-TW");
  const PAY = { cash: "現金", card: "刷卡" };
  const FUL = { pickup: "到店自取", delivery: "外送" };
  const store = {
    get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  let menu = [];
  let pending = null;   // 等待客人確認的訂單
  const qty = {};

  async function loadMenu() {
    menu = MENU;
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

  function validate(b) {
    if (!b.items.length) return "請至少選一樣餐點";
    if (!b.name.trim()) return "請填寫姓名";
    if (!/^\d{8,12}$/.test(b.phone.replace(/[\s-]/g, ""))) return "電話格式不正確，請輸入 8–12 位數字";
    if (b.fulfillment === "delivery" && !b.address.trim()) return "外送請填寫地址";
    return "";
  }

  function row(dl, k, v) {
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = v;
    dl.append(dt, dd);
  }

  // 第一步：整理訂單，跳出確認視窗（客人輸入的文字一律用 textContent 顯示）
  function openConfirm() {
    const b = pending;
    const ul = $("c-lines");
    ul.textContent = "";
    let total = 0;
    for (const i of b.items) {
      const m = menu.find((x) => x.id === i.id);
      const li = document.createElement("li");
      const l = document.createElement("span"); l.textContent = `${m.name} × ${i.qty}`;
      const r = document.createElement("span"); r.textContent = money(m.price * i.qty);
      li.append(l, r); ul.append(li);
      total += m.price * i.qty;
    }
    $("c-total").textContent = money(total);
    const dl = $("c-info");
    dl.textContent = "";
    row(dl, "姓名", b.name.trim());
    row(dl, "電話", b.phone);
    row(dl, "取餐方式", FUL[b.fulfillment] + (b.fulfillment === "delivery" ? "：" + b.address.trim() : ""));
    row(dl, "付款方式", PAY[b.payment] + (b.payment === "card" ? "（取餐／送達時刷卡）" : "（取餐／送達時付現）"));
    if (b.note.trim()) row(dl, "備註", b.note.trim());
    $("c-msg").textContent = "";
    $("c-ok").disabled = false;
    $("confirm").showModal();
  }

  $("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData($("form"));
    const s = (k) => String(f.get(k) || "");
    pending = {
      name: s("name"), phone: s("phone"), note: s("note"), fulfillment: s("fulfillment"),
      payment: s("payment"), address: s("address"),
      items: Object.entries(qty).filter(([, q]) => q > 0).map(([id, q]) => ({ id, qty: q })),
    };
    const err = validate(pending);
    if (err) return say(err, true);
    say("");
    openConfirm();
  });

  $("c-back").addEventListener("click", () => $("confirm").close());

  // 第二步：客人按「確認送出」才真的送出
  $("c-ok").addEventListener("click", async () => {
    const body = pending;
    $("c-ok").disabled = true;
    $("c-msg").textContent = "送出中…";
    try {
      const data = saveLocal(body);
      store.set("maple_name", body.name);
      store.set("maple_phone", body.phone);
      $("done-id").textContent = data.order_id;
      $("done-total").textContent = data.total;
      $("done-pay").textContent = body.payment === "card"
        ? "付款方式：刷卡，請於取餐或送達時由店家刷卡。" : "付款方式：現金，請於取餐或送達時付款。";
      $("confirm").close();
      $("order-view").hidden = true;
      $("done-view").hidden = false;
      $("slip").scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      $("c-msg").textContent = err.message;
      $("c-ok").disabled = false;
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
