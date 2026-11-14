/**
 * HUD stylesheet, injected once by createHud() so the HUD also works in the
 * dev harness page. Everything is authored in WORLD pixels (1600×900) inside
 * .ss-frame, which is scaled to the same letterbox as the renderer.
 */
export const HUD_CSS = /* css */ `
.ss-frame { position:absolute; left:0; top:0; width:1600px; height:900px; transform-origin:0 0;
  pointer-events:none; color:#e8f1ff; user-select:none;
  font-family:"Arial Black","Segoe UI Black","Helvetica Neue",Impact,system-ui,sans-serif; font-weight:900; }
.ss-frame * { box-sizing:border-box; }
.ss-out { -webkit-text-stroke:4px #05060d; paint-order:stroke fill; }

/* ---------------- top bar ---------------- */
.ss-top { position:absolute; top:14px; left:26px; right:26px; height:110px; display:flex; align-items:flex-start; justify-content:space-between; }
.ss-panel { width:640px; display:flex; flex-direction:column; gap:7px; }
.ss-panel.p2 { align-items:flex-end; }
.ss-namerow { display:flex; align-items:center; gap:14px; height:30px; }
.ss-panel.p2 .ss-namerow { flex-direction:row-reverse; }
.ss-tag { font-size:15px; padding:2px 7px; border-radius:3px; background:rgba(255,255,255,.12); color:#cfe3ff; letter-spacing:1px; }
.ss-name { font-size:27px; font-style:italic; letter-spacing:1px; text-shadow:0 0 12px currentColor; -webkit-text-stroke:3px #05060d; paint-order:stroke fill; }
.ss-pips { display:flex; gap:7px; }
.ss-pip { width:16px; height:16px; border-radius:50%; border:2px solid rgba(255,255,255,.45); background:rgba(0,0,0,.4); }
.ss-pip.on { background:#fff; border-color:#fff; box-shadow:0 0 10px 2px var(--hc); }

.ss-bar { position:relative; width:640px; height:28px; transform:skewX(-16deg); background:rgba(8,10,22,.82);
  border:2px solid rgba(255,255,255,.28); border-radius:3px; overflow:hidden; box-shadow:0 0 18px rgba(0,0,0,.6); }
.ss-panel.p2 .ss-bar { transform:skewX(16deg) scaleX(-1); }
.ss-bar > div { position:absolute; inset:0; transform-origin:0 50%; }
.ss-chip { background:#fff; opacity:.92; }
.ss-fill { background:linear-gradient(180deg, color-mix(in srgb, var(--hc) 55%, #fff) 0%, var(--hc) 45%, color-mix(in srgb, var(--hc) 70%, #000) 100%);
  box-shadow:0 0 14px var(--hc) inset; }
.ss-bar .ss-shine { background:linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,0) 45%); }
.ss-panel.low .ss-fill { animation:ss-low .5s ease-in-out infinite alternate; }
@keyframes ss-low { from { filter:none; } to { filter:brightness(1.6) saturate(1.5) hue-rotate(-20deg); } }
.ss-panel.hurt { animation:ss-shake .28s linear; }
.ss-panel.hurt .ss-bar { border-color:#fff; }
@keyframes ss-shake { 0%{transform:translate(0,0)} 20%{transform:translate(-7px,3px)} 40%{transform:translate(6px,-3px)}
  60%{transform:translate(-4px,2px)} 80%{transform:translate(3px,-1px)} 100%{transform:translate(0,0)} }

.ss-aurarow { display:flex; gap:8px; align-items:center; height:18px; }
.ss-panel.p2 .ss-aurarow { flex-direction:row-reverse; }
.ss-aura { position:relative; width:92px; height:14px; transform:skewX(-16deg); background:rgba(8,10,22,.82);
  border:2px solid rgba(255,255,255,.22); border-radius:2px; overflow:hidden; }
.ss-panel.p2 .ss-aura { transform:skewX(16deg) scaleX(-1); }
.ss-aura > i { position:absolute; inset:0; transform-origin:0 50%; background:linear-gradient(90deg, #6f7bff, #b5f2ff); }
.ss-aura.full { border-color:#fff; box-shadow:0 0 12px 2px #9fe8ff; }
.ss-aura.full > i { background:linear-gradient(90deg, #c3f4ff, #fff); animation:ss-aura 0.9s ease-in-out infinite alternate; }
@keyframes ss-aura { from { filter:brightness(1); } to { filter:brightness(1.35); } }
.ss-aura.gain { animation:ss-gain .45s ease-out; }
@keyframes ss-gain { 0%{box-shadow:0 0 0 0 #fff} 30%{box-shadow:0 0 22px 8px #fff} 100%{box-shadow:0 0 12px 2px #9fe8ff} }
.ss-aura > b.ss-notch { position:absolute; top:-2px; bottom:-2px; width:2px; margin-left:-1px; background:rgba(255,255,255,.55);
  box-shadow:0 0 3px #000; }
.ss-phase { font-size:14px; letter-spacing:2px; padding:1px 8px; border-radius:3px; border:2px solid rgba(255,255,255,.18);
  color:rgba(207,227,255,.4); transform:skewX(-12deg); white-space:nowrap; }
.ss-phase.ready { color:#05060d; background:#b8f3ff; border-color:#fff; box-shadow:0 0 10px #7fe3ff; }
.ss-aurarow.noaura { animation:ss-noaura .4s linear; }
.ss-aurarow.noaura .ss-aura { border-color:#ff3048; box-shadow:0 0 14px 2px #ff3048; background:rgba(120,10,24,.85); }
.ss-aurarow.noaura .ss-phase { color:#fff; background:#ff3048; border-color:#ff3048; }
@keyframes ss-noaura { 0%{transform:translateX(0)} 15%{transform:translateX(-6px)} 35%{transform:translateX(5px)}
  55%{transform:translateX(-4px)} 75%{transform:translateX(2px)} 100%{transform:translateX(0)} }
.ss-infused { font-size:15px; letter-spacing:2px; padding:1px 8px; border-radius:3px; color:#05060d; display:none;
  animation:ss-blink .35s ease-in-out infinite alternate; }
.ss-infused.on { display:block; }

/* ---------------- centre: timer ---------------- */
.ss-centre { width:170px; display:flex; flex-direction:column; align-items:center; margin-top:-4px; }
.ss-timer { width:118px; height:70px; display:flex; align-items:center; justify-content:center; font-size:54px; line-height:1;
  background:rgba(8,10,22,.82); border:2px solid rgba(255,255,255,.28); clip-path:polygon(12% 0,88% 0,100% 50%,88% 100%,12% 100%,0 50%);
  color:#fff; text-shadow:0 0 14px rgba(160,200,255,.8); font-variant-numeric:tabular-nums; }
.ss-timer.urgent { color:#ff4d5e; text-shadow:0 0 16px #ff2a3a; animation:ss-tick 1s steps(1) infinite; }
.ss-timer.sd { color:#ffcf3a; font-size:40px; text-shadow:0 0 16px #ff8a00; animation:ss-tick .5s steps(1) infinite; }
@keyframes ss-tick { 0%{transform:scale(1.12)} 50%{transform:scale(1)} }
.ss-round { margin-top:6px; font-size:16px; letter-spacing:3px; color:#9fb4dd; }
.ss-round.rush { color:#ff6a3a; text-shadow:0 0 10px #ff3a1a; animation:ss-blink .4s ease-in-out infinite alternate; }
.ss-timer.rush { color:#ff6a3a; text-shadow:0 0 18px #ff3a1a; border-color:#ff6a3a; animation:ss-tick .5s steps(1) infinite; }

/* ---------------- combo counter ---------------- */
.ss-combo { position:absolute; top:150px; display:none; flex-direction:column; align-items:flex-start; transform:skewX(-10deg); }
.ss-combo.p1 { left:44px; }
.ss-combo.p2 { right:44px; align-items:flex-end; }
.ss-combo.on { display:flex; }
.ss-combo b { font-size:78px; line-height:.9; color:#fff; text-shadow:0 0 18px var(--hc); -webkit-text-stroke:5px #05060d; paint-order:stroke fill; }
.ss-combo span { font-size:24px; letter-spacing:3px; color:var(--hc); -webkit-text-stroke:3px #05060d; paint-order:stroke fill; }
.ss-combo.pop b { animation:ss-pop .25s cubic-bezier(.2,1.8,.4,1); }
@keyframes ss-pop { from { transform:scale(1.7); } to { transform:scale(1); } }

/* ---------------- callouts + announcer ---------------- */
.ss-layer { position:absolute; inset:0; }
.ss-callout { position:absolute; transform:translate(-50%,-50%) skewX(-12deg); white-space:nowrap; }
.ss-callout > div { font-style:italic; letter-spacing:2px; color:#fff; -webkit-text-stroke:5px #05060d; paint-order:stroke fill;
  text-shadow:0 0 18px var(--hc), 0 0 40px var(--hc); animation:ss-punch var(--life) cubic-bezier(.2,.9,.3,1) forwards; }
.ss-callout.t3 > div { -webkit-text-stroke:8px #05060d; }
@keyframes ss-punch {
  0% { transform:scale(1.45); opacity:0; }
  10% { transform:scale(.94); opacity:1; }
  18% { transform:scale(1.04); }
  26% { transform:scale(1); }
  75% { transform:scale(1); opacity:1; }
  100% { transform:scale(1.06) translateY(-14px); opacity:0; }
}
.ss-announce { position:absolute; left:50%; top:46%; transform:translate(-50%,-50%); text-align:center; white-space:nowrap; }
.ss-announce .main { font-style:italic; color:#fff; -webkit-text-stroke:9px #05060d; paint-order:stroke fill;
  text-shadow:0 0 28px var(--hc), 0 0 70px var(--hc); line-height:1; }
.ss-announce .sub { margin-top:10px; font-size:38px; letter-spacing:6px; color:var(--hc); -webkit-text-stroke:4px #05060d; paint-order:stroke fill; }
.ss-announce.count .main { font-size:230px; animation:ss-count .95s cubic-bezier(.2,.9,.3,1) forwards; }
.ss-announce.fight .main { font-size:210px; animation:ss-fight 1.1s cubic-bezier(.2,.9,.3,1) forwards; }
.ss-announce.ko .main { font-size:260px; color:#fff; animation:ss-ko 1.7s cubic-bezier(.15,1.1,.3,1) forwards; }
.ss-announce.big .main { font-size:120px; animation:ss-punch 2s cubic-bezier(.2,.9,.3,1) forwards; }
.ss-announce.big .sub { animation:ss-punch 2s cubic-bezier(.2,.9,.3,1) forwards; }
@keyframes ss-count { 0%{transform:scale(2.4);opacity:0} 14%{transform:scale(.95);opacity:1} 22%{transform:scale(1.03)} 30%{transform:scale(1)} 78%{opacity:1} 100%{transform:scale(.82);opacity:0} }
@keyframes ss-fight { 0%{transform:scale(3) skewX(-14deg);opacity:0} 12%{transform:scale(.9) skewX(-14deg);opacity:1} 22%{transform:scale(1.05) skewX(-14deg)}
  30%{transform:scale(1) skewX(-14deg)} 75%{opacity:1;transform:scale(1.02) skewX(-14deg)} 100%{transform:scale(1.5) skewX(-14deg);opacity:0} }
@keyframes ss-ko { 0%{transform:scale(4) rotate(-8deg);opacity:0} 8%{transform:scale(.9) rotate(-4deg);opacity:1} 16%{transform:scale(1.06) rotate(-4deg)}
  24%{transform:scale(1) rotate(-4deg)} 82%{opacity:1} 100%{transform:scale(1.04) rotate(-4deg);opacity:0} }
.ss-roundlabel { position:absolute; left:50%; top:24%; transform:translate(-50%,-50%) skewX(-10deg); font-size:46px; letter-spacing:8px; color:#cfe3ff;
  -webkit-text-stroke:4px #05060d; paint-order:stroke fill; text-shadow:0 0 18px #5a7dff; display:none; }
.ss-roundlabel.on { display:block; animation:ss-fadein .3s ease-out; }
.ss-roundlabel.final { color:#ffd166; text-shadow:0 0 22px #ff7a00; }
@keyframes ss-fadein { from{opacity:0; letter-spacing:30px} to{opacity:1} }
.ss-banner { position:absolute; left:0; right:0; top:38%; height:120px; display:flex; align-items:center; justify-content:center;
  background:linear-gradient(90deg, transparent, color-mix(in srgb, var(--hc) 55%, transparent) 20%, color-mix(in srgb, var(--hc) 55%, transparent) 80%, transparent);
  animation:ss-banner 1.5s ease-out forwards; }
.ss-banner div { font-size:84px; font-style:italic; letter-spacing:6px; color:#fff; -webkit-text-stroke:6px #05060d; paint-order:stroke fill; text-shadow:0 0 24px var(--hc); }
@keyframes ss-banner { 0%{transform:scaleY(0) translateX(-30%);opacity:0} 12%{transform:scaleY(1) translateX(0);opacity:1} 80%{opacity:1} 100%{opacity:0;transform:translateX(8%)} }

/* ---------------- full screens ---------------- */
.ss-screen { position:absolute; inset:0; display:none; flex-direction:column; align-items:center; justify-content:center; gap:14px;
  background:radial-gradient(ellipse at center, rgba(5,6,13,.55) 0%, rgba(5,6,13,.88) 70%); }
.ss-screen.on { display:flex; animation:ss-fadein2 .35s ease-out; }
@keyframes ss-fadein2 { from{opacity:0} to{opacity:1} }
.ss-screen .who { font-size:96px; font-style:italic; color:var(--hc); -webkit-text-stroke:7px #05060d; paint-order:stroke fill; text-shadow:0 0 30px var(--hc); }
.ss-screen .what { font-size:150px; font-style:italic; line-height:.9; color:#fff; -webkit-text-stroke:9px #05060d; paint-order:stroke fill; text-shadow:0 0 40px var(--hc); }
.ss-screen .score { font-size:56px; letter-spacing:10px; color:#cfe3ff; }
.ss-screen .hint { margin-top:30px; font-size:30px; letter-spacing:4px; color:#fff; animation:ss-blink .8s ease-in-out infinite alternate; }
.ss-screen .hint kbd { font:inherit; padding:2px 14px; border:3px solid #fff; border-radius:8px; margin:0 6px; }
.ss-screen.on .what { animation:ss-punch-hold .6s cubic-bezier(.2,.9,.3,1); }
@keyframes ss-punch-hold { 0%{transform:scale(1.6);opacity:0} 40%{transform:scale(.95);opacity:1} 60%{transform:scale(1.03)} 100%{transform:scale(1)} }
@keyframes ss-fadeout { to { opacity:0; transform:scale(.9); } }
@keyframes ss-blink { from{opacity:1} to{opacity:.35} }
.ss-pause { gap:10px; background:rgba(5,6,13,.9); }
.ss-pause .what { font-size:84px; --hc:#5a7dff; }
.ss-pause .hint { margin-top:6px; font-size:24px; animation:none; color:#9fb4dd; }
.ss-help { display:flex; gap:34px; align-items:flex-start; width:1440px; padding:18px 26px; border:2px solid #2b3a67; border-radius:10px;
  background:rgba(12,16,34,.9); font-family:system-ui,"Segoe UI",sans-serif; font-weight:600; color:#dbe7ff; }
.ss-help-col { flex:1 1 0; }
.ss-help h3 { margin:0 0 10px; font:900 22px "Arial Black",system-ui,sans-serif; letter-spacing:4px; color:#7fe3ff; }
.ss-controls { width:100%; border-collapse:collapse; font-size:21px; }
.ss-controls th { text-align:left; font-size:15px; letter-spacing:2px; color:#7f95c8; text-transform:uppercase; padding:0 8px 6px; }
.ss-controls td { padding:5px 8px; border-top:1px solid rgba(90,125,255,.18); }
.ss-controls td.act { color:#ffd166; white-space:nowrap; }
.ss-rule { margin:0 0 12px; font-size:20px; line-height:1.3; }
.ss-rule b { color:#ffd166; margin-right:4px; }
`;
