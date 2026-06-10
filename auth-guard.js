// AdsMasters PPC Tools – Zugriffsschutz via gemeinsamer Hub-Session (SSO)
// Gleiches Supabase-Projekt + gleiche Origin (adsmasters.github.io) wie der Hub
// → wer im Hub eingeloggt ist, ist hier automatisch eingeloggt.
(function () {
  var PUBLIC_PAGES = ['index', 'help', 'pricing'];
  var HUB = 'https://adsmasters.github.io/hub/';
  var SB_URL = 'https://lgrnmiszhhahfcmctmwo.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxncm5taXN6aGhhaGZjbWN0bXdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NjE2NDksImV4cCI6MjA4OTIzNzY0OX0.FDZRGMESves7XbAMs_oMLWmvnywMlVqe8p7f1kt06qk';

  var page = (location.pathname.split('/').pop() || 'index').replace('.html', '') || 'index';
  if (PUBLIC_PAGES.indexOf(page) !== -1) return;

  // Seite verbergen bis Session geprüft ist
  var style = document.createElement('style');
  style.id = '_authHide';
  style.textContent = 'body{visibility:hidden}';
  document.head.appendChild(style);

  function reveal() { var s = document.getElementById('_authHide'); if (s) s.remove(); }
  function toHub() { location.href = HUB; }

  function check() {
    try {
      var sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
      sb.auth.getSession().then(function (r) {
        if (r.data && r.data.session) { window._ppcSb = sb; reveal(); }
        else toHub();
      }).catch(toHub);
    } catch (e) { toHub(); }
  }

  if (window.supabase && window.supabase.createClient) {
    check();
  } else {
    var sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    sc.onload = check;
    sc.onerror = toHub;
    document.head.appendChild(sc);
  }
})();

// Logout: gemeinsame Session beenden → zurück zum Hub
function ppcLogout() {
  try {
    if (window._ppcSb) { window._ppcSb.auth.signOut().finally(function () { location.href = 'https://adsmasters.github.io/hub/'; }); return; }
  } catch (e) {}
  location.href = 'https://adsmasters.github.io/hub/';
}
