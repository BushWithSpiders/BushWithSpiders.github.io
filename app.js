(() => {
  const box = document.getElementById("jsAlive");
  if (box) { box.textContent = "JS загрузился ✅"; box.className = "small ok"; }
  window.addEventListener("error", (e) => {
    const b = document.getElementById("jsAlive");
    if (b) { b.textContent = "JS ERROR: " + e.message; b.className = "small err"; }
  });
  window.addEventListener("unhandledrejection", (e) => {
    const b = document.getElementById("jsAlive");
    if (b) { b.textContent = "JS REJECTION: " + String(e.reason); b.className = "small err"; }
  });
})();

const API_BASE = "https://aczcumjsybnvaygppedm.supabase.co/functions/v1/moodapi";
const ONESIGNAL_APP_ID = "cdb677ec-6732-47d8-9452-483603d3264e";
const STATES = ["тревога","грусть","злость","недовольство","страх","спокойствие","радость","стыд","нейтрально","никак"];

function $(id){ return document.getElementById(id); }
function setMsg(id, text, ok=true){
  const el = $(id);
  if(!el) return;
  el.textContent = text;
  el.className = "small " + (ok ? "ok" : "err");
}
function uuid(){
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c=>{
    const r = Math.random()*16|0, v = c==="x"?r:(r&0x3|0x8);
    return v.toString(16);
  });
}
function cid(){
  let v = localStorage.getItem("cid");
  if(!v){ v = uuid(); localStorage.setItem("cid", v); }
  return v;
}
const LS_NAME_KEY = "moodforus_name";
function loadLocalName(){ return localStorage.getItem(LS_NAME_KEY) || ""; }
function saveLocalName(name){ localStorage.setItem(LS_NAME_KEY, name); }

async function api(action, body){
  const res = await fetch(`${API_BASE}/${action}`, {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body: JSON.stringify({ cid: cid(), ...body })
  });
  const text = await res.text();
  let data=null; try{ data = text ? JSON.parse(text) : null; }catch{ data=null; }
  return data || { ok:false, error:"non_json", raw:text?.slice(0,800) };
}

function makeBtn(text){
  const b = document.createElement("button");
  b.className = "btn pill";
  b.textContent = text;
  return b;
}

let selectedState = null;

function renderStates(){
  const box = $("states");
  if(!box) return;
  box.innerHTML = "";
  STATES.forEach(s=>{
    const b = makeBtn(s);
    b.onclick = ()=>{
      selectedState = s;
      [...box.querySelectorAll(".btn")].forEach(x=>x.classList.remove("selected"));
      b.classList.add("selected");
      setMsg("sendStatus", `Выбрано: ${s}`, true);
    };
    box.appendChild(b);
  });
}

function renderTipsInputs(){
  const tipsBox = $("tipsBox");
  if(!tipsBox) return;
  tipsBox.innerHTML = "";
  STATES.forEach(st=>{
    const wrap = document.createElement("div");
    wrap.className="card";
    wrap.style.margin="10px 0";
    wrap.style.background="#121217";
    wrap.style.borderColor="#2a2a31";
    const title = document.createElement("div");
    title.style.color="#b7b7bd";
    title.style.fontSize="13px";
    title.textContent=`Подсказка для состояния: ${st}`;
    wrap.appendChild(title);
    const ta = document.createElement("textarea");
    ta.rows=2; ta.id=`tip_${st}`;
    wrap.appendChild(ta);
    tipsBox.appendChild(wrap);
  });
}
function collectTips(){
  const tips = {};
  STATES.forEach(st=>{
    const el = document.getElementById(`tip_${st}`);
    tips[st] = { advice: (el?.value || "").trim() };
  });
  return tips;
}
function fillTips(tips){
  STATES.forEach(st=>{
    const el = document.getElementById(`tip_${st}`);
    if (el) el.value = tips?.[st]?.advice || "";
  });
}

function selectTab(tab){
  const meBtn=$("tabMeBtn"), pBtn=$("tabPartnerBtn");
  const me=$("tabMe"), p=$("tabPartner");
  if(tab==="partner"){
    meBtn.classList.remove("selected"); pBtn.classList.add("selected");
    me.classList.add("hidden"); p.classList.remove("hidden");
  }else{
    pBtn.classList.remove("selected"); meBtn.classList.add("selected");
    p.classList.add("hidden"); me.classList.remove("hidden");
  }
}

function formatTime(iso){
  try{ return new Date(iso).toLocaleString(); }catch{ return iso; }
}

