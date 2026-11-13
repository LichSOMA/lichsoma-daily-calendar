/**
 * LichSOMA Daily Calendar — FVTT 13/14
 *
 * 시간대(오전/오후/심야) + 일자 카운트 캘린더 모듈.
 *
 * - 캘린더 ON/OFF (모듈 설정). OFF 시 좌측 캘린더·테스크바 날짜 연동 해제
 * - 캘린더 기준 날짜 기본값: 2000/01/01
 * - 캘린더 폰트: 웹폰트 CSS를 월드 설정으로 저장하고 즉시 적용
 */

import { applyCalendarTheme, CALENDAR_THEME_SETTING, registerCalendarThemeSetting } from './lichsoma-daily-calendar-theme.js';
import { createCalendarTaskbarAdapter, CALENDAR_TASKBAR_BUTTON_SELECTOR } from './lichsoma-daily-calendar-taskbar.js';

const calendarTaskbar = createCalendarTaskbarAdapter({
  onClick: () => togglePanel(),
  isActive: () => state.active,
  title: () => game.i18n.localize('LICHSOMA.DAILY_CALENDAR.SceneControlTitle')
});

const MODULE_ID = 'lichsoma-daily-calendar';
const TASKBAR_MODULE_ID = 'lichsoma-taskbar';
const BUTTON_ICON = 'fa-solid fa-hourglass-half';

const SETTING_ENABLE_CALENDAR = 'enableCalendar';
const SETTING_TIME_OF_DAY = 'timeOfDay';
const SETTING_BASE_CALENDAR_DATE = 'baseCalendarDate';
const SETTING_CURRENT_DAY = 'currentDay';
const SETTING_CALENDAR_WEBFONT_CSS = 'calendarWebfontCSS';
const WEBFONT_STYLE_ID = 'lichsoma-daily-calendar-webfont-css';


function stripWebfontCssComments(cssText) {
  return String(cssText ?? "").replace(/\/\*[\s\S]*?\*\//g, " ");
}

function extractPreferredWebfontBlock(cssText) {
  const css = stripWebfontCssComments(cssText);
  const marker = css.match(/\.(?:lichsoma-webfont-settings|lichsoma-webfont-family-marker)\s*\{([\s\S]*?)\}/i);
  return marker?.[1] || "";
}

function extractWebfontDeclaration(cssText, propertyName) {
  const css = stripWebfontCssComments(cssText);
  const escaped = String(propertyName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}\\s*:\\s*([^;}{]+)`, "i");
  const preferred = extractPreferredWebfontBlock(css);
  const match = (preferred && preferred.match(pattern)) || css.match(pattern);
  return String(match?.[1] ?? "").replace(/\s*!important\s*$/i, "").trim();
}

function normalizeWebfontFamily(value) {
  let text = String(value ?? "").split(",")[0]?.trim() ?? "";
  while (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) text = text.slice(1, -1).trim();
    else break;
  }
  return text;
}

function quoteWebfontFamily(value) {
  const family = normalizeWebfontFamily(value);
  return family ? `"${family.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : "";
}

function normalizeWebfontWeight(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^(?:normal|bold|bolder|lighter)$/i.test(text)) return text.toLowerCase();
  if (/^var\(.+\)$/i.test(text)) return text;
  if (/^\d{1,4}$/.test(text)) {
    const numeric = Number(text);
    return numeric >= 1 && numeric <= 1000 ? String(numeric) : "";
  }
  return "";
}

function normalizeWebfontStyle(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^(?:normal|italic)$/i.test(text)) return text.toLowerCase();
  if (/^oblique(?:\s+-?(?:\d+(?:\.\d+)?|\.\d+)(?:deg|grad|rad|turn))?$/i.test(text)) return text;
  if (/^var\(.+\)$/i.test(text)) return text;
  return "";
}

function normalizeWebfontVariationSettings(value) {
  const text = String(value ?? "").trim();
  if (!text || /[{};]/.test(text)) return "";
  return text;
}

function extractWebfontPresentation(cssText) {
  return {
    family: normalizeWebfontFamily(extractWebfontDeclaration(cssText, "font-family")),
    weight: normalizeWebfontWeight(extractWebfontDeclaration(cssText, "font-weight")),
    style: normalizeWebfontStyle(extractWebfontDeclaration(cssText, "font-style")),
    variationSettings: normalizeWebfontVariationSettings(extractWebfontDeclaration(cssText, "font-variation-settings"))
  };
}

