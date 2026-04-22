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

async function api(action, body){
  try {
    const res = await fetch(`${API_BASE}/${action}`, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify({ cid: cid(), ...body })
    });

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (data && typeof data === "object") return data;

    return { ok:false, error:"non_json_response", status:res.status, raw:(text||"").slice(0,800) };
  } catch (e) {
    return { ok:false, error:"fetch_failed", details:String(e) };
  }
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
    wrap.className = "card";
    wrap.style.margin = "10px 0";
    wrap.style.background = "#121217";
    wrap.style.borderColor = "#2a2a31";

    const title = document.createElement("div");
    title.style.color = "#b7b7bd";
    title.style.fontSize = "13px";
    title.textContent = `Подсказка для состояния: ${st}`;
    wrap.appendChild(title);

    const ta = document.createElement("textarea");
    ta.rows = 2;
    ta.id = `tip_${st}`;
    ta.placeholder = "Например: говори спокойно, предложи подышать 4/6, спроси можно ли обнять";
    wrap.appendChild(ta);

    tipsBox.appendChild(wrap);
  });
}

function collectTips(){
  const tips = {};
  STATES.forEach(st=>{
    const el = document.getElementById(`tip_${st}`);
    const v = (el?.value || "").trim();
    tips[st] = { advice: v };
  });
  return tips;
}

function fillTips(tips){
  STATES.forEach(st=>{
    const el = document.getElementById(`tip_${st}`);
    if (el) el.value = tips?.[st]?.advice || "";
  });
}

function safeOnClick(id, fn){
  const el = $(id);
  if (el) el.onclick = fn;
}

/* ---- OneSignal init once ---- */
let __osInitPromise = null;
function oneSignalInitOnce(){
  if (__osInitPromise) return __osInitPromise;

  __osInitPromise = new Promise((resolve, reject) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function(OneSignal) {
      try{
        if (OneSignal?.__isInitialized) { resolve(OneSignal); return; }

        await OneSignal.init({
          appId: ONESIGNAL_APP_ID,
          notifyButton: { enable: false },
          serviceWorkerPath: "OneSignalSDKWorker.js",
          serviceWorkerUpdaterPath: "OneSignalSDKUpdaterWorker.js",
          serviceWorkerParam: { scope: "/" }
        });

        OneSignal.__isInitialized = true;
        resolve(OneSignal);
      }catch(e){
        reject(e);
      }
    });
  });

  return __osInitPromise;
}

async function enablePush(){
  try{
    setMsg("pushStatus","1) initOnce…", true);

    const OneSignal = await oneSignalInitOnce();
    setMsg("pushStatus","2) init OK, checking permission…", true);

    const perm1 = await OneSignal.Notifications.permission;
    const sid1 = await OneSignal.User.PushSubscription.id;
    setMsg("pushStatus", `permission=${perm1}, subId=${sid1 || "(empty)"}`, perm1 === "granted" && !!sid1);

    if(perm1 !== "granted"){
      setMsg("pushStatus","3) requesting permission…", true);
      await OneSignal.Notifications.requestPermission();
    }

    const perm2 = await OneSignal.Notifications.permission;
    const sid2 = await OneSignal.User.PushSubscription.id;
    setMsg("pushStatus", `4) permission=${perm2}, subId=${sid2 || "(empty)"}`, perm2 === "granted" && !!sid2);

    if(!sid2) return;

    const r = await api("register", { onesignalId: sid2 });
    if (r.ok) setMsg("pushStatus","Уведомления включены ✅", true);
    else setMsg("pushStatus",(r.error||"register error") + (r.details?("\n"+r.details):"") + (r.raw?("\nRAW: "+r.raw):""), false);

  }catch(e){
    setMsg("pushStatus","OneSignal error: " + String(e), false);
  }
}

async function requireProfileOrWarn(){
  const r = await api("getProfile", {});
  if(!r.ok) return false;

  const prof = r.profile || null;
  const tipsEmpty = !prof?.tips || JSON.stringify(prof.tips) === "{}";
  const commentEmpty = !prof?.comment;

  if(!prof || (tipsEmpty && commentEmpty)){
    setMsg("sendStatus","Сначала заполни анкету (вверху) и сохрани. Без анкеты отправка заблокирована.", false);
    return false;
  }
  return true;
}

