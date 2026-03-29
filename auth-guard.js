// AdsMasters PPC Tools - Interner Passwort-Schutz
// Include in every tool page

(function() {
    const PUBLIC_PAGES = ['index', 'help'];
    const currentPage = location.pathname.split('/').pop().replace('.html', '') || 'index';

    if (PUBLIC_PAGES.includes(currentPage)) return;

    const STORAGE_KEY = 'ppc_tools_auth';
    const PASSWORD = 'adsmasters2024';

    if (sessionStorage.getItem(STORAGE_KEY) === 'true') return;

    document.body.style.visibility = 'hidden';
    const pw = prompt('Passwort eingeben:');
    if (pw === PASSWORD) {
        sessionStorage.setItem(STORAGE_KEY, 'true');
        document.body.style.visibility = 'visible';
    } else {
        alert('Falsches Passwort.');
        location.href = 'index.html';
    }
})();

// Logout helper (clears session and redirects to landing)
function ppcLogout() {
    sessionStorage.removeItem('ppc_tools_auth');
    location.href = 'index.html';
}