class LichsomaDailyCalendarWebfontCSSEditor extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'lichsoma-daily-calendar-webfont-css-editor',
    classes: ['lichsoma-daily-calendar-css-editor'],
    tag: 'div',
    window: {
      frame: true,
      positioned: true,
      title: 'LICHSOMA.DAILY_CALENDAR.Settings.WebfontCSS.Title',
      resizable: true,
      minimizable: false,
    },
    position: {
      width: 800,
      height: 600,
    },
  };

  editor = null;
  _resizeObserver = null;

  async _prepareContext(_options) {
    return {
      css: game.settings.get(MODULE_ID, SETTING_CALENDAR_WEBFONT_CSS) || '',
      label: localize('LICHSOMA.DAILY_CALENDAR.Settings.WebfontCSS.CSSLabel'),
      save: localize('LICHSOMA.DAILY_CALENDAR.Common.Save'),
      cancel: localize('LICHSOMA.DAILY_CALENDAR.Common.Cancel'),
    };
  }

  async _renderHTML(context, _options) {
    const form = document.createElement('form');
    form.classList.add('lichsoma-daily-calendar-css-editor-form');
    form.innerHTML = `
      <div class="form-group lichsoma-daily-calendar-css-editor-main">
        <label>${context.label}</label>
        <textarea name="css" rows="20" spellcheck="false"></textarea>
      </div>
      <div class="form-group lichsoma-daily-calendar-css-editor-actions">
        <button type="button" class="save-css">${context.save}</button>
        <button type="button" class="cancel-css">${context.cancel}</button>
      </div>
    `;
    const textarea = form.querySelector('textarea[name="css"]');
    if (textarea) textarea.value = context.css ?? '';
    return form;
  }

  _replaceHTML(result, content, _options) {
    content.replaceChildren(result);
  }

  async _onFirstRender(_context, _options) {
    const form = this.element.querySelector('form.lichsoma-daily-calendar-css-editor-form');
    const textarea = form?.querySelector('textarea[name="css"]');
    if (!form || !textarea) return;

    const CodeMirrorClass = window.CodeMirror || CONFIG.CM?.CodeMirror;
    if (CodeMirrorClass) {
      const editor = CodeMirrorClass.fromTextArea(textarea, {
        mode: 'css',
        theme: 'foundry',
        lineNumbers: true,
        indentUnit: 2,
        tabSize: 2,
        lineWrapping: true,
        autofocus: true,
        extraKeys: {
          'Ctrl-S': () => void this._onSave(),
          'Cmd-S': () => void this._onSave(),
        },
      });
      this.editor = editor;
      this._resizeObserver = new ResizeObserver(() => setTimeout(() => editor.refresh(), 100));
      this._resizeObserver.observe(this.element);
    }

    form.querySelector('.save-css')?.addEventListener('click', (event) => {
      event.preventDefault();
      void this._onSave();
    });
    form.querySelector('.cancel-css')?.addEventListener('click', (event) => {
      event.preventDefault();
      void this.close();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this._onSave();
    });
  }

  async _onClose(_options) {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    if (this.editor) {
      try {
        this.editor.toTextArea();
      } catch (_error) {
        // no-op
      }
      this.editor = null;
    }
  }

  async _onSave() {
    try {
      const css = this.editor?.getValue?.()
        ?? this.element.querySelector('textarea[name="css"]')?.value
        ?? '';
      await game.settings.set(MODULE_ID, SETTING_CALENDAR_WEBFONT_CSS, css);
      ui.notifications.info(localize('LICHSOMA.DAILY_CALENDAR.Settings.WebfontCSS.Saved'));
      await this.close();
    } catch (error) {
      console.error(`[${MODULE_ID}] Webfont CSS save failed`, error);
      ui.notifications.error(localize('LICHSOMA.DAILY_CALENDAR.Settings.WebfontCSS.SaveFailed'));
    }
  }
}

const VALID_TIMES = new Set(['morning', 'afternoon', 'latenight']);

const CALENDAR_CONTAINER_ID = 'lichsoma-daily-calendar-container';
const SCENE_NAV_ID = 'scene-navigation';

/**
 * FVTT 13/14 compatibility helpers.
 * - v13 can pass scene controls as an array with `tools` arrays.
 * - v14 can pass scene controls as an object with `tools` records.
 * - the left UI column/navigation IDs can differ across interface versions/themes.
 */
function findSceneControl(controls, name) {
  if (!controls) return null;
  if (Array.isArray(controls)) return controls.find((c) => c?.name === name) ?? null;
  if (controls[name]) return controls[name];
  if (typeof controls === 'object') {
    return Object.values(controls).find((c) => c?.name === name) ?? null;
  }
  return null;
}

