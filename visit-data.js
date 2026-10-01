/* Read-only adapters and aggregations for legacy visits and v3 menu items. */
(() => {
  const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const historyFields = ["standardPriceAtVisit", "standardMinutesAtVisit", "categoryAtVisit"];

  function itemsForEntry(entry) {
    if (has(entry, "menuItems")) return entry.menuItems;
    const item = { menuId: entry.menuId, menuName: entry.menuName, price: entry.price };
    for (const field of historyFields) if (has(entry, field)) item[field] = entry[field];
    return [item];
  }

  function validMenuItems(entry) {
    const items = entry.menuItems;
    if (!Array.isArray(items) || !items.length) return false;
    const ids = new Set();
    const valid = items.every(item => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      if (!["id", "menuId", "menuName"].every(key => typeof item[key] === "string")) return false;
      if (!item.id || !item.menuId || ids.has(item.id)) return false;
      ids.add(item.id);
      if (!Number.isFinite(item.price) || item.price < 0) return false;
      if (!["standardPriceAtVisit", "standardMinutesAtVisit"].every(key =>
        !has(item, key) || (Number.isFinite(item[key]) && item[key] >= 0))) return false;
      return !has(item, "categoryAtVisit") || typeof item.categoryAtVisit === "string";
    });
    if (!valid) return false;
    const total = items.reduce((sum, item) => sum + item.price, 0);
    return Number.isFinite(total) && entry.price === total;
  }

  function analyzeEntries(entries) {
    const rows = entries.flatMap((entry, visitIndex) => itemsForEntry(entry).map(item => ({ item, visitIndex })));
    const category = item => has(item, "categoryAtVisit") ? item.categoryAtVisit : null;
    const standardPrice = item => has(item, "standardPriceAtVisit") ? item.standardPriceAtVisit : null;
    function group(source, keyOf, denominator = source.length) {
      const groups = new Map();
      for (const row of source) {
        const key = keyOf(row.item);
        if (!groups.has(key)) groups.set(key, { key, count: 0, sales: 0, visits: new Set(), rows: [] });
        const value = groups.get(key);
        value.count++;
        value.sales += row.item.price;
        value.visits.add(row.visitIndex);
        value.rows.push(row);
      }
      return [...groups.values()].map(value => ({
        key: value.key, count: value.count, sales: value.sales, visitCount: value.visits.size,
        composition: denominator ? value.count / denominator : 0,
        utilization: entries.length ? value.visits.size / entries.length : 0,
        rows: value.rows
      }));
    }
    const clean = groups => groups.map(({ rows, ...value }) => value);
    const sales = entries.reduce((sum, entry) => sum + entry.price, 0);
    return {
      visits: entries.length, sales, average: entries.length ? sales / entries.length : 0,
      itemCount: rows.length,
      byMenuId: clean(group(rows, item => item.menuId)),
      byMenuName: clean(group(rows, item => item.menuName)),
      byStandardPrice: clean(group(rows, standardPrice)),
      byCategory: group(rows, category).map(({ rows: categoryRows, ...value }) => ({
        ...value,
        byStandardPrice: group(categoryRows, standardPrice).map(({ rows: priceRows, ...price }) => ({
          ...price, byMenuId: clean(group(priceRows, item => item.menuId))
        }))
      }))
    };
  }
  globalThis.MasaVisitData = Object.freeze({ itemsForEntry, validMenuItems, analyzeEntries });
})();
