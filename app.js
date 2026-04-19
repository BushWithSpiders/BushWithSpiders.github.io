const API_BASE = "https://aczcumjsybnvaygppedm.functions.supabase.co/moodapi";
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
  const res = await fetch(`${API_BASE}/${action}`, {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body: JSON.stringify({ cid: cid(), ...body })
  });
  return res.json();
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
    const v = (document.getElementById(`tip_${st}`)?.value || "").trim();
    tips[st] = { advice: v };
  });
  return tips;
}

function fillTips(tips){
  STATES.forEach(st=>{
    const v = tips?.[st]?.advice || "";
    const el = document.getElementById(`tip_${st}`);
    if(el) el.value = v;
  });
}

async function enablePush(){
  setMsg("pushStatus","Запрашиваю уведомления…", true);

  if(!ONESIGNAL_APP_ID || ONESIGNAL_APP_ID.includes("PASTE_")){
    setMsg("pushStatus","Не указан ONESIGNAL_APP_ID в app.js", false);
    return;
  }

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  OneSignalDeferred.push(async function(OneSignal) {
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      notifyButton: { enable: false },
      serviceWorkerPath: "OneSignalSDKWorker.js",
      serviceWorkerUpdaterPath: "OneSignalSDKUpdaterWorker.js",
      serviceWorkerParam: { scope: "/" }
    });

    const perm1 = await OneSignal.Notifications.permission;
    let sid1 = await OneSignal.User.PushSubscription.id;
    setMsg("pushStatus", `permission=${perm1}, subId=${sid1 || "(empty)"}`, perm1 === "granted" && !!sid1);

    if(perm1 !== "granted"){
      await OneSignal.Notifications.requestPermission();
    }

    const perm2 = await OneSignal.Notifications.permission;
    const sid2 = await OneSignal.User.PushSubscription.id;
    setMsg("pushStatus", `after request: permission=${perm2}, subId=${sid2 || "(empty)"}`, perm2 === "granted" && !!sid2);

    if(!sid2) return;

    const r = await api("register", { onesignalId: sid2 });
    setMsg("pushStatus", r.ok ? "Уведомления включены ✅" : (r.error || "Ошибка register"), !!r.ok);
  });
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
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("/sw.js").catch(()=>{});
  }

  renderStates();
  renderTipsInputs();

  $("scale").addEventListener("input", e => $("scaleVal").textContent = e.target.value);

  $("saveName").onclick = async ()=>{
    const name = $("name").value.trim();
    const r = await api("setName", { name });
    setMsg("pairStatus", r.ok ? "Имя сохранено ✅" : (r.error||"Ошибка setName"), !!r.ok);
  };

  $("enablePush").onclick = enablePush;

  $("getCode").onclick = async ()=>{
    const r = await api("getCode", {});
    if(r.ok){
      $("pairCode").value = r.code;
      setMsg("pairStatus", r.paired ? `Ваш код: ${r.code} (вы уже в паре ✅)` : `Ваш код: ${r.code} (отправь партнёру)`, true);
    } else setMsg("pairStatus", r.error||"Ошибка getCode", false);
  };

  $("joinCode").onclick = async ()=>{
    const code = $("pairCode").value.trim().toUpperCase();
    const r = await api("joinCode", { code });
    setMsg("pairStatus", r.ok ? `Связано ✅ Код пары: ${r.code}` : (r.error||"Ошибка joinCode"), !!r.ok);
  };

  $("loadProfile").onclick = async ()=>{
    const r = await api("getProfile", {});
    if(!r.ok) return setMsg("profileStatus", r.error||"Ошибка getProfile", false);
    $("profileComment").value = r.profile.comment || "";
    fillTips(r.profile.tips || {});
    setMsg("profileStatus","Анкета загружена ✅", true);
  };

  $("saveProfile").onclick = async ()=>{
    const comment = $("profileComment").value.trim();
    const tips = collectTips();
    const r = await api("setProfile", { comment, tips });
    setMsg("profileStatus", r.ok ? "Анкета сохранена ✅" : (r.error||"Ошибка setProfile"), !!r.ok);
  };

  $("clearProfile").onclick = async ()=>{
    const r = await api("clearProfile", {});
    if(r.ok){
      $("profileComment").value = "";
      fillTips({});
      setMsg("profileStatus","Анкета удалена ✅", true);
    } else setMsg("profileStatus", r.error||"Ошибка clearProfile", false);
  };

  $("sendMood").onclick = async ()=>{
    if(!selectedState) return setMsg("sendStatus","Выбери состояние", false);

    const okProfile = await requireProfileOrWarn();
    if(!okProfile) return;

    const scale = Number($("scale").value);
    const senderComment = $("senderComment").value.trim();

    const r = await api("sendMood", { state: selectedState, scale, senderComment });
    if(r.ok) setMsg("sendStatus","Отправлено партнёру ✅", true);
    else {
      if(r.error === "profile_required") setMsg("sendStatus","Нужно заполнить анкету (вверху) — без неё отправка запрещена.", false);
      else setMsg("sendStatus", r.error || "Ошибка sendMood", false);
    }
  };

  // ✅ анкета должна подгружаться при входе
  $("loadProfile").click();
}

document.addEventListener("DOMContentLoaded", boot);
