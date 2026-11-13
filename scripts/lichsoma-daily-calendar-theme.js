const MODULE_ID = 'lichsoma-daily-calendar';
export const CALENDAR_THEME_SETTING = 'theme';

// Foundry themes its UI regions, not necessarily the body. The floating date
// controls live directly under body, so mirror the scene UI theme for both.
const UI_ROOTS = ['#scene-controls', '#controls', '#ui-left-column-2', '#ui-left', '#interface', '#scene-navigation', '#navigation'];
const UI_ROOT_SELECTOR = UI_ROOTS.join(',');
let themeObserver;
let observedBody;
const themeFieldDisabled = new WeakMap();

export function getInheritedCalendarTheme() {
  const selector = globalThis.game?.modules?.get?.('lichsoma-speaker-selector');
  if (!selector?.active) return null;
  try {
    const value = selector.api?.getChatTheme?.() ?? game.settings.get('lichsoma-speaker-selector', 'chatTheme');
    return ['dark-simple', 'simple-light', 'retro-terminal', 'terminal-red'].includes(value) ? value : 'dark-simple';
  } catch { return 'dark-simple'; }
}

function syncCoreUITheme(body) {
  const inherited = getInheritedCalendarTheme();
  if (inherited) {
    body.dataset.ldcUiTheme = inherited === 'simple-light' ? 'light' : 'dark';
    return;
  }
  let themed;
  for (const selector of UI_ROOTS) {
    const root = body.querySelector(selector);
    if (!root) continue;
    const ancestor = root.closest('.theme-light, .theme-dark');
    if (ancestor && ancestor !== body && ancestor !== body.ownerDocument.documentElement) {
      themed = ancestor;
      break;
    }
    // A themed controls wrapper may sit inside the root.
    // Do not search the whole interface: chat/apps have independent themes.
    if (selector === '#scene-controls' || selector === '#controls') {
      themed = root.querySelector('.themed.theme-light, .themed.theme-dark');
      if (themed) break;
    }
  }
  themed ??= body.closest('.theme-light, .theme-dark');
  body.dataset.ldcUiTheme = themed?.classList.contains('theme-light') ? 'light' : 'dark';
}

function observeCoreUITheme(body) {
  syncCoreUITheme(body);
  if (getInheritedCalendarTheme()) {
    themeObserver?.disconnect();
    observedBody = null;
    return;
  }
  if (observedBody === body) return;
  themeObserver?.disconnect();
  observedBody = body;
  const touchesUIRoot = node => node.nodeType === 1 &&
    (node.matches(UI_ROOT_SELECTOR) || !!node.querySelector(UI_ROOT_SELECTOR));
  themeObserver = new MutationObserver(records => {
    const changed = records.some(record => record.type === 'attributes'
      ? record.target === body || touchesUIRoot(record.target) || !!record.target.closest('#scene-controls, #controls')
      : !!record.target.closest?.('#scene-controls, #controls') || [...record.addedNodes, ...record.removedNodes].some(touchesUIRoot));
    if (changed) syncCoreUITheme(body);
  });
  themeObserver.observe(body, {subtree: true, childList: true, attributes: true, attributeFilter: ['class']});
}

export function applyCalendarTheme(value, body = document.body) {
  if (!body) return;
  if (value === undefined) {
    try { value = game.settings.get(MODULE_ID, CALENDAR_THEME_SETTING); }
    catch { value = 'simple'; }
  }
  const inherited = getInheritedCalendarTheme();
  body.dataset.ldcThemeSource = inherited ? 'speaker' : 'core';
  body.dataset.ldcTheme = ['retro-terminal', 'terminal-red'].includes(inherited ?? value) ? (inherited ?? value) : 'simple';
  observeCoreUITheme(body);
}

export function lockCalendarThemeSetting(app, html) {
  const raw = html ?? app?.element;
  const root = raw?.jquery ? raw[0] : raw;
  const field = root?.querySelector?.(`[name="${MODULE_ID}.${CALENDAR_THEME_SETTING}"]`);
  if (!field) return;
  const inherited = getInheritedCalendarTheme();
  if (inherited) {
    if (!themeFieldDisabled.has(field)) themeFieldDisabled.set(field, field.disabled);
    field.disabled = true;
  } else if (themeFieldDisabled.has(field)) {
    field.disabled = themeFieldDisabled.get(field);
    themeFieldDisabled.delete(field);
  }
  if (inherited) field.value = ['retro-terminal', 'terminal-red'].includes(inherited) ? inherited : 'simple';
  else {
    try { field.value = game.settings.get(MODULE_ID, CALENDAR_THEME_SETTING); }
    catch { /* Settings may not be registered yet. */ }
  }
  const group = field.closest('.form-group');
  if (!group) return;
  let note = group.querySelector('.ldc-theme-inheritance');
  if (inherited && !note) {
    note = document.createElement('p');
    note.className = 'hint ldc-theme-inheritance';
    group.appendChild(note);
  }
  if (note) {
    note.textContent = game.i18n.localize('LICHSOMA.DAILY_CALENDAR.Settings.Theme.Inherited');
    note.hidden = !inherited;
  }
}

export function registerCalendarThemeSetting() {
  Hooks.on('renderSettingsConfig', lockCalendarThemeSetting);
  Hooks.on('lichsoma-speaker-selector.themeChanged', () => {
    applyCalendarTheme();
    lockCalendarThemeSetting(null, document.querySelector('#settings-config, #client-settings'));
  });
  game.settings.register(MODULE_ID, CALENDAR_THEME_SETTING, {
    name: 'LICHSOMA.DAILY_CALENDAR.Settings.Theme.Name',
    hint: 'LICHSOMA.DAILY_CALENDAR.Settings.Theme.Hint',
    scope: 'client', config: true, type: String, default: 'simple',
    choices: {
      simple: 'LICHSOMA.DAILY_CALENDAR.Settings.Theme.Simple',
      'retro-terminal': 'LICHSOMA.DAILY_CALENDAR.Settings.Theme.RetroTerminal',
      'terminal-red': 'LICHSOMA.DAILY_CALENDAR.Settings.Theme.TerminalRed'
    },
    onChange: value => applyCalendarTheme(value)
  });
  applyCalendarTheme();
}