// OneSignal init once
let __osInitPromise=null;
function oneSignalInitOnce(){
  if(__osInitPromise) return __osInitPromise;
  __osInitPromise = new Promise((resolve,reject)=>{
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function(OneSignal){
      try{
        if(OneSignal?.__isInitialized){ resolve(OneSignal); return; }
        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          notifyButton:{ enable:false },
          serviceWorkerPath:"OneSignalSDKWorker.js",
          serviceWorkerUpdaterPath:"OneSignalSDKUpdaterWorker.js",
          serviceWorkerParam:{ scope:"/" }
        });
        OneSignal.__isInitialized=true;
        resolve(OneSignal);
      }catch(e){ reject(e); }
    });
  });
  return __osInitPromise;
}

async function enablePush(){
  try{
    setMsg("pushStatus","1) init…", true);
    const OneSignal = await oneSignalInitOnce();
    setMsg("pushStatus","2) checking permission…", true);
    const perm1 = await OneSignal.Notifications.permission;
    const sid1  = await OneSignal.User.PushSubscription.id;
    setMsg("pushStatus", `permission=${perm1}, subId=${sid1||"(empty)"}`, perm1==="granted" && !!sid1);
    if(perm1!=="granted"){
      setMsg("pushStatus","3) requesting permission…", true);
      await OneSignal.Notifications.requestPermission();
    }
    const perm2 = await OneSignal.Notifications.permission;
    const sid2  = await OneSignal.User.PushSubscription.id;
    setMsg("pushStatus", `4) permission=${perm2}, subId=${sid2||"(empty)"}`, perm2==="granted" && !!sid2);
    if(!sid2) return;
    const r = await api("register", { onesignalId: sid2 });
    setMsg("pushStatus", r.ok ? "Уведомления включены ✅" : (r.error||"register error"), !!r.ok);
  }catch(e){
    setMsg("pushStatus","OneSignal error: "+String(e), false);
  }
}

async function refreshStatus(){
  const r = await api("status", {});
  if(!r.ok) return setMsg("pairStatus", (r.error||"status error") + (r.details?("\n"+r.details):""), false);
  const lines=[];
  lines.push(`Имя: ${r.name||"—"}`);
  lines.push(`Пуши на этом устройстве: ${r.push_enabled?"✅":"❌"}`);
  lines.push(`Связь: ${r.paired?"✅":"❌"}`);
  lines.push(`Код пары: ${r.code||"—"}`);
  if(r.paired){
    lines.push(`Партнёр: ${r.partner_name||"—"}`);
    lines.push(`Пуши у партнёра: ${r.partner_push_enabled?"✅":"❌"}`);
  }
  setMsg("pairStatus", lines.join("\n"), true);
  return r;
}

async function loadPartnerLatest(){
  const r = await api("latest", {});
  if(!r.ok) return setMsg("partnerCard", (r.error||"latest error"), false);
  const item = r.item;
  if(!item){
    $("partnerCard").textContent = "Пока нет сообщений от партнёра.";
    $("partnerCard").className = "small";
    return;
  }
  const text =
`От: ${item.sender_name || "Партнёр"}  •  ${formatTime(item.created_at)}
Состояние: ${item.state}  •  ${item.scale}/10 (${item.severity})

Совет по анкете:
${item.advice || "—"}

Что нужно:
${item.profile_comment || "—"}${item.report_comment ? `\n\nКомментарий:\n${item.report_comment}` : ""}`;
  const el = $("partnerCard");
  el.textContent = text;
  el.className = "small";
}

let histFilter="all";
function setHistFilter(f){
  histFilter=f;
  ["histAll","histMe","histPartner"].forEach(id=>$(id).classList.remove("selected"));
  if(f==="all") $("histAll").classList.add("selected");
  if(f==="me") $("histMe").classList.add("selected");
  if(f==="partner") $("histPartner").classList.add("selected");
}

async function loadHistory(){
  const r = await api("history", { limit: 50, filter: histFilter });
  if(!r.ok) return setMsg("historyStatus", (r.error||"history error"), false);
  const list = $("historyList");
  list.innerHTML = "";
  (r.items||[]).forEach(it=>{
    const div=document.createElement("div");
    div.className="historyItem";
    div.innerHTML =
      `<div class="small"><b>${it.sender_name || "—"}</b> • ${formatTime(it.created_at)}</div>`+
      `<div style="margin-top:6px"><b>${it.state}</b> • ${it.scale}/10 (${it.severity||""})</div>`+
      `<div class="small" style="margin-top:6px"><b>Совет:</b> ${it.advice||"—"}</div>`;
    list.appendChild(div);
  });
  setMsg("historyStatus", `Показано: ${(r.items||[]).length}`, true);
}

