
(() => {
  const STORAGE_KEY = "masa_salon_intelligence_prod_v1";
  const CURRENT_DATA_VERSION = 2;
  const $ = (id) => document.getElementById(id);

  const DEFAULT_STATE = {
    version: CURRENT_DATA_VERSION,
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

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      const version = parsed?.version;
      if (version !== undefined && version !== 1 && version !== CURRENT_DATA_VERSION) {
        saveBlockedReason = Number.isFinite(version) && version > CURRENT_DATA_VERSION
          ? `このデータは新しいversion ${version}です。対応版で開いてください。`
          : "対応していないデータversionです。";
      }
      return parsed;
    } catch {
      saveBlockedReason = "保存データのJSONを解析できません。元データ保護のため保存を停止しています。";
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }

  function saveState() {
    const version = state?.version;
    const unsupportedVersion = version !== undefined && version !== 1 && version !== CURRENT_DATA_VERSION;
    if (saveBlockedReason || unsupportedVersion) {
      alert(saveBlockedReason || "対応していないデータversionのため保存できません。");
      return false;
    }
    state.version = CURRENT_DATA_VERSION;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

 function refreshSelectors() {
    $("staffSelect").innerHTML =activeStaffToday().map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
    $("menuSelect").innerHTML = `<option value="">選択してください</option>` +
      state.menus.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("");
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

  function menuChanged() {
    const menu = state.menus.find(m => m.id === $("menuSelect").value);
    if (!menu) {
      $("actualPrice").value = "";
      $("stayMinutes").value = "";
      $("endTime").value = "";
      $("autoFillStatus").textContent = "メニューを選ぶと標準価格と標準時間が自動入力されます。";
      return;
    }
    $("actualPrice").value = menu.price;
    $("stayMinutes").value = menu.minutes;
    previewEnd();
    $("autoFillStatus").textContent = `自動入力：${menu.name} / ${yen(menu.price)} / ${menu.minutes}分`;
  }

  function previewEnd() {
    const a = $("arrivalTime").value;
    const mins = Number($("stayMinutes").value) || 0;
    $("endTime").value = a && mins ? minToTime(timeToMin(a) + mins) : "";
  }

  function addEntry() {
    if (!editingEntryId && businessStatusOf(currentDay()) === "closed") {
      alert("休業日には来店実績を登録できません。先に営業設定を保存してください。");
      return;
    }
    const staff = state.staff.find(s => s.id === $("staffSelect").value);
    const menu = state.menus.find(m => m.id === $("menuSelect").value);
    const mins = Number($("stayMinutes").value) || 0;
    const price = Number($("actualPrice").value) || 0;
    const arrival = $("arrivalTime").value;
    if (!staff || !menu || !isValidArrival(arrival) || mins <= 0) {
      alert("担当者・来店時間・メニュー・滞在時間を確認してください。");
      return;
    }
    const payload = { staffId: staff.id, arrival, menuName: menu.name, menuId: menu.id, price, minutes: mins };

    if (editingEntryId) {
      const d = currentDay();
      const idx = d.entries.findIndex(e => e.id === editingEntryId);
      if (idx >= 0) {
        const entry = d.entries[idx];
        d.entries[idx] = { ...entry, ...payload };
        if (entry.staffId !== staff.id) d.entries[idx].staffNameAtVisit = staff.name;
        if (entry.menuId !== menu.id) d.entries[idx].standardPriceAtVisit = menu.price;
      }
      editingEntryId = null;
    } else {
      currentDay().entries.push({
        id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()),
        staffNameAtVisit: staff.name,
        standardPriceAtVisit: menu.price,
        ...payload
      });
    }
    if (!saveState()) return;
    clearEntryForm();
    renderAll();
  }


function editEntry(id) {
  const editBtn = document.querySelector(`[data-edit="${id}"]`);
  const row = editBtn?.closest("tr");
  const entry = currentDay().entries.find(e => e.id === id);

  if (!row || !entry) return;

  row.dataset.inlineId = id;

  const currentStaff = state.staff.find(s => s.id === entry.staffId);
  const unavailableStaffOption = currentStaff ? "" :
    `<option value="${escapeAttr(entry.staffId)}" selected>${Object.prototype.hasOwnProperty.call(entry, "staffNameAtVisit") ? escapeHtml(entry.staffNameAtVisit) : "—"}</option>`;
  const staffOptions = unavailableStaffOption + state.staff.map(s =>
    `<option value="${escapeAttr(s.id)}" ${s.id === entry.staffId ? "selected" : ""}>${escapeHtml(s.name)}</option>`
  ).join("");

  const currentMenu = state.menus.find(m => m.id === entry.menuId);
  const unavailableMenuOption = currentMenu ? "" :
    `<option value="${escapeAttr(entry.menuId)}" selected>${escapeHtml(entry.menuName)}</option>`;
  const menuOptions = unavailableMenuOption + state.menus.map(m =>
    `<option value="${escapeAttr(m.id)}" ${m.id === entry.menuId ? "selected" : ""}>${escapeHtml(m.name)}</option>`
  ).join("");

  row.innerHTML = `
    <td>
      <input type="time" step="1800" data-inline-arrival="${id}" value="${entry.arrival}">
      <div data-inline-end="${id}">
        〜${minToTime(timeToMin(entry.arrival) + Number(entry.minutes))}
      </div>
    </td>
    <td>
      <select data-inline-staff="${id}">
        ${staffOptions}
      </select>
    </td>
    <td>
      <select data-inline-menu="${id}">
        ${menuOptions}
      </select>
      <div class="hint" data-inline-standard-price="${id}">標準価格：${Object.prototype.hasOwnProperty.call(entry, "standardPriceAtVisit") ? yen(entry.standardPriceAtVisit) : "—"}</div>
    </td>
    <td>
      <input type="number" min="1" step="1"
        data-inline-minutes="${id}" value="${entry.minutes}">分
    </td>
    <td>
      <input type="number" min="0" step="1"
        data-inline-price="${id}" value="${entry.price}">
    </td>
    <td>
      <div class="row-actions">
        <button class="secondary" data-inline-save="${id}">保存</button>
        <button class="secondary" data-inline-cancel="${id}">キャンセル</button>
      </div>
    </td>
  `;

  const arrivalEl = row.querySelector(`[data-inline-arrival="${id}"]`);
  const minutesEl = row.querySelector(`[data-inline-minutes="${id}"]`);
  const endEl = row.querySelector(`[data-inline-end="${id}"]`);
  const menuEl = row.querySelector(`[data-inline-menu="${id}"]`);

  function refreshInlineEnd() {
    const mins = Number(minutesEl.value) || 0;
    endEl.textContent =
      arrivalEl.value && mins > 0
        ? `〜${minToTime(timeToMin(arrivalEl.value) + mins)}`
        : "";
  }

  arrivalEl.addEventListener("input", refreshInlineEnd);
  minutesEl.addEventListener("input", refreshInlineEnd);

  menuEl.addEventListener("change", () => {
    const menu = state.menus.find(m => m.id === menuEl.value);
    const standardPrice = menuEl.value === entry.menuId
      ? (Object.prototype.hasOwnProperty.call(entry, "standardPriceAtVisit") ? yen(entry.standardPriceAtVisit) : "—")
      : (menu ? yen(menu.price) : "—");
    row.querySelector(`[data-inline-standard-price="${id}"]`).textContent = `標準価格：${standardPrice}`;
    if (!menu) return;

    row.querySelector(`[data-inline-price="${id}"]`).value = menu.price;
    minutesEl.value = menu.minutes;
    refreshInlineEnd();
  });

  row.querySelector(`[data-inline-save="${id}"]`)
    .addEventListener("click", () => saveInlineEntry(id));

  row.querySelector(`[data-inline-cancel="${id}"]`)
    .addEventListener("click", cancelInlineEdit);
}

function saveInlineEntry(id) {
  const row = document.querySelector(`tr[data-inline-id="${id}"]`);
  const d = currentDay();
  const idx = d.entries.findIndex(e => e.id === id);

  if (!row || idx < 0) return;

  const arrival = row.querySelector(`[data-inline-arrival="${id}"]`).value;
  const staffId = row.querySelector(`[data-inline-staff="${id}"]`).value;
  const menuId = row.querySelector(`[data-inline-menu="${id}"]`).value;
  const minutes = Number(row.querySelector(`[data-inline-minutes="${id}"]`).value) || 0;
  const price = Number(row.querySelector(`[data-inline-price="${id}"]`).value) || 0;

  const staff = state.staff.find(s => s.id === staffId);
  const menu = state.menus.find(m => m.id === menuId);
  const entry = d.entries[idx];
  const hasMenuChanged = entry.menuId !== menuId;

  if (!isValidArrival(arrival) || (hasMenuChanged && !menu) || minutes <= 0 || (entry.staffId !== staffId && !staff)) {
    alert("担当者・来店時間・メニュー・滞在時間を確認してください。");
    return;
  }

  d.entries[idx] = {
    ...entry,
    staffId,
    arrival,
    price,
    minutes
  };
  if (entry.staffId !== staffId) d.entries[idx].staffNameAtVisit = staff.name;
  if (hasMenuChanged) {
    d.entries[idx].menuId = menu.id;
    d.entries[idx].menuName = menu.name;
    d.entries[idx].standardPriceAtVisit = menu.price;
  }

  if (!saveState()) return;
  renderEntriesAndKpis();
}

function cancelInlineEdit() {
  renderEntriesAndKpis();
}  function cancelEdit() {
    editingEntryId = null;
    clearEntryForm();
    updateEditUi();
  }

  function clearEntryForm() {
    $("menuSelect").value = "";
    $("actualPrice").value = "";
    $("stayMinutes").value = "";
    $("endTime").value = "";
    $("autoFillStatus").textContent = "メニューを選ぶと標準価格と標準時間が自動入力されます。";
  }

  function updateEditUi() {
    const editing = Boolean(editingEntryId);
    $("editNotice").hidden = !editing;
    $("cancelEditBtn").hidden = !editing;
    $("addEntryBtn").textContent = editing ? "修正を保存" : "登録";
  }

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
    const d = currentDay();
    const entries = [...d.entries].sort((a,b) => timeToMin(a.arrival) - timeToMin(b.arrival));
    $("entryRows").innerHTML = entries.map(e => {
      const staffName = Object.prototype.hasOwnProperty.call(e, "staffNameAtVisit")
        ? e.staffNameAtVisit
        : state.staff.find(s => s.id === e.staffId)?.name || "—";
      const standardPrice = Object.prototype.hasOwnProperty.call(e, "standardPriceAtVisit")
        ? yen(e.standardPriceAtVisit)
        : "—";
      return `<tr>
        <td>${e.arrival}〜${minToTime(timeToMin(e.arrival)+Number(e.minutes))}</td>
        <td>${escapeHtml(staffName)}</td>
        <td>${escapeHtml(e.menuName)}<div class="hint">標準価格：${standardPrice}</div></td>
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

    $("menuMaster").innerHTML = state.menus.map((m,i) => `<div class="master-row">
      <label>メニュー名<input data-menu-name="${i}" value="${escapeAttr(m.name)}"></label>
      <label>税込価格<input type="number" data-menu-price="${i}" value="${m.price}"></label>
      <label>標準時間<input type="number" data-menu-minutes="${i}" value="${m.minutes}"></label>
      <button class="secondary" data-menu-remove="${i}">削除</button></div>`).join("");

    document.querySelectorAll("[data-staff-remove]").forEach(btn => btn.addEventListener("click", () => {
      if (confirm("このスタッフをマスターから削除しますか？ 過去実績は残ります。")) { state.staff.splice(Number(btn.dataset.staffRemove), 1); renderMasters(); }
    }));
    document.querySelectorAll("[data-menu-remove]").forEach(btn => btn.addEventListener("click", () => {
      if (confirm("このメニューをマスターから削除しますか？ 過去実績は残ります。")) { state.menus.splice(Number(btn.dataset.menuRemove), 1); renderMasters(); }
    }));
  }

  function saveMasters() {
    document.querySelectorAll("[data-staff-name]").forEach(el => state.staff[Number(el.dataset.staffName)].name = el.value.trim() || "スタッフ");
    document.querySelectorAll("[data-menu-name]").forEach(el => state.menus[Number(el.dataset.menuName)].name = el.value.trim() || "メニュー");
    document.querySelectorAll("[data-menu-price]").forEach(el => state.menus[Number(el.dataset.menuPrice)].price = Number(el.value) || 0);
    document.querySelectorAll("[data-menu-minutes]").forEach(el => state.menus[Number(el.dataset.menuMinutes)].minutes = Number(el.value) || 0);
    if (!saveState()) return;
    refreshSelectors();
    renderWorkSchedule();
    renderMasters();
    renderEntriesAndKpis();
    alert("管理設定を保存しました。");
  }

  function addStaff() {
    state.staff.push({ id: "staff_" + Date.now(), name: "新しいスタッフ" });
    renderMasters();
  }

  function addMenu() {
    state.menus.push({ id: "menu_" + Date.now(), name: "新しいメニュー", price: 0, minutes: 60 });
    renderMasters();
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
    if (x.version !== undefined && x.version !== 1 && x.version !== CURRENT_DATA_VERSION) throw new Error("unsupported version");
    if (!x.staff.every(s => isRecord(s) && hasStrings(s, ["id", "name"]))) throw new Error("invalid staff");
    if (!x.menus.every(m => isRecord(m) && hasStrings(m, ["id", "name"]) && hasNumbers(m, ["price", "minutes"]))) throw new Error("invalid menus");
    for (const day of Object.values(x.days)) {
      if (!isRecord(day) || !Array.isArray(day.work) || !Array.isArray(day.entries)) throw new Error("invalid day");
      if (has(day, "retailSales") && !Number.isFinite(day.retailSales)) throw new Error("invalid retail sales");
      if (has(day, "businessStatus") && !["open", "closed", "unset"].includes(day.businessStatus)) throw new Error("invalid business status");
      if (!day.work.every(w => isRecord(w) && hasStrings(w, ["id", "start", "end"]) && typeof w.on === "boolean")) throw new Error("invalid work");
      if (!day.entries.every(e => isRecord(e)
        && hasStrings(e, ["id", "staffId", "arrival", "menuId", "menuName"])
        && hasNumbers(e, ["price", "minutes"])
        && (!has(e, "standardPriceAtVisit") || Number.isFinite(e.standardPriceAtVisit))
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
  $("menuSelect").addEventListener("change", menuChanged);
  $("arrivalTime").addEventListener("input", previewEnd);
  $("stayMinutes").addEventListener("input", previewEnd);
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
  renderAll();
})();
