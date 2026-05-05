/**
 * LichSOMA Daily Calendar — FVTT 14
 *
 * 시간대(오전/오후/심야) + 일자 카운트 캘린더 모듈.
 * lichsoma-time-and-weather에서 시간/캘린더 기능만 분리.
 *
 * - 캘린더 ON/OFF (모듈 설정). OFF 시 좌측 캘린더·테스크바 날짜 연동 해제
 * - 캘린더 기준 날짜 기본값: 2000/01/01
 * - 캘린더 폰트: lichsoma-nameplate와 동일하게 document.fonts 기반 목록 + 모듈 설정
 */

const MODULE_ID = 'lichsoma-daily-calendar';
const TASKBAR_MODULE_ID = 'lichsoma-taskbar';
const BUTTON_ICON = 'fa-solid fa-hourglass-half';

const SETTING_ENABLE_CALENDAR = 'enableCalendar';
const SETTING_TIME_OF_DAY = 'timeOfDay';
const SETTING_BASE_CALENDAR_DATE = 'baseCalendarDate';
const SETTING_CURRENT_DAY = 'currentDay';
const SETTING_CALENDAR_FONT = 'calendarFont';

const VALID_TIMES = new Set(['morning', 'afternoon', 'latenight']);

const CALENDAR_CONTAINER_ID = 'lichsoma-daily-calendar-container';
const SCENE_NAV_ID = 'scene-navigation';

const state = {
  active: false,
  outsideClickHandler: null,
  timeOfDay: 'morning',
  timeOverlayElement: null,
  afternoonOverlay: null,
  latenightOverlay: null,
};

/** @see lichsoma-nameplate — 폰트 선택지 중복 갱신 방지 */
let _fontChoicesUpdated = false;

