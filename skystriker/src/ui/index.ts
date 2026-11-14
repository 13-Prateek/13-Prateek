/**
 * UI MODULE — DOM HUD overlay in #ui. Owned by the audio/UI session.
 * Reads MatchState + GameEvents only; never mutates state.
 *
 * Health bars with a delayed damage chip, 3-segment aura meters, round timer,
 * round-win pips, hero names, countdown 3-2-1-FIGHT!, callouts (sized by tier),
 * combo counter, K.O. / round / match result screens, pause overlay.
 */
import { ROUND_TIME } from '../shared/constants';
import { HEROES } from '../shared/heroes';
import type { GameEvent, HudSystem, MatchState, PlayerId } from '../shared/types';
import { computeFit } from '../input/mapping';
import {
  CALLOUT_LIFE, CALLOUT_SIZE, COMBO_HOLD, ELEMENT_COLOR, LOW_HP, TIMER_URGENT,
  auraFill, countdownDigit, heroColor, heroName, hpFraction, isFinalRound, matchWinner,
  roundLabel, stepChip, timerSeconds, timerText,
} from './model';
import { HUD_CSS } from './styles';

export * from './model';

/** createHud's return value: the HudSystem plus display-only extras for the loop. */
export interface Hud extends HudSystem {
  /** Show / hide the PAUSED overlay (display only; the loop does the actual pausing). */
  setPaused(paused: boolean): void;
  /** Remove the overlay from the DOM. */
  destroy(): void;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

/** Restart a CSS animation class on an element. */
function retrigger(e: HTMLElement, cls: string) {
  e.classList.remove(cls);
  void e.offsetWidth; // force reflow so the animation restarts
  e.classList.add(cls);
}

let styleInjected = false;
function injectStyles() {
  if (styleInjected || document.getElementById('ss-hud-css')) return;
  const s = document.createElement('style');
  s.id = 'ss-hud-css';
  s.textContent = HUD_CSS;
  document.head.appendChild(s);
  styleInjected = true;
}

interface PanelEls {
  root: HTMLDivElement;
  tag: HTMLSpanElement;
  name: HTMLSpanElement;
  pips: HTMLDivElement;
  chip: HTMLDivElement;
  fill: HTMLDivElement;
  aura: HTMLDivElement[];
  auraFill: HTMLElement[];
  infused: HTMLSpanElement;
  combo: HTMLDivElement;
  comboNum: HTMLElement;
}

interface PanelState {
  hp: number;
  chip: number;
  lastDamageAt: number;
  hurtUntil: number;
  comboUntil: number;
  key: string; // cache of last-written DOM values
}

export function createHud(root: HTMLElement): Hud {
  injectStyles();
  const frame = el('div', 'ss-frame', root);
  const top = el('div', 'ss-top', frame);
  const panelsEls: PanelEls[] = [];

  const makePanel = (p: PlayerId): PanelEls => {
    const panel = el('div', `ss-panel p${p + 1}`);
    const row = el('div', 'ss-namerow', panel);
    const tag = el('span', 'ss-tag', row, `P${p + 1}`);
    const name = el('span', 'ss-name', row);
    const pips = el('div', 'ss-pips', row);
    const bar = el('div', 'ss-bar', panel);
    const chip = el('div', 'ss-chip', bar);
    const fill = el('div', 'ss-fill', bar);
    el('div', 'ss-shine', bar);
    const auraRow = el('div', 'ss-aurarow', panel);
    const aura: HTMLDivElement[] = [], af: HTMLElement[] = [];
    for (let i = 0; i < 3; i++) {
      const seg = el('div', 'ss-aura', auraRow);
      aura.push(seg);
      af.push(el('i', '', seg));
    }
    const infused = el('span', 'ss-infused', auraRow, 'INFUSED');
    const combo = el('div', `ss-combo p${p + 1}`, frame);
    const comboNum = el('b', '', combo, '2');
    el('span', '', combo, 'HIT COMBO');
    return { root: panel, tag, name, pips, chip, fill, aura, auraFill: af, infused, combo, comboNum };
  };

  panelsEls.push(makePanel(0));
  const centre = el('div', 'ss-centre');
  const timer = el('div', 'ss-timer', centre, '90');
  const roundSmall = el('div', 'ss-round', centre, 'ROUND 1');
  panelsEls.push(makePanel(1));
  top.append(panelsEls[0].root, centre, panelsEls[1].root);

  const roundLabelEl = el('div', 'ss-roundlabel', frame);
  const calloutLayer = el('div', 'ss-layer', frame);
  const announceLayer = el('div', 'ss-layer', frame);

  const result = el('div', 'ss-screen ss-result', frame);
  const resWho = el('div', 'who', result);
  const resWhat = el('div', 'what', result, 'WINS!');
  const resScore = el('div', 'score', result);
  const resHint = el('div', 'hint', result);
  resHint.innerHTML = 'Press <kbd>ENTER</kbd> to rematch';

  const pause = el('div', 'ss-screen ss-pause', frame);
  el('div', 'what', pause, 'PAUSED');
  const pauseHint = el('div', 'hint', pause);
  pauseHint.innerHTML = 'Press <kbd>ESC</kbd> or <kbd>P</kbd> to resume';

  const panels: PanelState[] = [0, 1].map(() => ({ hp: -1, chip: -1, lastDamageAt: -99, hurtUntil: 0, comboUntil: 0, key: '' }));

  let lastT = now();
  let lastTick = -1;
  let viewW = -1, viewH = -1;
  let heroesKey = '';
  let lastPhase: MatchState['phase'] | null = null;
  let lastDigit = 0;
  let timerKey = '';
  let roundKey = '';
  let resultShown = false;
  let lastKoAt = -99;
  let announceBusyUntil = 0;
  const queue: Array<() => number> = []; // each returns its hold time in seconds

  /* ------------------------------ announcer ------------------------------ */
  function showAnnounce(cls: string, main: string, color: string, sub?: string): void {
    announceLayer.replaceChildren();
    const a = el('div', `ss-announce ${cls}`, announceLayer);
    a.style.setProperty('--hc', color);
    el('div', 'main', a, main);
    if (sub) el('div', 'sub', a, sub);
    a.addEventListener('animationend', (e) => { if (e.target === a.firstChild) a.remove(); });
  }
  /** Immediately show (clearing the queue). */
  function announceNow(cls: string, main: string, color: string, hold: number, sub?: string) {
    queue.length = 0;
    clearCallouts();
    showAnnounce(cls, main, color, sub);
    announceBusyUntil = now() + hold;
  }
  /** Show after whatever is on screen now. */
  function announceQueued(fn: () => number) {
    if (now() >= announceBusyUntil && queue.length === 0) announceBusyUntil = now() + fn();
    else queue.push(fn);
  }
  function pumpQueue(t: number) {
    if (queue.length && t >= announceBusyUntil) announceBusyUntil = t + queue.shift()!();
  }

  /* ------------------------------ callouts ------------------------------ */
  const liveCallouts: Array<{ e: HTMLElement; side: number; until: number }> = [];
  /** Big moments (countdown, FIGHT!, K.O.) wipe the small stuff so nothing overlaps. */
  function clearCallouts() {
    calloutLayer.querySelectorAll('.ss-callout').forEach((c) => c.remove());
    liveCallouts.length = 0;
  }
  function callout(text: string, player: PlayerId | null, tier: 1 | 2 | 3, state: Readonly<MatchState>) {
    const t = now();
    for (let i = liveCallouts.length - 1; i >= 0; i--) if (liveCallouts[i].until < t) liveCallouts.splice(i, 1);
    const side = tier === 3 || player === null ? -1 : player;
    const stack = liveCallouts.filter((c) => c.side === side).length;
    if (stack >= 4) liveCallouts.shift()?.e.remove();
    if (tier === 3) { // a tier-3 callout owns the screen: fade the smaller ones out
      for (const c of liveCallouts) (c.e.firstChild as HTMLElement).style.animation = 'ss-fadeout .15s forwards';
    }
    const wrap = el('div', `ss-callout t${tier}`, calloutLayer);
    const inner = el('div', '', wrap, text);
    const color = player === null ? '#ffd166' : heroColor(state, player);
    const life = CALLOUT_LIFE[tier];
    wrap.style.setProperty('--hc', color);
    wrap.style.setProperty('--life', `${life}s`);
    inner.style.fontSize = `${CALLOUT_SIZE[tier]}px`;
    let x = 800, y = tier === 3 ? 420 : 250;
    if (side >= 0) {
      x = side === 0 ? (tier === 2 ? 470 : 330) : (tier === 2 ? 1130 : 1270);
      y = (tier === 2 ? 300 : 250) + stack * 56;
    } else if (tier !== 3) {
      y = 250 + stack * 56;
    }
    wrap.style.left = `${x}px`;
    wrap.style.top = `${y}px`;
    inner.addEventListener('animationend', () => wrap.remove());
    liveCallouts.push({ e: wrap, side, until: t + life });
  }

  /* ------------------------------ layout ------------------------------ */
  function layout() {
    const w = root.clientWidth || window.innerWidth;
    const h = root.clientHeight || window.innerHeight;
    if (w === viewW && h === viewH) return;
    viewW = w; viewH = h;
    const f = computeFit(w, h);
    frame.style.transform = `translate(${f.offsetX}px, ${f.offsetY}px) scale(${f.scale})`;
  }

  function setHeroes(s: Readonly<MatchState>) {
    const key = `${s.fighters[0].heroId}|${s.fighters[1].heroId}|${s.config.roundsToWin}`;
    if (key === heroesKey) return;
    heroesKey = key;
    for (const p of [0, 1] as PlayerId[]) {
      const pe = panelsEls[p];
      const c = heroColor(s, p);
      pe.root.style.setProperty('--hc', c);
      pe.combo.style.setProperty('--hc', c);
      pe.name.textContent = heroName(s, p).toUpperCase();
      pe.name.style.color = c;
      pe.pips.replaceChildren();
      for (let i = 0; i < s.config.roundsToWin; i++) el('div', 'ss-pip', pe.pips);
      const el_ = HEROES[s.fighters[p].heroId].element;
      pe.infused.textContent = `${el_.toUpperCase()} INFUSED`;
      pe.infused.style.background = ELEMENT_COLOR[el_];
      panels[p].key = '';
    }
  }

  function showResult(s: Readonly<MatchState>) {
    const w = matchWinner(s);
    const c = heroColor(s, w);
    result.style.setProperty('--hc', c);
    resWho.textContent = heroName(s, w).toUpperCase();
    resWhat.textContent = 'WINS!';
    resScore.textContent = `${s.wins[0]} — ${s.wins[1]}`;
    announceLayer.replaceChildren();
    clearCallouts();
    result.classList.add('on');
    resultShown = true;
  }

  /* ------------------------------ per frame ------------------------------ */
  function update(s: Readonly<MatchState>) {
    const t = now();
    const dt = Math.min(0.1, Math.max(0, t - lastT));
    lastT = t;
    layout();
    setHeroes(s);
    if (s.tick < lastTick) { // a new match (rematch): snap bars instead of draining
      for (const ps of panels) { ps.hp = -1; ps.comboUntil = 0; }
      panelsEls.forEach((pe) => pe.combo.classList.remove('on'));
      lastPhase = s.phase; // no FIGHT!/result transitions carried over from the old match
      lastDigit = 0;
    }
    lastTick = s.tick;

    // Phase transitions (state-driven so the HUD is right even if an event was missed).
    if (s.phase !== lastPhase) {
      if (lastPhase === 'countdown' && s.phase === 'playing') announceNow('fight', 'FIGHT!', '#ffd166', 1.0);
      if (s.phase === 'countdown') { lastDigit = 0; result.classList.remove('on'); resultShown = false; }
      lastPhase = s.phase;
    }
    const digit = countdownDigit(s);
    if (digit && digit !== lastDigit) {
      announceNow('count', String(digit), digit === 1 ? '#ff5a2a' : '#5ad8ff', 0.9);
      lastDigit = digit;
    }
    const rk = s.phase === 'countdown' ? roundLabel(s) : '';
    if (rk !== roundKey) {
      roundKey = rk;
      roundLabelEl.textContent = rk;
      roundLabelEl.classList.toggle('on', !!rk);
      roundLabelEl.classList.toggle('final', isFinalRound(s));
    }
    if (s.phase === 'matchOver' && !resultShown && t >= announceBusyUntil && queue.length === 0) showResult(s);
    if (s.phase !== 'matchOver' && resultShown) { result.classList.remove('on'); resultShown = false; }
    pumpQueue(t);

    // Timer (frozen at its last value during K.O. / round-over / match-over)
    const tt = timerText(s, ROUND_TIME);
    const secs = timerSeconds(s);
    const tk = `${tt}|${s.suddenDeath}|${secs <= TIMER_URGENT}|${s.round}`;
    if (tk !== timerKey && (s.phase === 'playing' || s.phase === 'countdown')) {
      timerKey = tk;
      timer.textContent = tt;
      timer.classList.toggle('sd', s.suddenDeath);
      timer.classList.toggle('urgent', !s.suddenDeath && secs <= TIMER_URGENT);
      roundSmall.textContent = isFinalRound(s) ? 'FINAL ROUND' : `ROUND ${s.round}`;
    }

    // Panels
    for (const p of [0, 1] as PlayerId[]) {
      const f = s.fighters[p], ps = panels[p], pe = panelsEls[p];
      if (ps.hp < 0) { ps.hp = f.hp; ps.chip = f.hp; }
      if (f.hp < ps.hp) ps.lastDamageAt = t;
      ps.hp = f.hp;
      ps.chip = stepChip(ps.chip, f.hp, t - ps.lastDamageAt, dt);
      const fills = auraFill(f.aura);
      const hurt = t < ps.hurtUntil;
      const key = `${f.hp}|${ps.chip.toFixed(1)}|${fills.join(',')}|${f.infused}|${s.wins[p]}|${hurt}`;
      if (key !== ps.key) {
        ps.key = key;
        pe.fill.style.transform = `scaleX(${hpFraction(f.hp)})`;
        pe.chip.style.transform = `scaleX(${hpFraction(ps.chip)})`;
        pe.root.classList.toggle('low', f.hp > 0 && f.hp <= LOW_HP);
        if (!hurt) pe.root.classList.remove('hurt');
        for (let i = 0; i < 3; i++) {
          pe.auraFill[i].style.transform = `scaleX(${fills[i]})`;
          pe.aura[i].classList.toggle('full', fills[i] >= 1);
        }
        pe.infused.classList.toggle('on', f.infused);
        const pips = pe.pips.children;
        for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i < s.wins[p]);
      }
      if (ps.comboUntil && t > ps.comboUntil) { pe.combo.classList.remove('on'); ps.comboUntil = 0; }
    }
  }

