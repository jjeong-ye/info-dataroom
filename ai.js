/* =====================================================================
   AI 도우미 (Google Gemini) — 현재 개념을 맥락으로 질문/생성
   - API 키는 이 브라우저(localStorage)에만 저장됩니다. 서버 전송 없음.
   - 질문 시 개념 내용과 질문이 Google Gemini로 전송됩니다(교사 본인 키 사용).
   ===================================================================== */
(function () {
  "use strict";

  const KEY_STORE = "geminiApiKey";
  const MODEL_STORE = "geminiModel";
  const DEFAULT_MODEL = "gemini-2.5-flash";

  const PRESETS = [
    "이 개념을 중학교 1학년도 이해할 수 있게 더 쉽게 설명해줘.",
    "이 개념으로 45분 수업안을 표로 만들어줘 (도입·전개·정리).",
    "이 개념의 생활 속 예시를 5개 더 만들어줘.",
    "이 개념을 배우는 학생용 활동지를 만들어줘.",
    "컴퓨터 없이 할 수 있는 언플러그드 활동으로 바꿔줘.",
    "이 개념 형성평가 문제 5개와 정답·해설을 만들어줘.",
  ];

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function getKey() { return localStorage.getItem(KEY_STORE) || ""; }
  function getModel() { return localStorage.getItem(MODEL_STORE) || DEFAULT_MODEL; }

  // 개념 객체 → 맥락 텍스트
  function buildContext(c) {
    const L = [];
    L.push(`개념명: ${c.개념명}`);
    if (c.한줄) L.push(`한 줄 요약: ${c.한줄}`);
    if (c.통합정의) L.push(`통합 정의: ${c.통합정의}`);
    if (c.쉬운설명) L.push(`쉬운 설명: ${c.쉬운설명}`);
    if (c.비유) L.push(`비유: ${c.비유}`);
    if (c.핵심용어?.length) L.push("핵심 용어: " + c.핵심용어.map((t) => `${t.용어}(${t.뜻})`).join(", "));
    if (c.생활예시?.length) L.push("생활 예시: " + c.생활예시.join(", "));
    if (c.오개념?.length) L.push("학생 오개념: " + c.오개념.join(" / "));
    return L.join("\n");
  }

  // 단원 전체 맥락 (개념 요약 + 실습 목록)
  function buildUnitContext(unitId) {
    if (typeof 자료 === "undefined") return "";
    const unit = (자료.단원목록 || []).find((u) => u.id === unitId) || {};
    const cs = 자료.개념?.[unitId] || [];
    const L = [`단원: ${unit.이름 || unitId}`, "", "[개념 목록]"];
    cs.forEach((c) => {
      L.push(`- ${c.개념명}: ${c.작성예정 ? (c.한줄 || "") : (c.통합정의 || c.한줄 || "")}`);
    });
    const ps = 자료.실습?.[unitId] || [];
    if (ps.length) {
      L.push("", "[실습 목록]");
      ps.forEach((p) => {
        const src = p.유형 === "추천" ? "추천" : (p.출판사 || "") + (p.페이지 ? " " + p.페이지 : "");
        L.push(`- [${p.개념}] ${p.제목} (${src}${p.도구 ? ", " + p.도구 : ""})`);
      });
    }
    return L.join("\n");
  }

  // 전체 단원 맥락 (모든 단원의 개념 요약 — 단원 간 연결용)
  function buildAllContext() {
    if (typeof 자료 === "undefined") return "";
    const L = ["전체 단원 개념 지도 (단원 간 연결에 활용)"];
    (자료.단원목록 || []).forEach((u) => {
      const cs = 자료.개념?.[u.id] || [];
      L.push("", `[${u.로마자 || ""} ${u.이름}]`);
      cs.forEach((c) => {
        L.push(`- ${c.개념명}: ${c.작성예정 ? (c.한줄 || "") : (c.통합정의 || c.한줄 || "")}`);
      });
    });
    return L.join("\n");
  }

  async function callGemini(promptText) {
    const key = getKey();
    const model = getModel();
    // 키는 URL(주소)이 아니라 헤더(x-goog-api-key)로 전송 — 방문기록/로그 노출 최소화
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] }),
    });
    if (!res.ok) {
      let msg = `요청 실패 (HTTP ${res.status})`;
      try { const e = await res.json(); if (e.error?.message) msg += `: ${e.error.message}`; } catch (_) {}
      throw new Error(msg);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
    if (!text) throw new Error("응답이 비어 있어요. 모델 이름이나 키를 확인해 주세요.");
    return text;
  }

  // 아주 단순한 마크다운 → HTML (제목·굵게·목록·표 일부)
  function mdToHtml(md) {
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    let h = esc(md);
    h = h.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    h = h.replace(/^### (.+)$/gm, "<h4>$1</h4>");
    h = h.replace(/^## (.+)$/gm, "<h3>$1</h3>");
    h = h.replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>");
    h = h.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>");
    h = h.replace(/\n{2,}/g, "<br><br>").replace(/\n/g, "<br>");
    return h;
  }

  function renderKeySetup(host, onDone) {
    host.innerHTML = "";
    host.appendChild(el("p", "ai-note", "Gemini API 키를 입력하면 이 개념을 바탕으로 질문할 수 있어요. 키는 <b>이 브라우저에만</b> 저장되고 외부로 보내지 않아요. (질문 시에는 개념 내용과 질문이 Google로 전송됩니다.)"));
    const row = el("div", "ai-keyrow");
    const input = el("input", "ai-key");
    input.type = "password";
    input.placeholder = "Gemini API 키 붙여넣기";
    input.value = getKey();
    const model = el("input", "ai-model");
    model.type = "text";
    model.placeholder = "모델(기본: " + DEFAULT_MODEL + ")";
    model.value = getModel();
    const save = el("button", "ai-btn", "저장");
    save.onclick = () => {
      localStorage.setItem(KEY_STORE, input.value.trim());
      localStorage.setItem(MODEL_STORE, (model.value.trim() || DEFAULT_MODEL));
      onDone();
    };
    row.append(input, model, save);
    host.appendChild(row);
    host.appendChild(el("p", "ai-hint", "키 발급: Google AI Studio(aistudio.google.com) → API key. 모델은 gemini-2.5-flash / gemini-2.0-flash 등."));
  }

  // 개념 c에 대한 AI 상호작용 본문 DOM 반환
  function buildAIBody(c, unitId) {
    const body = el("div", "ai-body");
    let scope = "concept"; // concept | unit

    function renderMain() {
      body.innerHTML = "";
      const bar = el("div", "ai-topbar");
      bar.appendChild(el("span", "ai-ok", "✅ 키 설정됨 · " + getModel()));
      const btns = el("span", "ai-topbtns");
      const chg = el("button", "ai-link", "키 변경");
      chg.onclick = () => renderKeySetup(body, renderMain);
      const del = el("button", "ai-link ai-danger", "키 삭제");
      del.onclick = () => {
        if (!confirm("이 브라우저에 저장된 Gemini API 키를 삭제할까요?")) return;
        localStorage.removeItem(KEY_STORE);
        localStorage.removeItem(MODEL_STORE);
        renderKeySetup(body, renderMain);
      };
      btns.append(chg, del);
      bar.appendChild(btns);
      body.appendChild(bar);

      // 맥락 범위 선택
      const scopeWrap = el("div", "ai-scope");
      scopeWrap.appendChild(el("span", "ai-scope-label", "맥락"));
      const mkScope = (val, label) => {
        const b = el("button", "ai-scope-btn" + (scope === val ? " on" : ""), label);
        b.onclick = () => { scope = val; [...scopeWrap.querySelectorAll(".ai-scope-btn")].forEach((x) => x.classList.remove("on")); b.classList.add("on"); };
        return b;
      };
      scopeWrap.appendChild(mkScope("concept", "이 개념"));
      scopeWrap.appendChild(mkScope("unit", "이 단원"));
      scopeWrap.appendChild(mkScope("all", "전체 단원"));
      body.appendChild(scopeWrap);

      const presetWrap = el("div", "ai-presets");
      PRESETS.forEach((p) => {
        const b = el("button", "ai-chip", p.length > 20 ? p.slice(0, 20) + "…" : p);
        b.title = p;
        b.onclick = () => { ta.value = p; ta.focus(); };
        presetWrap.appendChild(b);
      });
      body.appendChild(presetWrap);

      const ta = el("textarea", "ai-input");
      ta.placeholder = "예: 이 개념으로 모둠 활동 아이디어 3개 만들어줘";
      body.appendChild(ta);

      const ask = el("button", "ai-btn", "질문하기");
      body.appendChild(ask);

      const out = el("div", "ai-out");
      body.appendChild(out);

      ask.onclick = async () => {
        const q = ta.value.trim();
        if (!q) { out.innerHTML = "<span class='ai-err'>질문을 입력하거나 위 버튼을 눌러 주세요.</span>"; return; }
        out.innerHTML = "<span class='ai-loading'>생각 중…</span>";
        ask.disabled = true;
        let ctx, ctxLabel;
        if (scope === "all") { ctx = buildAllContext(); ctxLabel = "전체 단원 자료"; }
        else if (scope === "unit") { ctx = buildUnitContext(unitId); ctxLabel = "단원 자료"; }
        else { ctx = buildContext(c); ctxLabel = "개념 자료"; }
        const prompt =
          "당신은 대한민국 중학교 정보 교사의 수업 준비를 돕는 조교입니다. " +
          "아래 자료를 참고해, 중학교 수업에 바로 쓸 수 있도록 한국어로 구체적이고 실용적으로 답하세요.\n\n" +
          "[" + ctxLabel + "]\n" + ctx + "\n\n[교사의 요청]\n" + q;
        try {
          const ans = await callGemini(prompt);
          out.innerHTML = "";
          const actions = el("div", "ai-actions");
          const copy = el("button", "ai-link", "📋 답변 복사");
          copy.onclick = () => {
            navigator.clipboard.writeText(ans).then(() => {
              copy.textContent = "✅ 복사됨";
              setTimeout(() => (copy.textContent = "📋 답변 복사"), 1500);
            });
          };
          actions.appendChild(copy);
          out.appendChild(actions);
          out.appendChild(el("div", "ai-answer", mdToHtml(ans)));
        } catch (e) {
          out.innerHTML = "<span class='ai-err'>" + (e.message || "오류가 발생했어요.") + "</span>";
        } finally {
          ask.disabled = false;
        }
      };
    }

    if (getKey()) renderMain();
    else renderKeySetup(body, renderMain);
    return body;
  }

  // 플로팅 도크에 현재 개념 기준으로 마운트
  window.mountAI = function (c) {
    const dock = document.getElementById("aiDock");
    if (!dock) return;
    dock.innerHTML = "";
    const head = el("div", "ai-dock-head");
    head.appendChild(el("span", "ai-dock-title", "🤖 AI 도우미 · " + c.개념명));
    const close = el("button", "ai-dock-close", "✕");
    close.onclick = () => { dock.hidden = true; };
    head.appendChild(close);
    dock.appendChild(head);
    dock.appendChild(buildAIBody(c));
  };

  // 플로팅 버튼 토글
  document.addEventListener("DOMContentLoaded", () => {
    const fab = document.getElementById("aiFab");
    const dock = document.getElementById("aiDock");
    if (fab && dock) fab.onclick = () => { dock.hidden = !dock.hidden; };
  });
})();