async function boot(){
  setMsg("sendStatus","Готово. Выбери состояние и отправь.", true);

  renderStates();
  renderTipsInputs();

  const scaleEl = $("scale");
  if (scaleEl) {
    scaleEl.addEventListener("input", (e) => {
      const sv = $("scaleVal");
      if (sv) sv.textContent = e.target.value;
    });
  }

  safeOnClick("saveName", async ()=>{
    const name = ($("name")?.value || "").trim();
    const r = await api("setName", { name });
    setMsg("pairStatus", r.ok ? "Имя сохранено ✅" : (r.error||"Ошибка setName"), !!r.ok);
  });

  safeOnClick("enablePush", enablePush);

  // CODE MANAGEMENT
  safeOnClick("getCode", async ()=>{
    const r = await api("getCode", {});
    if(r.ok){
      $("pairCode").value = r.code;
      setMsg("pairStatus", r.paired ? `Ваш код: ${r.code} (вы уже в паре ✅)` : `Ваш код: ${r.code} (отправь партнёру)`, true);
    } else setMsg("pairStatus", (r.error||"Ошибка getCode") + (r.details?("\n"+r.details):"") + (r.raw?("\nRAW: "+r.raw):""), false);
  });

  safeOnClick("newCode", async ()=>{
    const r = await api("newCode", {});
    if(r.ok){
      $("pairCode").value = r.code;
      setMsg("pairStatus", `Новый код создан: ${r.code}\nПартнёру нужно подключиться заново.`, true);
    } else setMsg("pairStatus", (r.error||"Ошибка newCode") + (r.details?("\n"+r.details):"") + (r.raw?("\nRAW: "+r.raw):""), false);
  });

  safeOnClick("unlink", async ()=>{
    const r = await api("unlink", {});
    if(r.ok){
      setMsg("pairStatus", r.unlinked ? "Связь удалена ✅ Теперь создай новый код." : "Связи не было (ok).", true);
    } else setMsg("pairStatus", (r.error||"Ошибка unlink") + (r.details?("\n"+r.details):"") + (r.raw?("\nRAW: "+r.raw):""), false);
  });

  safeOnClick("joinCode", async ()=>{
    const code = ($("pairCode")?.value || "").trim().toUpperCase();
    const r = await api("joinCode", { code });
    setMsg("pairStatus", r.ok ? `Связано ✅ Код пары: ${r.code}` : (r.error||"Ошибка joinCode"), !!r.ok);
  });

  // PROFILE
  safeOnClick("loadProfile", async ()=>{
    const r = await api("getProfile", {});
    if(!r.ok) return setMsg("profileStatus", (r.error||"Ошибка getProfile") + (r.details?("\n"+r.details):"") + (r.raw?("\nRAW: "+r.raw):""), false);
    $("profileComment").value = r.profile.comment || "";
    fillTips(r.profile.tips || {});
    setMsg("profileStatus","Анкета загружена ✅", true);
  });

  safeOnClick("saveProfile", async ()=>{
    const comment = ($("profileComment")?.value || "").trim();
    const tips = collectTips();
    const r = await api("setProfile", { comment, tips });
    if (r.ok) setMsg("profileStatus","Анкета сохранена ✅", true);
    else setMsg("profileStatus",(r.error||"Ошибка setProfile") + (r.details?("\n"+r.details):"") + (r.raw?("\nRAW: "+r.raw):""), false);
  });

  safeOnClick("clearProfile", async ()=>{
    const r = await api("clearProfile", {});
    if(r.ok){
      $("profileComment").value = "";
      fillTips({});
      setMsg("profileStatus","Анкета удалена ✅", true);
    } else setMsg("profileStatus", (r.error||"Ошибка clearProfile") + (r.details?("\n"+r.details):"") + (r.raw?("\nRAW: "+r.raw):""), false);
  });

  // SEND MOOD
  safeOnClick("sendMood", async ()=>{
    if(!selectedState) return setMsg("sendStatus","Выбери состояние", false);

    const okProfile = await requireProfileOrWarn();
    if(!okProfile) return;

    const scale = Number($("scale")?.value || 5);
    const senderComment = ($("senderComment")?.value || "").trim();

    const r = await api("sendMood", { state: selectedState, scale, senderComment });
    if(r.ok) setMsg("sendStatus","Отправлено партнёру ✅", true);
    else setMsg("sendStatus", (r.error||"Ошибка sendMood") + (r.details?("\n"+r.details):"") + (r.raw?("\nRAW: "+r.raw):""), false);
  });

  // auto-load profile
  const lp = $("loadProfile");
  if (lp) lp.click();
}

document.addEventListener("DOMContentLoaded", boot);