function addSceneControlTool(control, toolName, toolData) {
  if (!control) return false;
  if (!control.tools) control.tools = Array.isArray(control.tools) ? control.tools : {};

  if (Array.isArray(control.tools)) {
    const existing = control.tools.find((t) => t?.name === toolName);
    if (existing) Object.assign(existing, toolData);
    else control.tools.push({ ...toolData, name: toolName });
    return true;
  }

  const tools = control.tools;
  const order = Number.isFinite(toolData.order) ? toolData.order : Object.keys(tools).length;
  tools[toolName] = { ...toolData, name: toolName, order };
  return true;
}

function getSceneNavigationElement() {
  return (
    document.getElementById(SCENE_NAV_ID) ||
    document.getElementById('navigation') ||
    document.querySelector('#ui-left-column-2 #scene-navigation, #ui-left #scene-navigation, #ui-left #navigation, nav#scene-navigation, nav#navigation')
  );
}

function getCalendarMountParent(sceneNav) {
  return (
    document.getElementById('ui-left-column-2') ||
    sceneNav?.parentElement ||
    document.getElementById('ui-left') ||
    document.getElementById('interface') ||
    document.body
  );
}

const state = {
  active: false,
  outsideClickHandler: null,
  timeOfDay: 'morning',
  timeOverlayElement: null,
  afternoonOverlay: null,
  latenightOverlay: null,
};

let _calendarWebfontProfile = { family: '', weight: '', style: '', variationSettings: '' };

/** 컨테이너와 캘린더 내부 요소에 직접 적용해 다른 UI 규칙보다 우선한다. */
function applyCalendarFontInline(profile = _calendarWebfontProfile) {
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
    if (profile.family) el.style.setProperty('font-family', quoteWebfontFamily(profile.family), 'important');
    else el.style.removeProperty('font-family');

    if (profile.weight) el.style.setProperty('font-weight', profile.weight, 'important');
    else el.style.removeProperty('font-weight');

    if (profile.style) el.style.setProperty('font-style', profile.style, 'important');
    else el.style.removeProperty('font-style');

    if (profile.variationSettings) el.style.setProperty('font-variation-settings', profile.variationSettings, 'important');
    else el.style.removeProperty('font-variation-settings');

    if (profile.family || profile.weight || profile.style || profile.variationSettings) {
      el.style.setProperty('font-synthesis', 'weight style', 'important');
    } else {
      el.style.removeProperty('font-synthesis');
    }
  });

  return targets.length;
}