function normalizeFontFamilyName(name) {
  if (name == null) return '';
  const s = String(name).trim();
  if (!s) return '';
  return s.replace(/^['"]+|['"]+$/g, '').trim();
}

/** lichsoma-nameplate와 동일하게 document.fonts에서 선택 가능한 폰트 목록 구성 */
function getAvailableFonts() {
  try {
    const loadedFonts = [];
    try {
      if (document.fonts?.forEach) {
        document.fonts.forEach((font) => {
          const family = font.family;
          if (family && typeof family === 'string') {
            const n = normalizeFontFamilyName(family);
            if (n) loadedFonts.push(n);
          }
        });
      }
    } catch (e) {
      /* ignore */
    }

    const excludePatterns = [
      'modesto condensed',
      'modesto',
      'amiri',
      'signika',
      'bruno ace',
      'font awesome',
      'fontawesome',
      'fallback',
    ];

    const filteredFonts = loadedFonts.filter((font) => {
      if (!font || typeof font !== 'string') return false;
      const lowerFont = font.toLowerCase().trim();
      return !excludePatterns.some((pattern) => lowerFont.includes(pattern));
    });

    const uniqueFonts = [...new Set(filteredFonts)];
    const allFonts = ['default', ...uniqueFonts.filter((f) => f && f.trim() !== '' && f !== 'default')];
    const sortedFonts = allFonts.sort((a, b) => {
      if (a === 'default') return -1;
      if (b === 'default') return 1;
      return a.localeCompare(b, ['ko', 'en'], { numeric: true, sensitivity: 'base' });
    });

    const fontChoices = {};
    sortedFonts.forEach((font) => {
      if (font === 'default') {
        fontChoices[font] = localize('LICHSOMA.DAILY_CALENDAR.Font.Default');
      } else {
        fontChoices[font] = font;
      }
    });
    return fontChoices;
  } catch (e) {
    console.warn(`[${MODULE_ID}] 폰트 목록 수집 실패`, e);
    return {
      default: localize('LICHSOMA.DAILY_CALENDAR.Font.Default'),
      Arial: 'Arial',
      'Times New Roman': 'Times New Roman',
      'Courier New': 'Courier New',
      Verdana: 'Verdana',
    };
  }
}

function updateFontChoices(force = false) {
  if (!force && _fontChoicesUpdated) return;
  try {
    const availableFonts = getAvailableFonts();
    const rawFont = game.settings.get(MODULE_ID, SETTING_CALENDAR_FONT);
    const currentFont = normalizeFontFamilyName(rawFont);
    if (currentFont && currentFont !== 'default' && !availableFonts[currentFont]) {
      availableFonts[currentFont] = currentFont;
    }
    const setting = game.settings.settings.get(`${MODULE_ID}.${SETTING_CALENDAR_FONT}`);
    if (setting) {
      setting.choices = availableFonts;
      _fontChoicesUpdated = true;
    }
  } catch (e) {
    console.warn(`[${MODULE_ID}] 폰트 선택지 갱신 실패`, e);
  }
}

function waitForFontsAndUpdate() {
  if (document.fonts?.ready) {
    document.fonts.ready
      .then(() => {
        setTimeout(() => updateFontChoices(), 500);
      })
      .catch(() => {
        setTimeout(() => updateFontChoices(), 1000);
      });
  } else {
    setTimeout(() => updateFontChoices(), 1000);
  }
  setTimeout(() => updateFontChoices(true), 5000);
  setTimeout(() => updateFontChoices(true), 10000);
}

/** Foundry CONFIG.fontDefinitions에는 등록되어 있지만 브라우저에는
 *  @font-face가 없어서 CSS에서 매칭이 안 되는 경우를 대비해 동적으로 @font-face를 주입한다.
 *  (PIXI/canvas는 별도 경로로 폰트를 쓰는 경우가 있어 그쪽은 보이는데 HTML에선 안 보일 때 발생) */
function ensureFontFaceForFamily(family) {
  if (!family || family === 'default') return false;

  // CSS 매칭이 이미 가능한 상태라면 추가 작업 불필요
  try {
    if (document.fonts?.check?.(`12px "${family}"`)) return true;
  } catch (_) {
    /* ignore */
  }

  try {
    const def = CONFIG?.fontDefinitions?.[family];
    if (!def || !Array.isArray(def.fonts) || !def.fonts.length) return false;

    const safeId = String(family).replace(/[^a-zA-Z0-9가-힣]/g, '_');
    const styleId = `ldc-font-face-${safeId}`;
    if (document.getElementById(styleId)) return true;

    const declarations = def.fonts
      .map((font) => {
        const urls = (Array.isArray(font.urls) ? font.urls : [])
          .map((u) => `url("${u}")`)
          .join(', ');
        if (!urls) return '';
        const weight = font.weight ? `font-weight: ${font.weight};` : '';
        const style = font.style ? `font-style: ${font.style};` : '';
        return `@font-face {
          font-family: "${family}";
          src: ${urls};
          ${weight}
          ${style}
          font-display: swap;
        }`;
      })
      .filter(Boolean)
      .join('\n');

    if (!declarations) return false;

    const el = document.createElement('style');
    el.id = styleId;
    el.textContent = declarations;
    document.head.appendChild(el);

    // 한 번 명시적으로 로드 트리거
    try { document.fonts?.load?.(`16px "${family}"`); } catch (_) {}

    return true;
  } catch (e) {
    console.warn(`[${MODULE_ID}] ensureFontFaceForFamily failed`, e);
    return false;
  }
}

/** 컨테이너 + 캘린더 내부 요소들에 직접 인라인 스타일을 박아 강제 적용한다.
 *  Foundry/다른 모듈이 더 강한 셀렉터로 폰트를 덮어쓰는 경우에도 확실히 이긴다. */
function applyCalendarFontInline(fontFamily) {
  const container = document.getElementById(CALENDAR_CONTAINER_ID);
  if (!container) return 0;

  const targets = [container];
  container
    .querySelectorAll(
      [
        '.lichsoma-calendar-panel',
        '.lichsoma-calendar-content',
        '.lichsoma-calendar-body',
        '.lichsoma-calendar-row',
        '.lichsoma-calendar-date',
        '.lichsoma-calendar-weekday',
        '.lichsoma-calendar-weekday-text',
        '.lichsoma-calendar-time-wrap',
      ].join(','),
    )
    .forEach((el) => targets.push(el));

  targets.forEach((el) => {
    if (fontFamily) {
      el.style.setProperty('font-family', fontFamily, 'important');
      // 폰트가 weight 900을 가지지 않으면 매칭 자체가 실패해 fallback이 발생할 수 있다.
      // font-synthesis로 굵기를 합성해 강제하고, 인라인 weight는 적용하지 않는다.
      el.style.setProperty('font-synthesis', 'weight style', 'important');
      el.style.removeProperty('font-weight');
    } else {
      el.style.removeProperty('font-family');
      el.style.removeProperty('font-weight');
      el.style.removeProperty('font-synthesis');
    }
  });

  return targets.length;
}

function applyCalendarFontVariable() {
  try {
    let raw = 'default';
    try {
      raw = game.settings.get(MODULE_ID, SETTING_CALENDAR_FONT) || 'default';
    } catch (_) {
      // 설정이 아직 등록되지 않은 시점에서도 그냥 default로 처리.
    }
    const n = normalizeFontFamilyName(raw);

    let fontFamily = '';
    if (n && n !== 'default') {
      ensureFontFaceForFamily(n);
      const safe = String(n).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      // inline의 font-family fallback에 var()을 두면 환경에 따라 평가가 깨질 수 있어 단순화.
      fontFamily = `"${safe}", sans-serif`;
    }

    if (fontFamily) {
      document.documentElement.style.setProperty('--ldc-calendar-font-family', fontFamily);
    } else {
      document.documentElement.style.removeProperty('--ldc-calendar-font-family');
    }

    applyCalendarFontInline(fontFamily);
  } catch (e) {
    document.documentElement.style.removeProperty('--ldc-calendar-font-family');
    console.warn(`[${MODULE_ID}] calendar font apply failed`, e);
  }
}

function localize(key) {
  return game?.i18n?.localize?.(key) ?? key;
}

function isOurSettingKey(setting, shortKey) {
  if (!setting?.key) return false;
  const composite = `${MODULE_ID}.${shortKey}`;
  return setting.key === composite || (setting.namespace === MODULE_ID && setting.key === shortKey);
}

function notifyGmOnly() {
  ui.notifications?.warn(localize('LICHSOMA.DAILY_CALENDAR.NotifyGMOnly'));
}

function readTimeFromWorld() {
  const v = game.settings.get(MODULE_ID, SETTING_TIME_OF_DAY);
  return VALID_TIMES.has(v) ? v : 'morning';
}

function isCalendarEnabled() {
  return Boolean(game.settings.get(MODULE_ID, SETTING_ENABLE_CALENDAR));
}

function readCurrentDay() {
  if (!isCalendarEnabled()) return 0;
  const v = game.settings.get(MODULE_ID, SETTING_CURRENT_DAY);
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function getDaysInMonth(yyyy, mm) {
  const fullYear = Number(yyyy);
  const isLeap = (fullYear % 4 === 0 && fullYear % 100 !== 0) || fullYear % 400 === 0;
  switch (mm) {
    case 1: return 31;
    case 2: return isLeap ? 29 : 28;
    case 3: return 31;
    case 4: return 30;
    case 5: return 31;
    case 6: return 30;
    case 7: return 31;
    case 8: return 31;
    case 9: return 30;
    case 10: return 31;
    case 11: return 30;
    case 12: return 31;
    default: return 30;
  }
}

function parseBaseDate(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const m = /^(\d{4})\s*\/\s*(\d{2})\s*\/\s*(\d{2})$/.exec(trimmed);
  if (!m) return null;
  const yy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  if (!Number.isInteger(yy) || !Number.isInteger(mm) || !Number.isInteger(dd)) return null;
  if (yy < 1) return null;
  if (mm < 1 || mm > 12) return null;
  const dim = getDaysInMonth(yy, mm);
  if (dd < 1 || dd > dim) return null;
  return { yy, mm, dd };
}

function addDaysToDate({ yy, mm, dd }, offsetDays) {
  let y = yy;
  let m = mm;
  let d = dd;
  let remaining = Number(offsetDays) || 0;
  while (remaining !== 0) {
    if (remaining > 0) {
      const dim = getDaysInMonth(y, m);
      if (d < dim) d += 1;
      else {
        d = 1;
        if (m < 12) m += 1;
        else { m = 1; y = y + 1; }
      }
      remaining -= 1;
    } else {
      if (d > 1) d -= 1;
      else {
        if (m > 1) m -= 1;
        else { m = 12; y = y - 1; }
        d = getDaysInMonth(y, m);
      }
      remaining += 1;
    }
  }
  return { yy: y, mm: m, dd: d };
}

function toUtcDate({ yy, mm, dd }) {
  return new Date(Date.UTC(Number(yy), (mm - 1), dd, 12, 0, 0));
}

function formatYYMMDD({ yy, mm, dd }) {
  return `${String(yy).padStart(4, '0')}/${pad2(mm)}/${pad2(dd)}`;
}

function getWeekdayKorean(date) {
  const labels = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  return labels[date.getUTCDay()] ?? '';
}

function getTimeIconClass(time) {
  return time === 'morning'
    ? 'fa-solid fa-sun'
    : time === 'afternoon'
      ? 'fa-solid fa-circle-half-stroke'
      : time === 'latenight'
        ? 'fa-solid fa-moon'
        : '';
}

function applyTimeOfDayOverlay(timeOfDay) {
  const oldOverlay = state.timeOverlayElement;
  if (timeOfDay === 'morning') {
    [state.afternoonOverlay, state.latenightOverlay].forEach((el) => {
      if (el?.classList.contains('visible')) el.classList.remove('visible');
    });
    state.timeOverlayElement = null;
    return;
  }

  const hadAfternoon = Boolean(state.afternoonOverlay);
  const hadLateNight = Boolean(state.latenightOverlay);

  if (!state.afternoonOverlay) {
    state.afternoonOverlay = document.createElement('div');
    state.afternoonOverlay.id = 'ldc-afternoon-overlay';
    state.afternoonOverlay.className = 'ldc-time-overlay ldc-time-overlay-afternoon';
    document.body.appendChild(state.afternoonOverlay);
  }

  if (!state.latenightOverlay) {
    state.latenightOverlay = document.createElement('div');
    state.latenightOverlay.id = 'ldc-latenight-overlay';
    state.latenightOverlay.className = 'ldc-time-overlay ldc-time-overlay-latenight';
    document.body.appendChild(state.latenightOverlay);
  }

  const newOverlay = timeOfDay === 'afternoon' ? state.afternoonOverlay : state.latenightOverlay;
  const wasCreatedNow =
    (timeOfDay === 'afternoon' && !hadAfternoon) || (timeOfDay !== 'afternoon' && !hadLateNight);

  if (oldOverlay && oldOverlay.classList.contains('visible') && oldOverlay !== newOverlay) {
    oldOverlay.classList.remove('visible');
    requestAnimationFrame(() => {
      newOverlay.classList.add('visible');
    });
  } else {
    if (wasCreatedNow || !oldOverlay) {
      requestAnimationFrame(() => {
        void newOverlay.getBoundingClientRect();
        requestAnimationFrame(() => {
          if (!newOverlay.classList.contains('visible')) newOverlay.classList.add('visible');
        });
      });
    } else if (!newOverlay.classList.contains('visible')) {
      requestAnimationFrame(() => {
        newOverlay.classList.add('visible');
      });
    }
  }

  state.timeOverlayElement = newOverlay;
}

async function persistTimeOfDay(value) {
  if (!game.user.isGM) {
    notifyGmOnly();
    return;
  }
  await game.settings.set(MODULE_ID, SETTING_TIME_OF_DAY, value);
  state.timeOfDay = value;
  updatePanelButtons();
}

async function persistCurrentDay(value) {
  if (!game.user.isGM) {
    notifyGmOnly();
    return;
  }
  const n = Math.max(1, Math.floor(Number(value) || 1));
  await game.settings.set(MODULE_ID, SETTING_CURRENT_DAY, n);
}

async function navigateTime(direction) {
  if (!isCalendarEnabled()) {
    const order = ['morning', 'afternoon', 'latenight'];
    const cur = readTimeFromWorld();
    const idx = order.indexOf(cur);
    const safe = idx >= 0 ? idx : 0;
    const next = order[(safe + (direction > 0 ? 1 : -1) + order.length) % order.length];
    await persistTimeOfDay(next);
    return;
  }

  const order = ['morning', 'afternoon', 'latenight'];
  const curTime = readTimeFromWorld();
  const curDay = readCurrentDay();
  const idx = order.indexOf(curTime);
  const safe = idx >= 0 ? idx : 0;

  if (direction > 0) {
    if (safe < order.length - 1) {
      await persistTimeOfDay(order[safe + 1]);
      return;
    }
    await persistCurrentDay(curDay + 1);
    await persistTimeOfDay('morning');
    return;
  }

  if (safe > 0) {
    await persistTimeOfDay(order[safe - 1]);
    return;
  }
  if (curDay <= 1) return;
  await persistCurrentDay(curDay - 1);
  await persistTimeOfDay('latenight');
}

async function navigateDay(direction) {
  if (!isCalendarEnabled()) return;
  const curDay = readCurrentDay();
  if (direction < 0 && curDay <= 1) return;
  await persistCurrentDay(curDay + (direction > 0 ? 1 : -1));
  await persistTimeOfDay('morning');
}

function setupOutsideClickHandler() {
  if (state.outsideClickHandler) {
    document.removeEventListener('click', state.outsideClickHandler);
    state.outsideClickHandler = null;
  }

  state.outsideClickHandler = (event) => {
    const panel = document.getElementById('ldc-panel');
    const taskbarButton = document.getElementById('taskbar-daily-calendar-btn');

    if (panel && panel.contains(event.target)) return;
    if (taskbarButton && taskbarButton.contains(event.target)) return;

    togglePanel(false);
  };

  setTimeout(() => {
    document.addEventListener('click', state.outsideClickHandler);
  }, 0);
}

function refreshGmLocks() {
  const panel = document.getElementById('ldc-panel');
  if (!panel) return;
  const gm = game.user.isGM;
  panel.querySelectorAll('.ldc-time-btn').forEach((btn) => {
    btn.disabled = !gm;
    btn.style.opacity = gm ? '' : '0.55';
  });
}

function syncPanelTimeSectionLayout() {
  const panel = document.getElementById('ldc-panel');
  if (!panel) return;

  const section = panel.querySelector('.ldc-section-time');
  if (!section) return;

  const cal = isCalendarEnabled();
  section.classList.toggle('ldc-calendar-active', cal);

  const label = panel.querySelector('.ldc-day-count-label');
  if (label) {
    if (cal) {
      const d = readCurrentDay();
      label.textContent =
        typeof game.i18n?.format === 'function'
          ? game.i18n.format('LICHSOMA.DAILY_CALENDAR.Panel.DayCount', { day: d })
          : localize('LICHSOMA.DAILY_CALENDAR.Panel.DayCount').replace('{day}', String(d));
    } else {
      label.textContent = '';
    }
  }

  const gm = game.user.isGM;
  const day = cal ? readCurrentDay() : 0;
  const time = readTimeFromWorld();

  const prevDay = panel.querySelector('.ldc-prev-day');
  const nextDay = panel.querySelector('.ldc-next-day');
  const prevTime = panel.querySelector('.ldc-prev-time');
  const nextTime = panel.querySelector('.ldc-next-time');

  if (cal) {
    if (prevDay) prevDay.disabled = !gm || day <= 1;
    if (nextDay) nextDay.disabled = !gm;
    if (prevTime) prevTime.disabled = !gm || (day <= 1 && time === 'morning');
    if (nextTime) nextTime.disabled = !gm;
  } else {
    if (prevDay) prevDay.disabled = true;
    if (nextDay) nextDay.disabled = true;
    if (prevTime) prevTime.disabled = true;
    if (nextTime) nextTime.disabled = true;
  }
}

function updatePanelButtons() {
  const panel = document.getElementById('ldc-panel');
  if (!panel) return;

  state.timeOfDay = readTimeFromWorld();
  applyTimeOfDayOverlay(state.timeOfDay);
  syncPanelTimeSectionLayout();

  panel.querySelectorAll('.ldc-time-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.timeOfDay === state.timeOfDay);
  });

  refreshGmLocks();
}

function setActive(active) {
  state.active = active;

  const panel = document.getElementById('ldc-panel');
  if (panel) panel.classList.toggle('hidden', !active);

  if (!active && state.outsideClickHandler) {
    document.removeEventListener('click', state.outsideClickHandler);
    state.outsideClickHandler = null;
  } else if (active) {
    setupOutsideClickHandler();
  }
}

function togglePanel(force) {
  const next = typeof force === 'boolean' ? force : !state.active;
  state.timeOfDay = readTimeFromWorld();
  setActive(next);
  updatePanelButtons();
}

function createPanel() {
  if (document.getElementById('ldc-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'ldc-panel';
  panel.className = 'ldc-panel hidden';

  panel.innerHTML = `
    <div class="ldc-content">
      <div class="ldc-section ldc-section-time">
        <div class="ldc-time-heading-simple">
          <div class="ldc-section-title">${localize('LICHSOMA.DAILY_CALENDAR.Panel.Time')}</div>
        </div>
        <div class="ldc-time-heading-calendar">
          <button type="button" class="ldc-nav-btn ldc-prev-day" aria-label="${localize('LICHSOMA.DAILY_CALENDAR.Panel.PrevDay')}" title="${localize('LICHSOMA.DAILY_CALENDAR.Panel.PrevDay')}">
            <i class="fa-solid fa-angle-double-left"></i>
          </button>
          <div class="ldc-section-title ldc-day-count-label"></div>
          <button type="button" class="ldc-nav-btn ldc-next-day" aria-label="${localize('LICHSOMA.DAILY_CALENDAR.Panel.NextDay')}" title="${localize('LICHSOMA.DAILY_CALENDAR.Panel.NextDay')}">
            <i class="fa-solid fa-angle-double-right"></i>
          </button>
        </div>

        <div class="ldc-time-buttons-wrap">
          <button type="button" class="ldc-nav-btn ldc-prev-time" aria-label="${localize('LICHSOMA.DAILY_CALENDAR.Panel.PrevTime')}" title="${localize('LICHSOMA.DAILY_CALENDAR.Panel.PrevTime')}">
            <i class="fa-solid fa-chevron-left"></i>
          </button>
          <div class="ldc-buttons">
            <button type="button" class="ldc-time-btn" data-time-of-day="morning" title="${localize('LICHSOMA.DAILY_CALENDAR.Panel.Morning')}">
              <i class="fa-solid fa-sun"></i>
            </button>
            <button type="button" class="ldc-time-btn" data-time-of-day="afternoon" title="${localize('LICHSOMA.DAILY_CALENDAR.Panel.Afternoon')}">
              <i class="fa-solid fa-circle-half-stroke"></i>
            </button>
            <button type="button" class="ldc-time-btn" data-time-of-day="latenight" title="${localize('LICHSOMA.DAILY_CALENDAR.Panel.LateNight')}">
              <i class="fa-solid fa-moon"></i>
            </button>
          </div>
          <button type="button" class="ldc-nav-btn ldc-next-time" aria-label="${localize('LICHSOMA.DAILY_CALENDAR.Panel.NextTime')}" title="${localize('LICHSOMA.DAILY_CALENDAR.Panel.NextTime')}">
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  async function panelNavDay(direction) {
    await navigateDay(direction);
    state.timeOfDay = readTimeFromWorld();
    updatePanelButtons();
    if (isCalendarEnabled()) renderCalendar();
  }

  async function panelNavTime(direction) {
    await navigateTime(direction);
    state.timeOfDay = readTimeFromWorld();
    updatePanelButtons();
    if (isCalendarEnabled()) renderCalendar();
  }

  panel.querySelector('.ldc-prev-day')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await panelNavDay(-1);
  });
  panel.querySelector('.ldc-next-day')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await panelNavDay(1);
  });
  panel.querySelector('.ldc-prev-time')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await panelNavTime(-1);
  });
  panel.querySelector('.ldc-next-time')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await panelNavTime(1);
  });

  panel.querySelectorAll('.ldc-time-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await persistTimeOfDay(btn.dataset.timeOfDay);
    });
  });

  updatePanelButtons();
}

function ensureCalendarContainer() {
  let container = document.getElementById(CALENDAR_CONTAINER_ID);
  if (container) return container;
  container = document.createElement('div');
  container.id = CALENDAR_CONTAINER_ID;
  return container;
}

function fadeSwap(element, applyUpdate) {
  if (!element) return;
  element.classList.add('lichsoma-calendar-fade-out');
  setTimeout(() => {
    try { applyUpdate(); } catch (err) { /* ignore */ }
    element.classList.remove('lichsoma-calendar-fade-out');
  }, 500);
}

function ensureCalendarDom() {
  const container = ensureCalendarContainer();
  if (container.querySelector('.lichsoma-calendar-panel')) return container;

  container.innerHTML = `
    <div class="lichsoma-calendar-panel">
      <div class="lichsoma-calendar-content">
        <div class="lichsoma-calendar-body">
        <div class="lichsoma-calendar-row lichsoma-calendar-row-date">
          <div class="lichsoma-calendar-date"></div>
        </div>

        <div class="lichsoma-calendar-row lichsoma-calendar-row-time">
          <div class="lichsoma-calendar-weekday">
            <span class="lichsoma-calendar-weekday-text"></span>
            <span class="lichsoma-calendar-time-wrap">
              <i class="lichsoma-calendar-time-icon"></i>
            </span>
          </div>
        </div>
        </div>
      </div>
    </div>
  `;

  return container;
}

function renderCalendar() {
  if (!isCalendarEnabled()) return;

  const day = readCurrentDay();
  const time = readTimeFromWorld();

  const base = parseBaseDate(game.settings.get(MODULE_ID, SETTING_BASE_CALENDAR_DATE));
  const computed = base ? addDaysToDate(base, day - 1) : null;
  const dateStr = computed ? formatYYMMDD(computed) : '????/??/??';
  const weekday = computed ? getWeekdayKorean(toUtcDate(computed)) : '';

  const container = ensureCalendarDom();
  const content = container.querySelector('.lichsoma-calendar-content');
  const dateEl = container.querySelector('.lichsoma-calendar-date');
  const weekdayTextEl = container.querySelector('.lichsoma-calendar-weekday-text');
  const timeIconEl = container.querySelector('.lichsoma-calendar-time-icon');
  const timeWrapEl = container.querySelector('.lichsoma-calendar-time-wrap');

  const prevRenderedDay = Number(container.dataset.day || 'NaN');
  const prevRenderedTime = container.dataset.timeOfDay || '';

  const timeIconClass = getTimeIconClass(time);

  const applyFull = () => {
    if (dateEl) dateEl.textContent = `${dateStr} ${day}일차`;
    if (weekdayTextEl) weekdayTextEl.textContent = weekday;

    if (timeIconEl) timeIconEl.className = `${timeIconClass} lichsoma-calendar-time-icon`.trim();
    if (timeWrapEl) timeWrapEl.style.display = timeIconClass ? '' : 'none';

    container.dataset.day = String(day);
    container.dataset.timeOfDay = String(time);
  };

  const applyTimeOnly = () => {
    if (timeIconEl) timeIconEl.className = `${timeIconClass} lichsoma-calendar-time-icon`.trim();
    if (timeWrapEl) timeWrapEl.style.display = timeIconClass ? '' : 'none';
    container.dataset.timeOfDay = String(time);
  };

  const dayChanged = !Number.isFinite(prevRenderedDay) || prevRenderedDay !== day;
  const timeChanged = prevRenderedTime !== String(time);

  if (dayChanged) fadeSwap(content, applyFull);
  else if (timeChanged) fadeSwap(timeWrapEl, applyTimeOnly);
  else applyFull();

  // 캘린더 DOM이 (재)생성된 직후일 수 있으므로 자식들에 폰트를 다시 박는다.
  applyCalendarFontVariable();
}

function unmountCalendar() {
  const container = document.getElementById(CALENDAR_CONTAINER_ID);
  if (container) container.remove();
}

function mountCalendarAboveSceneNav() {
  if (!isCalendarEnabled()) return;

  const uiCol2 = document.getElementById('ui-left-column-2');
  const sceneNav = document.getElementById(SCENE_NAV_ID);
  if (!uiCol2 || !sceneNav) return;

  const container = ensureCalendarContainer();

  if (container.parentElement !== uiCol2) uiCol2.appendChild(container);
  if (sceneNav.parentElement === uiCol2) {
    uiCol2.insertBefore(container, sceneNav);
  } else {
    if (uiCol2.firstChild) uiCol2.insertBefore(container, uiCol2.firstChild);
    else uiCol2.appendChild(container);
  }

  renderCalendar();
  applyCalendarFontVariable();
}

function updateTaskbarDateTime() {
  if (!isCalendarEnabled()) return;

  const dateEl = document.getElementById('taskbar-datetime-date');
  const timeEl = document.getElementById('taskbar-datetime-time');
  if (!dateEl || !timeEl) return;

  const day = readCurrentDay();
  const timeOfDay = readTimeFromWorld();

  const base = parseBaseDate(game.settings.get(MODULE_ID, SETTING_BASE_CALENDAR_DATE));
  const computed = base ? addDaysToDate(base, day - 1) : null;
  const dateStr = computed ? formatYYMMDD(computed) : '????/??/??';
  const weekday = computed ? getWeekdayKorean(toUtcDate(computed)) : '';

  const timeLabel =
    timeOfDay === 'morning' ? localize('LICHSOMA.DAILY_CALENDAR.Panel.Morning')
      : timeOfDay === 'afternoon' ? localize('LICHSOMA.DAILY_CALENDAR.Panel.Afternoon')
        : timeOfDay === 'latenight' ? localize('LICHSOMA.DAILY_CALENDAR.Panel.LateNight')
          : '';

  dateEl.textContent = dateStr;
  timeEl.textContent = `${weekday}${weekday ? ' ' : ''}${timeLabel}`.trim();
}

function refreshTaskbarDate() {
  if (!isCalendarEnabled()) return;
  if (!game.modules.get(TASKBAR_MODULE_ID)?.active) return;
  updateTaskbarDateTime();
}

function notifyTaskbarStatsRefresh() {
  Hooks.callAll('lichsomaDailyCalendarRefreshTaskbarStats');
}

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, SETTING_ENABLE_CALENDAR, {
    name: localize('LICHSOMA.DAILY_CALENDAR.EnableCalendar'),
    hint: localize('LICHSOMA.DAILY_CALENDAR.EnableCalendarHint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {
      setTimeout(() => {
        try {
          if (isCalendarEnabled()) mountCalendarAboveSceneNav();
          else unmountCalendar();
          updatePanelButtons();
          notifyTaskbarStatsRefresh();
        } catch (err) {
          console.warn(`[${MODULE_ID}] enableCalendar 처리 중 오류`, err);
        }
      }, 50);
    },
  });

  game.settings.register(MODULE_ID, SETTING_TIME_OF_DAY, {
    name: 'LichSOMA Daily Calendar — Time',
    hint: 'World Time - Common time of day (morning/afternoon/latenight)',
    scope: 'world',
    config: false,
    type: String,
    default: 'morning',
  });

  game.settings.register(MODULE_ID, SETTING_BASE_CALENDAR_DATE, {
    name: localize('LICHSOMA.DAILY_CALENDAR.BaseCalendarDate'),
    hint: localize('LICHSOMA.DAILY_CALENDAR.BaseCalendarDateHint'),
    scope: 'world',
    config: true,
    type: String,
    default: '2000/01/01',
    onChange: () => {
      try {
        if (isCalendarEnabled()) renderCalendar();
        refreshTaskbarDate();
        notifyTaskbarStatsRefresh();
      } catch (err) {
        // ignore
      }
    },
  });

  game.settings.register(MODULE_ID, SETTING_CURRENT_DAY, {
    name: 'LichSOMA Daily Calendar — DayCount',
    hint: '캘린더 DayCount (저장용)',
    scope: 'world',
    config: false,
    type: Number,
    default: 1,
  });

  game.settings.register(MODULE_ID, SETTING_CALENDAR_FONT, {
    name: localize('LICHSOMA.DAILY_CALENDAR.Settings.CalendarFont.Name'),
    hint: localize('LICHSOMA.DAILY_CALENDAR.Settings.CalendarFont.Hint'),
    scope: 'world',
    config: true,
    type: String,
    choices: { default: localize('LICHSOMA.DAILY_CALENDAR.Font.Default') },
    default: 'default',
    onChange: () => {
      applyCalendarFontVariable();
    },
  });

  waitForFontsAndUpdate();

  // 초기 1회 적용(저장된 폰트 즉시 반영)
  applyCalendarFontVariable();
});

Hooks.once('setup', () => {
  applyCalendarFontVariable();
});

Hooks.once('canvasReady', () => {
  applyCalendarFontVariable();
});

Hooks.on('getSceneControlButtons', (controls) => {
  const lighting = controls.lighting;
  if (!lighting?.tools) return;

  lighting.tools.dailycalendar = {
    name: 'dailycalendar',
    title: 'LICHSOMA.DAILY_CALENDAR.SceneControlTitle',
    icon: BUTTON_ICON,
    order: Object.keys(lighting.tools).length,
    button: true,
    onChange: () => togglePanel(),
  };
});

Hooks.on('updateSetting', (setting) => {
  if (setting.namespace && setting.namespace !== MODULE_ID) return;

  if (isOurSettingKey(setting, SETTING_CALENDAR_FONT)) {
    applyCalendarFontVariable();
    return;
  }

  if (isOurSettingKey(setting, SETTING_ENABLE_CALENDAR)) {
    if (isCalendarEnabled()) mountCalendarAboveSceneNav();
    else unmountCalendar();
    updatePanelButtons();
    notifyTaskbarStatsRefresh();
    return;
  }

  if (isOurSettingKey(setting, SETTING_TIME_OF_DAY)) {
    state.timeOfDay = readTimeFromWorld();
    updatePanelButtons();
    if (isCalendarEnabled()) renderCalendar();
    refreshTaskbarDate();
    return;
  }

  if (
    isOurSettingKey(setting, SETTING_BASE_CALENDAR_DATE) ||
    isOurSettingKey(setting, SETTING_CURRENT_DAY)
  ) {
    if (isCalendarEnabled()) renderCalendar();
    updatePanelButtons();
    refreshTaskbarDate();
  }
});

function setupTaskbarButton() {
  if (!game.modules.get(TASKBAR_MODULE_ID)?.active) return;

  const taskbar = document.getElementById('lichsoma-taskbar');
  const taskbarRight = taskbar?.querySelector('.taskbar-right');
  if (!taskbarRight) return;

  if (document.getElementById('taskbar-daily-calendar-btn')) return;

  const button = document.createElement('button');
  button.className = 'taskbar-icon-btn';
  button.id = 'taskbar-daily-calendar-btn';
  button.title = game.i18n.localize('LICHSOMA.DAILY_CALENDAR.SceneControlTitle');
  button.innerHTML = `<i class="${BUTTON_ICON}"></i>`;
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePanel();
  });

  taskbarRight.insertBefore(button, taskbarRight.firstChild);
}

Hooks.on('renderSettingsConfig', (app, html) => {
  try {
    const root = html?.[0] ?? html;
    const selects = root?.querySelectorAll?.(`select[name*='${MODULE_ID}']`);
    if (!selects?.length) return;

    updateFontChoices(true);
    const choices = getAvailableFonts();
    selects.forEach((select) => {
      const n = select.name || '';
      if (!n.includes(SETTING_CALENDAR_FONT)) return;
      const current = game.settings.get(MODULE_ID, SETTING_CALENDAR_FONT);
      select.innerHTML = '';
      Object.entries(choices).forEach(([value, label]) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        if (value === current) opt.selected = true;
        select.appendChild(opt);
      });
    });
  } catch (_) {
    /* ignore */
  }
});

Hooks.once('ready', () => {
  applyCalendarFontVariable();

  state.timeOfDay = readTimeFromWorld();

  createPanel();

  setTimeout(() => {
    try {
      if (isCalendarEnabled()) mountCalendarAboveSceneNav();
      else unmountCalendar();
    } catch (err) {
      console.warn(`[${MODULE_ID}] 캘린더 초기 표시 중 오류`, err);
    }
  }, 100);

  setupTaskbarButton();
  refreshTaskbarDate();
  notifyTaskbarStatsRefresh();

  // body 전역에서 DOM 변경마다 날짜를 갱신하면 로딩 중 수천 번 호출되어 메인 스레드가 멈춤.
  // 테스크바는 1초 간격으로 updatePerformanceStats → updateTaskbarDateTime을 이미 호출함.
  const taskbarObserver = new MutationObserver(() => {
    if (
      game.modules.get(TASKBAR_MODULE_ID)?.active &&
      document.getElementById('lichsoma-taskbar') &&
      !document.getElementById('taskbar-daily-calendar-btn')
    ) {
      setupTaskbarButton();
      refreshTaskbarDate();
    }
  });

  taskbarObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
});
