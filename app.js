
(() => {
  const STORAGE_KEY = "masa_salon_intelligence_prod_v1";
  const CURRENT_DATA_VERSION = 3;
  const { itemsForEntry, validMenuItems } = MasaVisitData;
  const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
  const MENU_CATEGORIES = ["カット", "カラー", "パーマ", "縮毛矯正", "トリートメント", "ヘッドスパ", "セット・その他"];
  // Keep existing group order independent of the editable category suggestions.
  const MENU_CATEGORY_ORDER = ["カット", "カラー", "パーマ", "トリートメント", "ヘアリセッター", "その他"];
  const $ = (id) => document.getElementById(id);

  const DEFAULT_STATE = {
    version: 2,
    staff: [
      { id: "masa", name: "マサ" },
      { id: "staff_a", name: "スタッフA" },
      { id: "staff_b", name: "スタッフB" }
    ],
    menus: [
      { id: "existing_cut", name: "既存カット", price: 7150, minutes: 60 },
      { id: "new_cut", name: "新規カット", price: 7700, minutes: 60 },
      { id: "existing_color", name: "既存カラー", price: 8250, minutes: 90 },
      { id: "new_color", name: "新規カラー", price: 8800, minutes: 90 }
    ],
    days: {}
  };

  let saveBlockedReason = "";
  let state = loadState();
  let editingEntryId = null;
  let menuDrafts = [];

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      const version = parsed?.version;
      if (version !== undefined && version !== 1 && version !== 2 && version !== CURRENT_DATA_VERSION) {
        saveBlockedReason = Number.isFinite(version) && version > CURRENT_DATA_VERSION
          ? `このデータは新しいversion ${version}です。対応版で開いてください。`
          : "対応していないデータversionです。";
      }
      if (saveBlockedReason) return structuredClone(DEFAULT_STATE);
      validateBackup(parsed);
      return parsed;
    } catch {
      saveBlockedReason = "保存データのJSONまたは構造を確認できません。元データ保護のため保存を停止しています。";
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }

  function saveState() {
    const version = state?.version;
    const unsupportedVersion = version !== undefined && version !== 1 && version !== 2 && version !== CURRENT_DATA_VERSION;
    if (saveBlockedReason || unsupportedVersion) {
      alert(saveBlockedReason || "対応していないデータversionのため保存できません。");
      return false;
    }
    const hasItems = Object.values(state.days).some(day => day.entries.some(entry => has(entry, "menuItems")));
    const next = { ...state, version: state.version === 3 || hasItems ? 3 : 2 };
    validateBackup(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    state = next;
    return true;
  }

  function todayLocal() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function timeToMin(t) {
    if (!t) return 0;
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }

  function isValidArrival(arrival) {
    return /^(?:[01]\d|2[0-3]):(?:00|30)$/.test(arrival);
  }

  function minToTime(n) {
    n = ((n % 1440) + 1440) % 1440;
    return `${String(Math.floor(n / 60)).padStart(2,"0")}:${String(n % 60).padStart(2,"0")}`;
  }

  function yen(n) {
    return "¥" + Math.round(Number(n) || 0).toLocaleString("ja-JP");
  }

  function currentDay() {
    const key = $("workDate").value;
    if (!state.days[key]) {
      state.days[key] = {
        retailSales: 0,
        work: state.staff.map(s => ({ id: s.id, on: true, start: "11:00", end: "20:00" })),
        entries: []
      };
    }
    const d = state.days[key];
    for (const s of state.staff) {
      if (!d.work.some(w => w.id === s.id)) d.work.push({ id: s.id, on: false, start: "11:00", end: "20:00" });
    }
    return d;
  }

  function businessStatusOf(day) {
    return day.businessStatus === "open" || day.businessStatus === "closed"
      ? day.businessStatus
      : "unset";
  }

 function activeStaffToday() {
  const d = currentDay();

  return state.staff.filter(s => {
    const work = d.work.find(w => w.id === s.id);
    return work && work.on;
  });
}

  function menuCategory(menu) {
    return typeof menu.category === "string" ? menu.category.trim() : "";
  }

  function menuGroups(menus) {
    const categories = [...new Set([...MENU_CATEGORY_ORDER, ...menus.map(menuCategory).filter(Boolean), ""])];
    return categories.map(category => ({ category, menus: menus.filter(menu => menuCategory(menu) === category) }))
      .filter(group => group.menus.length);
  }

  function menuOptionsHtml(selectedId) {
    return menuGroups(state.menus).map(group =>
      `<optgroup label="${escapeAttr(group.category || "未分類")}">${group.menus.map(menu =>
        `<option value="${escapeAttr(menu.id)}" ${menu.id === selectedId ? "selected" : ""}>${escapeHtml(menu.name)}</option>`
      ).join("")}</optgroup>`
    ).join("");
  }

  function refreshMenuSelectors() {
    document.querySelectorAll("[data-item-menu]").forEach(select => {
      const id = select.value;
      const text = select.selectedOptions[0]?.textContent || "削除済みメニュー";
      select.innerHTML = '<option value="">選択してください</option>' +
        (id && !state.menus.some(menu => menu.id === id) ? '<option value="' + escapeAttr(id) + '" selected>' + escapeHtml(text) + '</option>' : '') + menuOptionsHtml(id);
      select.value = id;
    });
  }

 function refreshSelectors() {
    $("staffSelect").innerHTML =activeStaffToday().map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
    refreshMenuSelectors();
  }

  function renderWorkSchedule() {
    const d = currentDay();
    const statusLabels = { unset: "未設定", open: "営業", closed: "休業" };
    $("businessStatus").textContent = `営業状態：${statusLabels[businessStatusOf(d)]}`;
    $("retailSales").value = d.retailSales || 0;
    $("workSchedule").innerHTML = state.staff.map(s => {
      const w = d.work.find(x => x.id === s.id);
      return `<div class="schedule-row">
        <label><input type="checkbox" data-work-on="${s.id}" ${w.on ? "checked" : ""}> ${escapeHtml(s.name)}</label>
        <label>出勤<input type="time" data-work-start="${s.id}" value="${w.start}"></label>
        <label>退勤<input type="time" data-work-end="${s.id}" value="${w.end}"></label>
      </div>`;
    }).join("");
  }

  function saveDaySettings() {
    const d = currentDay();
    d.retailSales = Number($("retailSales").value) || 0;
    for (const w of d.work) {
      const on = document.querySelector(`[data-work-on="${w.id}"]`);
      const start = document.querySelector(`[data-work-start="${w.id}"]`);
      const end = document.querySelector(`[data-work-end="${w.id}"]`);
      if (on && start && end) {
        w.on = on.checked;
        w.start = start.value;
        w.end = end.value;
      }
    }
    d.businessStatus = "open";
    if (!saveState()) return;
    renderAll();
  }

  function closeDay() {
    const d = currentDay();
    d.businessStatus = "closed";
    if (!saveState()) return;
    renderAll();
  }

  let newEditor;
  const inlineEditors = new Map();

  function menuSnapshot(menu) {
    return { menuId: menu.id, menuName: menu.name, standardPriceAtVisit: menu.price,
      standardMinutesAtVisit: menu.minutes, categoryAtVisit: has(menu, "category") ? menu.category : "" };
  }

  function createItemEditor(container, initial, changed) {
    let items = initial.map(item => ({ ...item, id: item.id || uid() }));
    const originals = new Map(items.map(item => [item.id, { ...item }]));
    function totals() {
      const selected = items.filter(item => item.menuId);
      return { price: selected.reduce((sum, item) => sum + Number(item.price), 0),
        minutes: selected.length && selected.every(item => has(item, "standardMinutesAtVisit"))
          ? selected.reduce((sum, item) => sum + item.standardMinutesAtVisit, 0) : null };
    }
    function draw() {
      container.innerHTML = items.map(item => '<div class="visit-item">' +
        '<label>メニュー<select data-item-menu><option value="">選択してください</option>' +
        (item.menuId && !state.menus.some(menu => menu.id === item.menuId) ? '<option value="' + escapeAttr(item.menuId) + '" selected>' + escapeHtml(item.menuName) + '</option>' : '') + menuOptionsHtml(item.menuId) + '</select></label>' +
        '<label>実売上（税込）<input data-item-price type="number" min="0" step="1" value="' + escapeAttr(item.price ?? '') + '"></label>' +
        '<div class="hint">標準価格：' + (has(item, "standardPriceAtVisit") ? yen(item.standardPriceAtVisit) : '不明') + ' / 標準時間：' + (has(item, "standardMinutesAtVisit") ? item.standardMinutesAtVisit + '分' : '不明') + ' / ' + escapeHtml(has(item, "categoryAtVisit") ? item.categoryAtVisit || '未分類' : 'カテゴリー不明') + '</div>' +
        '<button class="secondary" data-item-remove ' + (items.length === 1 ? 'disabled' : '') + '>メニュー削除</button></div>').join('');
      [...container.children].forEach((row, index) => {
        const item = items[index];
        row.querySelector('[data-item-menu]').value = item.menuId || '';
        row.querySelector('[data-item-menu]').addEventListener('change', event => {
          const menu = state.menus.find(menu => menu.id === event.target.value);
          const original = originals.get(item.id);
          items[index] = original && original.menuId === event.target.value ? { ...original } :
            menu ? { ...item, ...menuSnapshot(menu), price: menu.price } : { id: item.id, menuId: '', price: '' };
          draw(); changed(totals(), true);
        });
        row.querySelector('[data-item-price]').addEventListener('input', event => { item.price = event.target.value; changed(totals(), false); });
        row.querySelector('[data-item-remove]').addEventListener('click', () => { items.splice(index, 1); draw(); changed(totals(), true); });
      });
    }
    draw();
    return { add() { items.push({ id: uid(), menuId: '', price: '' }); draw(); changed(totals(), true); },
      read() {
        if (items.some(item => !item.menuId || item.price === '' || !Number.isFinite(Number(item.price)) || Number(item.price) < 0)) return null;
        return items.map(item => ({ ...item, price: Number(item.price) }));
      }, totals };
  }

  let stayManuallyEdited = false;
  function clearEntryForm() {
    stayManuallyEdited = false;
    $("stayMinutes").value = '';
    $("endTime").value = '';
    newEditor = createItemEditor($("visitMenuItems"), [{ menuId: '', price: '' }], (totals, menuChanged) => {
      $("visitTotal").textContent = yen(totals.price);
      $("standardMinutesTotal").textContent = '標準時間合計：' + (totals.minutes === null ? '不明' : totals.minutes + '分');
      if (menuChanged && !stayManuallyEdited) $("stayMinutes").value = totals.minutes ?? '';
      previewEnd();
    });
    $("visitTotal").textContent = yen(0);
    $("standardMinutesTotal").textContent = '標準時間合計：—';
  }
  function previewEnd() {
    const a = $("arrivalTime").value, mins = Number($("stayMinutes").value);
    $("endTime").value = a && mins > 0 ? minToTime(timeToMin(a) + mins) : '';
  }
  function addEntry() {
    if (businessStatusOf(currentDay()) === 'closed') { alert('休業日には来店実績を登録できません。先に営業設定を保存してください。'); return; }
    const staff = state.staff.find(s => s.id === $("staffSelect").value);
    const menuItems = newEditor.read(), minutes = Number($("stayMinutes").value), arrival = $("arrivalTime").value;
    if (!staff || !menuItems || !isValidArrival(arrival) || !Number.isFinite(minutes) || minutes <= 0) { alert('担当者・来店時間・メニュー・実売上・滞在時間を確認してください。'); return; }
    const day = currentDay();
    day.entries.push({ id: uid(), staffId: staff.id, staffNameAtVisit: staff.name, arrival, minutes,
      price: menuItems.reduce((sum, item) => sum + item.price, 0), menuItems });
    try { if (!saveState()) { day.entries.pop(); return; } } catch { day.entries.pop(); alert('保存できませんでした。'); return; }
    clearEntryForm(); renderAll();
  }
  function editEntry(id) {
    const row = [...document.querySelectorAll('[data-edit]')].find(button => button.dataset.edit === id)?.closest('tr');
    const entry = currentDay().entries.find(entry => entry.id === id);
    if (!row || !entry) return;
    row.dataset.inlineId = id;
    const staffOptions = (state.staff.some(staff => staff.id === entry.staffId) ? '' : '<option value="' + escapeAttr(entry.staffId) + '">' + escapeHtml(entry.staffNameAtVisit ?? '—') + '</option>') + state.staff.map(staff => '<option value="' + escapeAttr(staff.id) + '">' + escapeHtml(staff.name) + '</option>').join('');
    row.innerHTML = '<td colspan="6" class="visit-edit"><div class="grid two"><label>担当者<select data-inline-staff>' + staffOptions + '</select></label><label>来店時間<input data-inline-arrival type="time" step="1800" value="' + escapeAttr(entry.arrival) + '"></label></div><div data-inline-items></div><button class="secondary" data-inline-add>メニュー追加</button><p data-inline-total></p><p class="hint" data-inline-standard></p><label>滞在時間（分）<input data-inline-minutes type="number" min="1" step="1" value="' + entry.minutes + '"></label><p data-inline-end></p><div class="actions"><button data-inline-save>保存</button><button class="secondary" data-inline-cancel>キャンセル</button></div></td>';
    row.querySelector('[data-inline-staff]').value = entry.staffId;
    const arrival = row.querySelector('[data-inline-arrival]'), minutes = row.querySelector('[data-inline-minutes]');
    const end = () => { row.querySelector('[data-inline-end]').textContent = '終了予定：' + minToTime(timeToMin(arrival.value) + Number(minutes.value)); };
    arrival.addEventListener('input', end); minutes.addEventListener('input', end); end();
    const show = totals => {
      row.querySelector('[data-inline-total]').textContent = '合計売上：' + yen(totals.price);
      row.querySelector('[data-inline-standard]').textContent = '標準時間合計：' + (totals.minutes === null ? '不明' : totals.minutes + '分') + '（滞在時間は必要に応じて修正してください）';
    };
    const editor = createItemEditor(row.querySelector('[data-inline-items]'), itemsForEntry(entry), show);
    inlineEditors.set(id, editor); show(editor.totals());
    row.querySelector('[data-inline-add]').addEventListener('click', () => editor.add());
    row.querySelector('[data-inline-save]').addEventListener('click', () => saveInlineEntry(id));
    row.querySelector('[data-inline-cancel]').addEventListener('click', renderEntriesAndKpis);
  }
  function saveInlineEntry(id) {
    const row = [...document.querySelectorAll('[data-inline-id]')].find(row => row.dataset.inlineId === id);
    const day = currentDay(), index = day.entries.findIndex(entry => entry.id === id), entry = day.entries[index];
    const items = inlineEditors.get(id)?.read();
    if (!row || !entry) return;
    const staffId = row.querySelector('[data-inline-staff]').value, staff = state.staff.find(staff => staff.id === staffId);
    const arrival = row.querySelector('[data-inline-arrival]').value, minutes = Number(row.querySelector('[data-inline-minutes]').value);
    if (!items || !isValidArrival(arrival) || !Number.isFinite(minutes) || minutes <= 0 || (entry.staffId !== staffId && !staff)) { alert('担当者・来店時間・メニュー・実売上・滞在時間を確認してください。'); return; }
    const updated = { ...entry, staffId, arrival, minutes, price: items.reduce((sum, item) => sum + item.price, 0) };
    if (entry.staffId !== staffId) updated.staffNameAtVisit = staff.name;
    const fields = ['menuId', 'menuName', 'standardPriceAtVisit', 'standardMinutesAtVisit', 'categoryAtVisit'];
    if (has(entry, 'menuItems') || items.length > 1) {
      updated.menuItems = items;
      for (const field of fields) delete updated[field];
    } else {
      for (const field of fields) { if (has(items[0], field)) updated[field] = items[0][field]; }
    }
    day.entries[index] = updated;
    try { if (!saveState()) { day.entries[index] = entry; return; } } catch { day.entries[index] = entry; alert('保存できませんでした。'); return; }
    renderEntriesAndKpis();
  }
  function cancelEdit() { clearEntryForm(); }
  function updateEditUi() { $("editNotice").hidden = true; $("cancelEditBtn").hidden = true; }

  function removeEntry(id) {
    if (!confirm("この入力を削除しますか？")) return;
    const d = currentDay();
    d.entries = d.entries.filter(e => e.id !== id);
    if (editingEntryId === id) editingEntryId = null;
    if (!saveState()) return;
    updateEditUi();
    renderAll();
  }

  function calculateUtilization(entries, work) {
    const active = work.filter(w => w.on && timeToMin(w.end) > timeToMin(w.start));
    const capacity = active.reduce((sum, w) => sum + (timeToMin(w.end) - timeToMin(w.start)), 0);
    if (!capacity || !active.length) return { occupied: 0, capacity: 0, rate: 0 };

    const lo = Math.min(...active.map(w => timeToMin(w.start)));
    const hi = Math.max(...active.map(w => timeToMin(w.end)));
    let occupied = 0;

    for (let minute = lo; minute < hi; minute++) {
      const availableStaff = active.filter(w => minute >= timeToMin(w.start) && minute < timeToMin(w.end)).length;
      const customers = entries.filter(e => minute >= timeToMin(e.arrival) && minute < timeToMin(e.arrival) + Number(e.minutes)).length;
      occupied += Math.min(availableStaff, customers);
    }
    return { occupied, capacity, rate: occupied / capacity * 100 };
  }

  function renderEntriesAndKpis() {
    inlineEditors.clear();
    const d = currentDay();
    const entries = [...d.entries].sort((a,b) => timeToMin(a.arrival) - timeToMin(b.arrival));
    $("entryRows").innerHTML = entries.map(e => {
      const staffName = Object.prototype.hasOwnProperty.call(e, "staffNameAtVisit")
        ? e.staffNameAtVisit
        : state.staff.find(s => s.id === e.staffId)?.name || "—";
      return `<tr>
        <td>${e.arrival}〜${minToTime(timeToMin(e.arrival)+Number(e.minutes))}</td>
        <td>${escapeHtml(staffName)}</td>
        <td>${itemsForEntry(e).map(item => `${escapeHtml(item.menuName)}<div class="hint">標準価格：${has(item, "standardPriceAtVisit") ? yen(item.standardPriceAtVisit) : "不明"} / 実売上：${yen(item.price)}</div>`).join("")}</td>
        <td>${e.minutes}分</td>
        <td>${yen(e.price)}</td>

        <td><div class="row-actions"><button class="secondary" data-edit="${e.id}">修正</button><button class="secondary danger-text" data-delete="${e.id}">削除</button></div></td>
      </tr>`;
    }).join("");

    document.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => editEntry(btn.dataset.edit)));
    document.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => removeEntry(btn.dataset.delete)));

    const sales = entries.reduce((sum,e) => sum + Number(e.price || 0), 0);
    const totalMinutes = entries.reduce((sum,e) => sum + Number(e.minutes || 0), 0);
    const util = calculateUtilization(entries, d.work);

    $("kpiSales").textContent = yen(sales);
    $("kpiGuests").textContent = entries.length;
    $("kpiAvg").textContent = yen(entries.length ? sales / entries.length : 0);
    $("kpiUtil").textContent = util.rate.toFixed(1) + "%";
    $("kpiHourly").textContent = yen(totalMinutes ? sales / (totalMinutes / 60) : 0);
    $("kpiRetail").textContent = yen(d.retailSales || 0);
    $("kpiTotalSales").textContent = yen(sales + (Number(d.retailSales) || 0));
    $("utilFormula").textContent = `有効顧客滞在 ${(util.occupied/60).toFixed(2)}人時 ÷ 実勤務 ${(util.capacity/60).toFixed(2)}人時`;
  }

  function renderMasters() {
    $("staffMaster").innerHTML = state.staff.map((s,i) => `<div class="master-row">
      <label>スタッフ名<input data-staff-name="${i}" value="${escapeAttr(s.name)}"></label><span></span><span></span>
      <button class="secondary" data-staff-remove="${i}">削除</button></div>`).join("");

    menuDrafts = state.menus.map(menu => ({ ...menu }));
    renderMenuMaster();

    document.querySelectorAll("[data-staff-remove]").forEach(btn => btn.addEventListener("click", () => {
      if (confirm("このスタッフをマスターから削除しますか？ 過去実績は残ります。")) { state.staff.splice(Number(btn.dataset.staffRemove), 1); renderMasters(); }
    }));
  }

  function renderMenuMaster() {
    $("menuMaster").innerHTML = `<datalist id="menuCategoryChoices">${MENU_CATEGORIES.map(category =>
      `<option value="${escapeAttr(category)}"></option>`).join("")}</datalist>` +
      menuGroups(menuDrafts).map(group => `<section class="menu-group"><h3>${escapeHtml(group.category || "未分類")}</h3>${group.menus.map((menu, index) =>
        `<div class="menu-master-row" data-menu-row="${escapeAttr(menu.id)}">
          <label>メニュー名<input data-menu-field="name" value="${escapeAttr(menu.name)}"></label>
          <label>税込価格<input type="number" data-menu-field="price" value="${escapeAttr(menu.price)}"></label>
          <label>標準時間<input type="number" data-menu-field="minutes" value="${escapeAttr(menu.minutes)}"></label>
          <label>カテゴリー<input data-menu-field="category" list="menuCategoryChoices" placeholder="未分類" value="${escapeAttr(menuCategory(menu))}"></label>
          <div class="menu-actions">
            <button class="secondary" data-menu-move="-1" aria-label="上へ移動" ${index === 0 ? "disabled" : ""}>↑</button>
            <button class="secondary" data-menu-move="1" aria-label="下へ移動" ${index === group.menus.length - 1 ? "disabled" : ""}>↓</button>
            <button class="secondary danger-text" data-menu-remove>削除</button>
          </div>
        </div>`).join("")}</section>`).join("");
    $("menuMaster").querySelectorAll("[data-menu-row]").forEach(row => {
      const menu = menuDrafts.find(item => item.id === row.dataset.menuRow);
      row.querySelectorAll("[data-menu-field]").forEach(input => {
        input.addEventListener("input", () => {
          const field = input.dataset.menuField;
          if (field === "category") {
            const category = input.value.trim();
            if (category) menu.category = category;
            else delete menu.category;
            updateMenuMoveButtons();
          } else menu[field] = input.value;
        });
      });
      row.querySelectorAll("[data-menu-move]").forEach(button => button.addEventListener("click", () => {
        // Resolve neighbours from the current draft, including any category edits.
        const peers = menuDrafts.filter(item => menuCategory(item) === menuCategory(menu));
        const neighbour = peers[peers.indexOf(menu) + Number(button.dataset.menuMove)];
        if (neighbour) {
          const from = menuDrafts.indexOf(menu), to = menuDrafts.indexOf(neighbour);
          [menuDrafts[from], menuDrafts[to]] = [menuDrafts[to], menuDrafts[from]];
        }
        renderMenuMaster();
      }));
      row.querySelector("[data-menu-remove]").addEventListener("click", () => {
        if (!confirm("このメニューをマスターから削除しますか？ 過去実績は残ります。")) return;
        menuDrafts = menuDrafts.filter(item => item !== menu);
        renderMenuMaster();
      });
    });
  }

  function updateMenuMoveButtons() {
    $("menuMaster").querySelectorAll("[data-menu-row]").forEach(row => {
      const menu = menuDrafts.find(item => item.id === row.dataset.menuRow);
      const peers = menuDrafts.filter(item => menuCategory(item) === menuCategory(menu));
      row.querySelectorAll("[data-menu-move]").forEach(button => {
        button.disabled = !peers[peers.indexOf(menu) + Number(button.dataset.menuMove)];
      });
    });
  }

  function saveMasters() {
    document.querySelectorAll("[data-staff-name]").forEach(el => state.staff[Number(el.dataset.staffName)].name = el.value.trim() || "スタッフ");
    state.menus = menuDrafts.map(menu => ({ ...menu, name: menu.name.trim() || "メニュー",
      price: Number(menu.price) || 0, minutes: Number(menu.minutes) || 0 }));
    if (!saveState()) return;
    refreshSelectors();
    renderWorkSchedule();
    renderMasters();
    if (!document.querySelector("[data-inline-id]")) renderEntriesAndKpis();
    alert("管理設定を保存しました。");
  }

  function addStaff() {
    state.staff.push({ id: "staff_" + Date.now(), name: "新しいスタッフ" });
    renderMasters();
  }

  function addMenu() {
    menuDrafts.push({ id: "menu_" + Date.now(), name: "新しいメニュー", price: 0, minutes: 60 });
    renderMenuMaster();
  }

  function backupJson() {
    return JSON.stringify(state, null, 2);
  }

  function downloadBackup() {
    const blob = new Blob([backupJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `MASA_Salon_Backup_${$("workDate").value}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function restoreFromFile(file) {
    try {
      const parsed = JSON.parse(await file.text());
      validateBackup(parsed);
      if (!saveRestoredBackup(parsed)) return;
      clearEntryForm();
      renderAll();
      alert("バックアップを復元しました。");
    } catch {
      alert("MASAシステムのバックアップとして読み込めませんでした。");
    }
  }

  function validateBackup(x) {
    const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
    const hasStrings = (value, fields) => fields.every(field => typeof value[field] === "string");
    const hasNumbers = (value, fields) => fields.every(field => Number.isFinite(value[field]));
    const has = (value, field) => Object.prototype.hasOwnProperty.call(value, field);
    if (!isRecord(x) || !Array.isArray(x.staff) || !Array.isArray(x.menus) || !isRecord(x.days)) throw new Error("invalid");
    if (x.version !== undefined && x.version !== 1 && x.version !== 2 && x.version !== CURRENT_DATA_VERSION) throw new Error("unsupported version");
    if (!x.staff.every(s => isRecord(s) && hasStrings(s, ["id", "name"]))) throw new Error("invalid staff");
    if (!x.menus.every(m => isRecord(m) && hasStrings(m, ["id", "name"]) && hasNumbers(m, ["price", "minutes"]))) throw new Error("invalid menus");
    if (!x.menus.every(m => !has(m, "category") || typeof m.category === "string")) throw new Error("invalid category");
    for (const day of Object.values(x.days)) {
      if (!isRecord(day) || !Array.isArray(day.work) || !Array.isArray(day.entries)) throw new Error("invalid day");
      if (has(day, "retailSales") && !Number.isFinite(day.retailSales)) throw new Error("invalid retail sales");
      if (has(day, "businessStatus") && !["open", "closed", "unset"].includes(day.businessStatus)) throw new Error("invalid business status");
      if (!day.work.every(w => isRecord(w) && hasStrings(w, ["id", "start", "end"]) && typeof w.on === "boolean")) throw new Error("invalid work");
      if (!day.entries.every(e => isRecord(e)
        && hasStrings(e, ["id", "staffId", "arrival"])
        && (has(e, "menuItems") ? x.version === 3 && validMenuItems(e) : hasStrings(e, ["menuId", "menuName"]))
        && hasNumbers(e, ["price", "minutes"])
        && (!has(e, "standardPriceAtVisit") || Number.isFinite(e.standardPriceAtVisit))
        && (!has(e, "standardMinutesAtVisit") || (Number.isFinite(e.standardMinutesAtVisit) && e.standardMinutesAtVisit >= 0))
        && (!has(e, "categoryAtVisit") || typeof e.categoryAtVisit === "string")
        && (!has(e, "staffNameAtVisit") || typeof e.staffNameAtVisit === "string"))) throw new Error("invalid entries");
    }
  }

  function saveRestoredBackup(parsed) {
    const previousState = state;
    state = parsed;
    try {
      if (saveState()) return true;
    } catch (error) {
      state = previousState;
      throw error;
    }
    state = previousState;
    return false;
  }

  function restoreFromText() {
    try {
      const parsed = JSON.parse($("backupText").value.trim());
      validateBackup(parsed);
      if (!confirm("現在のデータを貼り付けたバックアップで置き換えますか？")) return;
      if (!saveRestoredBackup(parsed)) return;
      clearEntryForm();
      renderAll();
      alert("復元しました。");
    } catch {
      alert("バックアップ文字列を確認できません。");
    }
  }

  async function copyBackup() {
    $("backupText").value = backupJson();
    try {
      await navigator.clipboard.writeText($("backupText").value);
      alert("コピーしました。");
    } catch {
      $("backupText").focus();
      $("backupText").select();
      alert("自動コピーできない場合は長押ししてコピーしてください。");
    }
  }

  function renderAll() {
    refreshSelectors();
    renderWorkSchedule();
    renderMasters();
    renderEntriesAndKpis();
    updateEditUi();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  $("workDate").value = todayLocal();
  $("workDate").addEventListener("change", () => { editingEntryId = null; clearEntryForm(); renderAll(); });
  $("saveDayBtn").addEventListener("click", saveDaySettings);
  $("closeDayBtn").addEventListener("click", closeDay);
  $("addVisitMenuBtn").addEventListener("click", () => newEditor.add());
  $("arrivalTime").addEventListener("input", previewEnd);
  $("stayMinutes").addEventListener("input", () => { stayManuallyEdited = true; previewEnd(); });
  $("addEntryBtn").addEventListener("click", addEntry);
  $("clearEntryBtn").addEventListener("click", () => { editingEntryId = null; clearEntryForm(); updateEditUi(); });
  $("cancelEditBtn").addEventListener("click", cancelEdit);
  $("addStaffBtn").addEventListener("click", addStaff);
  $("addMenuBtn").addEventListener("click", addMenu);
  $("saveMasterBtn").addEventListener("click", saveMasters);
  $("downloadBackupBtn").addEventListener("click", downloadBackup);
  $("restoreFile").addEventListener("change", (e) => e.target.files[0] && restoreFromFile(e.target.files[0]));
  $("showBackupBtn").addEventListener("click", () => $("backupText").value = backupJson());
  $("copyBackupBtn").addEventListener("click", copyBackup);
  $("restoreTextBtn").addEventListener("click", restoreFromText);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  }
  clearEntryForm();
  renderAll();
})();