  /* ------------------------------ events ------------------------------ */
  function onEvents(events: readonly GameEvent[], s: Readonly<MatchState>) {
    const t = now();
    for (const e of events) {
      switch (e.type) {
        case 'callout':
          callout(e.text, e.player, e.tier, s);
          break;
        case 'hit': {
          const ps = panels[e.target], pe = panelsEls[e.target];
          ps.hurtUntil = t + 0.28;
          retrigger(pe.root, 'hurt');
          if (e.combo >= 2) {
            const ae = panelsEls[e.attacker];
            ae.comboNum.textContent = String(e.combo);
            ae.combo.classList.add('on');
            retrigger(ae.combo, 'pop');
            panels[e.attacker].comboUntil = t + COMBO_HOLD;
          }
          break;
        }
        case 'wallSplat':
          panels[e.target].hurtUntil = t + 0.28;
          retrigger(panelsEls[e.target].root, 'hurt');
          break;
        case 'auraBar': {
          const seg = panelsEls[e.player].aura[Math.max(0, Math.min(2, e.bars - 1))];
          if (seg) retrigger(seg, 'gain');
          break;
        }
        case 'ko':
          lastKoAt = t;
          announceNow('ko', 'K.O.', heroColor(s, e.loser === 0 ? 1 : 0), 1.5);
          break;
        case 'roundEnd': {
          // A K.O. leaves someone at 0 HP; otherwise the round ended on time.
          const timeout = !s.fighters.some((f) => f.hp <= 0) && t - lastKoAt > 3;
          if (timeout) announceNow('big', 'TIME!', '#ffd166', 1.1);
          announceQueued(() => {
            if (e.winner === null) showAnnounce('big', 'DRAW', '#cfe3ff', 'NO ONE TAKES THE ROUND');
            else showAnnounce('big', heroName(s, e.winner).toUpperCase(), heroColor(s, e.winner), 'WINS THE ROUND');
            return 1.6;
          });
          break;
        }
        case 'matchEnd':
          announceQueued(() => { showResult(s); return 0; });
          break;
        case 'suddenDeath':
          callout('SUDDEN DEATH', null, 3, s);
          break;
        case 'superStart': {
          const b = el('div', 'ss-banner', calloutLayer);
          b.style.setProperty('--hc', heroColor(s, e.player));
          el('div', '', b, e.name);
          b.addEventListener('animationend', () => b.remove());
          break;
        }
        default:
          break;
      }
    }
  }

  return {
    update,
    onEvents,
    setPaused(p: boolean) { pause.classList.toggle('on', p); },
    destroy() { frame.remove(); },
  };
}
