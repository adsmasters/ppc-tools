// AdsMasters PPC Tools - Auth Guard
// Include after supabase-js CDN in every tool page

const SUPABASE_URL = 'https://lgrnmiszhhahfcmctmwo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxncm5taXN6aGhhaGZjbWN0bXdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NjE2NDksImV4cCI6MjA4OTIzNzY0OX0.FDZRGMESves7XbAMs_oMLWmvnywMlVqe8p7f1kt06qk';

const STARTER_TOOLS = ['campaign-creator', 'audit', 'negative-manager'];
const ALL_TOOLS = ['campaign-creator', 'audit', 'negative-manager', 'keyword-harvesting', 'wasted-spend', 'bid-optimizer', 'asin-optimizer'];
const PUBLIC_PAGES = ['index', 'landing', 'pricing', 'reset-password', 'help'];

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Hide body until auth check completes
document.body.style.visibility = 'hidden';

(async () => {
    const { data: { session } } = await sb.auth.getSession();
    const currentPage = location.pathname.split('/').pop().replace('.html', '') || 'index';

    // Public pages don't need auth
    if (PUBLIC_PAGES.includes(currentPage)) {
        document.body.style.visibility = 'visible';
        return;
    }

    // Not logged in -> redirect to login
    if (!session) {
        location.href = 'login.html';
        return;
    }

    // Check subscription
    const { data: sub } = await sb.from('ppc_subscriptions')
        .select('plan, status')
        .eq('user_id', session.user.id)
        .single();

    // No active subscription -> pricing page (except dashboard with active sub)
    if (!sub || sub.status !== 'active') {
        if (currentPage === 'dashboard') {
            // Dashboard without sub -> redirect to pricing
            location.href = 'pricing.html';
        } else {
            location.href = 'pricing.html';
        }
        return;
    }

    // Check tool access
    const allowed = sub.plan === 'professional' ? ALL_TOOLS : STARTER_TOOLS;
    if (!allowed.includes(currentPage)) {
        location.href = 'dashboard.html?upgrade=true';
        return;
    }

    // Auth OK - expose user info and show page
    window.ppcUser = session.user;
    window.ppcPlan = sub.plan;
    window.ppcSub = sub;
    document.body.style.visibility = 'visible';
})();

// Logout helper
function ppcLogout() {
    sb.auth.signOut().then(() => {
        location.href = 'login.html';
    });
}
