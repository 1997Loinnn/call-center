/**
 * 1097 Call-markaz veb-chat vidjeti (F-OMNI-02).
 * Saytga ulash: <script src="https://<call-markaz manzili>/webchat.js" async></script>
 * O'ng pastki burchakda tugma chiqadi; bosilganda chat oynasi (iframe) ochiladi.
 */
(function () {
  if (window.__cc1097Webchat) return;
  window.__cc1097Webchat = true;

  var script = document.currentScript;
  var origin = script && script.src ? new URL(script.src).origin : window.location.origin;
  var frame = null;
  var open = false;

  var button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', '1097 onlayn yordam');
  button.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h16v11H8l-4 4V5z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>' +
    '<span>1097 · Onlayn yordam</span>';
  button.style.cssText =
    'position:fixed;right:20px;bottom:20px;z-index:2147483000;display:flex;align-items:center;gap:8px;' +
    'padding:12px 18px;border:0;border-radius:999px;background:#0b6b6b;color:#fff;cursor:pointer;' +
    "font:600 14px/1.2 'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif;box-shadow:0 8px 24px rgba(15,30,43,.25)";

  function layout() {
    if (!frame) return;
    var small = window.innerWidth < 480;
    frame.style.cssText = small
      ? 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483001;background:#fff'
      : 'position:fixed;right:20px;bottom:84px;width:380px;height:600px;max-height:calc(100vh - 110px);border:0;' +
        'border-radius:16px;z-index:2147483001;background:#fff;box-shadow:0 16px 40px rgba(15,30,43,.25)';
    frame.style.display = open ? 'block' : 'none';
  }

  function toggle(next) {
    open = typeof next === 'boolean' ? next : !open;
    if (open && !frame) {
      frame = document.createElement('iframe');
      frame.src = origin + '/webchat?embed=1';
      frame.title = '1097 onlayn yordam';
      frame.setAttribute('allow', 'clipboard-write');
      document.body.appendChild(frame);
    }
    layout();
  }

  button.addEventListener('click', function () {
    toggle();
  });
  window.addEventListener('resize', layout);
  window.addEventListener('message', function (event) {
    if (event.origin === origin && event.data && event.data.type === 'cc-webchat-close') toggle(false);
  });

  if (document.body) document.body.appendChild(button);
  else document.addEventListener('DOMContentLoaded', function () {
    document.body.appendChild(button);
  });
})();