function applyCalendarWebfontCSS() {
  let css = '';
  try {
    css = String(game.settings.get(MODULE_ID, SETTING_CALENDAR_WEBFONT_CSS) ?? '').trim();
  } catch (_) {
    css = '';
  }

  let style = document.getElementById(WEBFONT_STYLE_ID);
  if (!css) {
    style?.remove();
    _calendarWebfontProfile = { family: '', weight: '', style: '', variationSettings: '' };
    document.documentElement.style.removeProperty('--ldc-calendar-font-family');
    applyCalendarFontInline(_calendarWebfontProfile);
    return;
  }

  if (!style) {
    style = document.createElement('style');
    style.id = WEBFONT_STYLE_ID;
    style.type = 'text/css';
    document.head.appendChild(style);
  }
  style.textContent = css;
  _calendarWebfontProfile = extractWebfontPresentation(css);

  if (_calendarWebfontProfile.family) {
    document.documentElement.style.setProperty('--ldc-calendar-font-family', quoteWebfontFamily(_calendarWebfontProfile.family));
  } else {
    document.documentElement.style.removeProperty('--ldc-calendar-font-family');
  }
  applyCalendarFontInline(_calendarWebfontProfile);

  const refresh = () => applyCalendarFontInline(_calendarWebfontProfile);
  try {
    document.fonts?.ready?.then(refresh).catch(() => {});
  } catch (_) {}
  setTimeout(refresh, 250);
  setTimeout(refresh, 1000);
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

function formatI18n(key, data = {}) {
  if (typeof game?.i18n?.format === 'function') return game.i18n.format(key, data);
  let text = localize(key);
  Object.entries(data).forEach(([k, v]) => {
    text = text.replaceAll(`{${k}}`, String(v));
  });
  return text;
}

function getWeekdayLabel(date) {
  const keys = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const key = keys[date.getUTCDay()];
  return key ? localize(`LICHSOMA.DAILY_CALENDAR.Weekdays.${key}`) : '';
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
      if (state.timeOverlayElement === newOverlay) newOverlay.classList.add('visible');
    });
  } else {
    if (wasCreatedNow || !oldOverlay) {
      requestAnimationFrame(() => {
        if (state.timeOverlayElement !== newOverlay) return;
        void newOverlay.getBoundingClientRect();
        requestAnimationFrame(() => {
          if (state.timeOverlayElement === newOverlay && !newOverlay.classList.contains('visible')) newOverlay.classList.add('visible');
        });
      });
    } else if (!newOverlay.classList.contains('visible')) {
      requestAnimationFrame(() => {
        if (state.timeOverlayElement === newOverlay) newOverlay.classList.add('visible');
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
    const taskbarButton = event.target.closest?.(CALENDAR_TASKBAR_BUTTON_SELECTOR);

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
      label.textContent = formatI18n('LICHSOMA.DAILY_CALENDAR.Panel.DayCount', { day: d });
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
  calendarTaskbar.refreshState();

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
  const weekday = computed ? getWeekdayLabel(toUtcDate(computed)) : '';

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
    if (dateEl) dateEl.textContent = `${dateStr} ${formatI18n('LICHSOMA.DAILY_CALENDAR.Panel.DayCount', { day })}`;
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
  applyCalendarWebfontCSS();
}

function unmountCalendar() {
  const container = document.getElementById(CALENDAR_CONTAINER_ID);
  if (container) container.remove();
}

function mountCalendarAboveSceneNav() {
  if (!isCalendarEnabled()) return;

  const sceneNav = getSceneNavigationElement();
  const parent = getCalendarMountParent(sceneNav);
  if (!parent) return;

  const container = ensureCalendarContainer();

  if (container.parentElement !== parent) parent.appendChild(container);
  if (sceneNav?.parentElement === parent) {
    parent.insertBefore(container, sceneNav);
  } else if (parent.firstChild && parent.firstChild !== container) {
    parent.insertBefore(container, parent.firstChild);
  } else if (!container.parentElement) {
    parent.appendChild(container);
  }

  renderCalendar();
  applyCalendarWebfontCSS();
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
  const weekday = computed ? getWeekdayLabel(toUtcDate(computed)) : '';

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
  registerCalendarThemeSetting();
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

  game.settings.registerMenu(MODULE_ID, 'calendarWebfontCSSMenu', {
    name: localize('LICHSOMA.DAILY_CALENDAR.Settings.CalendarWebfont.Name'),
    label: localize('LICHSOMA.DAILY_CALENDAR.Settings.WebfontCSS.EditButton'),
    hint: localize('LICHSOMA.DAILY_CALENDAR.Settings.CalendarWebfont.Hint'),
    icon: 'fas fa-font',
    type: LichsomaDailyCalendarWebfontCSSEditor,
    restricted: true,
  });

  game.settings.register(MODULE_ID, SETTING_CALENDAR_WEBFONT_CSS, {
    name: localize('LICHSOMA.DAILY_CALENDAR.Settings.CalendarWebfont.Name'),
    hint: localize('LICHSOMA.DAILY_CALENDAR.Settings.CalendarWebfont.Hint'),
    scope: 'world',
    config: false,
    type: String,
    default: '',
    onChange: () => applyCalendarWebfontCSS(),
  });

  applyCalendarWebfontCSS();
});

Hooks.once('setup', () => {
  applyCalendarWebfontCSS();
});

Hooks.once('canvasReady', () => {
  applyCalendarWebfontCSS();
});

Hooks.on('getSceneControlButtons', (controls) => {
  // 1.0.1의 의도 유지: GM에게만 컨트롤 버튼을 표시한다.
  if (!game.user?.isGM) return;

  const lighting = findSceneControl(controls, 'lighting');
  if (!lighting) return;

  const toolData = {
    title: 'LICHSOMA.DAILY_CALENDAR.SceneControlTitle',
    icon: BUTTON_ICON,
    button: true,
    visible: true,
    toggle: false,
    // FVTT 13 계열은 onClick, FVTT 14 계열은 onChange를 사용하는 경우가 있어 둘 다 제공한다.
    onClick: () => togglePanel(),
    onChange: () => togglePanel(),
  };

  addSceneControlTool(lighting, 'dailycalendar', toolData);
});

Hooks.on('updateSetting', (setting) => {
  if (setting.namespace && setting.namespace !== MODULE_ID) return;

  if (isOurSettingKey(setting, CALENDAR_THEME_SETTING)) {
    applyCalendarTheme();
    return;
  }

  if (isOurSettingKey(setting, SETTING_CALENDAR_WEBFONT_CSS)) {
    applyCalendarWebfontCSS();
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

Hooks.once('ready', () => {
  applyCalendarTheme();
  applyCalendarWebfontCSS();

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

  calendarTaskbar.initialize();
  refreshTaskbarDate();
  notifyTaskbarStatsRefresh();

});
