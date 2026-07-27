/* 중학교 정보 통합 자료실 - 렌더링 로직 */
(function () {
  "use strict";

  const state = { 단원: "computing", 개념index: 0, view: "theory", 실습cat: "교과서실습" };

  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  /* ---------- 개념 검색·이동 헬퍼 ---------- */
  function findConceptByName(name) {
    for (const u of 자료.단원목록) {
      const arr = 자료.개념[u.id] || [];
      const i = arr.findIndex((c) => c.개념명 === name);
      if (i >= 0) return { 단원: u.id, index: i };
    }
    return null;
  }
  function gotoConcept(unit, index, view) {
    state.단원 = unit;
    state.개념index = index;
    if (view) state.view = view;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function moveConcept(delta) {
    const 개념들 = 자료.개념[state.단원] || [];
    const next = state.개념index + delta;
    if (next < 0 || next >= 개념들.length) return;
    state.개념index = next;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- localStorage (준비 체크 · 메모) ---------- */
  const LS_PREP = "jaryo_prep_v1", LS_MEMO = "jaryo_memo_v1";
  const loadLS = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch (e) { return {}; } };
  const saveLS = (k, o) => { try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) {} };
  const keyOf = (unit, name) => unit + "::" + name;
  function isPrepared(unit, name) { return !!loadLS(LS_PREP)[keyOf(unit, name)]; }
  function togglePrepared(unit, name) { const o = loadLS(LS_PREP); const k = keyOf(unit, name); if (o[k]) delete o[k]; else o[k] = 1; saveLS(LS_PREP, o); }
  function getMemo(unit, name) { return loadLS(LS_MEMO)[keyOf(unit, name)] || ""; }
  function setMemo(unit, name, text) { const o = loadLS(LS_MEMO); const k = keyOf(unit, name); if (text.trim()) o[k] = text; else delete o[k]; saveLS(LS_MEMO, o); }

  /* ---------- URL 해시 딥링크 ---------- */
  let suppressHash = false;
  function applyHash() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (!h) return false;
    const [unit, idx, view] = h.split("/");
    if (!자료.개념[unit]) return false;
    const arr = 자료.개념[unit];
    const i = Math.max(0, Math.min(arr.length - 1, parseInt(idx || "0", 10) || 0));
    state.단원 = unit; state.개념index = i;
    state.view = ["practice", "review"].includes(view) ? view : "theory";
    return true;
  }
  function syncHash() {
    const suffix = state.view === "theory" ? "" : "/" + state.view;
    const h = "#" + state.단원 + "/" + state.개념index + suffix;
    if (location.hash !== h) { suppressHash = true; location.hash = h; }
  }

  /* ---------- 45분 수업 흐름 자동 구성 ---------- */
  function lessonFlowNode(c) {
    const wrap = el("div", "lesson-flow");
    const 실습목록 = 자료.실습?.[state.단원] || [];
    const nP = 실습목록.filter((p) => p.개념 === c.개념명).length;
    const step = (time, title, items) => {
      const s = el("div", "lf-step");
      s.appendChild(el("div", "lf-head", `<span class="lf-time">${time}</span><b>${esc(title)}</b>`));
      const ul = el("ul", "clean");
      items.filter(Boolean).forEach((t) => ul.appendChild(el("li", null, t)));
      s.appendChild(ul);
      return s;
    };
    const 도입 = [];
    if (c.생활예시?.length) 도입.push("<b>동기유발</b> · 생활 예시로 흥미 끌기 — " + esc(c.생활예시.slice(0, 2).join(", ")));
    if (c.비유) 도입.push("<b>비유</b> · " + esc(c.비유));
    도입.push("<b>학습 목표 안내</b> · " + esc(c.한줄 || c.개념명));
    wrap.appendChild(step("도입 · 5분", "열기", 도입));

    const 전개 = [];
    if (c.쉬운설명) 전개.push("<b>개념 설명</b> · " + esc(c.쉬운설명));
    if (c.핵심용어?.length) 전개.push("<b>핵심 용어</b> · " + esc(c.핵심용어.map((t) => t.용어).join(", ")));
    if (c.수업용설명) 전개.push("<b>수업 팁</b> · " + esc(c.수업용설명));
    전개.push(nP ? `<b>활동·실습</b> · 이 개념 실습 ${nP}개 (실습 탭에서 확인)` : "<b>활동</b> · 예시·오개념으로 이해 확인");
    wrap.appendChild(step("전개 · 30분", "개념 학습·활동", 전개));

    const 정리 = [];
    (c.확인질문 || []).forEach((q) => 정리.push("<b>확인 질문</b> · " + esc(q)));
    if (c.오개념?.length) 정리.push("<b>오개념 짚기</b> · " + esc(c.오개념[0].split("→")[0].replace(/\.$/, "").trim()));
    정리.push("<b>차시 예고</b> · 다음 개념과 연결하기");
    wrap.appendChild(step("정리 · 10분", "확인·마무리", 정리));
    return wrap;
  }

  /* ---------- 교사 메모 (자동 저장) ---------- */
  function memoNode(c) {
    const wrap = el("div", "memo-wrap");
    const ta = el("textarea", "memo-area");
    ta.placeholder = "이 개념 수업 준비 메모를 적어 두세요. (이 브라우저에 자동 저장)";
    ta.value = getMemo(state.단원, c.개념명);
    ta.addEventListener("input", () => setMemo(state.단원, c.개념명, ta.value));
    wrap.appendChild(ta);
    return wrap;
  }

  /* ---------- 데이터 백업 (JSON 내보내기·불러오기) ---------- */
  function exportData() {
    const data = { app: "중학교정보자료실", version: 1, exportedAt: new Date().toISOString(), prep: loadLS(LS_PREP), memo: loadLS(LS_MEMO) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const a = document.createElement("a");
    a.href = url; a.download = `정보자료실_백업_${ymd}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function importData(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const o = JSON.parse(r.result);
        const memoCnt = o.memo ? Object.keys(o.memo).length : 0;
        const prepCnt = o.prep ? Object.keys(o.prep).length : 0;
        if (!o.memo && !o.prep) { alert("불러오기 실패: 이 파일에는 저장할 메모·체크가 없어요."); return; }
        if (!confirm(`메모 ${memoCnt}개, 준비체크 ${prepCnt}개를 불러올까요?\n(현재 저장된 내용은 덮어써집니다)`)) return;
        if (o.prep) saveLS(LS_PREP, o.prep);
        if (o.memo) saveLS(LS_MEMO, o.memo);
        render();
        alert("불러왔어요. 메모·준비체크가 반영되었습니다.");
      } catch (e) { alert("불러오기 실패: 올바른 백업 파일(.json)이 아니에요."); }
    };
    r.readAsText(file);
  }
  function setupBackup() {
    const ex = document.getElementById("btnExport");
    const im = document.getElementById("btnImport");
    const file = document.getElementById("importFile");
    if (ex) ex.onclick = exportData;
    if (im && file) {
      im.onclick = () => file.click();
      file.onchange = () => { if (file.files[0]) importData(file.files[0]); file.value = ""; };
    }
  }

  /* ---------- 전역 검색 ---------- */
  function setupSearch() {
    const input = document.getElementById("searchInput");
    const results = document.getElementById("searchResults");
    if (!input || !results) return;

    const doSearch = () => {
      const q = input.value.trim().toLowerCase();
      results.innerHTML = "";
      if (!q) { results.hidden = true; return; }
      const hits = [];
      자료.단원목록.forEach((u) => {
        (자료.개념[u.id] || []).forEach((c, i) => {
          const name = (c.개념명 || "").toLowerCase();
          const one = (c.한줄 || "").toLowerCase();
          const terms = (c.핵심용어 || []).map((t) => t.용어).join(" ").toLowerCase();
          let score = -1;
          if (name.includes(q)) score = 0;
          else if (terms.includes(q)) score = 1;
          else if (one.includes(q)) score = 2;
          if (score >= 0) hits.push({ u, i, c, score });
        });
      });
      hits.sort((a, b) => a.score - b.score);
      if (!hits.length) { results.innerHTML = "<div class='sr-empty'>검색 결과가 없어요</div>"; results.hidden = false; return; }
      hits.slice(0, 14).forEach(({ u, i, c, score }) => {
        const why = score === 1 ? " <span class='sr-why'>· 핵심용어</span>" : score === 2 ? " <span class='sr-why'>· 설명</span>" : "";
        const row = el("button", "sr-row",
          `<span class="sr-unit">${u.로마자}</span><span class="sr-name">${esc(c.개념명)}</span>${why}`);
        row.onclick = () => { input.value = ""; results.hidden = true; gotoConcept(u.id, i, "theory"); };
        results.appendChild(row);
      });
      results.hidden = false;
    };
    input.addEventListener("input", doSearch);
    input.addEventListener("focus", doSearch);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { input.value = ""; results.hidden = true; input.blur(); }
      if (e.key === "Enter") { const first = results.querySelector(".sr-row"); if (first) first.click(); }
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-wrap")) results.hidden = true;
    });
  }

  /* ---------- 키보드 이동 ---------- */
  function setupKeyboard() {
    document.addEventListener("keydown", (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") moveConcept(-1);
      else if (e.key === "ArrowRight") moveConcept(1);
    });
  }

  /* ---------- 인쇄 시 접힌 내용 펼치기 ---------- */
  function setupPrint() {
    window.addEventListener("beforeprint", () => {
      document.querySelectorAll("details").forEach((d) => { if (!d.open) { d.dataset.wasClosed = "1"; d.open = true; } });
    });
    window.addEventListener("afterprint", () => {
      document.querySelectorAll("details").forEach((d) => { if (d.dataset.wasClosed) { d.open = false; delete d.dataset.wasClosed; } });
    });
  }

  /* ---------- 개념 이동 툴바 ---------- */
  function conceptToolbar() {
    const 개념들 = 자료.개념[state.단원] || [];
    const total = 개념들.length;
    const 개념 = 개념들[state.개념index];
    const bar = el("div", "concept-toolbar");

    const prev = el("button", "tb-btn", "◀ 이전");
    prev.disabled = state.개념index <= 0;
    prev.onclick = () => moveConcept(-1);

    const pos = el("span", "tb-pos", `${state.개념index + 1} / ${total}`);

    const next = el("button", "tb-btn", "다음 ▶");
    next.disabled = state.개념index >= total - 1;
    next.onclick = () => moveConcept(1);

    const spacer = el("span", "tb-spacer");

    const 실습목록 = 자료.실습?.[state.단원] || [];
    const nP = 개념 ? 실습목록.filter((p) => p.개념 === 개념.개념명).length : 0;
    const viewBtn = el("button", "tb-btn alt");
    if (state.view === "theory") {
      viewBtn.innerHTML = `🧩 이 개념 실습 (${nP})`;
      viewBtn.onclick = () => { state.view = "practice"; render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
    } else {
      viewBtn.innerHTML = "📖 이론 보기";
      viewBtn.onclick = () => { state.view = "theory"; render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
    }

    const done = 개념 ? isPrepared(state.단원, 개념.개념명) : false;
    const prepBtn = el("button", "tb-btn prep" + (done ? " on" : ""), done ? "✓ 준비 완료" : "☐ 준비 완료");
    prepBtn.title = "이 개념 수업 준비 완료로 표시";
    prepBtn.onclick = () => { if (개념) { togglePrepared(state.단원, 개념.개념명); render(); } };

    const reviewBtn = el("button", "tb-btn", "📝 단원 복습지");
    reviewBtn.title = "이 단원의 핵심 용어·확인 질문을 모아 인쇄용 복습/평가지로";
    reviewBtn.onclick = () => { state.view = "review"; render(); window.scrollTo({ top: 0, behavior: "smooth" }); };

    const printBtn = el("button", "tb-btn", "🖨 인쇄·PDF");
    printBtn.onclick = () => window.print();

    bar.append(prev, pos, next, spacer, prepBtn, reviewBtn, viewBtn, printBtn);

    // 이론 화면에서만: 접힌 블록 전체 펼치기/접기
    if (state.view === "theory") {
      let expanded = false;
      const expandBtn = el("button", "tb-btn", "🔽 전체 펼치기");
      expandBtn.title = "심화·교과서 정의 등 접힌 내용을 한 번에 펼치기";
      expandBtn.onclick = () => {
        expanded = !expanded;
        document.querySelectorAll("#content .block").forEach((bk) => {
          const body = bk.querySelector(".block-body");
          const tgl = bk.querySelector(".block-toggle");
          if (body) { body.style.display = expanded ? "" : "none"; if (tgl) tgl.textContent = expanded ? "▾" : "▸"; }
        });
        expandBtn.textContent = expanded ? "🔼 전체 접기" : "🔽 전체 펼치기";
      };
      bar.appendChild(expandBtn);
    }
    return bar;
  }

  /* ---------- 단원 네비 ---------- */
  function renderUnitNav() {
    const nav = document.getElementById("unitNav");
    nav.innerHTML = "";
    자료.단원목록.forEach((u) => {
      const 개념수 = (자료.개념[u.id] || []).length;
      const btn = el("button", "unit-btn" + (u.id === state.단원 ? " active" : ""));
      btn.innerHTML =
        `<span class="roman">${u.로마자}</span> ${esc(u.이름)}` +
        `<span class="badge">${개념수 ? 개념수 + "개념" : u.상태}</span>`;
      btn.onclick = () => { state.단원 = u.id; state.개념index = 0; render(); };
      nav.appendChild(btn);
    });
  }

  /* ---------- 이론/실습 탭 ---------- */
  function renderViewTabs() {
    document.querySelectorAll(".view-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === state.view);
      btn.onclick = () => {
        state.view = btn.dataset.view;
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
      };
    });
  }

  /* ---------- 사이드바 (항상 개념 목록) ---------- */
  function renderSidebar() {
    const list = document.getElementById("conceptList");
    const title = document.querySelector(".sidebar-title");
    list.innerHTML = "";
    title.textContent = "개념 목록";

    const 개념들 = 자료.개념[state.단원] || [];
    if (!개념들.length) {
      list.appendChild(el("li", null, "<span style='color:#9aa'>준비 중입니다</span>"));
      return;
    }
    const 준비수 = 개념들.filter((c) => isPrepared(state.단원, c.개념명)).length;
    title.textContent = `개념 목록 · 준비 ${준비수}/${개념들.length}`;

    const 실습목록 = 자료.실습?.[state.단원] || [];
    개념들.forEach((c, i) => {
      const done = isPrepared(state.단원, c.개념명);
      let label = esc(c.개념명);
      if (state.view === "practice") {
        const n = 실습목록.filter((p) => p.개념 === c.개념명).length;
        label += ` <span style='opacity:.55'>(${n})</span>`;
      }
      const li = el("li", (i === state.개념index ? "active" : "") + (done ? " done" : ""));
      const check = el("span", "li-check" + (done ? " on" : ""), done ? "✓" : "○");
      check.title = "수업 준비 완료 표시";
      check.onclick = (e) => { e.stopPropagation(); togglePrepared(state.단원, c.개념명); renderSidebar(); };
      const lab = el("span", "li-label", label);
      li.append(check, lab);
      li.onclick = () => { state.개념index = i; render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
      list.appendChild(li);
    });
  }

  /* ---------- 블록 헬퍼 (접이식) ---------- */
  function block(title, node, collapsed) {
    const c = el("section", "card block");
    const head = el("button", "block-head");
    head.innerHTML = `<span class="block-title">${esc(title)}</span><span class="block-toggle">${collapsed ? "▸" : "▾"}</span>`;
    const bodyWrap = el("div", "block-body");
    bodyWrap.appendChild(node);
    if (collapsed) bodyWrap.style.display = "none";
    head.onclick = () => {
      const hidden = bodyWrap.style.display === "none";
      bodyWrap.style.display = hidden ? "" : "none";
      head.querySelector(".block-toggle").textContent = hidden ? "▾" : "▸";
    };
    c.append(head, bodyWrap);
    return c;
  }
  function listNode(items, cls) {
    const ul = el("ul", "clean " + (cls || ""));
    items.forEach((t) => ul.appendChild(el("li", null, esc(t))));
    return ul;
  }

  /* ---------- 실습 콘텐츠 ---------- */
  function meta(label, val) {
    return `<span class="meta"><b>${esc(label)}</b> ${esc(val)}</span>`;
  }
  function practiceCard(p) {
    const c = el("section", "card practice");
    const 태그 = p.유형 === "추천"
      ? `<span class="pub-tag rec">추천</span>`
      : `<span class="pub-tag">활동</span>`;
    const 출처 = p.유형 === "추천" ? "교사 추천 실습" : "수업 활동 아이디어";
    let html = `<div class="p-top">${태그}<h3>${esc(p.제목)}</h3></div>`;
    html += `<div class="src">🧩 ${출처}</div>`;
    html += `<div class="metas">${meta("도구", p.도구)}${meta("난이도", p.난이도)}${meta("시간", p.시간)}</div>`;
    if (p.요약) html += `<p class="p-sum">${esc(p.요약)}</p>`;
    if (p.추천이유) html += `<div class="tip">⭐ <b>추천 이유</b> · ${esc(p.추천이유)}</div>`;
    if (p.학습목표?.length) html += `<div class="mini-label" style="margin-top:12px">학습 목표</div><ul class="clean">${p.학습목표.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
    if (p.진행요약) html += `<p class="p-sum"><b>진행</b> · ${esc(p.진행요약)}</p>`;
    if (p.발문?.length) html += `<div class="mini-label" style="margin-top:12px">교사 발문</div><ul class="clean">${p.발문.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
    if (p.팁) html += `<div class="tip">💡 <b>수업 활용 팁</b> · ${esc(p.팁)}</div>`;
    if (p.모범답안?.length) {
      html += `<details class="answer"><summary>🔑 교사용 모범답안 (펼치기)</summary>` +
        `<ul class="clean">${p.모범답안.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></details>`;
    }
    c.innerHTML = html;
    return c;
  }

  function renderPractice() {
    const box = document.getElementById("content");
    box.innerHTML = "";
    const 개념들 = 자료.개념[state.단원] || [];
    const 개념 = 개념들[state.개념index];
    const 실습목록 = 자료.실습?.[state.단원] || [];

    if (!개념) { box.appendChild(block("안내", el("p", null, "이 단원의 실습은 아직 준비 중이에요."))); return; }
    box.appendChild(conceptToolbar());

    const 관련 = 실습목록.filter((p) => p.개념 === 개념.개념명);
    const 아이디어 = 관련.filter((p) => p.유형 !== "추천");
    const 추천 = 관련.filter((p) => p.유형 === "추천");

    const head = el("section", "card concept-head");
    head.innerHTML = `<h2>${esc(개념.개념명)} <span style="font-size:15px;color:#9aa;font-weight:500">· 실습</span></h2>` +
      `<p class="oneline">이 개념과 연결된 실습 ${관련.length}개</p>`;
    box.appendChild(head);

    if (!관련.length) {
      box.appendChild(block("안내", el("p", null, "이 개념에 연결된 실습은 아직 없어요. 다른 개념을 선택해 보세요.")));
      return;
    }

    if (아이디어.length) {
      box.appendChild(el("div", "sec-label", "🧩 수업 활동 아이디어"));
      아이디어.forEach((p) => box.appendChild(practiceCard(p)));
    }
    if (추천.length) {
      box.appendChild(el("div", "sec-label", "⭐ 교사 추천 실습 (모범답안 포함)"));
      추천.forEach((p) => box.appendChild(practiceCard(p)));
    }
  }

  /* ---------- 단원 복습·형성평가 문항 시트 ---------- */
  function renderReview() {
    const box = document.getElementById("content");
    box.innerHTML = "";
    const u = 자료.단원목록.find((x) => x.id === state.단원);
    const 개념들 = 자료.개념[state.단원] || [];

    box.appendChild(conceptToolbar());
    const head = el("section", "card concept-head");
    head.innerHTML = `<h2>📝 ${esc(u ? u.이름 : "")} · 복습·형성평가 문항 모음</h2>` +
      `<p class="oneline">개념별 핵심 용어와 확인 질문을 모았어요. 그대로 인쇄해 복습지·형성평가로 쓰세요.</p>`;
    box.appendChild(head);

    // 핵심 용어 정리
    const termCard = el("section", "card");
    termCard.appendChild(el("div", "sec-label", "📚 핵심 용어 정리"));
    const gl = el("div", "glossary");
    let termCnt = 0;
    개념들.forEach((c) => (c.핵심용어 || []).forEach((t) => {
      const row = el("div", "gterm");
      row.innerHTML = `<span class="gword">${esc(t.용어)}</span><span class="gdef">${esc(t.뜻)}</span>`;
      gl.appendChild(row); termCnt++;
    }));
    if (termCnt) { termCard.appendChild(gl); box.appendChild(termCard); }

    // 개념별 확인 질문
    const qCard = el("section", "card");
    qCard.appendChild(el("div", "sec-label", "✅ 개념별 확인 질문"));
    let qAny = false;
    개념들.forEach((c) => {
      if (!(c.확인질문 && c.확인질문.length)) return;
      qAny = true;
      qCard.appendChild(el("div", "review-concept", esc(c.개념명)));
      const ol = el("ol", "review-q");
      c.확인질문.forEach((q) => ol.appendChild(el("li", null, esc(q))));
      qCard.appendChild(ol);
    });
    if (qAny) box.appendChild(qCard);
  }

  /* ---------- 개념 콘텐츠 ---------- */
  function renderContent() {
    if (state.view === "review") { renderReview(); return; }
    if (state.view === "practice") { renderPractice(); return; }
    const box = document.getElementById("content");
    box.innerHTML = "";
    const 개념들 = 자료.개념[state.단원] || [];
    const c = 개념들[state.개념index];
    if (!c) {
      box.appendChild(block("안내", el("p", null, "이 단원은 아직 준비 중이에요. 곧 채워집니다.")));
      return;
    }

    box.appendChild(conceptToolbar());

    // 머리말
    const head = el("section", "card concept-head");
    head.innerHTML = `<h2>${esc(c.개념명)}</h2><p class="oneline">${esc(c.한줄 || "")}</p>`;
    box.appendChild(head);

    // 45분 수업 흐름 (자동 구성) — 내용 있는 개념만
    if (c.통합정의 || c.쉬운설명) {
      box.appendChild(block("📋 45분 수업 흐름 (자동 구성)", lessonFlowNode(c), true));
    }

    // 작성 예정(뼈대) 개념
    if (c.작성예정 || (!c.교과서별정의 && !c.통합정의)) {
      const note = el("section", "card todo");
      note.innerHTML = "✍️ <b>내용 작성 예정</b><br>이 개념은 성취기준 기준으로 뼈대만 잡혀 있어요. 교과서별 정의·예시·오개념 등은 곧 채워집니다.";
      box.appendChild(note);
      return;
    }

    const stage = (t) => box.appendChild(el("div", "stage", esc(t)));

    /* ===== 1) 개념 이해 (교사가 먼저 파악) ===== */
    stage("1. 개념 이해");
    const defWrap = el("div", "two-col");
    if (c.통합정의) {
      const d = el("div", "highlight");
      d.appendChild(el("div", "mini-label", "통합 정의 (교사용)"));
      d.appendChild(el("div", null, esc(c.통합정의)));
      defWrap.appendChild(d);
    }
    if (c.쉬운설명) {
      const d = el("div", "easy");
      d.appendChild(el("div", "mini-label", "중학생용 쉬운 설명"));
      d.appendChild(el("div", null, esc(c.쉬운설명)));
      defWrap.appendChild(d);
    }
    if (defWrap.children.length) box.appendChild(block(`${c.개념명} — 정의`, defWrap));

    if (c.핵심용어?.length) {
      const dl = el("div", "glossary");
      c.핵심용어.forEach((t) => {
        const row = el("div", "gterm");
        row.innerHTML = `<span class="gword">${esc(t.용어)}</span><span class="gdef">${esc(t.뜻)}</span>`;
        dl.appendChild(row);
      });
      box.appendChild(block(`핵심 용어 (${c.핵심용어.length})`, dl));
    }

    if (c.심화?.length) {
      const wrap = el("div", "deepen");
      c.심화.forEach((s) => {
        const sec = el("div", "deep-sec");
        sec.appendChild(el("div", "deep-title", esc(s.소제목)));
        if (s.내용) sec.appendChild(el("p", "deep-body", esc(s.내용)));
        if (s.항목?.length) sec.appendChild(listNode(s.항목));
        wrap.appendChild(sec);
      });
      box.appendChild(block("자세히 알아보기 (교사용 심화)", wrap, true));
    }

    /* ===== 2) 수업 도입·설명 (학생에게 전달) ===== */
    stage("2. 수업 도입·설명");
    if (c.생활예시?.length) box.appendChild(block("생활 속 예시 (동기유발)", listNode(c.생활예시)));

    if (c.비유 || c.수업용설명) {
      const wrap = el("div", null);
      if (c.수업용설명) wrap.appendChild(el("p", null, "🗣️ <b>수업용 한마디</b> · " + esc(c.수업용설명)));
      if (c.비유) wrap.appendChild(el("p", null, "🔑 <b>비유로 설명하기</b> · " + esc(c.비유)));
      box.appendChild(block("이렇게 설명해 보세요", wrap));
    }

    if (c.이미지?.length) {
      const wrap = el("div", "figures");
      c.이미지.forEach((img) => {
        const fig = el("figure", "figure");
        const im = el("img");
        im.src = img.파일; im.alt = img.설명 || ""; im.loading = "lazy";
        fig.appendChild(im);
        if (img.설명) fig.appendChild(el("figcaption", null, esc(img.설명)));
        wrap.appendChild(fig);
      });
      box.appendChild(block("칠판·화면용 그림", wrap));
    }

    /* ===== 3) 지도 유의·정리 ===== */
    stage("3. 지도 유의·정리");
    if (c.지도유의?.length) {
      const wrap = el("div", "guide-tips");
      c.지도유의.forEach((t) => wrap.appendChild(el("div", "guide-tip", "🧭 " + esc(t))));
      box.appendChild(block("지도상 유의점 (지도서 기반)", wrap));
    }
    if (c.오개념?.length) box.appendChild(block("학생들이 자주 헷갈리는 부분 (오개념)", listNode(c.오개념, "misconcept")));
    if (c.확인질문?.length) box.appendChild(block("이해 확인 질문 (마무리)", listNode(c.확인질문)));

    /* ===== 4) 교과서 참고 (여러 출판사 비교) =====
       ⚠️ 저작권상 '교과서별 정의 비교' 섹션은 표시하지 않습니다. */

    // 관련 개념 (클릭하면 해당 개념으로 이동)
    if (c.관련개념?.length) {
      const chips = el("div", "chips");
      c.관련개념.forEach((k) => {
        const chip = el("span", "chip", esc(k));
        const loc = findConceptByName(k);
        if (loc) {
          chip.classList.add("clickable");
          chip.title = "이 개념으로 이동";
          chip.onclick = () => gotoConcept(loc.단원, loc.index, "theory");
        }
        chips.appendChild(chip);
      });
      box.appendChild(block("관련 개념", chips, true));
    }

    // 교사 메모 (자동 저장) — 메모가 있으면 펼친 채로 표시
    const hasMemo = !!getMemo(state.단원, c.개념명);
    box.appendChild(block("✏️ 내 수업 메모 (자동 저장)", memoNode(c), !hasMemo));

    // AI 도우미 (Gemini) — 플로팅 도크에 현재 개념 맥락으로 마운트
    if (typeof window.mountAI === "function") window.mountAI(c);
  }

  function render() { renderUnitNav(); renderViewTabs(); renderSidebar(); renderContent(); syncHash(); }
  function init() {
    setupSearch(); setupKeyboard(); setupPrint(); setupBackup();
    applyHash();
    window.addEventListener("hashchange", () => {
      if (suppressHash) { suppressHash = false; return; }
      if (applyHash()) render();
    });
    render();
  }
  document.addEventListener("DOMContentLoaded", init);
})();
