
(() => {
  const STORAGE_KEY = "masa_salon_intelligence_prod_v1";
  const $ = (id) => document.getElementById(id);

  const DEFAULT_STATE = {
    version: 1,
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

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : structuredClone(DEFAULT_STATE);
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

  function refreshSelectors() {
    $("staffSelect").innerHTML = state.staff.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
    $("menuSelect").innerHTML = `<option value="">選択してください</option>` +
      state.menus.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("");
  }

  function renderWorkSchedule() {
    const d = currentDay();
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
    saveState();
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
    const menu = state.menus.find(m => m.id === $("menuSelect").value);
    const mins = Number($("stayMinutes").value) || 0;
    const price = Number($("actualPrice").value) || 0;
    const arrival = $("arrivalTime").value;
    if (!menu || !arrival || mins <= 0) {
      alert("来店時間・メニュー・滞在時間を確認してください。");
      return;
    }
    currentDay().entries.push({
      id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()),
      staffId: $("staffSelect").value,
      arrival,
      menuName: menu.name,
      menuId: menu.id,
      price,
      minutes: mins
    });
    saveState();
    renderAll();
    $("menuSelect").value = "";
    $("actualPrice").value = "";
    $("stayMinutes").value = "";
    $("endTime").value = "";
  }

  function removeEntry(id) {
    const d = currentDay();
    d.entries = d.entries.filter(e => e.id !== id);
    saveState();
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
      const staffName = state.staff.find(s => s.id === e.staffId)?.name || "—";
      return `<tr>
        <td>${e.arrival}〜${minToTime(timeToMin(e.arrival)+Number(e.minutes))}</td>
        <td>${escapeHtml(staffName)}</td>
        <td>${escapeHtml(e.menuName)}</td>
        <td>${e.minutes}分</td>
        <td>${yen(e.price)}</td>
        <td><button class="secondary" data-delete="${e.id}">削除</button></td>
      </tr>`;
    }).join("");

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
      state.staff.splice(Number(btn.dataset.staffRemove), 1); renderMasters();
    }));
    document.querySelectorAll("[data-menu-remove]").forEach(btn => btn.addEventListener("click", () => {
      state.menus.splice(Number(btn.dataset.menuRemove), 1); renderMasters();
    }));
  }

  function saveMasters() {
    document.querySelectorAll("[data-staff-name]").forEach(el => state.staff[Number(el.dataset.staffName)].name = el.value.trim() || "スタッフ");
    document.querySelectorAll("[data-menu-name]").forEach(el => state.menus[Number(el.dataset.menuName)].name = el.value.trim() || "メニュー");
    document.querySelectorAll("[data-menu-price]").forEach(el => state.menus[Number(el.dataset.menuPrice)].price = Number(el.value) || 0);
    document.querySelectorAll("[data-menu-minutes]").forEach(el => state.menus[Number(el.dataset.menuMinutes)].minutes = Number(el.value) || 0);
    saveState();
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
      state = parsed;
      saveState();
      renderAll();
      alert("バックアップを復元しました。");
    } catch {
      alert("MASAシステムのバックアップとして読み込めませんでした。");
    }
  }

  function validateBackup(x) {
    if (!x || !Array.isArray(x.staff) || !Array.isArray(x.menus) || typeof x.days !== "object") throw new Error("invalid");
  }

  function restoreFromText() {
    try {
      const parsed = JSON.parse($("backupText").value.trim());
      validateBackup(parsed);
      if (!confirm("現在のデータを貼り付けたバックアップで置き換えますか？")) return;
      state = parsed;
      saveState();
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
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  $("workDate").value = todayLocal();
  $("workDate").addEventListener("change", renderAll);
  $("saveDayBtn").addEventListener("click", saveDaySettings);
  $("menuSelect").addEventListener("change", menuChanged);
  $("arrivalTime").addEventListener("input", previewEnd);
  $("stayMinutes").addEventListener("input", previewEnd);
  $("addEntryBtn").addEventListener("click", addEntry);
  $("clearEntryBtn").addEventListener("click", () => { $("menuSelect").value=""; $("actualPrice").value=""; $("stayMinutes").value=""; $("endTime").value=""; });
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
