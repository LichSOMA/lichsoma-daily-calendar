const TASKBAR_MODULE_ID = 'lichsoma-taskbar';
const BUTTON_ID = 'lichsoma-daily-calendar';
export const CALENDAR_TASKBAR_BUTTON_SELECTOR = '#taskbar-daily-calendar-btn, [data-taskbar-extension-id="lichsoma-daily-calendar"]';

/** Use Taskbar 3.0+ API, retaining direct insertion for older taskbars. */
export function createCalendarTaskbarAdapter({onClick, isActive, title}) {
  let registeredApi;
  let handle;
  let lastActive;
  let observer;
  let initialized = false;
  const getApi = () => {
    const api = game.modules.get(TASKBAR_MODULE_ID)?.api ?? globalThis.window?.LichsomaTaskbar?.api;
    return ['buttons', 'buttonState', 'buttonOrder', 'readyHook'].every(feature => api?.supports?.(feature) === true)
      && typeof api?.registerButton === 'function' ? api : null;
  };
  const click = event => {
    event?.stopPropagation();
    if (game.user.isGM) onClick();
  };

  function refreshState() {
    const active = Boolean(isActive());
    if (handle && active !== lastActive) {
      lastActive = active;
      handle.setActive?.(active);
    }
    const legacy = document.getElementById('taskbar-daily-calendar-btn');
    legacy?.classList.toggle('active', active);
    legacy?.setAttribute('aria-pressed', String(active));
  }

  function sync() {
    if (!game.modules.get(TASKBAR_MODULE_ID)?.active || !game.user.isGM) {
      handle?.unregister?.();
      handle = null;
      registeredApi = null;
      document.getElementById('taskbar-daily-calendar-btn')?.remove();
      return;
    }
    const api = getApi();
    if (api) {
      document.getElementById('taskbar-daily-calendar-btn')?.remove();
      if (!handle || api !== registeredApi || (api.getButton && !api.getButton(BUTTON_ID))) {
        handle?.unregister?.();
        lastActive = Boolean(isActive());
        handle = api.registerButton({
          id: BUTTON_ID, icon: 'fa-solid fa-hourglass-half',
          title, ariaLabel: title, order: Number.MAX_SAFE_INTEGER,
          active: lastActive, onClick: click
        });
        registeredApi = api;
      }
    } else {
      handle?.unregister?.();
      handle = null;
      registeredApi = null;
      const right = document.querySelector('#lichsoma-taskbar .taskbar-right');
      if (!right) return;
      if (!document.getElementById('taskbar-daily-calendar-btn')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'taskbar-daily-calendar-btn';
        button.className = 'taskbar-icon-btn';
        button.title = title();
        button.setAttribute('aria-label', title());
        button.innerHTML = '<i class="fa-solid fa-hourglass-half"></i>';
        button.addEventListener('click', click);
        const builtIn = right.querySelector('#taskbar-quest-btn, #taskbar-close-btn, #taskbar-settings-btn, #taskbar-invitations-btn, .taskbar-stats');
        right.insertBefore(button, builtIn);
      }
    }
    refreshState();
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    Hooks.on('lichsoma-taskbar.ready', sync);
    Hooks.on('updateUser', user => { if (user?.id === game.user.id) sync(); });
    sync();
    // Only taskbar creation/removal or replacement of its right region matters.
    // API-owned button renders and unrelated chat mutations do not trigger sync.
    observer = new MutationObserver(records => {
      const touchesTaskbar = node => node.nodeType === 1 &&
        (node.matches('#lichsoma-taskbar, #lichsoma-taskbar .taskbar-right') || !!node.querySelector('#lichsoma-taskbar'));
      const changedRoot = records.some(record => [...record.addedNodes, ...record.removedNodes].some(touchesTaskbar));
      const clearedLegacyRegion = !getApi() && !document.getElementById('taskbar-daily-calendar-btn') &&
        records.some(record => record.target.matches?.('#lichsoma-taskbar .taskbar-right'));
      if (changedRoot || clearedLegacyRegion) sync();
    });
    observer.observe(document.body, {childList: true, subtree: true});
  }

  return {initialize, refreshState};
}
