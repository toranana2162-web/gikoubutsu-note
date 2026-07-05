/* 技工物管理ノート — MVP
 * データはブラウザの localStorage に保存（サーバー不要・無料枠で完結）。
 */
(function () {
  "use strict";

  var STORAGE_KEY = "gikoubutsu.records.v1";

  // ---- データ層 ------------------------------------------------------------
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("読み込み失敗", e);
      return [];
    }
  }
  function save(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }
  function uid() {
    return "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  var records = load();

  // ---- 日付ユーティリティ --------------------------------------------------
  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day; // ローカル時刻基準の YYYY-MM-DD
  }
  var TODAY = todayStr();

  function fmtDate(s) {
    if (!s) return "—";
    var p = s.split("-");
    return p.length === 3 ? p[1] + "/" + p[2] : s;
  }

  // ---- 歯式（Zsigmondy-Palmer）ユーティリティ ------------------------------
  // コード例: "UR6"=右上6番（永久歯）, "URA"=右上A（乳歯）。象限 UR/UL/LR/LL。
  var QUAD_LABEL = { UR: "右上", UL: "左上", LR: "右下", LL: "左下" };
  var QUAD_ORDER = ["UR", "UL", "LR", "LL"];

  // 永久歯(1〜8)を先に、乳歯(A〜E)を後に並べるための並び替えキー
  function toothSortKey(label) {
    var n = Number(label);
    return isNaN(n) ? 100 + label.charCodeAt(0) : n;
  }

  function formatTeeth(teeth) {
    if (!teeth || !teeth.length) return "";
    var groups = {};
    teeth.forEach(function (c) {
      var q = c.slice(0, 2), label = c.slice(2);
      (groups[q] = groups[q] || []).push(label);
    });
    return QUAD_ORDER.filter(function (q) { return groups[q]; }).map(function (q) {
      var labels = groups[q].sort(function (a, b) {
        return toothSortKey(a) - toothSortKey(b);
      }).join("・");
      return QUAD_LABEL[q] + labels;
    }).join("　");
  }

  // 状態判定: delivered | overdue | today | pending
  function statusOf(r) {
    if (r.delivered) return "delivered";
    if (!r.dueDate) return "pending";
    if (r.dueDate < TODAY) return "overdue";
    if (r.dueDate === TODAY) return "today";
    return "pending";
  }

  // ---- DOM 参照 ------------------------------------------------------------
  var $ = function (id) { return document.getElementById(id); };
  var views = { top: $("view-top"), list: $("view-list"), form: $("view-form") };
  var tabs = document.querySelectorAll(".tab");

  // ---- タブ切替 ------------------------------------------------------------
  function showView(name) {
    Object.keys(views).forEach(function (k) {
      views[k].classList.toggle("is-hidden", k !== name);
    });
    tabs.forEach(function (t) {
      t.classList.toggle("is-active", t.dataset.view === name);
    });
    if (name === "top") renderTop();
    if (name === "list") renderList();
    if (name === "form" && !$("editId").value) resetForm();
    window.scrollTo(0, 0);
  }
  tabs.forEach(function (t) {
    t.addEventListener("click", function () { showView(t.dataset.view); });
  });

  // ---- カード生成 ----------------------------------------------------------
  function badge(status) {
    var map = {
      overdue: ["badge-overdue", "期限超過"],
      today: ["badge-today", "本日納品"],
      delivered: ["badge-done", "納品済み"],
      pending: ["badge-pending", "未納品"]
    };
    var b = map[status];
    return '<span class="card-badge ' + b[0] + '">' + b[1] + "</span>";
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function cardHtml(r) {
    var st = statusOf(r);
    var cls = "work-card";
    if (st === "overdue") cls += " is-overdue";
    else if (st === "today") cls += " is-today";
    if (r.delivered) cls += " is-delivered card-delivered";

    var items = (r.sendItems || []).map(function (i) {
      return '<span class="chip">' + escapeHtml(i) + "</span>";
    }).join("");

    return (
      '<div class="' + cls + '" data-id="' + r.id + '">' +
        '<div class="card-head">' +
          '<span class="card-patient">' + escapeHtml(r.patientName) + "</span>" +
          badge(st) +
        "</div>" +
        '<div class="card-meta">' +
          "<span>印象日 <b>" + fmtDate(r.impressionDate) + "</b></span>" +
          "<span>納品予定 <b>" + fmtDate(r.dueDate) + "</b></span>" +
        "</div>" +
        (r.content ? '<div class="card-meta">' + escapeHtml(r.content) + "</div>" : "") +
        (r.teeth && r.teeth.length
          ? '<div class="card-meta">歯式 <b>' + escapeHtml(formatTeeth(r.teeth)) + "</b></div>"
          : "") +
        (items ? '<div class="card-items">' + items + "</div>" : "") +
        '<div class="card-actions">' +
          '<label class="check-label"><input type="checkbox" data-act="instruction" ' +
            (r.instructionChecked ? "checked" : "") + " /> 指示書チェック</label>" +
          '<label class="check-label"><input type="checkbox" data-act="delivered" ' +
            (r.delivered ? "checked" : "") + " /> 納品済み</label>" +
          '<button class="btn btn-ghost btn-sm" data-act="edit">編集</button>' +
          '<button class="btn btn-danger btn-sm" data-act="delete">削除</button>' +
        "</div>" +
      "</div>"
    );
  }

  function renderInto(el, list, emptyMsg) {
    if (!list.length) {
      el.innerHTML = '<p class="empty">' + emptyMsg + "</p>";
      return;
    }
    el.innerHTML = list.map(cardHtml).join("");
  }

  // 並び順: 納品予定日の早い順（未設定は末尾）
  function byDue(a, b) {
    return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
  }

  // ---- トップ画面 ----------------------------------------------------------
  function renderTop() {
    var today = records.filter(function (r) { return statusOf(r) === "today"; }).sort(byDue);
    var overdue = records.filter(function (r) { return statusOf(r) === "overdue"; }).sort(byDue);
    var pending = records.filter(function (r) { return !r.delivered; });

    $("sumToday").textContent = today.length;
    $("sumOverdue").textContent = overdue.length;
    $("sumPending").textContent = pending.length;

    renderInto($("todayList"), today, "今日の納品予定はありません");
    renderInto($("overdueList"), overdue, "期限超過の未納品はありません 🎉");
  }

  // ---- 一覧画面（検索・絞り込み） -----------------------------------------
  function renderList() {
    var qp = $("fPatient").value.trim().toLowerCase();
    var qd = $("fDue").value;
    var qs = $("fStatus").value;

    var list = records.filter(function (r) {
      if (qp && (r.patientName || "").toLowerCase().indexOf(qp) === -1) return false;
      if (qd && r.dueDate !== qd) return false;
      if (qs !== "all") {
        var st = statusOf(r);
        if (qs === "pending" && r.delivered) return false;
        if (qs === "delivered" && !r.delivered) return false;
        if (qs === "overdue" && st !== "overdue") return false;
      }
      return true;
    }).sort(byDue);

    $("resultCount").textContent = list.length + " 件";
    renderInto($("fullList"), list, "該当する技工物はありません");
  }

  ["fPatient", "fDue", "fStatus"].forEach(function (id) {
    $(id).addEventListener("input", renderList);
  });
  $("clearFilters").addEventListener("click", function () {
    $("fPatient").value = "";
    $("fDue").value = "";
    $("fStatus").value = "all";
    renderList();
  });

  // ---- カード上の操作（イベント委任） -------------------------------------
  function findRecord(id) {
    return records.filter(function (r) { return r.id === id; })[0];
  }

  document.querySelector(".content").addEventListener("click", function (e) {
    var actEl = e.target.closest("[data-act]");
    if (!actEl) return;
    var card = e.target.closest(".work-card");
    if (!card) return;
    var r = findRecord(card.dataset.id);
    if (!r) return;
    var act = actEl.dataset.act;

    if (act === "delivered") {
      r.delivered = actEl.checked;
      r.deliveredDate = actEl.checked ? TODAY : "";
      save(records);
      refreshAll();
    } else if (act === "instruction") {
      r.instructionChecked = actEl.checked;
      save(records);
    } else if (act === "edit") {
      openEdit(r);
    } else if (act === "delete") {
      if (confirm(r.patientName + " さんの技工物データを削除しますか？")) {
        records = records.filter(function (x) { return x.id !== r.id; });
        save(records);
        refreshAll();
      }
    }
  });

  function refreshAll() {
    if (!views.top.classList.contains("is-hidden")) renderTop();
    if (!views.list.classList.contains("is-hidden")) renderList();
  }

  // ---- 歯式チャート（Zsigmondy-Palmer） -----------------------------------
  var toothChart = $("toothChart");
  var toothSelected = $("toothSelected");

  // 患者正面視: 上段=上顎、下段=下顎。中央（正中）で左右を分ける。
  // 右側の象限は正中側が末尾、左側は正中側が先頭になるよう並べる。
  var PERM = [1, 2, 3, 4, 5, 6, 7, 8];      // 永久歯
  var PRIMARY = ["A", "B", "C", "D", "E"];  // 乳歯

  function buildSet(setName, labels) {
    var rows = [["UR", "UL"], ["LR", "LL"]];
    var html = '<div class="tc-set" data-set="' + setName + '">';
    rows.forEach(function (pair) {
      html += '<div class="tc-row">';
      pair.forEach(function (q, idx) {
        var isRight = idx === 0;
        var seq = isRight ? labels.slice().reverse() : labels;
        html += '<div class="tc-quad ' + (isRight ? "tc-right" : "tc-left") + '">';
        seq.forEach(function (v) {
          html += '<button type="button" class="tooth" data-code="' + q + v + '">' + v + "</button>";
        });
        html += "</div>";
      });
      html += "</div>";
    });
    return html + "</div>";
  }

  function buildToothChart() {
    toothChart.innerHTML = buildSet("perm", PERM) + buildSet("primary", PRIMARY);
    setToothMode("perm");
  }

  // 表示中の歯列を切り替える（選択状態は両歯列とも保持される）
  function setToothMode(mode) {
    toothChart.querySelectorAll(".tc-set").forEach(function (set) {
      set.classList.toggle("is-hidden", set.dataset.set !== mode);
    });
    $("toothMode").querySelectorAll(".tm-btn").forEach(function (b) {
      b.classList.toggle("is-active", b.dataset.mode === mode);
    });
  }

  function collectTeeth() {
    var arr = [];
    toothChart.querySelectorAll(".tooth.is-on").forEach(function (b) {
      arr.push(b.dataset.code);
    });
    return arr;
  }

  function updateToothSelected() {
    var txt = formatTeeth(collectTeeth());
    toothSelected.textContent = txt || "未選択";
  }

  function setTeeth(teeth) {
    teeth = teeth || [];
    var set = {};
    teeth.forEach(function (c) { set[c] = true; });
    toothChart.querySelectorAll(".tooth").forEach(function (b) {
      b.classList.toggle("is-on", !!set[b.dataset.code]);
    });
    // 乳歯のみ選択されている場合は乳歯表示で開く
    var hasPerm = teeth.some(function (c) { return !isNaN(Number(c.slice(2))); });
    setToothMode(!hasPerm && teeth.length ? "primary" : "perm");
    updateToothSelected();
  }

  buildToothChart();
  toothChart.addEventListener("click", function (e) {
    var btn = e.target.closest(".tooth");
    if (!btn) return;
    btn.classList.toggle("is-on");
    updateToothSelected();
  });
  $("toothMode").addEventListener("click", function (e) {
    var btn = e.target.closest(".tm-btn");
    if (btn) setToothMode(btn.dataset.mode);
  });

  // ---- フォーム（登録・編集） ---------------------------------------------
  var form = $("workForm");
  var chkOther = $("chkOther");
  var sendOther = $("sendOther");

  chkOther.addEventListener("change", function () {
    sendOther.classList.toggle("is-hidden", !chkOther.checked);
    if (!chkOther.checked) sendOther.value = "";
  });

  function resetForm() {
    form.reset();
    $("editId").value = "";
    $("formTitle").textContent = "技工物の登録";
    $("submitBtn").textContent = "登録する";
    sendOther.classList.add("is-hidden");
    setTeeth([]);
    $("impressionDate").value = TODAY;
  }

  function openEdit(r) {
    resetForm();
    $("editId").value = r.id;
    $("formTitle").textContent = "技工物の編集";
    $("submitBtn").textContent = "更新する";
    $("impressionDate").value = r.impressionDate || "";
    $("patientName").value = r.patientName || "";
    $("content").value = r.content || "";
    $("dueDate").value = r.dueDate || "";
    setTeeth(r.teeth);

    var fixed = ["対合", "バイト", "トレー", "参考模型", "咬合器"];
    document.querySelectorAll('#sendItems input[type="checkbox"]').forEach(function (cb) {
      cb.checked = (r.sendItems || []).indexOf(cb.value) !== -1;
    });
    var other = (r.sendItems || []).filter(function (i) { return fixed.indexOf(i) === -1; });
    if (other.length) {
      chkOther.checked = true;
      sendOther.classList.remove("is-hidden");
      sendOther.value = other.join("、");
    }
    showView("form");
  }

  function collectSendItems() {
    var items = [];
    document.querySelectorAll('#sendItems input[type="checkbox"]').forEach(function (cb) {
      if (cb.checked && cb.value !== "その他") items.push(cb.value);
    });
    if (chkOther.checked && sendOther.value.trim()) {
      sendOther.value.split(/[、,]/).forEach(function (s) {
        if (s.trim()) items.push(s.trim());
      });
    }
    return items;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = $("editId").value;
    var data = {
      impressionDate: $("impressionDate").value,
      patientName: $("patientName").value.trim(),
      content: $("content").value.trim(),
      teeth: collectTeeth(),
      sendItems: collectSendItems(),
      dueDate: $("dueDate").value
    };

    if (id) {
      var r = findRecord(id);
      if (r) Object.keys(data).forEach(function (k) { r[k] = data[k]; });
    } else {
      data.id = uid();
      data.delivered = false;
      data.deliveredDate = "";
      data.instructionChecked = false;
      data.createdAt = new Date().toISOString();
      records.push(data);
    }
    save(records);
    resetForm();
    showView("list");
  });

  $("cancelBtn").addEventListener("click", function () {
    resetForm();
    showView("top");
  });

  // ---- 初期化 --------------------------------------------------------------
  $("todayLabel").textContent =
    new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
  $("impressionDate").value = TODAY;
  showView("top");
})();