async function boot(){
  // tabs
  $("tabMeBtn").onclick = ()=>selectTab("me");
  $("tabPartnerBtn").onclick = async ()=>{ selectTab("partner"); await loadPartnerLatest(); await loadHistory(); };

  // deep link from push
  const params = new URLSearchParams(location.search);
  if(params.get("tab")==="partner") selectTab("partner");

  // restore name
  const nameEl = $("name");
  if(nameEl) nameEl.value = loadLocalName();

  renderStates();
  renderTipsInputs();

  $("scale").addEventListener("input", (e)=>{ $("scaleVal").textContent = e.target.value; });

  $("saveName").onclick = async ()=>{
    const name = ($("name").value||"").trim();
    if(!name) return setMsg("pairStatus","Имя пустое", false);
    saveLocalName(name);
    const r = await api("setName", { name });
    setMsg("pairStatus", r.ok ? "Имя сохранено ✅" : (r.error||"setName error"), !!r.ok);
    await refreshStatus();
  };

  $("enablePush").onclick = async ()=>{ await enablePush(); await refreshStatus(); };

  $("loadProfile").onclick = async ()=>{
    const r = await api("getProfile", {});
    if(!r.ok) return setMsg("profileStatus",(r.error||"getProfile error"), false);
    $("profileComment").value = r.profile.comment || "";
    fillTips(r.profile.tips || {});
    setMsg("profileStatus","Анкета загружена ✅", true);
  };
  $("saveProfile").onclick = async ()=>{
    const comment = ($("profileComment").value||"").trim();
    const tips = collectTips();
    const r = await api("setProfile", { comment, tips });
    setMsg("profileStatus", r.ok ? "Анкета сохранена ✅" : (r.error||"setProfile error"), !!r.ok);
  };
  $("clearProfile").onclick = async ()=>{
    const r = await api("clearProfile", {});
    if(r.ok){
      $("profileComment").value=""; fillTips({});
      setMsg("profileStatus","Анкета удалена ✅", true);
    } else setMsg("profileStatus",(r.error||"clearProfile error"), false);
  };

  $("refreshStatus").onclick = refreshStatus;
  $("getCode").onclick = async ()=>{
    const r = await api("getCode", {});
    if(r.ok){ $("pairCode").value=r.code; setMsg("pairStatus",`Ваш код: ${r.code}`, true); }
    else setMsg("pairStatus",(r.error||"getCode error"), false);
    await refreshStatus();
  };
  $("newCode").onclick = async ()=>{
    const r = await api("newCode", {});
    if(r.ok){ $("pairCode").value=r.code; setMsg("pairStatus",`Новый код: ${r.code}\nПартнёру нужно подключиться заново.`, true); }
    else setMsg("pairStatus",(r.error||"newCode error"), false);
    await refreshStatus();
  };
  $("unlink").onclick = async ()=>{
    const r = await api("unlink", {});
    setMsg("pairStatus", r.ok ? "Связь сброшена ✅" : (r.error||"unlink error"), !!r.ok);
    await refreshStatus();
  };
  $("joinCode").onclick = async ()=>{
    const code = ($("pairCode").value||"").trim().toUpperCase();
    const r = await api("joinCode", { code });
    setMsg("pairStatus", r.ok ? `Связано ✅ ${r.code}` : (r.error||"joinCode error"), !!r.ok);
    await refreshStatus();
  };

  $("sendMood").onclick = async ()=>{
    if(!selectedState) return setMsg("sendStatus","Выбери состояние", false);

    const st = await api("status", {});
    if(st.ok){
      if(!st.paired) return setMsg("sendStatus","Вы не в паре. Свяжитесь по коду.", false);
      if(!st.partner_push_enabled) return setMsg("sendStatus","У партнёра не включены уведомления.", false);
    }

    const scale = Number($("scale").value);
    const senderComment = ($("senderComment").value||"").trim();
    const r = await api("sendMood", { state: selectedState, scale, senderComment });
    setMsg("sendStatus", r.ok ? "Отправлено ✅" : (r.error||"sendMood error"), !!r.ok);
  };

  // partner tab controls
  $("refreshPartner").onclick = async ()=>{ await loadPartnerLatest(); };
  $("openAllHistory").onclick = async ()=>{ await loadHistory(); };

  $("histAll").onclick = async ()=>{ setHistFilter("all"); await loadHistory(); };
  $("histMe").onclick = async ()=>{ setHistFilter("me"); await loadHistory(); };
  $("histPartner").onclick = async ()=>{ setHistFilter("partner"); await loadHistory(); };

  // initial loads
  $("loadProfile").click();
  await refreshStatus();

  if(params.get("tab")==="partner"){
    await loadPartnerLatest();
    await loadHistory();
  }
}

document.addEventListener("DOMContentLoaded", boot);
