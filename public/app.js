document.addEventListener('DOMContentLoaded', () => {
    const adminToggleBtn = document.getElementById('adminToggleBtn');
    const closeAdminBtn = document.getElementById('closeAdminBtn');
    const adminModal = document.getElementById('adminModal');
    const postsGrid = document.getElementById('postsGrid');

    let allPosts = [];
    let currentFilter = 'all';
    let searchQuery = '';
    let currentPage = 1;
    const POSTS_PER_PAGE = 4;
    let allCommunityPosts = [];
    let allTechPosts = [];
    let allProjects = [];
    let projectSearchQuery = '';
    let currentProjectPage = 1;
    const PROJECTS_PER_PAGE = 4;

// IntersectionObserver to trigger fade‑in animation for post cards
const postObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      postObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

    // Escape untrusted text before it is placed in innerHTML templates (XSS protection)
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Allow only http(s) and same-site relative URLs in href/src (blocks javascript: and data: URLs).
    // Thumbnails scraped from og:image tags are stored with "&amp;" entities; decode them first so
    // escaping doesn't double-encode them (LinkedIn's CDN rejects "&amp;amp;" URLs with a 403)
    function safeUrl(url) {
        if (!url) return '';
        const decoded = String(url).replace(/&(?:amp|#0*38|#x0*26);/gi, '&');
        try {
            const parsed = new URL(decoded, window.location.origin);
            return (parsed.protocol === 'https:' || parsed.protocol === 'http:') ? escapeHtml(decoded) : '';
        } catch (e) {
            return '';
        }
    }

    // Safely pass an ID into an inline onclick="fn(...)" handler
    function jsArg(value) {
        return escapeHtml(JSON.stringify(String(value ?? '')));
    }

    function truncateSummary(text) {
        if (!text) return '';
        const words = text.split(/\s+/);
        if (words.length > 30) {
            return words.slice(0, 30).join(' ') + '...';
        }
        return text;
    }

    function generateShareButtonsHtml(title, url, summary) {
        const shareUrl = url || window.location.href;
        const encodedUrl = encodeURIComponent(shareUrl);
        const encodedTitle = encodeURIComponent(title || 'AI Foundation Australia');
        const encodedText = encodeURIComponent(summary ? truncateSummary(summary) : (title || 'Check out this update'));

        const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
        const twUrl = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`;
        const liUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
        const mailUrl = `mailto:?subject=${encodedTitle}&body=${encodedText}%0A%0A${encodedUrl}`;

        return `
            <div class="post-share-row">
                <span class="share-label"><i class="fa-solid fa-share-nodes"></i> Share</span>
                <div class="share-buttons">
                    <a href="${fbUrl}" target="_blank" rel="noopener noreferrer" class="share-btn share-facebook" title="Share on Facebook" aria-label="Share on Facebook">
                        <i class="fa-brands fa-facebook-f"></i>
                    </a>
                    <a href="${twUrl}" target="_blank" rel="noopener noreferrer" class="share-btn share-twitter" title="Share on X (Twitter)" aria-label="Share on X (Twitter)">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="#ffffff" style="display:block;">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                    </a>
                    <a href="${liUrl}" target="_blank" rel="noopener noreferrer" class="share-btn share-linkedin" title="Share on LinkedIn" aria-label="Share on LinkedIn">
                        <i class="fa-brands fa-linkedin-in"></i>
                    </a>
                    <a href="${mailUrl}" class="share-btn share-email" title="Share via Email" aria-label="Share via Email">
                        <i class="fa-solid fa-envelope"></i>
                    </a>
                </div>
            </div>
        `;
    }

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    }

    // =========================================================================
    // Firebase Google Authentication Controls (Navbar & Admin)
    // =========================================================================
    // =========================================================================
    // Firebase Google Authentication & Integrated Settings Dropdown Menu
    // (Replaces separate settings button with Google Log In + Dropdown)
    // =========================================================================
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    const googleSignOutBtn = document.getElementById('googleSignOutBtn');
    const userMenuWrapper = document.getElementById('userMenuWrapper');
    const userProfileBadge = document.getElementById('userProfileBadge');
    const userAvatarImg = document.getElementById('userAvatarImg');
    const userDisplayName = document.getElementById('userDisplayName');
    const userDropdownCaret = document.getElementById('userDropdownCaret');
    const userDropdownMenu = document.getElementById('userDropdownMenu');
    const menuUserAvatar = document.getElementById('menuUserAvatar');
    const menuUserName = document.getElementById('menuUserName');
    const menuUserEmail = document.getElementById('menuUserEmail');
    const menuUserRoleBadge = document.getElementById('menuUserRoleBadge');
    
    // Dropdown Settings Action Buttons & Role Sections
    const supporterMenuSection = document.getElementById('supporterMenuSection');
    const adminMenuSection = document.getElementById('adminMenuSection');
    const menuRegisterDetailsBtn = document.getElementById('menuRegisterDetailsBtn');
    const menuAdminSettingsBtn = document.getElementById('menuAdminSettingsBtn');
    const menuUploadPostBtn = document.getElementById('menuUploadPostBtn');
    const menuUploadImageBtn = document.getElementById('menuUploadImageBtn');
    const menuManagePostsBtn = document.getElementById('menuManagePostsBtn');
    const menuDatabaseActivityBtn = document.getElementById('menuDatabaseActivityBtn');
    const menuServicePricesBtn = document.getElementById('menuServicePricesBtn');

    // Supporter Register Details Modal Elements
    const userDetailsModal = document.getElementById('userDetailsModal');
    const closeUserDetailsBtn = document.getElementById('closeUserDetailsBtn');
    const cancelUserDetailsBtn = document.getElementById('cancelUserDetailsBtn');
    const userDetailsForm = document.getElementById('userDetailsForm');
    const userFormDisplayName = document.getElementById('userFormDisplayName');
    const userFormEmail = document.getElementById('userFormEmail');
    const userFormPhone = document.getElementById('userFormPhone');
    const userFormStatusMsg = document.getElementById('userFormStatusMsg');

    // Address Box Elements
    const userFormAddressApartment = document.getElementById('userFormAddressApartment');
    const userFormAddressStreet = document.getElementById('userFormAddressStreet');
    const userFormAddressSuburb = document.getElementById('userFormAddressSuburb');
    const userFormAddressState = document.getElementById('userFormAddressState');
    const userFormAddressCountry = document.getElementById('userFormAddressCountry');
    const userFormAddressPostcode = document.getElementById('userFormAddressPostcode');
    
    const adminGoogleLoginBtn = document.getElementById('adminGoogleLoginBtn');

    const SUPERADMIN_UIDS = ['ZK79FRQoVlYhsgvMibhi81dRUWj2', 'L5euSJAfNKdDOX6mT0qmrCGjUA53'];
    const SUPERADMIN_EMAILS = ['davidrobertson.info@gmail.com', 'support@aifoundation.net.au'];

    function isSuperAdminUser(uid, email) {
        const normUid = (uid || '').trim();
        const normEmail = (email || '').toLowerCase().trim();
        return SUPERADMIN_UIDS.includes(normUid) || SUPERADMIN_EMAILS.includes(normEmail);
    }

    // A chat reply really from a SuperAdmin: only the server writes messages under these UIDs ('superadmin' in older
    // records), while anyone can put any senderRole or senderName on a message they write straight to Firestore
    function isSuperAdminSenderUid(senderUid) {
        return senderUid === 'superadmin' || SUPERADMIN_UIDS.includes(senderUid);
    }

    function checkIsSuperAdmin(user) {
        if (!user) return false;
        if (isSuperAdminUser(user.uid, user.email)) return true;
        if (user.isSuperAdmin === true) return true;
        const role = (user.role || '').toLowerCase();
        const status = (user.status || '').toLowerCase();
        const classification = (user.classification || '').toLowerCase();
        return role === 'superadmin' || status === 'superadmin' || classification === 'superadmin';
    }

    // Administrator Role Checker strictly checked against Firebase
    function checkIsAdmin(user) {
        if (!user) return false;
        if (checkIsSuperAdmin(user)) return true;
        if (user.isAdmin === true || user.verifiedAdmin === true) return true;
        const role = (user.role || '').toLowerCase();
        const status = (user.status || '').toLowerCase();
        return role === 'admin' || role === 'super_admin' || role === 'superadmin' || status === 'admin' || status === 'superadmin';
    }

    // Admin Tab Constants
    const SUPER_ADMIN_TABS = [
        { id: 'admin-register-details', icon: 'fa-solid fa-id-card', title: 'Register Your Details' },
        { id: 'admin-settings-overview', icon: 'fa-solid fa-sliders', title: 'Settings & Admin Panel' },
        { id: 'admin-supporter-chat', icon: 'fa-solid fa-comments', title: 'Message Box' },
        { id: 'admin-upload-post', icon: 'fa-solid fa-upload', title: 'Upload Content' },
        { id: 'admin-upload-image', icon: 'fa-solid fa-cloud-arrow-up', title: 'Upload Image' },
        { id: 'admin-manage-posts', icon: 'fa-solid fa-list-check', title: 'Manage Posts' },
        { id: 'admin-services-pricing', icon: 'fa-solid fa-tags', title: 'Services & Pricing' },
        { id: 'admin-database-activity', icon: 'fa-solid fa-database', title: 'Database Activity' },
        { id: 'admin-buy-tokens', icon: 'fa-solid fa-coins', title: 'Buy Tokens' },
        { id: 'admin-token-accounts', icon: 'fa-solid fa-wallet', title: 'Token Accounts' },
        { id: 'admin-strategy-briefs', icon: 'fa-solid fa-wand-magic-sparkles', title: 'Strategy Briefs' },
        { id: 'admin-regional-edu-studio', icon: 'fa-solid fa-graduation-cap', title: 'Regional Edu Studio' },
        { id: 'admin-tool-governance-studio', icon: 'fa-solid fa-toolbox', title: 'Tool Governance Studio' },
        { id: 'admin-managed-agent-studio', icon: 'fa-solid fa-robot', title: 'Managed Agent Studio' }
    ];

    const SUPPORTER_TABS = [
        { id: 'supporter-tab-chat', icon: 'fa-solid fa-comments', title: 'Direct Chat with Team' },
        { id: 'admin-register-details', icon: 'fa-solid fa-id-card', title: 'Register Your Details' },
        { id: 'admin-buy-tokens', icon: 'fa-solid fa-coins', title: 'Buy Tokens', iconColor: '#f59e0b' }
    ];

    // Administration & Settings menu order: the sections clicked most in this browser come first, and
    // sections with equal clicks (or none yet) are alphabetical. Re-sorted each time the panel opens,
    // so items never move while being clicked
    const ADMIN_TAB_USE_KEY = 'aifoundation_admin_tab_clicks';

    function getAdminTabUse() {
        try {
            const stored = JSON.parse(localStorage.getItem(ADMIN_TAB_USE_KEY) || '{}');
            return stored && typeof stored === 'object' ? stored : {};
        } catch (e) {
            return {};
        }
    }

    function recordAdminTabUse(targetId) {
        if (!SUPER_ADMIN_TABS.some(tab => tab.id === targetId)) return;
        try {
            const counts = getAdminTabUse();
            counts[targetId] = (Number(counts[targetId]) || 0) + 1;
            localStorage.setItem(ADMIN_TAB_USE_KEY, JSON.stringify(counts));
        } catch (e) {
            // Private browsing or blocked storage: the menu stays alphabetical
        }
    }

    function sortedAdminTabs() {
        const counts = getAdminTabUse();
        const uses = tab => Number(counts[tab.id]) || 0;
        return [...SUPER_ADMIN_TABS].sort((a, b) => uses(b) - uses(a) || a.title.localeCompare(b.title));
    }

    function sortAdminSidebar() {
        const list = document.getElementById('adminSuperTabs');
        if (!list) return;
        const order = sortedAdminTabs().map(tab => tab.id);
        [...list.querySelectorAll('.sidebar-item')]
            .sort((a, b) => order.indexOf(a.dataset.target) - order.indexOf(b.dataset.target))
            .forEach(item => list.appendChild(item));
    }

    // Mobile Collapsible Top Menu Helpers
    function renderMobileMenuItems(isSuperAdmin) {
        const list = document.getElementById('adminMobileItemsList');
        if (!list) return;

        // Only tabs this page has (the hidden original services.html has no Services & Pricing tab)
        const tabs = (isSuperAdmin ? sortedAdminTabs() : SUPPORTER_TABS).filter(tab => document.getElementById(tab.id));
        list.dataset.menu = isSuperAdmin ? 'admin' : 'supporter';
        list.innerHTML = tabs.map(tab => `
            <li class="admin-mobile-menu-item" data-target="${tab.id}">
                <div class="admin-mobile-item-left">
                    <i class="${tab.icon}" ${tab.iconColor ? `style="color: ${tab.iconColor};"` : ''}></i>
                    <span>${tab.title}</span>
                </div>
                <i class="fa-solid fa-check active-check"></i>
            </li>
        `).join('');
    }

    function toggleMobileMenu(force = null) {
        const dropdown = document.getElementById('adminMobileDropdownMenu');
        const toggleBtn = document.getElementById('adminMobileMenuToggle');
        if (!dropdown || !toggleBtn) return;

        const isOpen = force !== null ? force : !dropdown.classList.contains('is-open');
        if (isOpen) {
            dropdown.classList.add('is-open');
            toggleBtn.classList.add('is-open');
            toggleBtn.setAttribute('aria-expanded', 'true');
        } else {
            dropdown.classList.remove('is-open');
            toggleBtn.classList.remove('is-open');
            toggleBtn.setAttribute('aria-expanded', 'false');
        }
    }

    function closeMobileMenu() {
        toggleMobileMenu(false);
    }

    // Comprehensive Device & Screen Detection for Android, iPad, iPhone, and Touch Tablets
    function updateDeviceAdminMode() {
        const ua = navigator.userAgent || '';
        // iPad detection: Handles both classic iPad UA and iPadOS 13+ desktop-class Safari (MacIntel + touch points)
        const isIPad = /iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isIPhone = /iPhone|iPod/i.test(ua);
        const isAndroid = /Android/i.test(ua);
        const isCoarseTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        const isTabletOrMobileWidth = window.innerWidth <= 1024 || (isCoarseTouch && window.innerWidth <= 1366);

        const isTargetDevice = isIPad || isIPhone || isAndroid || isTabletOrMobileWidth;

        if (document.body) {
            if (isAndroid) document.body.classList.add('device-android');
            if (isIPad) document.body.classList.add('device-ipad');
            if (isIPhone) document.body.classList.add('device-ios');
            if (isTargetDevice) {
                document.body.classList.add('admin-touch-device');
            } else if (!isIPad && !isIPhone && !isAndroid) {
                document.body.classList.remove('admin-touch-device');
            }
        }

        if (adminModal) {
            if (isTargetDevice) {
                adminModal.classList.add('mobile-tablet-mode');
            } else if (!isIPad && !isIPhone && !isAndroid) {
                adminModal.classList.remove('mobile-tablet-mode');
            }
        }

        // Strictly enforce DOM styles on the sidebars and mobile nav bar
        const sidebars = document.querySelectorAll('.admin-panel-sidebar, #adminSuperSidebar, #adminSupporterSidebar');
        const mobileNavBar = document.getElementById('adminMobileNavBar');

        if (isTargetDevice) {
            sidebars.forEach(el => {
                el.style.setProperty('display', 'none', 'important');
            });
            if (mobileNavBar) {
                mobileNavBar.style.setProperty('display', 'flex', 'important');
            }
        } else {
            // Genuine desktop mode: restore standard display behavior
            const currentUser = window.firebaseService?.getCurrentUser?.();
            const isSuper = checkIsSuperAdmin(currentUser);
            const superSidebar = document.getElementById('adminSuperSidebar');
            const supporterSidebar = document.getElementById('adminSupporterSidebar');
            const mainSidebar = document.querySelector('.admin-panel-sidebar');

            if (mainSidebar) mainSidebar.style.removeProperty('display');
            if (isSuper) {
                if (superSidebar) superSidebar.style.display = 'block';
                if (supporterSidebar) supporterSidebar.style.display = 'none';
            } else {
                if (superSidebar) superSidebar.style.display = 'none';
                if (supporterSidebar) supporterSidebar.style.display = 'block';
            }
            if (mobileNavBar) {
                mobileNavBar.style.removeProperty('display');
            }
        }

        return isTargetDevice;
    }

    // Admin Tab Switching (Synchronized between desktop sidebar and mobile collapsible menu)
    function switchAdminTab(targetId) {
        if (!targetId) return;

        // Update all desktop sidebar items across both superadmin and supporter sidebars
        const allSidebarItems = document.querySelectorAll('.admin-panel-sidebar .sidebar-item');
        allSidebarItems.forEach(t => {
            if (t.getAttribute('data-target') === targetId) {
                t.classList.add('active');
            } else {
                t.classList.remove('active');
            }
        });

        // Update mobile collapsible menu header (icon, title)
        const allTabs = [...SUPER_ADMIN_TABS, ...SUPPORTER_TABS];
        const currentTabObj = allTabs.find(t => t.id === targetId);
        if (currentTabObj) {
            const currentIcon = document.getElementById('adminMobileCurrentIcon');
            const currentText = document.getElementById('adminMobileCurrentText');
            if (currentIcon) {
                currentIcon.className = currentTabObj.icon;
                if (currentTabObj.iconColor) {
                    currentIcon.style.color = currentTabObj.iconColor;
                } else {
                    currentIcon.style.color = '';
                }
            }
            if (currentText) {
                currentText.textContent = currentTabObj.title;
            }
        }

        // Update active highlight on mobile menu items
        const mobileItems = document.querySelectorAll('.admin-mobile-menu-item');
        mobileItems.forEach(item => {
            if (item.getAttribute('data-target') === targetId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Automatically close mobile menu once selection is made
        closeMobileMenu();

        // Update mobile dropdown select (backward-compatibility)
        const mobileSelect = document.getElementById('adminMobileTabSelect');
        if (mobileSelect && mobileSelect.value !== targetId) {
            mobileSelect.value = targetId;
        }

        // Show matching content pane (a tab can ask for another display type with data-display, e.g. flex)
        const adminTabContents = document.querySelectorAll('.admin-tab-content');
        adminTabContents.forEach(content => {
            content.style.display = content.id === targetId ? (content.dataset.display || 'block') : 'none';
        });

        const currentUser = window.firebaseService?.getCurrentUser?.();

        // Trigger dynamic tab loaders
        if (targetId === 'admin-manage-posts') {
            if (typeof renderAdminAllPosts === 'function') renderAdminAllPosts();
        } else if (targetId === 'admin-database-activity') {
            if (typeof loadDatabaseRecentInputs === 'function') loadDatabaseRecentInputs();
        } else if (targetId === 'admin-supporter-chat') {
            const coreBox = document.getElementById('messageBoxCoreContainer');
            const modalHost = document.getElementById('admin-supporter-chat');
            if (coreBox && modalHost && coreBox.parentElement !== modalHost) {
                modalHost.appendChild(coreBox);
            }
            if (typeof loadMessageBox === 'function') loadMessageBox();
        } else if (targetId === 'admin-services-pricing') {
            if (typeof loadAdminServicePrices === 'function') loadAdminServicePrices();
        } else if (targetId === 'admin-buy-tokens') {
            if (typeof loadBuyTokens === 'function') loadBuyTokens();
        } else if (targetId === 'admin-token-accounts') {
            if (typeof loadTokenAccounts === 'function') loadTokenAccounts();
        } else if (targetId === 'admin-strategy-briefs') {
            if (typeof loadStrategyBriefs === 'function') loadStrategyBriefs();
        } else if (targetId === 'admin-regional-edu-studio') {
            if (typeof loadRegionalEduStudio === 'function') loadRegionalEduStudio();
        } else if (targetId === 'admin-tool-governance-studio') {
            if (typeof loadToolGovernanceStudio === 'function') loadToolGovernanceStudio();
        } else if (targetId === 'admin-managed-agent-studio') {
            if (typeof loadManagedAgentStudio === 'function') loadManagedAgentStudio();
        } else if (targetId === 'supporter-tab-chat') {
            if (currentUser && typeof loadSupporterChatMessages === 'function') {
                loadSupporterChatMessages(currentUser.uid);
                if (supporterChatPollTimer) clearInterval(supporterChatPollTimer);
                supporterChatPollTimer = setInterval(() => {
                    if (adminModal && adminModal.style.display === 'flex') {
                        const chatPane = document.getElementById('supporter-tab-chat');
                        if (chatPane && chatPane.style.display === 'block') {
                            loadSupporterChatMessages(currentUser.uid, true);
                        }
                    }
                }, 5000);
            }
        } else if (targetId === 'admin-register-details') {
            if (currentUser) populateUserDetailsForm(currentUser);
        }
    }

    // Populate user profile details into the details form
    async function populateUserDetailsForm(currentUser) {
        if (!currentUser) return;
        const userFormDisplayName = document.getElementById('userFormDisplayName');
        const userFormEmail = document.getElementById('userFormEmail');
        const userFormPhone = document.getElementById('userFormPhone');
        const userFormAddressApartment = document.getElementById('userFormAddressApartment');
        const userFormAddressStreet = document.getElementById('userFormAddressStreet');
        const userFormAddressSuburb = document.getElementById('userFormAddressSuburb');
        const userFormAddressState = document.getElementById('userFormAddressState');
        const userFormAddressCountry = document.getElementById('userFormAddressCountry');
        const userFormAddressPostcode = document.getElementById('userFormAddressPostcode');
        const userFormStatusMsg = document.getElementById('userFormStatusMsg');

        if (userFormDisplayName && !userFormDisplayName.value) {
            userFormDisplayName.value = currentUser.displayName || '';
        }
        if (userFormEmail) {
            userFormEmail.value = currentUser.email || '';
        }
        if (userFormStatusMsg) {
            userFormStatusMsg.style.display = 'none';
        }

        try {
            const profile = await window.firebaseService?.getUserProfile?.(currentUser.uid);
            if (profile) {
                if (profile.phoneNumber && userFormPhone) {
                    userFormPhone.value = profile.phoneNumber;
                }
                if (profile.displayName && userFormDisplayName && !userFormDisplayName.value) {
                    userFormDisplayName.value = profile.displayName;
                }
                const addr = profile.address || {};
                if (userFormAddressApartment) userFormAddressApartment.value = addr.apartment || profile.addressApartment || '';
                if (userFormAddressStreet) userFormAddressStreet.value = addr.street || profile.addressStreet || '';
                if (userFormAddressSuburb) userFormAddressSuburb.value = addr.suburb || profile.addressSuburb || '';
                if (userFormAddressState) userFormAddressState.value = addr.state || profile.addressState || '';
                if (userFormAddressCountry) userFormAddressCountry.value = addr.country || profile.addressCountry || 'Australia';
                if (userFormAddressPostcode) userFormAddressPostcode.value = addr.postcode || profile.addressPostcode || '';
            }
        } catch (e) {
            console.warn('[Profile Lookup] Notice:', e.message);
        }
    }

    // Close authenticated admin / supporter panel
    function closeAdminPanel() {
        if (adminModal) {
            adminModal.style.display = 'none';
        }
        closeMobileMenu();
        if (supporterChatPollTimer) {
            clearInterval(supporterChatPollTimer);
            supporterChatPollTimer = null;
        }
        if (userProfileBadge) {
            userProfileBadge.classList.remove('active');
            userProfileBadge.setAttribute('aria-expanded', 'false');
        }
    }

    // Unified Authenticated Panel Opener (Directly opened when clicking avatar icon on top right)
    async function openAuthenticatedPanel(targetTab = null) {
        if (!adminModal) return;

        // Close any dropdown menu
        if (userDropdownMenu) userDropdownMenu.style.display = 'none';
        if (userProfileBadge) {
            userProfileBadge.classList.remove('active');
            userProfileBadge.setAttribute('aria-expanded', 'false');
        }

        const currentUser = window.firebaseService?.getCurrentUser?.();
        if (!currentUser) {
            // Not signed in: trigger Google Sign In
            if (window.firebaseService?.signInWithGoogle) {
                window.firebaseService.signInWithGoogle();
            }
            return;
        }

        let isSuper = checkIsSuperAdmin(currentUser);
        let isAdmin = isSuper || checkIsAdmin(currentUser);

        // Verify with backend if not already verified
        if (!isSuper && !isAdmin && currentUser.email) {
            try {
                const verifyRes = await fetch('/api/auth/admin-verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: currentUser.email, uid: currentUser.uid })
                });
                const verifyData = await verifyRes.json();
                if (verifyData.authorized) {
                    isAdmin = true;
                    if (verifyData.isSuperAdmin || verifyData.role === 'superadmin') isSuper = true;
                }
            } catch (e) {
                console.warn('[Admin Verify] Notice:', e.message);
            }
        }

        adminModal.style.display = 'flex';
        const isTargetDevice = updateDeviceAdminMode();

        // Views
        const loginView = document.getElementById('adminLoginView');
        const panelView = document.getElementById('adminPanelView');
        if (loginView) loginView.style.display = 'none';
        if (panelView) panelView.style.display = 'flex';

        const superTopWrap = document.getElementById('adminTopBarSuperWrap');
        const supporterTopWrap = document.getElementById('adminTopBarSupporterWrap');
        const superSidebar = document.getElementById('adminSuperSidebar');
        const supporterSidebar = document.getElementById('adminSupporterSidebar');
        const mobileSelect = document.getElementById('adminMobileTabSelect');
        const adminPanelUserEmail = document.getElementById('adminPanelUserEmail');
        const supporterPanelUserEmail = document.getElementById('supporterPanelUserEmail');
        const panelFooterUserEmail = document.getElementById('panelFooterUserEmail');
        const panelFooterRoleBadge = document.getElementById('panelFooterRoleBadge');

        if (panelFooterUserEmail) {
            panelFooterUserEmail.textContent = currentUser.email || 'user@example.com';
        }

        if (isSuper) {
            // ==========================================
            // SUPERADMIN INTERFACE
            // ==========================================
            if (superTopWrap) superTopWrap.style.display = 'flex';
            if (supporterTopWrap) supporterTopWrap.style.display = 'none';
            if (isTargetDevice) {
                if (superSidebar) superSidebar.style.setProperty('display', 'none', 'important');
                if (supporterSidebar) supporterSidebar.style.setProperty('display', 'none', 'important');
            } else {
                if (superSidebar) superSidebar.style.display = 'block';
                if (supporterSidebar) supporterSidebar.style.display = 'none';
            }
            if (adminPanelUserEmail) adminPanelUserEmail.textContent = currentUser.email || 'support@aifoundation.net.au';

            if (panelFooterRoleBadge) {
                panelFooterRoleBadge.className = 'user-role-badge role-admin';
                panelFooterRoleBadge.innerHTML = '<i class="fa-solid fa-crown"></i> SuperAdmin';
            }

            sortAdminSidebar();
            renderMobileMenuItems(true);

            if (mobileSelect) {
                mobileSelect.innerHTML = `
                    <option value="admin-register-details">Register Your Details/ Update name, email &amp; phone</option>
                    <option value="admin-settings-overview">Settings &amp; Admin Panel</option>
                    <option value="admin-supporter-chat">Message Box</option>
                    <option value="admin-upload-post">Upload Content</option>
                    <option value="admin-upload-image">Upload Image</option>
                    <option value="admin-manage-posts">Manage Posts</option>
                    <option value="admin-services-pricing">Services &amp; Pricing</option>
                    <option value="admin-database-activity">Database Activity</option>
                    <option value="admin-buy-tokens">Buy Tokens</option>
                    <option value="admin-token-accounts">Token Accounts</option>
                    <option value="admin-strategy-briefs">Strategy Briefs</option>
                    <option value="admin-regional-edu-studio">Regional Edu Studio</option>
                    <option value="admin-tool-governance-studio">Tool Governance Studio</option>
                    <option value="admin-managed-agent-studio">Managed Agent Studio</option>
                `;
            }

            document.cookie = "adminAuth=true; max-age=" + (365 * 24 * 60 * 60) + "; path=/";

            const defaultTab = targetTab || 'admin-settings-overview';
            switchAdminTab(defaultTab);
        } else {
            // ==========================================
            // SUPPORTER INTERFACE (STRICTLY SUPPORTER ONLY)
            // ==========================================
            if (superTopWrap) superTopWrap.style.display = 'none';
            if (supporterTopWrap) supporterTopWrap.style.display = 'flex';
            if (isTargetDevice) {
                if (superSidebar) superSidebar.style.setProperty('display', 'none', 'important');
                if (supporterSidebar) supporterSidebar.style.setProperty('display', 'none', 'important');
            } else {
                if (superSidebar) superSidebar.style.display = 'none';
                if (supporterSidebar) supporterSidebar.style.display = 'block';
            }
            if (supporterPanelUserEmail) supporterPanelUserEmail.textContent = currentUser.email || 'supporter@example.com';

            if (panelFooterRoleBadge) {
                panelFooterRoleBadge.className = 'user-role-badge role-supporter';
                panelFooterRoleBadge.innerHTML = '<i class="fa-solid fa-user-check"></i> Supporter';
            }

            renderMobileMenuItems(false);

            if (mobileSelect) {
                mobileSelect.innerHTML = `
                    <option value="supporter-tab-chat">Direct chat with administrative team</option>
                    <option value="admin-register-details">Register Your Details/ Update name, email &amp; phone</option>
                    <option value="admin-buy-tokens">Buy Tokens</option>
                `;
            }

            const defaultTab = targetTab || 'supporter-tab-chat';
            switchAdminTab(defaultTab);
        }

        populateUserDetailsForm(currentUser);
    }

    // Aliases for legacy hooks
    async function openAdminSettings(targetTab = null) {
        return openAuthenticatedPanel(targetTab);
    }

    async function openUserDetailsModal() {
        return openAuthenticatedPanel('admin-register-details');
    }

    // Direct Avatar Click -> Opens Admin/Supporter Panel Directly
    if (userProfileBadge) {
        userProfileBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            openAuthenticatedPanel();
        });
    }

    // Mobile Select Event (backward-compatibility fallback)
    const adminMobileTabSelectEl = document.getElementById('adminMobileTabSelect');
    if (adminMobileTabSelectEl) {
        adminMobileTabSelectEl.addEventListener('change', (e) => {
            switchAdminTab(e.target.value);
        });
    }

    // Mobile Collapsible Top Menu Toggle & Navigation
    const adminMobileMenuToggle = document.getElementById('adminMobileMenuToggle');
    if (adminMobileMenuToggle) {
        adminMobileMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMobileMenu();
        });
    }

    const adminMobileItemsList = document.getElementById('adminMobileItemsList');
    if (adminMobileItemsList) {
        adminMobileItemsList.addEventListener('click', (e) => {
            const item = e.target.closest('.admin-mobile-menu-item');
            if (item) {
                const targetId = item.getAttribute('data-target');
                if (targetId) {
                    if (adminMobileItemsList.dataset.menu === 'admin') recordAdminTabUse(targetId);
                    switchAdminTab(targetId);
                }
            }
        });
    }

    // Dismiss mobile menu when clicking outside
    document.addEventListener('click', (e) => {
        const navBar = document.getElementById('adminMobileNavBar');
        if (navBar && !navBar.contains(e.target)) {
            closeMobileMenu();
        }
    });

    // Responsive and Device Event Listeners (Android, iPad, iPhone, and Tablet/Mobile orientation & resize)
    window.addEventListener('resize', updateDeviceAdminMode);
    window.addEventListener('orientationchange', updateDeviceAdminMode);
    updateDeviceAdminMode();

    // Desktop Sidebar Tabs Event Delegation
    document.querySelectorAll('.admin-panel-sidebar').forEach(sidebar => {
        sidebar.addEventListener('click', (e) => {
            const item = e.target.closest('.sidebar-item');
            if (item) {
                const targetId = item.getAttribute('data-target');
                if (targetId && item.closest('#adminSuperTabs')) recordAdminTabUse(targetId);
                if (targetId) switchAdminTab(targetId);
            }
        });
    });

    // Close Panel Buttons
    const closeAdminPanelBtn = document.getElementById('closeAdminPanelBtn');
    if (closeAdminPanelBtn) {
        closeAdminPanelBtn.addEventListener('click', closeAdminPanel);
    }
    if (closeAdminBtn) {
        closeAdminBtn.addEventListener('click', closeAdminPanel);
    }

    // Escape Key Listener to dismiss modal and collapsible menu
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMobileMenu();
            if (adminModal && adminModal.style.display === 'flex') {
                closeAdminPanel();
            }
        }
    });

    // Sign out of the site: close the menus and panel, clear the session cookies, and end the Firebase sign-in
    async function signOutOfSite() {
        if (userDropdownMenu) userDropdownMenu.style.display = 'none';
        closeAdminPanel();
        document.cookie = "adminAuth=; max-age=0; path=/";
        document.cookie = "adminAuth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie = "userAuth=; max-age=0; path=/";
        document.cookie = "userAuth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        try {
            if (window.firebaseService?.signOutGoogle) await window.firebaseService.signOutGoogle();
        } catch (err) {
            console.error('[Firebase Auth] Sign out error:', err);
        }
    }

    // "Log out?" box with Yes and No. Resolves true for Yes; No, Esc or a click outside the box resolve false
    let signOutDialog = null;
    function confirmSignOut() {
        if (!signOutDialog) {
            signOutDialog = document.createElement('dialog');
            signOutDialog.className = 'signout-confirm';
            signOutDialog.setAttribute('aria-labelledby', 'signOutConfirmTitle');
            signOutDialog.innerHTML = `
                <div class="signout-confirm-box">
                    <h3 id="signOutConfirmTitle">Log out?</h3>
                    <p>Are you sure you want to log out?</p>
                    <div class="signout-confirm-actions">
                        <button type="button" class="signout-confirm-no" value="no">No, stay logged in</button>
                        <button type="button" class="signout-confirm-yes" value="yes">Yes, log out</button>
                    </div>
                </div>`;
            signOutDialog.addEventListener('click', (e) => {
                const button = e.target.closest('button[value]');
                if (button) signOutDialog.close(button.value);
                else if (e.target === signOutDialog) signOutDialog.close('no'); // the dimmed backdrop around the box
            });
            // Esc closes only this box, not the admin panel behind it
            signOutDialog.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') e.stopPropagation();
            });
            document.body.appendChild(signOutDialog);
        }
        return new Promise(resolve => {
            signOutDialog.returnValue = 'no';
            signOutDialog.addEventListener('close', () => resolve(signOutDialog.returnValue === 'yes'), { once: true });
            signOutDialog.showModal();
            signOutDialog.querySelector('.signout-confirm-no').focus();
        });
    }

    // Sign Out Button inside Admin Panel Footer: asks first
    const panelSignOutBtn = document.getElementById('panelSignOutBtn');
    if (panelSignOutBtn) {
        panelSignOutBtn.addEventListener('click', async () => {
            if (await confirmSignOut()) await signOutOfSite();
        });
    }

    // Admin Overview Quick-Jump Cards
    document.querySelectorAll('.admin-overview-card').forEach(card => {
        card.addEventListener('click', () => {
            const jumpTarget = card.getAttribute('data-jump');
            if (jumpTarget) {
                recordAdminTabUse(jumpTarget);
                switchAdminTab(jumpTarget);
            }
        });
    });

    if (adminModal) {
        adminModal.addEventListener('click', (e) => {
            if (e.target === adminModal) {
                closeAdminPanel();
            }
        });
        // The page behind stays still while the panel is open. Several places show and hide the panel,
        // so follow its display style rather than each open/close call
        new MutationObserver(() => {
            document.documentElement.classList.toggle('admin-panel-open', adminModal.style.display === 'flex');
        }).observe(adminModal, { attributes: true, attributeFilter: ['style'] });

        // The panel's scrollbars are hidden, so fade its bottom edge while there's more to scroll to.
        // Re-checked on scroll, resize, tab switches, list updates and image loads
        const adminContentPane = adminModal.querySelector('.admin-panel-content-pane');
        if (adminContentPane) {
            const updateScrollCue = () => {
                const moreBelow = adminContentPane.scrollHeight - adminContentPane.scrollTop - adminContentPane.clientHeight > 4;
                adminContentPane.classList.toggle('has-more-below', moreBelow);
            };
            adminContentPane.addEventListener('scroll', updateScrollCue, { passive: true });
            adminContentPane.addEventListener('load', updateScrollCue, true);
            new ResizeObserver(updateScrollCue).observe(adminContentPane);
            new MutationObserver(updateScrollCue).observe(adminContentPane, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        }
    }

    // Wire up Supporter Register Details Modal Actions
    if (menuRegisterDetailsBtn) {
        menuRegisterDetailsBtn.addEventListener('click', () => {
            openUserDetailsModal();
        });
    }

    if (closeUserDetailsBtn) {
        closeUserDetailsBtn.addEventListener('click', () => {
            if (userDetailsModal) userDetailsModal.style.display = 'none';
        });
    }

    if (cancelUserDetailsBtn) {
        cancelUserDetailsBtn.addEventListener('click', () => {
            if (userDetailsModal) userDetailsModal.style.display = 'none';
        });
    }

    if (userDetailsModal) {
        userDetailsModal.addEventListener('click', (e) => {
            if (e.target === userDetailsModal) {
                userDetailsModal.style.display = 'none';
            }
        });
    }

    if (userDetailsForm) {
        userDetailsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentUser = window.firebaseService?.getCurrentUser?.();
            if (!currentUser) {
                alert('Please sign in first.');
                return;
            }

            const newDisplayName = (userFormDisplayName?.value || '').trim();
            const newPhone = (userFormPhone?.value || '').trim();
            const addressApartment = (userFormAddressApartment?.value || '').trim();
            const addressStreet = (userFormAddressStreet?.value || '').trim();
            const addressSuburb = (userFormAddressSuburb?.value || '').trim();
            const addressState = (userFormAddressState?.value || '').trim();
            const addressCountry = (userFormAddressCountry?.value || '').trim();
            const addressPostcode = (userFormAddressPostcode?.value || '').trim();

            const addressData = {
                apartment: addressApartment,
                street: addressStreet,
                suburb: addressSuburb,
                state: addressState,
                country: addressCountry,
                postcode: addressPostcode
            };

            const isSuper = checkIsSuperAdmin(currentUser);
            const isAdmin = isSuper || checkIsAdmin(currentUser);
            const supporterRole = isSuper ? 'superadmin' : (isAdmin ? 'admin' : 'supporter');
            const supporterStatus = isSuper ? 'superadmin' : (isAdmin ? 'admin' : 'supporter');

            const userProfileUpdate = {
                displayName: newDisplayName,
                phoneNumber: newPhone,
                address: addressData,
                role: supporterRole,
                status: supporterStatus,
                classification: isSuper ? 'Superadmin' : (isAdmin ? 'Admin' : 'Supporter'),
                isSuperAdmin: isSuper,
                detailsRegistered: true,
                registeredAt: new Date().toISOString()
            };

            const saveBtn = document.getElementById('saveUserDetailsBtn');

            if (!newDisplayName) {
                if (userFormStatusMsg) {
                    userFormStatusMsg.style.display = 'block';
                    userFormStatusMsg.style.background = '#fef2f2';
                    userFormStatusMsg.style.color = '#991b1b';
                    userFormStatusMsg.textContent = 'Please enter your full name.';
                }
                return;
            }

            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';
            }

            try {
                // 1. Dual-layer client sync to Firestore
                if (window.firebaseService?.syncUserProfile) {
                    await window.firebaseService.syncUserProfile(currentUser, userProfileUpdate);
                }

                // 2. Dual-layer server sync
                await fetch('/api/auth/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        uid: currentUser.uid,
                        email: currentUser.email,
                        displayName: newDisplayName,
                        phoneNumber: newPhone,
                        address: addressData,
                        role: supporterRole,
                        status: supporterStatus,
                        detailsRegistered: true,
                        registeredAt: new Date().toISOString()
                    })
                });

                // Update UI text immediately
                if (userDisplayName) userDisplayName.textContent = newDisplayName.split(' ')[0];
                if (menuUserName) menuUserName.textContent = newDisplayName;
                if (typeof markContactProfileRegistered === 'function') {
                    markContactProfileRegistered(currentUser, newDisplayName);
                }

                if (userFormStatusMsg) {
                    userFormStatusMsg.style.display = 'block';
                    userFormStatusMsg.style.background = '#ecfdf5';
                    userFormStatusMsg.style.color = '#065f46';
                    userFormStatusMsg.style.border = '1px solid #a7f3d0';
                    userFormStatusMsg.innerHTML = '<i class="fa-solid fa-circle-check"></i> Details registered successfully!';
                }

                setTimeout(() => {
                    if (userDetailsModal) userDetailsModal.style.display = 'none';
                    if (userFormStatusMsg) userFormStatusMsg.style.display = 'none';
                }, 1300);
            } catch (err) {
                console.error('[Save Details Error]:', err);
                if (userFormStatusMsg) {
                    userFormStatusMsg.style.display = 'block';
                    userFormStatusMsg.style.background = '#fef2f2';
                    userFormStatusMsg.style.color = '#991b1b';
                    userFormStatusMsg.style.border = '1px solid #fecaca';
                    userFormStatusMsg.textContent = 'Could not save details: ' + (err.message || 'Please try again.');
                }
            } finally {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save Details';
                }
            }
        });
    }

    // Wire up dropdown settings actions to open admin functions
    const menuSupporterChatBtn = document.getElementById('menuSupporterChatBtn');
    const menuAdminChatInboxBtn = document.getElementById('menuAdminChatInboxBtn');

    if (menuSupporterChatBtn) {
        menuSupporterChatBtn.addEventListener('click', () => openSupporterChatModal());
    }
    if (menuAdminChatInboxBtn) {
        menuAdminChatInboxBtn.addEventListener('click', () => openAdminSettings('admin-supporter-chat'));
    }
    if (menuAdminSettingsBtn) {
        menuAdminSettingsBtn.addEventListener('click', () => openAdminSettings());
    }
    if (menuUploadPostBtn) {
        menuUploadPostBtn.addEventListener('click', () => openAdminSettings('admin-upload-post'));
    }
    if (menuUploadImageBtn) {
        menuUploadImageBtn.addEventListener('click', () => openAdminSettings('admin-upload-image'));
    }
    if (menuManagePostsBtn) {
        menuManagePostsBtn.addEventListener('click', () => openAdminSettings('admin-manage-posts'));
    }
    if (menuDatabaseActivityBtn) {
        menuDatabaseActivityBtn.addEventListener('click', () => openAdminSettings('admin-database-activity'));
    }
    if (menuServicePricesBtn) {
        menuServicePricesBtn.addEventListener('click', () => openAdminSettings('admin-services-pricing'));
    }


    function renderAuthUser(user) {
        if (user) {
            if (googleSignInBtn) googleSignInBtn.style.display = 'none';
            if (userMenuWrapper) userMenuWrapper.style.display = 'inline-flex';
            
            // Google profile photo (some accounts only expose it on providerData)
            const photo = user.photoURL || (user.providerData || []).find(p => p && p.photoURL)?.photoURL || 'assets/avatar.png';
            const name = user.displayName || (user.email ? user.email.split('@')[0] : 'User');
            const firstName = name.split(' ')[0];

            [userAvatarImg, menuUserAvatar].forEach(img => {
                if (!img) return;
                // Google's image server can refuse requests that send a Referer header
                img.referrerPolicy = 'no-referrer';
                // Fall back to the default avatar if the photo cannot load
                img.onerror = () => { img.onerror = null; img.src = 'assets/avatar.png'; };
                img.src = photo;
                img.alt = name;
            });
            if (userDisplayName) {
                userDisplayName.textContent = firstName;
            }
            if (menuUserName) {
                menuUserName.textContent = name;
            }
            if (menuUserEmail) {
                menuUserEmail.textContent = user.email || '';
            }

            // Role badge display: SuperAdmin or Supporter
            let isSuper = checkIsSuperAdmin(user);
            let isAdmin = isSuper || checkIsAdmin(user);
            const sidebarMessagesItem = document.getElementById('sidebarMessagesItem');
            if (sidebarMessagesItem) {
                sidebarMessagesItem.style.display = isSuper ? '' : 'none';
            }
            if (isSuper && window.location.hash === '#messages' && typeof handleHash === 'function') {
                handleHash();
            }
            if (menuUserRoleBadge) {
                if (isSuper) {
                    menuUserRoleBadge.className = 'user-role-badge role-admin';
                    menuUserRoleBadge.innerHTML = '<i class="fa-solid fa-crown"></i> SuperAdmin';
                } else if (isAdmin) {
                    menuUserRoleBadge.className = 'user-role-badge role-admin';
                    menuUserRoleBadge.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Administrator';
                } else {
                    menuUserRoleBadge.className = 'user-role-badge role-supporter';
                    menuUserRoleBadge.innerHTML = '<i class="fa-solid fa-user-check"></i> Supporter';
                }
            }

            // Supporter Role: gets Supporter Portal (Register Details)
            // Admin/SuperAdmin Role: gets Administration & Settings
            if (supporterMenuSection) {
                supporterMenuSection.style.display = 'block';
            }
            if (adminMenuSection) {
                adminMenuSection.style.display = (isAdmin || isSuper) ? 'block' : 'none';
            }
            if (typeof syncContactUsRegistrationState === 'function') {
                syncContactUsRegistrationState();
            }

            if (isAdmin || isSuper) {
                document.cookie = "adminAuth=true; max-age=" + (365 * 24 * 60 * 60) + "; path=/";
            } else {
                document.cookie = "adminAuth=; max-age=0; path=/";
                document.cookie = "adminAuth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            }
            document.cookie = "userAuth=true; max-age=" + (365 * 24 * 60 * 60) + "; path=/";

            // Verify admin status against Firebase database
            if (user && user.email && !user._firebaseAdminVerified) {
                user._firebaseAdminVerified = true;
                fetch('/api/auth/admin-verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: user.email, uid: user.uid })
                }).then(res => res.json()).then(data => {
                    const isFirebaseSuper = Boolean(data.isSuperAdmin || data.role === 'superadmin') || checkIsSuperAdmin(user);
                    const isFirebaseAdmin = Boolean(data.authorized) || isFirebaseSuper || checkIsAdmin(user);
                    user.isAdmin = isFirebaseAdmin;
                    user.isSuperAdmin = isFirebaseSuper;
                    user.verifiedAdmin = isFirebaseAdmin;
                    user.role = isFirebaseSuper ? 'superadmin' : (isFirebaseAdmin ? 'admin' : 'supporter');
                    user.status = isFirebaseSuper ? 'superadmin' : (isFirebaseAdmin ? 'admin' : 'supporter');

                    if (menuUserRoleBadge) {
                        if (isFirebaseSuper) {
                            menuUserRoleBadge.className = 'user-role-badge role-admin';
                            menuUserRoleBadge.innerHTML = '<i class="fa-solid fa-crown"></i> SuperAdmin';
                        } else if (isFirebaseAdmin) {
                            menuUserRoleBadge.className = 'user-role-badge role-admin';
                            menuUserRoleBadge.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Administrator';
                        } else {
                            menuUserRoleBadge.className = 'user-role-badge role-supporter';
                            menuUserRoleBadge.innerHTML = '<i class="fa-solid fa-user-check"></i> Supporter';
                        }
                    }
                    if (adminMenuSection) {
                        adminMenuSection.style.display = (isFirebaseAdmin || isFirebaseSuper) ? 'block' : 'none';
                    }
                    if (sidebarMessagesItem) {
                        sidebarMessagesItem.style.display = isFirebaseSuper ? '' : 'none';
                    }
                    if (isFirebaseSuper && window.location.hash === '#messages' && typeof handleHash === 'function') {
                        handleHash();
                    }
                    if (isFirebaseAdmin || isFirebaseSuper) {
                        document.cookie = "adminAuth=true; max-age=" + (365 * 24 * 60 * 60) + "; path=/";
                    } else {
                        document.cookie = "adminAuth=; max-age=0; path=/";
                        document.cookie = "adminAuth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                    }
                }).catch(() => {});
            }
        } else {
            if (googleSignInBtn) googleSignInBtn.style.display = 'inline-flex';
            if (userMenuWrapper) userMenuWrapper.style.display = 'none';
            if (userDropdownMenu) userDropdownMenu.style.display = 'none';
            if (userProfileBadge) {
                userProfileBadge.classList.remove('active');
                userProfileBadge.setAttribute('aria-expanded', 'false');
            }
            if (adminModal) adminModal.style.display = 'none';
            if (userDetailsModal) userDetailsModal.style.display = 'none';
            const sidebarMessagesItem = document.getElementById('sidebarMessagesItem');
            if (sidebarMessagesItem) sidebarMessagesItem.style.display = 'none';
            const sectionMessages = document.getElementById('section-messages');
            if (sectionMessages && sectionMessages.style.display !== 'none' && typeof activateSection === 'function') {
                activateSection('section-overview');
            }
            document.cookie = "adminAuth=; max-age=0; path=/";
            document.cookie = "adminAuth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            document.cookie = "userAuth=; max-age=0; path=/";
            document.cookie = "userAuth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            if (typeof syncContactUsRegistrationState === 'function') {
                syncContactUsRegistrationState();
            }
        }
    }

    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', async () => {
            try {
                if (window.firebaseService?.signInWithGoogle) {
                    await window.firebaseService.signInWithGoogle();
                } else {
                    console.warn('[Firebase Auth] Service initializing, please wait a moment.');
                }
            } catch (err) {
                if (err.code !== 'auth/popup-closed-by-user') {
                    console.error('[Firebase Auth] Sign in error:', err);
                    alert('Sign in notice: ' + (err.message || 'Could not complete Google sign-in.'));
                }
            }
        });
    }

    if (googleSignOutBtn) {
        googleSignOutBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await signOutOfSite();
        });
    }

    if (adminGoogleLoginBtn) {
        adminGoogleLoginBtn.addEventListener('click', async () => {
            const errorMsg = document.getElementById('adminLoginError');
            if (errorMsg) errorMsg.style.display = 'none';

            try {
                adminGoogleLoginBtn.disabled = true;
                adminGoogleLoginBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Authenticating with Google...</span>';

                let user = window.firebaseService?.getCurrentUser?.();
                if (!user && window.firebaseService?.signInWithGoogle) {
                    user = await window.firebaseService.signInWithGoogle();
                }

                if (user) {
                    let isAuthorized = checkIsAdmin(user);
                    try {
                        const verifyRes = await fetch('/api/auth/admin-verify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: user.email, uid: user.uid })
                        });
                        const verifyData = await verifyRes.json();
                        isAuthorized = Boolean(verifyData.authorized);
                    } catch (e) {
                        console.warn('[Admin Verify] Notice:', e.message);
                    }

                    if (isAuthorized) {
                        document.cookie = "adminAuth=true; max-age=" + (365 * 24 * 60 * 60) + "; path=/";
                        if (errorMsg) errorMsg.style.display = 'none';
                        document.getElementById('adminLoginView').style.display = 'none';
                        document.getElementById('adminPanelView').style.display = 'flex';
                        renderAdminAllPosts();
                    } else {
                        if (errorMsg) {
                            errorMsg.textContent = `Google account (${user.email}) is not registered as an administrator.`;
                            errorMsg.style.display = 'block';
                        }
                    }
                }
            } catch (err) {
                if (err.code !== 'auth/popup-closed-by-user') {
                    console.error('[Admin Google Auth] Error:', err);
                    if (errorMsg) {
                        errorMsg.textContent = err.message || 'Google authentication failed.';
                        errorMsg.style.display = 'block';
                    }
                }
            } finally {
                if (adminGoogleLoginBtn) {
                    adminGoogleLoginBtn.disabled = false;
                    adminGoogleLoginBtn.innerHTML = `
                        <svg class="google-icon" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                        </svg>
                        <span>Sign In with Google</span>
                    `;
                }
            }
        });
    }

    // Listen to Firebase Auth events
    window.addEventListener('firebaseAuthChanged', (e) => {
        renderAuthUser(e.detail?.user);
    });

    window.addEventListener('firebaseServiceReady', () => {
        if (window.firebaseService?.getCurrentUser) {
            renderAuthUser(window.firebaseService.getCurrentUser());
        }
        // Immediately fetch and render posts from Firestore as soon as Firebase is ready
        loadPosts();
        loadProjects();
        loadCommunityPosts();
        loadTechPosts();
    });

    // Backward-compatibility if adminToggleBtn exists anywhere
    if (adminToggleBtn) {
        adminToggleBtn.addEventListener('click', () => {
            openAdminSettings();
        });
    }

    if (closeAdminBtn) {
        closeAdminBtn.addEventListener('click', () => {
            if (adminModal) adminModal.style.display = 'none';
        });
    }

    // Admin Panel Logout / Close Action
    const adminPanelLogoutBtn = document.getElementById('adminPanelLogoutBtn');
    if (adminPanelLogoutBtn) {
        adminPanelLogoutBtn.addEventListener('click', () => {
            if (adminModal) adminModal.style.display = 'none';
            console.log('🔒 Admin modal closed.');
        });
    }

    // =========================================================================
    // Multi-Tenant Database Explorer (Shared Firestore Inputs)
    // =========================================================================
    const dbTenantSelect = document.getElementById('dbTenantSelect');
    const dbCollectionSelect = document.getElementById('dbCollectionSelect');
    const dbLimitSelect = document.getElementById('dbLimitSelect');
    const dbRefreshBtn = document.getElementById('dbRefreshBtn');
    const dbRecordsTableBody = document.getElementById('dbRecordsTableBody');
    const statTotalRecords = document.getElementById('statTotalRecords');
    const statAIFoundationRecords = document.getElementById('statAIFoundationRecords');
    const statOtherRecords = document.getElementById('statOtherRecords');
    const dbJsonModal = document.getElementById('dbJsonModal');
    const dbJsonModalPre = document.getElementById('dbJsonModalPre');
    const closeDbJsonBtn = document.getElementById('closeDbJsonBtn');

    let currentDbRecords = [];

    function formatDbTime(iso) {
        if (!iso) return 'Just now';
        try {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return String(iso);
            const now = Date.now();
            const diff = Math.floor((now - d.getTime()) / 1000);
            
            let rel = '';
            if (diff < 60) rel = 'Just now';
            else if (diff < 3600) rel = `${Math.floor(diff / 60)}m ago`;
            else if (diff < 86400) rel = `${Math.floor(diff / 3600)}h ago`;
            else rel = `${Math.floor(diff / 86400)}d ago`;

            const dateStr = window.SitePrefs
                ? window.SitePrefs.formatDateTime(d)
                : d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
            return `<span style="font-weight: 600; color: #0f172a;">${dateStr}</span> <span style="font-size: 0.74rem; color: #94a3b8; display: block;">${rel}</span>`;
        } catch (e) {
            return String(iso);
        }
    }

    async function loadDatabaseRecentInputs() {
        if (!dbRecordsTableBody) return;

        const tenant = dbTenantSelect?.value || 'all';
        const collection = dbCollectionSelect?.value || 'all';
        const limit = dbLimitSelect?.value || '50';

        dbRecordsTableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 36px; color: #94a3b8;">
                    <i class="fa-solid fa-circle-notch fa-spin fa-2x" style="color: #0066ff; margin-bottom: 10px;"></i>
                    <div style="font-size: 0.9rem; font-weight: 500;">Querying live multi-tenant Firestore...</div>
                </td>
            </tr>
        `;

        try {
            const res = await fetch(`/api/admin/database-inputs?tenant=${encodeURIComponent(tenant)}&collection=${encodeURIComponent(collection)}&limit=${limit}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            currentDbRecords = data.records || [];

            // Update stats
            if (statTotalRecords) statTotalRecords.textContent = data.tenantCounts?.total ?? currentDbRecords.length;
            if (statAIFoundationRecords) statAIFoundationRecords.textContent = data.tenantCounts?.aifoundation ?? 0;
            if (statOtherRecords) statOtherRecords.textContent = (data.tenantCounts?.total || 0) - (data.tenantCounts?.aifoundation || 0);

            if (currentDbRecords.length === 0) {
                dbRecordsTableBody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; padding: 40px; color: #64748b;">
                            <i class="fa-solid fa-database" style="font-size: 2rem; color: #cbd5e1; margin-bottom: 12px; display: block;"></i>
                            <div style="font-weight: 600; color: #334155; margin-bottom: 4px;">No database inputs found</div>
                            <div style="font-size: 0.84rem;">No documents matching current filters in shared collections.</div>
                        </td>
                    </tr>
                `;
                return;
            }

            dbRecordsTableBody.innerHTML = currentDbRecords.map((rec, idx) => {
                const websiteKey = rec.websiteKey || 'other';
                let pillClass = 'tenant-pill ' + websiteKey;
                let iconClass = 'fa-solid fa-circle-nodes';
                if (websiteKey === 'aifoundation') iconClass = 'fa-solid fa-brain';
                else if (websiteKey === 'pro-lms') iconClass = 'fa-solid fa-graduation-cap';
                else if (websiteKey === 'itsasimplejob') iconClass = 'fa-solid fa-briefcase';
                else if (websiteKey === 'rto-ai') iconClass = 'fa-solid fa-certificate';

                let colIcon = 'fa-solid fa-folder';
                if (rec.collection === 'users') colIcon = 'fa-solid fa-user';
                else if (rec.collection === 'transactions') colIcon = 'fa-solid fa-credit-card';
                else if (rec.collection === 'chat_interactions') colIcon = 'fa-solid fa-comments';
                else if (rec.collection === 'metrics') colIcon = 'fa-solid fa-chart-line';
                else if (rec.collection === 'activity_logs') colIcon = 'fa-solid fa-list-check';

                return `
                    <tr>
                        <td style="white-space: nowrap;">${formatDbTime(rec.timestamp)}</td>
                        <td>
                            <span class="${pillClass}">
                                <i class="${iconClass}"></i> ${escapeHtml(rec.websiteLabel)}
                            </span>
                            <span style="display: block; font-size: 0.72rem; color: #94a3b8; margin-top: 2px;">tag: ${escapeHtml(rec.tag)}</span>
                        </td>
                        <td>
                            <span style="font-weight: 600; color: #475569; display: inline-flex; align-items: center; gap: 6px;">
                                <i class="${colIcon}" style="font-size: 0.8rem; color: #0066ff;"></i> ${escapeHtml(rec.collection)}
                            </span>
                            <span style="display: block; font-size: 0.72rem; color: #94a3b8; font-family: monospace;">${escapeHtml(String(rec.id || '').substring(0, 16))}...</span>
                        </td>
                        <td style="max-width: 380px;">
                            <div style="font-size: 0.84rem; color: #1e293b; line-height: 1.4; word-break: break-word;">${escapeHtml(rec.summary)}</div>
                        </td>
                        <td style="text-align: right; white-space: nowrap;">
                            <button type="button" class="db-json-btn" data-record-idx="${idx}">
                                <i class="fa-solid fa-code"></i> JSON
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            // Wire up JSON inspection buttons
            document.querySelectorAll('.db-json-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.recordIdx, 10);
                    const record = currentDbRecords[idx];
                    if (record && dbJsonModal && dbJsonModalPre) {
                        const titleEl = document.getElementById('dbJsonModalTitle');
                        if (titleEl) titleEl.textContent = `${record.websiteLabel} • ${record.collection}/${record.id}`;
                        dbJsonModalPre.textContent = JSON.stringify(record.raw, null, 2);
                        dbJsonModal.style.display = 'flex';
                    }
                });
            });

        } catch (err) {
            console.error('[Database Activity] Query error:', err);
            dbRecordsTableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 24px; color: #ef4444;">
                        <i class="fa-solid fa-triangle-exclamation fa-2x" style="margin-bottom: 8px;"></i>
                        <div style="font-weight: 600;">Failed to load database inputs</div>
                        <div style="font-size: 0.82rem; color: #64748b; margin-top: 4px;">${escapeHtml(err.message)}</div>
                    </td>
                </tr>
            `;
        }
    }

    if (dbTenantSelect) dbTenantSelect.addEventListener('change', loadDatabaseRecentInputs);
    if (dbCollectionSelect) dbCollectionSelect.addEventListener('change', loadDatabaseRecentInputs);
    if (dbLimitSelect) dbLimitSelect.addEventListener('change', loadDatabaseRecentInputs);
    if (dbRefreshBtn) dbRefreshBtn.addEventListener('click', loadDatabaseRecentInputs);
    if (closeDbJsonBtn) closeDbJsonBtn.addEventListener('click', () => {
        if (dbJsonModal) dbJsonModal.style.display = 'none';
    });
    if (dbJsonModal) {
        dbJsonModal.addEventListener('click', (e) => {
            if (e.target === dbJsonModal) dbJsonModal.style.display = 'none';
        });
    }

    // =========================================================================
    // Supporter Chat & SuperAdmin Messaging Logic
    // Compliance: 7-Year Statutory Record Retention, No Uploads, Links Supported
    // =========================================================================
    const supporterChatModal = document.getElementById('supporterChatModal');
    const closeSupporterChatBtn = document.getElementById('closeSupporterChatBtn');
    const chatMessagesContainer = document.getElementById('chatMessagesContainer');
    const chatLoadingState = document.getElementById('chatLoadingState');
    const chatEmptyState = document.getElementById('chatEmptyState');
    const chatFeedList = document.getElementById('chatFeedList');
    const supporterChatForm = document.getElementById('supporterChatForm');
    const chatMessageInput = document.getElementById('chatMessageInput');
    const sendChatBtn = document.getElementById('sendChatBtn');
    const chatCharCounter = document.getElementById('chatCharCounter');
    const chatDropzoneNotice = document.getElementById('chatDropzoneNotice');
    const chatStatusAlert = document.getElementById('chatStatusAlert');

    let supporterChatPollTimer = null;

    function escapeHtmlChat(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function renderMessageWithLinks(rawText) {
        if (!rawText) return '';
        const escaped = escapeHtmlChat(rawText);
        // Identify URLs and convert to clickable anchors
        const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;
        return escaped.replace(urlRegex, (url) => {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link" title="Open external link: ${url}"><i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.72rem;"></i> ${url}</a>`;
        });
    }

    function formatChatTimestamp(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        if (isNaN(d.getTime())) return '';
        if (window.SitePrefs) return window.SitePrefs.formatTime(d) + ' • ' + window.SitePrefs.formatDate(d);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' • ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    function formatRetentionUntilDate(isoDate) {
        const d = isoDate ? new Date(isoDate) : new Date();
        if (!isoDate) d.setFullYear(d.getFullYear() + 7);
        if (isNaN(d.getTime())) return '7 Years';
        return window.SitePrefs ? window.SitePrefs.formatDate(d) : d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
    }

    // Open Supporter Chat Modal behind Login
    async function openSupporterChatModal() {
        if (!supporterChatModal) return;

        // Close dropdown
        if (userDropdownMenu) userDropdownMenu.style.display = 'none';
        if (userProfileBadge) {
            userProfileBadge.classList.remove('active');
            userProfileBadge.setAttribute('aria-expanded', 'false');
        }

        const currentUser = window.firebaseService?.getCurrentUser?.();
        if (!currentUser) {
            alert('Please sign in with Google to message the SuperAdmin team.');
            return;
        }

        supporterChatModal.style.display = 'flex';
        if (chatStatusAlert) chatStatusAlert.style.display = 'none';

        await loadSupporterChatMessages(currentUser.uid);

        // Start auto-refresh polling every 5 seconds while modal is active
        if (supporterChatPollTimer) clearInterval(supporterChatPollTimer);
        supporterChatPollTimer = setInterval(() => {
            if (supporterChatModal.style.display === 'flex') {
                loadSupporterChatMessages(currentUser.uid, true);
            }
        }, 5000);

        if (chatMessageInput) {
            chatMessageInput.focus();
        }
    }

    function closeSupporterChatModal() {
        if (supporterChatModal) {
            supporterChatModal.style.display = 'none';
        }
        if (supporterChatPollTimer) {
            clearInterval(supporterChatPollTimer);
            supporterChatPollTimer = null;
        }
    }

    if (closeSupporterChatBtn) {
        closeSupporterChatBtn.addEventListener('click', closeSupporterChatModal);
    }

    if (supporterChatModal) {
        supporterChatModal.addEventListener('click', (e) => {
            if (e.target === supporterChatModal) {
                closeSupporterChatModal();
            }
        });
    }

    // Load messages for the authenticated supporter
    async function loadSupporterChatMessages(uid, isBackgroundPoll = false) {
        if (!uid || !chatFeedList) return;

        if (!isBackgroundPoll && chatLoadingState) {
            chatLoadingState.style.display = 'flex';
            if (chatEmptyState) chatEmptyState.style.display = 'none';
        }

        try {
            const currentUser = window.firebaseService?.getCurrentUser?.();
            const emailParam = currentUser?.email ? `&email=${encodeURIComponent(currentUser.email)}` : '';
            const res = await fetch(`/api/chat/messages?uid=${encodeURIComponent(uid)}${emailParam}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            // Only the supporter's own messages and real SuperAdmin replies (the server filters them too)
            const messages = (data.messages || []).filter(m => m.senderUid === uid || isSuperAdminSenderUid(m.senderUid));

            if (chatLoadingState) chatLoadingState.style.display = 'none';

            if (messages.length === 0) {
                chatFeedList.innerHTML = '';
                if (chatEmptyState) chatEmptyState.style.display = 'flex';
                return;
            }

            if (chatEmptyState) chatEmptyState.style.display = 'none';

            const currentScrollPos = chatMessagesContainer ? (chatMessagesContainer.scrollHeight - chatMessagesContainer.scrollTop - chatMessagesContainer.clientHeight) : 0;
            const wasNearBottom = currentScrollPos < 80 || !isBackgroundPoll;

            chatFeedList.innerHTML = messages.map(msg => {
                const isSentByMe = msg.senderUid === uid;
                const senderName = isSentByMe ? 'You (Supporter)' : (msg.senderName || 'SuperAdmin');
                const senderRole = isSentByMe ? 'Supporter' : 'SuperAdmin';
                const rowClass = isSentByMe ? 'chat-message-row sent' : 'chat-message-row received';
                const avatarIcon = isSentByMe ? '<div class="chat-avatar-icon"><i class="fa-solid fa-user"></i></div>' : '<div class="chat-avatar-icon" style="background: #004ecc;"><i class="fa-solid fa-shield-halved"></i></div>';
                const retentionDateStr = formatRetentionUntilDate(msg.retainedUntil);

                return `
                    <div class="${rowClass}">
                        ${avatarIcon}
                        <div class="chat-bubble">
                            <div class="chat-bubble-sender">
                                <span>${escapeHtml(senderName)}</span>
                                <span class="role-tag">${senderRole}</span>
                            </div>
                            <div class="chat-bubble-text">${renderMessageWithLinks(msg.userMessage)}</div>
                            <div class="chat-bubble-footer">
                                <span>${formatChatTimestamp(msg.createdAt || msg.timestamp)}</span>
                                <span class="retention-tag-mini" title="Retained for 7 years under Corporations Act 2001 & APP 11">
                                    <i class="fa-solid fa-clock-rotate-left"></i> Retained 7 yrs (until ${retentionDateStr})
                                </span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Auto-scroll to bottom if near bottom or initial load
            if (wasNearBottom && chatMessagesContainer) {
                chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
            }
        } catch (err) {
            console.warn('[Chat Messages Fetch] Notice:', err.message);
            if (chatLoadingState) chatLoadingState.style.display = 'none';
        }
    }

    // Supporter Chat Form Submit
    if (supporterChatForm) {
        supporterChatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentUser = window.firebaseService?.getCurrentUser?.();
            if (!currentUser) {
                alert('Please sign in first.');
                return;
            }

            const rawText = (chatMessageInput?.value || '').trim();
            if (!rawText) return;

            if (sendChatBtn) {
                sendChatBtn.disabled = true;
                sendChatBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
            }

            try {
                const res = await fetch('/api/chat/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        senderUid: currentUser.uid,
                        senderEmail: currentUser.email,
                        senderName: currentUser.displayName || 'Supporter',
                        senderPhoto: currentUser.photoURL || '',
                        senderRole: 'supporter',
                        recipientUid: 'superadmin',
                        recipientEmail: 'support@aifoundation.net.au',
                        recipientName: 'SuperAdmin',
                        conversationId: `conv_${currentUser.uid}`,
                        userMessage: rawText,
                        hasUploads: false // Strict non-upload compliance
                    })
                });

                const data = await res.json();
                if (!res.ok || !data.success) {
                    throw new Error(data.error || 'Failed to send message.');
                }

                // Clear input
                if (chatMessageInput) chatMessageInput.value = '';
                if (chatCharCounter) chatCharCounter.textContent = '0 / 4,000';

                // Immediately refresh chat feed
                await loadSupporterChatMessages(currentUser.uid);

                if (chatStatusAlert) {
                    chatStatusAlert.style.display = 'none';
                }
            } catch (err) {
                console.error('[Chat Send Error]:', err);
                if (chatStatusAlert) {
                    chatStatusAlert.className = 'chat-status-alert error';
                    chatStatusAlert.textContent = 'Could not send message: ' + (err.message || 'Please try again.');
                    chatStatusAlert.style.display = 'block';
                }
            } finally {
                if (sendChatBtn) {
                    sendChatBtn.disabled = false;
                    sendChatBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span class="send-btn-label">Send</span>';
                }
            }
        });
    }

    // Keydown & Char count in Chat Textarea
    if (chatMessageInput) {
        chatMessageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                supporterChatForm?.requestSubmit();
            }
        });

        chatMessageInput.addEventListener('input', () => {
            const len = chatMessageInput.value.length;
            if (chatCharCounter) {
                chatCharCounter.textContent = `${len.toLocaleString()} / 4,000`;
                chatCharCounter.style.color = len > 3800 ? '#ef4444' : '#94a3b8';
            }
        });
    }

    // Disallow Drag & Drop uploads strictly
    const chatModalContent = document.querySelector('.supporter-chat-modal-content');
    if (chatModalContent) {
        ['dragenter', 'dragover'].forEach(eventName => {
            chatModalContent.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        chatModalContent.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (chatDropzoneNotice) {
                chatDropzoneNotice.style.display = 'flex';
                setTimeout(() => {
                    chatDropzoneNotice.style.display = 'none';
                }, 4000);
            }
        }, false);
    }

    // =========================================================================
    // Message Box (SuperAdmin panel tab): every conversation with the SuperAdmin from all tenant apps, each
    // tagged with the app it came from (GET /api/message-box). Search and the app filter run in the browser.
    // Admins who aren't SuperAdmins get their own conversation with the SuperAdmin here instead
    // =========================================================================
    const adminThreadsList = document.getElementById('adminThreadsList');
    const adminThreadCount = document.getElementById('adminThreadCount');
    const adminNoThreadSelected = document.getElementById('adminNoThreadSelected');
    const adminThreadConversationView = document.getElementById('adminThreadConversationView');
    const adminThreadUserName = document.getElementById('adminThreadUserName');
    const adminThreadUserEmail = document.getElementById('adminThreadUserEmail');
    const adminThreadTenantBadge = document.getElementById('adminThreadTenantBadge');
    const messageBoxThreadSubject = document.getElementById('messageBoxThreadSubject');
    const adminThreadFeed = document.getElementById('adminThreadFeed');
    const adminReplyForm = document.getElementById('adminReplyForm');
    const adminReplyInput = document.getElementById('adminReplyInput');
    const adminSendReplyBtn = document.getElementById('adminSendReplyBtn');
    const adminRefreshChatBtn = document.getElementById('adminRefreshChatBtn');
    const messageBoxToolbar = document.getElementById('messageBoxToolbar');
    const messageBoxSearch = document.getElementById('messageBoxSearch');
    const messageBoxTenants = document.getElementById('messageBoxTenants');
    const messageBoxReadOnlyNote = document.getElementById('messageBoxReadOnlyNote');
    const messageBoxLayout = document.querySelector('#admin-supporter-chat .admin-chat-layout');
    const messageBoxReplyBanner = adminReplyForm ? adminReplyForm.parentElement.querySelector('.chat-constraints-banner') : null;
    const messageBoxRetentionTag = document.querySelector('#admin-supporter-chat .admin-thread-retention-tag');

    const DEFAULT_WEBSITE_TAGS = [
        'aifoundation',
        'lms',
        'hr',
        'ad-radar',
        'itsasimplejob',
        'trainerdavid',
        'rto-ai',
        'health',
        'nihongo',
        'finance',
        'kangoorental',
        'lawyerselect'
    ];

    let messageBoxConversations = [];
    let messageBoxTenantList = [];
    let messageBoxWebsiteTags = [...DEFAULT_WEBSITE_TAGS];
    let messageBoxTenant = 'all';
    let messageBoxActiveKey = null;
    let messageBoxPersonal = false;

    // Tenant badge, coloured per app (style.css); apps without their own colour get the neutral badge
    function tenantBadgeHtml(tag) {
        const cssTag = String(tag || 'unknown').toLowerCase().replace(/[^a-z0-9-]/g, '');
        return `<span class="tenant-badge tag-${cssTag}" title="From the ${escapeHtmlChat(tag)} app"><i class="fa-solid fa-tag"></i> ${escapeHtmlChat(tag)}</span>`;
    }

    function messageBoxPersonName(c) {
        return c.counterpart.name || c.counterpart.email || 'Unknown sender';
    }

    // Shown when its app matches the filter and every search word appears in its app, sender, subject or messages
    function messageBoxMatches(c, words) {
        if (messageBoxTenant !== 'all' && c.tenant !== messageBoxTenant) return false;
        const haystack = [c.tenant, c.counterpart.name, c.counterpart.email, c.subject,
            ...c.messages.map(m => `${m.senderName} ${m.subject} ${m.text}`)].join(' ').toLowerCase();
        return words.every(word => haystack.includes(word));
    }

    function getCombinedWebsiteTags() {
        const countByTag = new Map();
        for (const t of messageBoxTenantList) {
            countByTag.set(t.tag, t.conversations || 0);
        }
        const allTags = Array.from(new Set([
            ...messageBoxWebsiteTags,
            ...messageBoxTenantList.map(t => t.tag)
        ].filter(Boolean)));
        return allTags.map(tag => ({
            tag,
            conversations: countByTag.get(tag) || 0
        }));
    }

    function renderMessageBoxTenants() {
        if (!messageBoxTenants) return;
        const chip = (tag, label, count, showTagIcon = false) => `
            <button type="button" class="message-box-chip${messageBoxTenant === tag ? ' active' : ''}" data-tenant="${escapeHtmlChat(tag)}" aria-pressed="${messageBoxTenant === tag}">
                ${showTagIcon ? '<i class="fa-solid fa-tag"></i> ' : ''}${label} <span class="message-box-chip-count">${count}</span>
            </button>`;
        const combined = getCombinedWebsiteTags();
        messageBoxTenants.innerHTML = chip('all', 'All apps', messageBoxConversations.length, false) +
            combined.map(t => chip(t.tag, escapeHtmlChat(t.tag), t.conversations, true)).join('');
    }

    // Conversations Box: Smaller Text, Name and Email only
    function renderMessageBoxList() {
        if (!adminThreadsList) return;
        const words = (messageBoxSearch ? messageBoxSearch.value : '').toLowerCase().split(/\s+/).filter(Boolean);
        const shown = messageBoxConversations.filter(c => messageBoxMatches(c, words));
        if (adminThreadCount) {
            adminThreadCount.textContent = shown.length === messageBoxConversations.length
                ? String(shown.length) : `${shown.length} of ${messageBoxConversations.length}`;
        }
        if (!shown.length) {
            adminThreadsList.innerHTML = `
                <div class="message-box-empty">
                    <i class="fa-solid fa-inbox"></i>
                    ${messageBoxConversations.length ? 'No conversations match.' : 'No messages yet.'}
                </div>`;
            return;
        }
        adminThreadsList.innerHTML = shown.map(c => `
            <div class="admin-thread-item${c.key === messageBoxActiveKey ? ' active' : ''}" data-key="${escapeHtmlChat(c.key)}" role="button" tabindex="0">
                <div class="admin-thread-name">${escapeHtmlChat(messageBoxPersonName(c))}</div>
                <div class="admin-thread-email">${escapeHtmlChat(c.counterpart.email || 'No email')}</div>
            </div>`).join('');
    }

    // items: [{ mine, text }], oldest first — renders just the message text inside each bubble
    function renderMessageBoxFeed(items) {
        if (!adminThreadFeed) return;
        adminThreadFeed.innerHTML = items.map(m => `
            <div class="chat-message-row ${m.mine ? 'sent' : 'received'}">
                <div class="chat-bubble">
                    <div class="chat-bubble-text">${renderMessageWithLinks(m.text)}</div>
                </div>
            </div>`).join('');
        adminThreadFeed.scrollTop = adminThreadFeed.scrollHeight;
    }

    // SuperAdmin can reply directly from this app to conversations across all connected databases & apps
    function setMessageBoxReplyState(c) {
        const canReply = messageBoxPersonal || Boolean(c && c.replyable);
        if (adminReplyForm) adminReplyForm.style.display = canReply ? '' : 'none';
        if (messageBoxReplyBanner) messageBoxReplyBanner.style.display = canReply ? '' : 'none';
        if (adminReplyInput && !messageBoxPersonal && c) {
            adminReplyInput.placeholder = `Reply as SuperAdmin to ${messageBoxPersonName(c)} (${c.tenant})... (links allowed, no file uploads)`;
        }
        if (!messageBoxReadOnlyNote) return;
        messageBoxReadOnlyNote.style.display = canReply ? 'none' : 'block';
        if (canReply || !c) return;
        const email = c.counterpart.email;
        const mailto = email ? `mailto:${email}${c.subject ? `?subject=${encodeURIComponent(`Re: ${c.subject}`)}` : ''}` : '';
        messageBoxReadOnlyNote.innerHTML = `<i class="fa-solid fa-circle-info"></i> This conversation belongs to the <strong>${escapeHtmlChat(c.tenant)}</strong> app` +
            (email ? ` &mdash; <a href="${escapeHtmlChat(mailto)}">${escapeHtmlChat(email)}</a>.` : '.');
    }

    function openMessageBoxConversation(key) {
        const c = messageBoxConversations.find(conv => conv.key === key);
        if (!c) return;
        messageBoxActiveKey = key;
        if (adminThreadsList) {
            adminThreadsList.querySelectorAll('.admin-thread-item').forEach(el => el.classList.toggle('active', el.dataset.key === key));
        }
        if (adminNoThreadSelected) adminNoThreadSelected.style.display = 'none';
        if (adminThreadConversationView) adminThreadConversationView.style.display = 'flex';
        if (adminThreadUserName) adminThreadUserName.textContent = '';
        if (adminThreadUserEmail) adminThreadUserEmail.textContent = '';
        if (adminThreadTenantBadge) adminThreadTenantBadge.innerHTML = tenantBadgeHtml(c.tenant);
        if (messageBoxRetentionTag) messageBoxRetentionTag.style.display = '';
        if (messageBoxThreadSubject) {
            messageBoxThreadSubject.textContent = '';
            messageBoxThreadSubject.hidden = true;
        }
        renderMessageBoxFeed(c.messages.map(m => ({ ...m, mine: m.fromSuperAdmin })));
        setMessageBoxReplyState(c);
    }

    function setMessageBoxPersonal(personal) {
        messageBoxPersonal = personal;
        if (messageBoxLayout) messageBoxLayout.classList.toggle('is-personal', personal);
        if (messageBoxToolbar) messageBoxToolbar.hidden = personal;
        const intro = document.getElementById('messageBoxIntro');
        if (intro && personal) intro.textContent = 'Your conversation with the SuperAdmin. Write below and the SuperAdmin will reply here.';
        if (adminReplyInput) {
            adminReplyInput.placeholder = personal
                ? 'Write to the SuperAdmin... (links allowed, no file uploads)'
                : 'Reply as SuperAdmin... (links allowed, no file uploads)';
        }
    }

    // Signed in but not a SuperAdmin (e.g. a site admin): their own conversation with the SuperAdmin
    async function loadPersonalMessageBox() {
        setMessageBoxPersonal(true);
        const currentUser = window.firebaseService?.getCurrentUser?.();
        const uid = currentUser ? currentUser.uid : '';
        try {
            const res = await fetch('/api/chat/messages');
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            if (adminNoThreadSelected) adminNoThreadSelected.style.display = 'none';
            if (adminThreadConversationView) adminThreadConversationView.style.display = 'flex';
            if (adminThreadUserName) adminThreadUserName.textContent = '';
            if (adminThreadUserEmail) adminThreadUserEmail.textContent = '';
            if (adminThreadTenantBadge) adminThreadTenantBadge.innerHTML = '';
            if (messageBoxRetentionTag) messageBoxRetentionTag.style.display = '';
            if (messageBoxThreadSubject) messageBoxThreadSubject.hidden = true;
            const items = (data.messages || []).filter(m => m.senderUid === uid || isSuperAdminSenderUid(m.senderUid)).map(m => {
                const mine = m.senderUid === uid;
                return { mine, text: m.userMessage };
            });
            renderMessageBoxFeed(items);
            if (!items.length && adminThreadFeed) {
                adminThreadFeed.innerHTML = '<div class="message-box-empty"><i class="fa-solid fa-paper-plane"></i> No messages yet. Write to the SuperAdmin below.</div>';
            }
            setMessageBoxReplyState(null);
        } catch (err) {
            console.warn('[Message Box] Could not load your conversation:', err.message);
        }
    }

    async function loadMessageBox() {
        if (!adminThreadsList) return;
        if (messageBoxPersonal) return loadPersonalMessageBox();
        try {
            const res = await fetch('/api/message-box');
            if (res.status === 403) return loadPersonalMessageBox();
            if (res.status === 404) throw new Error('the server is running an older version without the Message Box, so restart or redeploy it');
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            messageBoxConversations = data.conversations || [];
            messageBoxTenantList = data.tenants || [];
            if (Array.isArray(data.websiteTags) && data.websiteTags.length) {
                messageBoxWebsiteTags = data.websiteTags;
            }
            const validTags = getCombinedWebsiteTags().map(t => t.tag);
            if (messageBoxTenant !== 'all' && !validTags.includes(messageBoxTenant)) {
                messageBoxTenant = 'all';
            }
            renderMessageBoxTenants();
            renderMessageBoxList();
            if (messageBoxActiveKey && messageBoxConversations.some(c => c.key === messageBoxActiveKey)) {
                openMessageBoxConversation(messageBoxActiveKey);
            } else {
                messageBoxActiveKey = null;
                if (adminNoThreadSelected) adminNoThreadSelected.style.display = 'flex';
                if (adminThreadConversationView) adminThreadConversationView.style.display = 'none';
            }
        } catch (err) {
            console.warn('[Message Box] Could not load messages:', err.message);
            adminThreadsList.innerHTML = `<div class="message-box-empty"><i class="fa-solid fa-triangle-exclamation"></i> Could not load messages (${escapeHtmlChat(err.message)}). Use Refresh to try again.</div>`;
        }
    }

    if (adminThreadsList) {
        adminThreadsList.addEventListener('click', (e) => {
            const item = e.target.closest('.admin-thread-item');
            if (item) openMessageBoxConversation(item.dataset.key);
        });
        adminThreadsList.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.admin-thread-item')) {
                e.preventDefault();
                openMessageBoxConversation(e.target.dataset.key);
            }
        });
    }
    if (messageBoxSearch) {
        messageBoxSearch.addEventListener('input', renderMessageBoxList);
    }
    if (messageBoxTenants) {
        messageBoxTenants.addEventListener('click', (e) => {
            const chip = e.target.closest('.message-box-chip');
            if (!chip) return;
            messageBoxTenant = chip.dataset.tenant;
            renderMessageBoxTenants();
            renderMessageBoxList();
        });
    }

    // Reply (SuperAdmin across any app's conversation) or write to the SuperAdmin (everyone else)
    if (adminReplyForm) {
        adminReplyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const replyText = (adminReplyInput?.value || '').trim();
            if (!replyText) return;
            const c = messageBoxConversations.find(conv => conv.key === messageBoxActiveKey);
            if (!messageBoxPersonal && !(c && c.replyable)) return;

            if (adminSendReplyBtn) {
                adminSendReplyBtn.disabled = true;
                adminSendReplyBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
            }
            try {
                const body = messageBoxPersonal ? { userMessage: replyText } : {
                    userMessage: replyText,
                    tenant: c.tenant,
                    subject: c.subject || '',
                    conversationId: c.conversationId,
                    recipientUid: c.counterpart.uid,
                    recipientEmail: c.counterpart.email,
                    recipientName: c.counterpart.name
                };
                const res = await fetch('/api/chat/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data.success) throw new Error(data.error || 'Failed to send.');
                if (adminReplyInput) adminReplyInput.value = '';
                await loadMessageBox();
            } catch (err) {
                alert('Could not send: ' + (err.message || 'Please try again.'));
            } finally {
                if (adminSendReplyBtn) {
                    adminSendReplyBtn.disabled = false;
                    adminSendReplyBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span>Send</span>';
                }
            }
        });
    }

    if (adminRefreshChatBtn) {
        adminRefreshChatBtn.addEventListener('click', () => {
            loadMessageBox();
        });
    }

    // Admin Tab Switching (Sidebar & Mobile Dropdown)
    const adminTabs = document.querySelectorAll('#adminTabs .sidebar-item');

    adminTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.getAttribute('data-target');
            switchAdminTab(targetId);
        });
    });

    const adminMobileTabSelect = document.getElementById('adminMobileTabSelect');
    if (adminMobileTabSelect) {
        adminMobileTabSelect.addEventListener('change', (e) => {
            switchAdminTab(e.target.value);
        });
    }

    // ==========================================
    // Services 2: prices set in the admin panel (Services & Pricing tab).
    // Visitors in Australia see AUD (USD when no AUD price is set); everyone else sees USD.
    // The service list, validation and currency rule come from service-pricing.js, shared with the server
    // ==========================================
    const servicePriceBoxes = document.querySelectorAll('[data-service-price]');
    const servicePricesForm = document.getElementById('servicePricesForm');
    const servicePricesRows = document.getElementById('servicePricesRows');
    const servicePricesSaveBtn = document.getElementById('servicePricesSaveBtn');
    const servicePricesStatus = document.getElementById('servicePricesStatus');
    const servicePricesUpdated = document.getElementById('servicePricesUpdated');
    const servicePricesRate = document.getElementById('servicePricesRate');
    let servicePricesData = null; // last answer from /api/services/prices: { country, prices, updatedAt }
    let usdAudRate = null; // last answer from /api/exchange-rates/usd-aud: { rate, date }, null until fetched

    // The server's IP geolocation decides; when it can't tell (local development), the location bar's place does
    function serviceVisitorCountry() {
        if (servicePricesData && servicePricesData.country) return servicePricesData.country;
        const place = window.SitePrefs ? window.SitePrefs.getLocation() : null;
        return place && place.countryCode ? place.countryCode : '';
    }

    function servicePriceAmountHtml(price, suffix) {
        if (!price) return '<span class="service-price-amount service-price-on-request">Price on request</span>';
        const text = escapeHtml(window.ServicePricing.formatPrice(price));
        const gstLabel = price.currency === 'AUD' ? ' <small>(+ GST)</small>' : '';
        return `<span class="service-price-amount">${text}${suffix ? `<small>${escapeHtml(suffix)}</small>` : ''}${gstLabel}</span>`;
    }

    function renderServicePrices() {
        const pricing = window.ServicePricing;
        if (!pricing) {
            servicePriceBoxes.forEach(box => { box.hidden = true; });
            return;
        }
        const country = serviceVisitorCountry();
        servicePriceBoxes.forEach(box => {
            const service = pricing.SERVICES.find(s => s.id === box.getAttribute('data-service-price'));
            if (!service) return;
            const saved = (servicePricesData && servicePricesData.prices && servicePricesData.prices[service.id]) || {};
            const lines = service.parts.map(part => ({ part, price: pricing.resolvePrice(saved[part.key], country) }));
            const name = `<span class="service-price-name">${escapeHtml(service.name)}</span>`;
            if (lines.length > 1 && lines.some(line => line.price)) {
                // A service with more than one price shows each on its own line
                box.innerHTML = name + lines.map(({ part, price }) => `
                    <span class="service-price-line">
                        <span class="service-price-label">${escapeHtml(part.label)}</span>
                        ${servicePriceAmountHtml(price, part.suffix)}
                    </span>`).join('');
            } else {
                box.innerHTML = `${name} ${servicePriceAmountHtml(lines[0].price, lines[0].part.suffix)}`;
            }
            box.classList.remove('is-loading');
        });
    }

    async function loadServicePrices() {
        if (!servicePriceBoxes.length) return;
        try {
            const res = await fetch('/api/services/prices');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            servicePricesData = await res.json();
        } catch (e) {
            console.warn('[Service Prices] Could not load prices:', e.message);
        }
        renderServicePrices();
    }

    function setServicePricesStatus(message, type = 'info') {
        if (!servicePricesStatus) return;
        servicePricesStatus.style.display = message ? 'block' : 'none';
        servicePricesStatus.className = `service-prices-status is-${type}`;
        servicePricesStatus.textContent = message || '';
    }

    function showServicePricesUpdated(updatedAt) {
        if (!servicePricesUpdated) return;
        const date = updatedAt ? new Date(updatedAt) : null;
        servicePricesUpdated.textContent = date && !isNaN(date.getTime())
            ? `Last saved ${window.SitePrefs ? window.SitePrefs.formatDateTime(date) : date.toLocaleString()}`
            : 'No prices saved yet';
    }

    // A 404 means the server is still running code from before Services & Pricing existed, which retrying won't fix
    function servicePricesRequestError(res, data) {
        if (res.status === 404) return new Error('the server is running an older version without Services & Pricing, so restart or redeploy it first');
        return new Error(String(data.error || `HTTP ${res.status}`).replace(/\.$/, ''));
    }

    // Box text for a saved amount: "1500" (service prices are whole dollars), or "1.43" for a token price with cents
    function servicePriceBoxValue(amount) {
        if (typeof amount !== 'number') return '';
        return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
    }

    function renderAdminServicePricesForm(prices) {
        const pricing = window.ServicePricing;
        if (!pricing || !servicePricesRows) return;
        servicePricesRows.innerHTML = pricing.PRICE_GROUPS.map(service => {
            const saved = (prices && prices[service.id]) || {};
            return `
            <div class="service-prices-card" role="group" aria-labelledby="servicePricesName-${escapeHtml(service.id)}">
                <h3 class="service-prices-name" id="servicePricesName-${escapeHtml(service.id)}">${escapeHtml(service.name)}</h3>
                ${service.note ? `<p class="service-prices-note">${escapeHtml(service.note)}</p>` : ''}
                ${service.parts.map(part => `
                <div class="service-prices-row">
                    ${service.parts.length > 1 ? `<span class="service-prices-part">${escapeHtml(part.label)}</span>` : ''}
                    ${pricing.CURRENCIES.map(currency => `
                    <label class="service-prices-field">
                        <span class="service-prices-currency">${currency.code} $</span>
                        <input type="text" inputmode="decimal" autocomplete="off"
                            data-service="${escapeHtml(service.id)}" data-part="${escapeHtml(part.key)}" data-currency="${escapeHtml(currency.key)}"
                            value="${escapeHtml(servicePriceBoxValue(saved[part.key] && saved[part.key][currency.key]))}"
                            placeholder="${escapeHtml((part.placeholders && part.placeholders[currency.key]) || (currency.key === 'aud' ? 'Uses USD price' : 'Not set'))}"
                            aria-label="${escapeHtml(`${service.name}, ${part.label}, ${currency.name}`)}">
                    </label>`).join('')}
                </div>`).join('')}
            </div>`;
        }).join('');
    }

    // Today's USD to AUD rate (Frankfurter, through the server) for filling in AUD boxes, and the note saying so
    async function loadUsdAudRate() {
        if (!servicePricesRate) return;
        try {
            const res = await fetch('/api/exchange-rates/usd-aud');
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !(data.rate > 0)) throw new Error(data.error || `HTTP ${res.status}`);
            usdAudRate = { rate: data.rate, date: data.date };
            const day = new Date(`${data.date}T00:00:00Z`);
            const dayText = isNaN(day.getTime()) ? '' : `, ${day.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
            servicePricesRate.textContent = `Typing a USD price fills in its AUD box at today's rate, rounded to the nearest dollar (token prices to the cent): 1 USD = ${data.rate} AUD (Frankfurter${dayText}). You can still change the AUD amount.`;
        } catch (e) {
            usdAudRate = null;
            servicePricesRate.textContent = 'Today\'s exchange rate could not be fetched, so AUD boxes won\'t fill in by themselves. Enter AUD prices yourself.';
        }
        servicePricesRate.hidden = false;
    }

    async function loadAdminServicePrices() {
        if (!servicePricesRows || !window.ServicePricing) return;
        // Saving stays off until the saved prices are shown, so a failed load can't blank them
        if (servicePricesSaveBtn) servicePricesSaveBtn.disabled = true;
        servicePricesRows.innerHTML = '';
        setServicePricesStatus('Loading saved prices...');
        loadUsdAudRate();
        try {
            const res = await fetch('/api/services/prices');
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw servicePricesRequestError(res, data);
            servicePricesData = data;
            renderAdminServicePricesForm(data.prices);
            showServicePricesUpdated(data.updatedAt);
            setServicePricesStatus('');
            if (servicePricesSaveBtn) servicePricesSaveBtn.disabled = false;
        } catch (e) {
            setServicePricesStatus(`Could not load the saved prices: ${e.message}. Then open Services & Pricing again.`, 'error');
        }
    }

    if (servicePricesRows) {
        // Clear a box's error highlight once it is edited
        servicePricesRows.addEventListener('input', (e) => {
            const field = e.target.closest('.service-prices-field');
            if (field) field.classList.remove('is-invalid');

            // Typing a USD price fills in the AUD box beside it at today's rate
            if (!usdAudRate || e.target.dataset.currency !== 'usd') return;
            const pricing = window.ServicePricing;
            const aud = pricing.convertUsdToAud(e.target.value, usdAudRate.rate, { decimals: pricing.priceDecimals(e.target.dataset.service) });
            const audInput = e.target.closest('.service-prices-row').querySelector('input[data-currency="aud"]');
            if (aud === null || !audInput) return;
            audInput.value = servicePriceBoxValue(aud);
            audInput.closest('.service-prices-field').classList.remove('is-invalid');
        });

        // Service prices are whole dollars: leaving a box shows its amount rounded to the nearest dollar (1,499.95 becomes
        // 1500). Token prices keep their cents (1.4261 becomes 1.43)
        servicePricesRows.addEventListener('focusout', (e) => {
            if (!e.target.matches('input[data-service]')) return;
            const pricing = window.ServicePricing;
            const amount = pricing.parseAmount(e.target.value, { decimals: pricing.priceDecimals(e.target.dataset.service) });
            if (Number.isFinite(amount)) e.target.value = servicePriceBoxValue(amount);
        });
    }

    if (servicePricesForm) {
        servicePricesForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pricing = window.ServicePricing;
            if (!pricing || !servicePricesSaveBtn || servicePricesSaveBtn.disabled) return;

            const prices = {};
            let firstInvalid = null;
            servicePricesRows.querySelectorAll('input[data-service]').forEach(input => {
                const amount = pricing.parseAmount(input.value, { decimals: pricing.priceDecimals(input.dataset.service) });
                const invalid = Number.isNaN(amount);
                input.closest('.service-prices-field').classList.toggle('is-invalid', invalid);
                input.setAttribute('aria-invalid', String(invalid));
                if (invalid && !firstInvalid) firstInvalid = input;
                const { service, part, currency } = input.dataset;
                prices[service] = prices[service] || {};
                prices[service][part] = prices[service][part] || {};
                prices[service][part][currency] = invalid ? null : amount;
            });
            if (firstInvalid) {
                setServicePricesStatus('Check the highlighted boxes: enter amounts like 1500 or 1,500 (from 1 to 1,000,000; token prices can have cents, like 1.43), or leave a box blank.', 'error');
                firstInvalid.focus();
                return;
            }

            servicePricesSaveBtn.disabled = true;
            servicePricesSaveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';
            setServicePricesStatus('');
            try {
                const res = await fetch('/api/services/prices', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prices })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw servicePricesRequestError(res, data);
                servicePricesData = { ...servicePricesData, prices: data.prices, updatedAt: data.updatedAt };
                renderAdminServicePricesForm(data.prices);
                showServicePricesUpdated(data.updatedAt);
                renderServicePrices();
                if (data.savedToDatabase) {
                    setServicePricesStatus('Prices saved. The Services page shows them now.', 'ok');
                } else {
                    setServicePricesStatus('Saved to this server\'s data file only: the database could not be reached, so the live site will not show these prices.', 'error');
                }
            } catch (err) {
                setServicePricesStatus(`Could not save the prices: ${err.message}.`, 'error');
            } finally {
                servicePricesSaveBtn.disabled = false;
                servicePricesSaveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save Prices';
            }
        });
    }

    // ==========================================
    // TOKEN BOXES (Buy Tokens and Token Accounts)
    // The - / amount / + controls. The amount starts at 10 and each press moves it to the next or previous 10
    // (TOKEN_LIMITS in service-pricing.js), with no upper limit. Any whole number can be typed; with wholeSteps
    // (Buy Tokens: tokens are bought 10 at a time) it's rounded up to a multiple of 10 on leaving the box.
    // onChange runs after every change
    // ==========================================
    function setupTokenStepper({ input, less, more, onChange, wholeSteps = false }) {
        const limits = () => window.ServicePricing.TOKEN_LIMITS;
        const typed = () => parseInt(String(input.value).replace(/\D/g, ''), 10);

        function refresh() {
            const value = typed();
            less.disabled = !(value > limits().min);
            more.disabled = value >= limits().max;
            onChange();
        }

        function step(direction) {
            const { min, max, step: by } = limits();
            const value = typed();
            const current = Number.isFinite(value) ? value : 0;
            // 15 goes up to 20 and down to 10, so the amount lands on a multiple of 10
            const next = direction > 0 ? Math.floor(current / by) * by + by : Math.ceil(current / by) * by - by;
            input.value = String(Math.min(max, Math.max(min, next)));
            refresh();
        }

        input.addEventListener('input', () => {
            const digits = input.value.replace(/\D/g, '');
            if (digits !== input.value) input.value = digits;
            refresh();
        });
        // Leaving the box keeps the amount within the limits
        input.addEventListener('blur', () => {
            const { min, max, step: by } = limits();
            const value = typed();
            const rounded = wholeSteps && Number.isFinite(value) ? Math.ceil(value / by) * by : value;
            input.value = String(Number.isFinite(rounded) ? Math.min(max, Math.max(min, rounded)) : min);
            refresh();
        });
        less.addEventListener('click', () => step(-1));
        more.addEventListener('click', () => step(1));
        refresh();
        return { refresh };
    }

    // ==========================================
    // BUY TOKENS (SuperAdmin and supporter panels)
    // GET /api/tokens gives the balance (users/{uid}.token_balance, shared by all the owner's apps) and this visitor's
    // price per token (set in Services & Pricing); tokens are bought 10 at a time. Paying goes through Stripe Checkout;
    // when Stripe sends the buyer back, the payment is confirmed and credited
    // ==========================================
    const buyTokensBalance = document.getElementById('buyTokensBalance');
    const buyTokensAmount = document.getElementById('buyTokensAmount');
    const buyTokensTotal = document.getElementById('buyTokensTotal');
    const buyTokensPayBtn = document.getElementById('buyTokensPayBtn');
    const buyTokensStatus = document.getElementById('buyTokensStatus');
    let buyTokensData = null; // last answer from GET /api/tokens: { balance, hasProfile, price, limits, minPayment, maxPayment, canPay }
    let buyTokensBusy = false; // true while a checkout is being started
    let buyTokensReturn = null; // back from Stripe: { sessionId } or { cancelled: true }, used by the next load
    let buyTokensStepper = null;

    function setBuyTokensStatus(message, type = 'info') {
        if (!buyTokensStatus) return;
        buyTokensStatus.style.display = message ? 'block' : 'none';
        buyTokensStatus.className = `service-prices-status is-${type}`;
        buyTokensStatus.textContent = message || '';
    }

    // Total and Pay button for the amount in the box
    function renderBuyTokensTotal() {
        const pricing = window.ServicePricing;
        const quantity = pricing.parseTokenQuantity(buyTokensAmount.value, { multipleOf: pricing.TOKEN_LIMITS.step });
        const price = buyTokensData && buyTokensData.price;
        buyTokensPayBtn.innerHTML = '<i class="fa-solid fa-credit-card"></i> Pay with Card';
        if (Number.isNaN(quantity)) {
            buyTokensTotal.textContent = 'Tokens are bought 10 at a time: enter 10, 20, 30 and so on.';
            buyTokensPayBtn.disabled = true;
            return;
        }
        if (!price) {
            buyTokensTotal.textContent = '';
            buyTokensPayBtn.disabled = true;
            return;
        }
        const total = pricing.tokenTotal(price, quantity);
        const maxPayment = buyTokensData.maxPayment || pricing.MAX_CARD_PAYMENT;
        let problem = '';
        if (total.amount < buyTokensData.minPayment) problem = `The smallest card payment is ${total.currency} $0.50, so please choose more tokens.`;
        else if (total.amount > maxPayment) problem = `One card payment can be at most ${total.currency} $999,999.99, so please choose fewer tokens.`;
        const gstTag = total.currency === 'AUD' ? ' (+ GST)' : '';
        buyTokensTotal.innerHTML = `
            <strong>${escapeHtml(pricing.formatPrice(total))}${gstTag}</strong> for ${quantity.toLocaleString('en-AU')} tokens
            <span class="buy-tokens-rate">${escapeHtml(pricing.formatPrice(price))}${gstTag} per token</span>
            ${problem ? `<span class="buy-tokens-rate">${escapeHtml(problem)}</span>` : ''}`;
        buyTokensPayBtn.innerHTML = `<i class="fa-solid fa-credit-card"></i> Pay ${escapeHtml(pricing.formatPrice(total))}`;
        buyTokensPayBtn.disabled = buyTokensBusy || Boolean(problem) || !buyTokensData.canPay ||
            buyTokensData.balance === null || buyTokensData.hasProfile === false;
    }

    // The message for a confirmed payment (POST /api/tokens/confirm): { text, type }
    function tokenConfirmMessage(data) {
        const tokensText = `${Number(data.tokens).toLocaleString('en-AU')} tokens`;
        if (data.status === 'credited') return { text: `Payment received: ${tokensText} added to your balance. Thank you!`, type: 'ok' };
        if (data.status === 'already-credited') return { text: `Payment received: ${tokensText} are in your balance.`, type: 'ok' };
        if (data.status === 'expired') return { text: 'That payment was not completed, so you were not charged and no tokens were added.', type: 'error' };
        return { text: 'Your payment is still being processed. The tokens will appear here once Stripe confirms it.', type: 'info' };
    }

    async function loadBuyTokens() {
        if (!buyTokensStepper) return;
        const returned = buyTokensReturn;
        buyTokensReturn = null;
        buyTokensPayBtn.disabled = true;
        buyTokensBalance.textContent = '...';
        setBuyTokensStatus(returned && returned.sessionId ? 'Checking your payment...' : '');

        let notice = returned && returned.cancelled
            ? { text: 'Payment cancelled. You were not charged and no tokens were bought.', type: 'info' }
            : null;
        if (returned && returned.sessionId) {
            try {
                const res = await fetch('/api/tokens/confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: returned.sessionId })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                notice = tokenConfirmMessage(data);
            } catch (e) {
                notice = { text: `Your payment could not be confirmed yet: ${e.message}`, type: 'error' };
            }
        }

        try {
            const res = await fetch('/api/tokens');
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(String(data.error || `HTTP ${res.status}`).replace(/\.$/, ''));
            buyTokensData = data;
        } catch (e) {
            buyTokensData = null;
            buyTokensBalance.textContent = '-';
            setBuyTokensStatus(notice ? notice.text : `Could not load Buy Tokens: ${e.message}. Please try again.`, notice ? notice.type : 'error');
            buyTokensStepper.refresh();
            return;
        }

        buyTokensBalance.textContent = buyTokensData.balance === null
            ? 'Unavailable right now'
            : `${buyTokensData.balance.toLocaleString('en-AU')} tokens`;
        if (!notice && !buyTokensData.price) notice = { text: 'Tokens are not on sale yet. Please check back soon.', type: 'info' };
        if (!notice && !buyTokensData.canPay) notice = { text: 'Card payments are not set up yet, so tokens can\'t be bought right now.', type: 'info' };
        if (!notice && buyTokensData.balance === null) notice = { text: 'Your token balance can\'t be reached right now, so buying is paused. Please try again shortly.', type: 'error' };
        if (!notice && buyTokensData.hasProfile === false) notice = { text: 'Your account isn\'t fully set up yet. Please sign out and sign in again to buy tokens.', type: 'info' };
        setBuyTokensStatus(notice ? notice.text : '', notice ? notice.type : 'info');
        buyTokensStepper.refresh();
    }

    if (buyTokensAmount && window.ServicePricing) {
        buyTokensStepper = setupTokenStepper({
            input: buyTokensAmount,
            less: document.getElementById('buyTokensLess'),
            more: document.getElementById('buyTokensMore'),
            onChange: renderBuyTokensTotal,
            wholeSteps: true
        });

        buyTokensPayBtn.addEventListener('click', async () => {
            const quantity = window.ServicePricing.parseTokenQuantity(buyTokensAmount.value, { multipleOf: window.ServicePricing.TOKEN_LIMITS.step });
            if (Number.isNaN(quantity) || buyTokensBusy) return;
            buyTokensBusy = true;
            buyTokensPayBtn.disabled = true;
            buyTokensPayBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Opening secure payment...';
            setBuyTokensStatus('');
            try {
                const res = await fetch('/api/tokens/checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tokens: quantity, returnPath: window.location.pathname })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data.url) throw new Error(data.error || `HTTP ${res.status}`);
                window.location.href = data.url;
            } catch (e) {
                buyTokensBusy = false;
                setBuyTokensStatus(`Could not start the payment: ${String(e.message).replace(/\.$/, '')}.`, 'error');
                renderBuyTokensTotal();
            }
        });
    }

    // ==========================================
    // TOKEN ACCOUNTS (SuperAdmin panel)
    // Every account's balance (profiles from all apps, which share one token balance) from GET /api/tokens/accounts.
    // Choosing an account opens the add-tokens box; POST /api/tokens/grant adds them.
    // Above them, the Total Token Count and AI Foundation Token Count (tokens bought minus tokens paid to people)
    // ==========================================
    const tokenAccountsSearch = document.getElementById('tokenAccountsSearch');
    const tokenAccountsList = document.getElementById('tokenAccountsList');
    const tokenAccountsStatus = document.getElementById('tokenAccountsStatus');
    const tokenGrantPanel = document.getElementById('tokenGrantPanel');
    const tokenGrantWho = document.getElementById('tokenGrantWho');
    const tokenGrantBalance = document.getElementById('tokenGrantBalance');
    const tokenGrantAmount = document.getElementById('tokenGrantAmount');
    const tokenGrantBtn = document.getElementById('tokenGrantBtn');
    let tokenAccounts = []; // last answer from GET /api/tokens/accounts: [{ uid, name, email, app, balance }]
    let selectedTokenAccount = null; // uid of the account the add-tokens box is for
    let tokenGrantBusy = false;
    // The two count tiles, by their key in the answer from GET /api/tokens/counts
    const tokenCountTiles = {
        total: { value: document.getElementById('tokenCountTotal'), detail: document.getElementById('tokenCountTotalDetail'), where: 'in all apps' },
        aifoundation: { value: document.getElementById('tokenCountAifoundation'), detail: document.getElementById('tokenCountAifoundationDetail'), where: 'in AI Foundation' }
    };

    function setTokenAccountsStatus(message, type = 'info') {
        if (!tokenAccountsStatus) return;
        tokenAccountsStatus.style.display = message ? 'block' : 'none';
        tokenAccountsStatus.className = `service-prices-status is-${type}`;
        tokenAccountsStatus.textContent = message || '';
    }

    function tokenAccountLabel(account) {
        return account.name || account.email || account.uid;
    }

    function renderTokenAccounts() {
        const query = tokenAccountsSearch.value.trim().toLowerCase();
        const shown = tokenAccounts.filter(a => !query || `${a.name} ${a.email} ${a.app}`.toLowerCase().includes(query));
        if (!shown.length) {
            tokenAccountsList.innerHTML = `<p class="token-accounts-empty">${tokenAccounts.length ? 'No accounts match your search.' : 'No accounts to show.'}</p>`;
            return;
        }
        tokenAccountsList.innerHTML = shown.map(a => `
            <button type="button" class="token-account-row${a.uid === selectedTokenAccount ? ' is-selected' : ''}" data-uid="${escapeHtml(a.uid)}" aria-pressed="${a.uid === selectedTokenAccount}">
                <span class="token-account-who">
                    <strong>${escapeHtml(tokenAccountLabel(a))}</strong>
                    ${a.name && a.email ? `<small>${escapeHtml(a.email)}</small>` : ''}
                </span>
                ${a.app ? `<span class="token-account-app">${escapeHtml(a.app)}</span>` : ''}
                <span class="token-account-balance">${a.balance.toLocaleString('en-AU')} <small>tokens</small></span>
            </button>`).join('');
    }

    function renderTokenGrant() {
        const account = tokenAccounts.find(a => a.uid === selectedTokenAccount);
        tokenGrantPanel.hidden = !account;
        if (!account) return;
        tokenGrantWho.textContent = tokenAccountLabel(account);
        tokenGrantBalance.textContent = `${account.balance.toLocaleString('en-AU')} tokens`;
        const quantity = window.ServicePricing.parseTokenQuantity(tokenGrantAmount.value);
        tokenGrantBtn.disabled = tokenGrantBusy || Number.isNaN(quantity);
        tokenGrantBtn.innerHTML = tokenGrantBusy
            ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Adding...'
            : `<i class="fa-solid fa-plus"></i> Add ${Number.isNaN(quantity) ? '' : `${quantity.toLocaleString('en-AU')} `}tokens`;
    }

    // Each count is { bought, paidOut, count }; paidOut is grants, What HR's gifts and PT trainer shares
    async function loadTokenCounts() {
        let counts = null;
        let problem = '';
        try {
            const res = await fetch('/api/tokens/counts');
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(String(data.error || `HTTP ${res.status}`).replace(/\.$/, ''));
            counts = data;
        } catch (e) {
            problem = `Could not load the count: ${e.message}.`;
        }
        const tokens = n => Number(n).toLocaleString('en-AU');
        for (const [key, tile] of Object.entries(tokenCountTiles)) {
            if (!tile.value) continue;
            const c = counts && counts[key];
            if (!c) {
                tile.value.textContent = '-';
                tile.detail.textContent = problem || 'Could not load the count.';
                continue;
            }
            tile.value.textContent = `${tokens(c.count)} tokens`;
            tile.detail.textContent = `${tokens(c.bought)} bought ${tile.where}, minus ${tokens(c.paidOut)} paid to people`;
        }
    }

    async function loadTokenAccounts() {
        if (!tokenAccountsList || !window.ServicePricing) return;
        loadTokenCounts();
        setTokenAccountsStatus('Loading accounts...');
        try {
            const res = await fetch('/api/tokens/accounts');
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(String(data.error || `HTTP ${res.status}`).replace(/\.$/, ''));
            tokenAccounts = Array.isArray(data.accounts) ? data.accounts : [];
            setTokenAccountsStatus('');
        } catch (e) {
            setTokenAccountsStatus(`Could not load the accounts: ${e.message}.`, 'error');
        }
        renderTokenAccounts();
        renderTokenGrant();
    }

    // Verify pending payments (Token Accounts, SuperAdmin). There are no Stripe webhooks, so this asks the server to check
    // every unfinished checkout with Stripe (POST /api/admin/payments/verify-pending) and complete the paid ones
    const verifyPaymentsBtn = document.getElementById('verifyPendingPaymentsBtn');
    const verifyPaymentsStatus = document.getElementById('verifyPendingPaymentsStatus');
    if (verifyPaymentsBtn && verifyPaymentsStatus) {
        const showVerifyStatus = (message, type = 'info') => {
            verifyPaymentsStatus.style.display = message ? 'block' : 'none';
            verifyPaymentsStatus.className = `service-prices-status payments-verify-status is-${type}`;
            verifyPaymentsStatus.textContent = message || '';
        };
        const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
        verifyPaymentsBtn.addEventListener('click', async () => {
            const original = verifyPaymentsBtn.innerHTML;
            verifyPaymentsBtn.disabled = true;
            verifyPaymentsBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Checking with Stripe...';
            showVerifyStatus('');
            try {
                const res = await fetch('/api/admin/payments/verify-pending', { method: 'POST' });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(String(data.error || `HTTP ${res.status}`).replace(/\.$/, ''));
                if (!data.checked) {
                    showVerifyStatus('No pending payments. Everything is up to date.', 'ok');
                } else {
                    const parts = [`${plural(data.paid, 'payment')} paid and completed`, `${data.pending} still waiting for payment`, `${data.expired} abandoned`];
                    if (data.notFound) parts.push(`${data.notFound} not found in Stripe (made with other keys?)`);
                    if (data.errors) parts.push(`${plural(data.errors, 'check')} failed (try again)`);
                    showVerifyStatus(`Checked ${plural(data.checked, 'checkout')}: ${parts.join(', ')}.${data.more ? ' More are waiting, so run it again.' : ''}`, data.errors ? 'error' : 'ok');
                }
                if (data.paid) loadTokenAccounts(); // balances and counts may have changed
            } catch (e) {
                showVerifyStatus(`Could not verify payments: ${e.message}.`, 'error');
            } finally {
                verifyPaymentsBtn.disabled = false;
                verifyPaymentsBtn.innerHTML = original;
            }
        });
    }

    // A new ID per click, so the server never adds the same click twice
    function newGrantRequestId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    }

    if (tokenAccountsList && window.ServicePricing) {
        tokenAccountsSearch.addEventListener('input', renderTokenAccounts);
        tokenAccountsList.addEventListener('click', (e) => {
            const row = e.target.closest('.token-account-row');
            if (!row) return;
            selectedTokenAccount = row.dataset.uid;
            setTokenAccountsStatus('');
            renderTokenAccounts();
            renderTokenGrant();
            tokenGrantPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });

        setupTokenStepper({
            input: tokenGrantAmount,
            less: document.getElementById('tokenGrantLess'),
            more: document.getElementById('tokenGrantMore'),
            onChange: renderTokenGrant
        });

        tokenGrantBtn.addEventListener('click', async () => {
            const account = tokenAccounts.find(a => a.uid === selectedTokenAccount);
            const tokens = window.ServicePricing.parseTokenQuantity(tokenGrantAmount.value);
            if (!account || Number.isNaN(tokens) || tokenGrantBusy) return;
            tokenGrantBusy = true;
            renderTokenGrant();
            setTokenAccountsStatus('');
            try {
                const res = await fetch('/api/tokens/grant', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uid: account.uid, tokens, requestId: newGrantRequestId() })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                if (typeof data.balance === 'number') account.balance = data.balance;
                setTokenAccountsStatus(`Added ${tokens.toLocaleString('en-AU')} tokens to ${tokenAccountLabel(account)}. Their balance is now ${account.balance.toLocaleString('en-AU')} tokens.`, 'ok');
                loadTokenCounts(); // tokens paid to people come off both counts
            } catch (e) {
                setTokenAccountsStatus(`Could not add the tokens: ${String(e.message).replace(/\.$/, '')}.`, 'error');
            } finally {
                tokenGrantBusy = false;
                renderTokenAccounts();
                renderTokenGrant();
            }
        });
    }

    // Firestore & Fallback Content Helpers
    function getPostTimestamp(p) {
        if (!p || !p.date) return 0;
        if (typeof p.date.toDate === 'function') return p.date.toDate().getTime();
        if (p.date.seconds) return p.date.seconds * 1000;
        const t = new Date(p.date).getTime();
        return isNaN(t) ? 0 : t;
    }

    function formatPostDate(d) {
        if (!d) return 'Recent';
        const parsed = typeof d.toDate === 'function' ? d.toDate() : new Date(d.seconds ? d.seconds * 1000 : d);
        if (isNaN(parsed.getTime())) return 'Recent';
        // Visitor's chosen date format and time zone from the location bar (site-locale.js)
        return window.SitePrefs ? window.SitePrefs.formatDate(parsed) : parsed.toLocaleDateString();
    }

    // Re-render dates when the visitor changes their date format or time zone in the location bar
    window.addEventListener('sitepreferenceschange', () => {
        if (allPosts.length) renderPosts();
        if (allProjects.length) renderProjects();
        if (allTechPosts.length) renderTechPosts();
        if (allCommunityPosts.length) renderCommunityPosts();
        const managePosts = document.getElementById('admin-manage-posts');
        if (managePosts && managePosts.style.display === 'block') renderAdminAllPosts();
        // A new location can change the currency when the server couldn't tell the visitor's country
        if (servicePricesData) renderServicePrices();
    });

    const DELETED_IDS_KEY = 'aifoundation_deleted_items';
    const DELETED_KEYS_KEY = 'aifoundation_deleted_keys';
    function getDeletedIds() {
        try {
            return JSON.parse(localStorage.getItem(DELETED_IDS_KEY) || '[]');
        } catch (e) {
            return [];
        }
    }
    function addDeletedId(id) {
        if (!id) return;
        try {
            const list = getDeletedIds();
            if (!list.includes(id)) {
                list.push(id);
                localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(list));
            }
        } catch (e) {}
    }

    function getDeletedKeys() {
        try {
            return JSON.parse(localStorage.getItem(DELETED_KEYS_KEY) || '[]');
        } catch (e) {
            return [];
        }
    }
    function addDeletedKey(key) {
        if (!key) return;
        try {
            const list = getDeletedKeys();
            if (!list.includes(key)) {
                list.push(key);
                localStorage.setItem(DELETED_KEYS_KEY, JSON.stringify(list));
            }
        } catch (e) {}
    }

    async function loadCategoryFromFirestore(category) {
        // If firebaseService is initializing, give it a moment to become ready
        if (!window.firebaseService?.isConnected) {
            await new Promise(resolve => {
                if (window.firebaseService?.isConnected) return resolve();
                const handler = () => {
                    window.removeEventListener('firebaseServiceReady', handler);
                    resolve();
                };
                window.addEventListener('firebaseServiceReady', handler);
                setTimeout(resolve, 800);
            });
        }

        if (window.firebaseService && window.firebaseService.isConnected) {
            try {
                const { db, collection, getDocs, query, where, TRANSACTION_TAG } = window.firebaseService;
                const q = query(collection(db, 'content'), where('tag', '==', TRANSACTION_TAG), where('category', '==', category));
                const snap = await getDocs(q);
                let items = snap.docs.map(d => {
                    const data = d.data();
                    let dateVal = data.date;
                    if (dateVal && typeof dateVal.toDate === 'function') {
                        dateVal = dateVal.toDate().toISOString();
                    } else if (dateVal && dateVal.seconds) {
                        dateVal = new Date(dateVal.seconds * 1000).toISOString();
                    }
                    return { id: d.id, ...data, date: dateVal || data.date };
                });
                const deletedIds = new Set(getDeletedIds());
                items = items.filter(p => !deletedIds.has(p.id));
                items.sort((a, b) => getPostTimestamp(b) - getPostTimestamp(a));
                return items;
            } catch (err) {
                console.warn('Firebase notice loading ' + category + ':', err.message);
            }
        }
        return null;
    }

    async function fetchFallbackData(category, jsonFileName) {
        try {
            const apiRes = await fetch(`/api/${category === 'articles' ? 'posts' : category}`);
            if (apiRes.ok) return await apiRes.json();
        } catch (e) {}
        try {
            const staticRes = await fetch(`/data/${jsonFileName}`);
            if (staticRes.ok) return await staticRes.json();
        } catch (e) {}
        return [];
    }

    function mergePosts(primary, fallback) {
        const deletedIds = new Set(getDeletedIds());
        const deletedKeys = new Set(getDeletedKeys());
        const list = [];
        const seenIds = new Set();
        const seenLinks = new Set();
        const seenTitles = new Set();

        const addIfUnique = (item) => {
            if (!item) return;
            const id = (item.id || '').trim();
            if (id && deletedIds.has(id)) return;

            const normLink = (item.link || '').trim().toLowerCase().replace(/\/+$/, '');
            const normTitle = (item.title || '').trim().toLowerCase();

            if (normLink && deletedKeys.has(normLink)) return;
            if (normTitle && deletedKeys.has(normTitle)) return;

            if (id && seenIds.has(id)) return;
            if (normLink && seenLinks.has(normLink)) return;
            if (normTitle && seenTitles.has(normTitle)) return;

            if (id) seenIds.add(id);
            if (normLink) seenLinks.add(normLink);
            if (normTitle) seenTitles.add(normTitle);
            list.push(item);
        };

        if (Array.isArray(primary)) {
            primary.forEach(addIfUnique);
        }
        if (Array.isArray(fallback)) {
            fallback.forEach(addIfUnique);
        }
        list.sort((a, b) => getPostTimestamp(b) - getPostTimestamp(a));
        return list;
    }

    // Community Posts Logic
    async function loadCommunityPosts() {
        const fbData = await loadCategoryFromFirestore('community');
        const fallback = await fetchFallbackData('community', 'community.json');
        allCommunityPosts = mergePosts(fbData, fallback);
        renderCommunityPosts();
        renderAdminAllPosts();
    }

    function renderCommunityPosts() {
        const grid = document.getElementById('communityPostsGrid');
        if (!grid) return;
        grid.innerHTML = allCommunityPosts.map(post => `
            <article class="post-card">
                <div class="post-image-box">
                    <img src="${safeUrl(post.imageUrl) || 'assets/logo.png'}" class="post-image" onerror="this.src='assets/logo.png'">
                    <span class="platform-badge platform-linkedin" style="background: var(--primary);">COMMUNITY</span>
                </div>
                <div class="post-content">
                    <h3 class="post-title">${escapeHtml(post.title)}</h3>
                    <p class="post-summary">${escapeHtml(truncateSummary(post.summary))}</p>
                    <div class="post-actions">
                        ${generateShareButtonsHtml(post.title, post.link, post.summary)}
                        <div class="post-footer">
                            <span>${formatPostDate(post.date)}</span>
                            ${post.link ? `<a href="${safeUrl(post.link)}" target="_blank" rel="noopener noreferrer">View Post ↗</a>` : ''}
                        </div>
                    </div>
                </div>
            </article>
        `).join('');
        
        document.querySelectorAll('#communityPostsGrid .post-card').forEach(card => postObserver.observe(card));
    }

    function renderAdminCommunityPosts() {
        const list = document.getElementById('adminCommunityPostsList');
        if (!list) return;
        list.innerHTML = allCommunityPosts.map(p => `
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; background:white; padding:8px; border-radius:6px; align-items:center;">
                <span><strong>${escapeHtml(p.title)}</strong></span>
                <button onclick="deleteCommunityPost(${jsArg(p.id)})" style="background:#ef4444; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer;">Delete</button>
            </div>
        `).join('');
    }

    window.deleteCommunityPost = async (id) => {
        if (window.firebaseService && window.firebaseService.isConnected) {
            try {
                const { db, doc, deleteDoc } = window.firebaseService;
                await deleteDoc(doc(db, 'content', id));
            } catch (e) { console.warn('Firestore delete notice:', e); }
        }
        try { await fetch('/api/community/' + id, { method: 'DELETE' }); } catch(e) {}
        loadCommunityPosts();
    };

    // Tech Posts Logic
    async function loadTechPosts() {
        const fbData = await loadCategoryFromFirestore('tech');
        const fallback = await fetchFallbackData('tech', 'tech.json');
        allTechPosts = mergePosts(fbData, fallback);
        renderTechPosts();
        renderAdminAllPosts();
    }

    function renderTechPosts() {
        const grid = document.getElementById('techPostsGrid');
        if (!grid) return;
        grid.innerHTML = allTechPosts.map(post => `
            <article class="post-card">
                <div class="post-image-box">
                    <img src="${safeUrl(post.imageUrl) || 'assets/logo.png'}" class="post-image" onerror="this.src='assets/logo.png'">
                    <span class="platform-badge platform-linkedin" style="background: var(--primary);">TECH R&D</span>
                </div>
                <div class="post-content">
                    <h3 class="post-title">${escapeHtml(post.title)}</h3>
                    <p class="post-summary">${escapeHtml(truncateSummary(post.summary))}</p>
                    <div class="post-actions">
                        ${generateShareButtonsHtml(post.title, post.link, post.summary)}
                        <div class="post-footer">
                            <span>${formatPostDate(post.date)}</span>
                            ${post.link ? `<a href="${safeUrl(post.link)}" target="_blank" rel="noopener noreferrer">View Post ↗</a>` : ''}
                        </div>
                    </div>
                </div>
            </article>
        `).join('');
        
        document.querySelectorAll('#techPostsGrid .post-card').forEach(card => postObserver.observe(card));
    }

    function renderAdminTechPosts() {
        const list = document.getElementById('adminTechPostsList');
        if (!list) return;
        list.innerHTML = allTechPosts.map(p => `
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; background:white; padding:8px; border-radius:6px; align-items:center;">
                <span><strong>${escapeHtml(p.title)}</strong></span>
                <button onclick="deleteTechPost(${jsArg(p.id)})" style="background:#ef4444; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer;">Delete</button>
            </div>
        `).join('');
    }

    window.deleteTechPost = async (id) => {
        if (window.firebaseService && window.firebaseService.isConnected) {
            try {
                const { db, doc, deleteDoc } = window.firebaseService;
                await deleteDoc(doc(db, 'content', id));
            } catch (e) { console.warn('Firestore delete notice:', e); }
        }
        try { await fetch('/api/tech/' + id, { method: 'DELETE' }); } catch(e) {}
        loadTechPosts();
    };

    // Projects Logic
    async function loadProjects() {
        const fbData = await loadCategoryFromFirestore('projects');
        const fallback = await fetchFallbackData('projects', 'projects.json');
        allProjects = mergePosts(fbData, fallback);
        renderProjects();
        renderAdminAllPosts();
    }

    document.getElementById('projectSearchInput')?.addEventListener('input', (e) => {
        projectSearchQuery = e.target.value.toLowerCase();
        currentProjectPage = 1;
        renderProjects();
    });

    window.changeProjectPage = (direction) => {
        currentProjectPage += direction;
        renderProjects();
        document.getElementById('section-projects')?.scrollIntoView({ behavior: 'smooth' });
    };

    function renderProjects() {
        const grid = document.getElementById('projectsGrid');
        if (!grid) return;
        
        let filtered = allProjects;
        if (projectSearchQuery) {
            filtered = filtered.filter(p => 
                (p.title && p.title.toLowerCase().includes(projectSearchQuery)) || 
                (p.summary && p.summary.toLowerCase().includes(projectSearchQuery)) || 
                (p.platform && p.platform.toLowerCase().includes(projectSearchQuery))
            );
        }

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-muted);">
                    <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; margin-bottom: 16px; opacity: 0.5;"></i>
                    <p style="font-size: 1.1rem; font-weight: 500;">No projects currently listed.</p>
                </div>
            `;
            const paginationControls = document.getElementById('projectsPaginationControls');
            if (paginationControls) paginationControls.innerHTML = '';
            return;
        }

        const totalPages = Math.ceil(filtered.length / PROJECTS_PER_PAGE) || 1;
        if (currentProjectPage > totalPages) currentProjectPage = Math.max(1, totalPages);

        const startIndex = (currentProjectPage - 1) * PROJECTS_PER_PAGE;
        const paginated = filtered.slice(startIndex, startIndex + PROJECTS_PER_PAGE);

        grid.innerHTML = paginated.map(project => `
            <article class="post-card">
                <div class="post-image-box">
                    <img src="${safeUrl(project.imageUrl) || 'assets/logo.png'}" class="post-image" onerror="this.src='assets/logo.png'">
                    <span class="platform-badge platform-${escapeHtml(project.platform || 'website')}">${escapeHtml((project.platform || 'PROJECT').toUpperCase())}</span>
                </div>
                <div class="post-content">
                    <h3 class="post-title">${escapeHtml(project.title)}</h3>
                    <p class="post-summary">${escapeHtml(truncateSummary(project.summary))}</p>
                    <div class="post-actions">
                        ${generateShareButtonsHtml(project.title, project.link, project.summary)}
                        <div class="post-footer">
                            <span>${formatPostDate(project.date)}</span>
                            <a href="${safeUrl(project.link)}" target="_blank" rel="noopener noreferrer">View Project ↗</a>
                        </div>
                    </div>
                </div>
            </article>
        `).join('');

        const paginationControls = document.getElementById('projectsPaginationControls');
        if (paginationControls) {
            let html = '';
            if (currentProjectPage > 1) {
                html += `<button onclick="changeProjectPage(-1)" data-agent-id="projects-prev-btn" data-testid="projects-prev-btn" aria-label="Previous projects page" style="background: white; color: var(--text-dark); border: 1px solid #e2e8f0; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: all 0.2s; display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-arrow-left"></i> PREV</button>`;
            }
            if (currentProjectPage < totalPages) {
                html += `<button onclick="changeProjectPage(1)" data-agent-id="projects-more-btn" data-testid="projects-more-btn" aria-label="Next projects page" style="background: var(--primary); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600; box-shadow: 0 4px 12px rgba(0, 102, 255, 0.25); transition: all 0.2s; display: flex; align-items: center; gap: 8px;">MORE <i class="fa-solid fa-arrow-right"></i></button>`;
            }
            paginationControls.innerHTML = html;
        }

        document.querySelectorAll('#projectsGrid .post-card').forEach(card => postObserver.observe(card));
    }

    function renderAdminProjects() {
        const list = document.getElementById('adminProjectsList');
        if (!list) return;
        list.innerHTML = allProjects.map(p => `
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; background:white; padding:8px; border-radius:6px; align-items:center;">
                <span><strong>${escapeHtml(p.title)}</strong> (${escapeHtml(p.platform || 'project')})</span>
                <button onclick="deleteProject(${jsArg(p.id)})" style="background:#ef4444; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer;">Delete</button>
            </div>
        `).join('');
    }

    window.deleteProject = (id) => window.deleteAnyPost('projects', id);


    document.getElementById('finalImageUrl')?.addEventListener('input', (e) => {
        const url = e.target.value.trim();
        if (url) {
            document.getElementById('imagePreview').src = url;
            document.getElementById('imgbbStatus').textContent = 'Custom image URL set';
        }
    });

    async function loadPosts() {
        const fbData = await loadCategoryFromFirestore('articles');
        const fallback = await fetchFallbackData('articles', 'posts.json');
        allPosts = mergePosts(fbData, fallback);
        renderPosts();
        renderAdminAllPosts();
    }

    document.getElementById('globalSearchInput')?.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        currentPage = 1;
        renderPosts();
    });

    window.changePage = (direction) => {
        currentPage += direction;
        renderPosts();
        document.getElementById('section-overview').scrollIntoView({ behavior: 'smooth' });
    };

    function renderPosts() {
        if (!postsGrid) return;
        let filtered = currentFilter === 'all' ? allPosts : allPosts.filter(p => p.platform === currentFilter);
        if (searchQuery) {
            filtered = filtered.filter(p => 
                p.title.toLowerCase().includes(searchQuery) || 
                p.summary.toLowerCase().includes(searchQuery) || 
                p.platform.toLowerCase().includes(searchQuery)
            );
        }
        const totalPages = Math.ceil(filtered.length / POSTS_PER_PAGE);
        if (currentPage > totalPages) currentPage = Math.max(1, totalPages);

        const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
        const paginated = filtered.slice(startIndex, startIndex + POSTS_PER_PAGE);

        postsGrid.innerHTML = paginated.map(post => `
            <article class="post-card">
                <div class="post-image-box">
                    <img src="${safeUrl(post.imageUrl) || 'assets/logo.png'}" class="post-image" onerror="this.src='assets/logo.png'">
                    <span class="platform-badge platform-${escapeHtml(post.platform)}">${escapeHtml(post.platform.toUpperCase())}</span>
                </div>
                <div class="post-content">
                    <h3 class="post-title">${escapeHtml(post.title)}</h3>
                    <p class="post-summary">${truncateSummary(post.summary)}</p>
                    <div class="post-actions">
                        ${generateShareButtonsHtml(post.title, post.link, post.summary)}
                        <div class="post-footer">
                            <span>${formatPostDate(post.date)}</span>
                            <a href="${safeUrl(post.link)}" target="_blank" rel="noopener noreferrer">View Post ↗</a>
                        </div>
                    </div>
                </div>
            </article>
        `).join('');

        const paginationControls = document.getElementById('paginationControls');
        if (paginationControls) {
            let html = '';
            if (currentPage > 1) {
                html += `<button onclick="changePage(-1)" data-agent-id="articles-prev-btn" data-testid="articles-prev-btn" aria-label="Previous articles page" style="background: white; color: var(--text-dark); border: 1px solid #e2e8f0; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: all 0.2s; display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-arrow-left"></i> PREV</button>`;
            }
            if (currentPage < totalPages) {
                html += `<button onclick="changePage(1)" data-agent-id="articles-more-btn" data-testid="articles-more-btn" aria-label="Next articles page" style="background: var(--primary); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600; box-shadow: 0 4px 12px rgba(0, 102, 255, 0.25); transition: all 0.2s; display: flex; align-items: center; gap: 8px;">MORE <i class="fa-solid fa-arrow-right"></i></button>`;
            }
            paginationControls.innerHTML = html;
        }

    // Observe newly added post cards for fade‑in animation
    document.querySelectorAll('.post-card').forEach(card => postObserver.observe(card));
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            currentPage = 1;
            renderPosts();
        });
    });

    function createLinkRow() {
        const row = document.createElement('div');
        row.className = 'link-row-container';
        row.innerHTML = `
            <div class="admin-form" style="margin: 0;">
                <div style="display: flex; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                    <h4 style="margin: 0; font-size: 1rem; color: #0f172a;">Link Entry</h4>
                    <button type="button" class="removeRowBtn" data-agent-id="remove-link-row-btn" data-testid="remove-link-row-btn" aria-label="Remove link entry" style="background: none; color: #ef4444; border: none; cursor: pointer; font-size: 1.3rem; padding: 4px 8px; line-height: 1;">&times;</button>
                </div>
                <input type="text" class="multiLinkInput" data-agent-id="link-entry-url-input" data-testid="link-entry-url-input" aria-label="Enter URL to scrape" placeholder="Enter URL to scrape" style="margin-bottom: 8px;" />
                <button type="button" class="multiExtractBtn" data-agent-id="extract-metadata-btn" data-testid="extract-metadata-btn" aria-label="Extract Metadata" style="background: #0f172a; color: white; padding: 12px; border-radius: 8px; font-weight: bold; width: 100%; border: none; cursor: pointer;">Extract Metadata</button>
                
                <div class="multiPreviewCard" style="margin-top: 14px; padding-top: 14px; border-top: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; gap: 14px; align-items: center; flex-wrap: wrap;">
                        <img class="multiImagePreview" src="assets/logo.png" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='assets/logo.png'" style="width: 72px; height: 72px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0; flex-shrink: 0;" />
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            <label style="background: #0284c7; color: white; padding: 7px 14px; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; width: fit-content;">
                                <i class="fa-solid fa-cloud-arrow-up"></i> Upload to ImgBB
                                <input type="file" class="multiFileImgbb" data-agent-id="link-entry-imgbb-file" data-testid="link-entry-imgbb-file" aria-label="Upload image to ImgBB" accept="image/*" style="display: none;" />
                            </label>
                            <span class="multiImgbbStatus" style="font-size: 0.8rem; color: #64748b;">Direct ImgBB Host</span>
                        </div>
                    </div>
                    <input type="text" class="multiImageUrl" data-agent-id="link-entry-image-url" data-testid="link-entry-image-url" aria-label="Image URL (ImgBB or Web)" placeholder="Image URL (ImgBB / Web)" required style="width: 100%; box-sizing: border-box;"/>
                    <input type="text" class="multiPostTitle" data-agent-id="link-entry-title" data-testid="link-entry-title" aria-label="Post Title" placeholder="Title" required style="width: 100%; box-sizing: border-box;"/>
                    <textarea class="multiPostSummary" data-agent-id="link-entry-summary" data-testid="link-entry-summary" aria-label="Post Summary" placeholder="Summary" style="width: 100%; box-sizing: border-box; min-height: 80px;"></textarea>
                    <input type="text" class="multiPostPlatform" data-agent-id="link-entry-platform" data-testid="link-entry-platform" aria-label="Platform" placeholder="Platform" required style="width: 100%; box-sizing: border-box;"/>
                    <input type="text" class="multiPostLink" data-agent-id="link-entry-final-link" data-testid="link-entry-final-link" aria-label="Final Link URL" placeholder="Final Link URL" required style="width: 100%; box-sizing: border-box;"/>
                </div>
            </div>
        `;

        const extractBtn = row.querySelector('.multiExtractBtn');
        extractBtn.addEventListener('click', async () => {
            const url = row.querySelector('.multiLinkInput').value.trim();
            if (!url) return alert('Enter a link');

            extractBtn.disabled = true;
            extractBtn.innerHTML = 'Extracting...';
            extractBtn.style.background = '#0f172a';
            try {
                const res = await fetch('/api/extract-metadata', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.error || 'Failed to extract metadata');
                }

                row.querySelector('.multiPostTitle').value = data.title || '';
                row.querySelector('.multiPostSummary').value = data.summary || '';
                row.querySelector('.multiPostPlatform').value = data.platform || '';
                row.querySelector('.multiPostLink').value = data.link || '';
                const img = data.imageUrl || 'assets/logo.png';
                row.querySelector('.multiImagePreview').src = img;
                row.querySelector('.multiImageUrl').value = img;

                row.querySelector('.multiPreviewCard').style.display = 'flex';
                if (data.partial) {
                    extractBtn.innerHTML = 'Partial — Check Fields';
                    extractBtn.style.background = '#d97706';
                } else {
                    extractBtn.innerHTML = 'Metadata Extracted';
                    extractBtn.style.background = '#10b981';
                }
            } catch (err) {
                alert(err.message || 'Failed to extract');
                extractBtn.innerHTML = 'Extract Metadata';
                extractBtn.style.background = '#0f172a';
            } finally {
                extractBtn.disabled = false;
            }
        });

        // Direct file to ImgBB upload handler
        const fileInput = row.querySelector('.multiFileImgbb');
        const imgbbStatus = row.querySelector('.multiImgbbStatus');
        fileInput?.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            imgbbStatus.textContent = 'Uploading to ImgBB...';
            imgbbStatus.style.color = '#0284c7';

            const reader = new FileReader();
            reader.onload = async () => {
                const base64Data = reader.result;
                row.querySelector('.multiImagePreview').src = base64Data;
                try {
                    const res = await fetch('/api/upload-imgbb', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ imageBase64: base64Data })
                    });
                    const data = await res.json();
                    if (data.success && data.url) {
                        row.querySelector('.multiImageUrl').value = data.url;
                        row.querySelector('.multiImagePreview').src = data.url;
                        imgbbStatus.textContent = '✓ Hosted on ImgBB';
                        imgbbStatus.style.color = '#16a34a';
                    } else {
                        imgbbStatus.textContent = data.error || 'ImgBB upload failed';
                        imgbbStatus.style.color = '#dc2626';
                    }
                } catch (err) {
                    imgbbStatus.textContent = 'Upload error: ' + err.message;
                    imgbbStatus.style.color = '#dc2626';
                }
            };
            reader.readAsDataURL(file);
        });

        row.querySelector('.multiImageUrl').addEventListener('input', (e) => {
            if(e.target.value) row.querySelector('.multiImagePreview').src = e.target.value;
        });

        row.querySelector('.removeRowBtn').addEventListener('click', () => {
            row.remove();
            if(document.querySelectorAll('.link-row-container').length === 0) createLinkRow();
        });
        
        document.getElementById('multiLinksContainer').appendChild(row);
    }

    document.getElementById('addLinkRowBtn')?.addEventListener('click', createLinkRow);

    document.getElementById('publishAllBtn')?.addEventListener('click', async () => {
        const rows = document.querySelectorAll('.link-row-container');
        const category = document.getElementById('postCategory').value;
        const btn = document.getElementById('publishAllBtn');
        if (btn.disabled) return;

        btn.disabled = true;
        btn.style.opacity = '0.6';
        btn.innerHTML = 'Publishing...';
        
        let successCount = 0;
        let lastPublishError = null;

        try {
            for (const row of rows) {
                let title = row.querySelector('.multiPostTitle')?.value?.trim();
                let link = row.querySelector('.multiPostLink')?.value?.trim();
                const inputUrl = row.querySelector('.multiLinkInput')?.value?.trim();

                // If user forgot to click Extract Metadata, try extracting on the fly
                if ((!title || !link) && inputUrl) {
                    try {
                        const extRes = await fetch('/api/extract-metadata', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: inputUrl })
                        });
                        if (extRes.ok) {
                            const extData = await extRes.json();
                            title = extData.title || inputUrl;
                            link = extData.link || inputUrl;
                            if (row.querySelector('.multiPostTitle')) row.querySelector('.multiPostTitle').value = title;
                            if (row.querySelector('.multiPostLink')) row.querySelector('.multiPostLink').value = link;
                            if (row.querySelector('.multiPostSummary')) row.querySelector('.multiPostSummary').value = extData.summary || '';
                            if (row.querySelector('.multiPostPlatform')) row.querySelector('.multiPostPlatform').value = extData.platform || 'website';
                            if (row.querySelector('.multiImageUrl')) row.querySelector('.multiImageUrl').value = extData.imageUrl || 'assets/logo.png';
                        } else {
                            title = inputUrl;
                            link = inputUrl;
                        }
                    } catch (e) {
                        title = inputUrl;
                        link = inputUrl;
                    }
                }

                if (!title && !link) {
                    if (!lastPublishError) {
                        lastPublishError = 'Please enter a URL or fill in the Title and Link fields.';
                    }
                    continue;
                }
                
                let finalImgUrl = row.querySelector('.multiImageUrl')?.value || 'assets/logo.png';
                let imageBackupUrl = '';
                // Images other than posts also get an ImgBB backup copy; the original thumbnail stays the one shown
                if (category !== 'articles' && finalImgUrl && finalImgUrl !== 'assets/logo.png' && !finalImgUrl.includes('i.ibb.co')) {
                    try {
                        const upRes = await fetch('/api/upload-imgbb', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                imageBase64: finalImgUrl.startsWith('data:') ? finalImgUrl : null,
                                imageUrl: !finalImgUrl.startsWith('data:') ? finalImgUrl : null
                            })
                        });
                        if (upRes.ok) {
                            const upData = await upRes.json();
                            if (upData.success && upData.url) {
                                if (finalImgUrl.startsWith('data:')) {
                                    // An uploaded file has no original web address, so its ImgBB copy is shown
                                    finalImgUrl = upData.url;
                                    if (row.querySelector('.multiImageUrl')) row.querySelector('.multiImageUrl').value = finalImgUrl;
                                } else {
                                    imageBackupUrl = upData.url;
                                }
                            }
                        }
                    } catch (upErr) {
                        console.warn('Frontend ImgBB upload fallback:', upErr);
                    }
                }

                // Generate a single consistent document ID used across both client and server layers
                const prefix = category === 'projects' ? 'proj_' : (category === 'tech' ? 'tech_' : (category === 'community' ? 'comm_' : 'post_'));
                const docId = prefix + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

                const payload = {
                    id: docId,
                    title: title || link || 'Untitled',
                    summary: row.querySelector('.multiPostSummary')?.value || '',
                    link: link || inputUrl,
                    imageUrl: finalImgUrl,
                    imageBackupUrl,
                    platform: row.querySelector('.multiPostPlatform')?.value || 'website',
                    author: 'Admin',
                    category: category,
                    date: new Date().toISOString(),
                    tag: window.firebaseService?.TRANSACTION_TAG || 'aifoundation'
                };
                
                try {
                    let saved = false;

                    // 1. Direct Firestore write if connected (using idempotent setDoc with consistent docId)
                    if (window.firebaseService && window.firebaseService.isConnected) {
                        try {
                            const { db, collection, doc, setDoc } = window.firebaseService;
                            const docRef = doc(collection(db, 'content'), docId);
                            await setDoc(docRef, payload, { merge: true });
                            saved = true;
                            payload.firestoreSynced = true;
                        } catch (fbErr) {
                            console.warn('Direct Firestore save note:', fbErr);
                        }
                    }

                    // 2. Dual-sync with server backend so local JSON fallback stays updated
                    const endpoints = {
                        'articles': '/api/posts', 'projects': '/api/projects',
                        'tech': '/api/tech', 'community': '/api/community'
                    };
                    try {
                        const res = await fetch(endpoints[category] || '/api/posts', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        if (res.ok) {
                            saved = true;
                        } else if (!saved) {
                            lastPublishError = `Backend returned HTTP ${res.status}. If running on Vercel, please check your network connection.`;
                        }
                    } catch (netErr) {
                        // Endpoint may not exist on static hosting
                    }

                    if (saved) {
                        successCount++;
                    } else if (!lastPublishError) {
                        lastPublishError = 'Failed to write to database or server.';
                    }
                } catch (err) {
                    console.error('Publish error:', err);
                    if (err.code === 'permission-denied' || (err.message && err.message.includes('permission'))) {
                        lastPublishError = 'Firestore Permission Denied. Your Firebase Console rules need to allow write access for authenticated users or the "content" collection.';
                    } else {
                        lastPublishError = err.message || 'Database write error';
                    }
                }
            }
        } finally {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.innerHTML = 'Publish All Posts';
        }
        if (successCount > 0) {
            const catName = category === 'projects' ? 'Projects & Initiatives' : 'Articles / Posts';
            alert(`Successfully published ${successCount} item(s) to ${catName}!`);
            document.getElementById('multiLinksContainer').innerHTML = '';
            createLinkRow(); 
            
            // Reload all feeds immediately
            await loadPosts();
            await loadProjects();
            await loadTechPosts();
            await loadCommunityPosts();
            renderAdminAllPosts();
            
            const adminModal = document.getElementById('adminModal');
            if (adminModal) adminModal.style.display = 'none';

            // If user published a project, make sure they know how to view it
            if (category === 'projects' && typeof activateSection === 'function') {
                const goToProjects = confirm('Your project was published! Would you like to switch to the Projects section to view it now?');
                if (goToProjects) {
                    activateSection('section-projects');
                }
            }
        } else {
            alert('No items could be published.\n\nReason: ' + (lastPublishError || 'Please ensure you entered a valid URL or Title/Link, and that database rules allow writes.'));
        }
    });

    // Initialize first row
    const container = document.getElementById('multiLinksContainer');
    if (container && container.innerHTML.trim() === '') {
        createLinkRow();
    }

    // Direct ImgBB Upload Tab Handler
    function initDirectImgbbUpload() {
        const dropzone = document.getElementById('directImgbbDropzone');
        const fileInput = document.getElementById('directImgbbFileInput');
        const promptWrap = document.getElementById('directImgbbPrompt');
        const previewWrap = document.getElementById('directImgbbPreviewWrap');
        const previewImg = document.getElementById('directImgbbPreviewImg');
        const fileNameSpan = document.getElementById('directImgbbFileName');
        const changeBtn = document.getElementById('directImgbbChangeBtn');
        const titleInput = document.getElementById('directImgbbTitle');
        const uploadBtn = document.getElementById('directImgbbUploadBtn');
        const statusDiv = document.getElementById('directImgbbStatus');
        const resultCard = document.getElementById('directImgbbResultCard');
        const resultThumb = document.getElementById('directImgbbResultThumb');
        const resultUrl = document.getElementById('directImgbbResultUrl');
        const viewerLink = document.getElementById('directImgbbViewerLink');
        const copyBtn = document.getElementById('directImgbbCopyBtn');

        if (!dropzone || !fileInput || !uploadBtn) return;

        let selectedBase64 = null;

        function setFile(file) {
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                alert('Please select an image file (PNG, JPG, GIF, WebP).');
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                selectedBase64 = e.target.result;
                if (previewImg) previewImg.src = selectedBase64;
                if (fileNameSpan) fileNameSpan.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
                if (promptWrap) promptWrap.style.display = 'none';
                if (previewWrap) previewWrap.style.display = 'flex';
                uploadBtn.disabled = false;
                uploadBtn.style.opacity = '1';
                if (statusDiv) statusDiv.style.display = 'none';
                if (resultCard) resultCard.style.display = 'none';
            };
            reader.readAsDataURL(file);
        }

        dropzone.addEventListener('click', (e) => {
            if (e.target !== changeBtn) {
                fileInput.click();
            }
        });

        changeBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.value = '';
            fileInput.click();
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files[0]) {
                setFile(fileInput.files[0]);
            }
        });

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '#0066ff';
            dropzone.style.background = '#eff6ff';
        });

        ['dragleave', 'dragend'].forEach(evt => {
            dropzone.addEventListener(evt, () => {
                dropzone.style.borderColor = '#cbd5e1';
                dropzone.style.background = 'white';
            });
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '#cbd5e1';
            dropzone.style.background = 'white';
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                setFile(e.dataTransfer.files[0]);
            }
        });

        uploadBtn.addEventListener('click', async () => {
            if (!selectedBase64) return;

            uploadBtn.disabled = true;
            uploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading to ImgBB...';
            if (statusDiv) {
                statusDiv.style.display = 'block';
                statusDiv.style.color = '#0284c7';
                statusDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading image to ImgBB...';
            }
            if (resultCard) resultCard.style.display = 'none';

            try {
                const res = await fetch('/api/upload-imgbb', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imageBase64: selectedBase64,
                        name: titleInput ? titleInput.value.trim() : ''
                    })
                });

                const data = await res.json();
                if (data.success && (data.url || data.display_url)) {
                    const finalUrl = data.url || data.display_url;
                    if (statusDiv) {
                        statusDiv.style.color = '#16a34a';
                        statusDiv.innerHTML = '<i class="fa-solid fa-circle-check"></i> Image successfully uploaded to ImgBB!';
                    }
                    if (resultThumb) resultThumb.src = finalUrl;
                    if (resultUrl) resultUrl.value = finalUrl;
                    if (viewerLink) {
                        viewerLink.href = data.data?.url_viewer || finalUrl;
                    }
                    if (resultCard) resultCard.style.display = 'block';
                } else {
                    if (statusDiv) {
                        statusDiv.style.color = '#dc2626';
                        statusDiv.textContent = `Upload failed: ${data.error || 'Unknown error'}`;
                    }
                }
            } catch (err) {
                if (statusDiv) {
                    statusDiv.style.color = '#dc2626';
                    statusDiv.textContent = `Network error: ${err.message}`;
                }
            } finally {
                uploadBtn.disabled = false;
                uploadBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Upload to ImgBB';
            }
        });

        copyBtn?.addEventListener('click', () => {
            if (!resultUrl || !resultUrl.value) return;
            navigator.clipboard.writeText(resultUrl.value).then(() => {
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                copyBtn.style.background = '#16a34a';
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                    copyBtn.style.background = '#0f172a';
                }, 2000);
            }).catch(() => {
                resultUrl.select();
                document.execCommand('copy');
            });
        });
    }

    initDirectImgbbUpload();

    function renderAdminAllPosts() {
        const list = document.getElementById('adminAllPostsList');
        if (!list) return;

        const combined = [
            ...allPosts.map(p => ({ ...p, _category: 'articles', _label: 'Article', _color: '#0066ff', _bg: 'rgba(0, 102, 255, 0.1)' })),
            ...allProjects.map(p => ({ ...p, _category: 'projects', _label: 'Project', _color: '#059669', _bg: 'rgba(16, 185, 129, 0.1)' })),
            ...allCommunityPosts.map(p => ({ ...p, _category: 'community', _label: 'Community', _color: '#7c3aed', _bg: 'rgba(124, 58, 237, 0.1)' })),
            ...allTechPosts.map(p => ({ ...p, _category: 'tech', _label: 'Tech R&D', _color: '#ea580c', _bg: 'rgba(234, 88, 12, 0.1)' }))
        ];

        combined.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        if (combined.length === 0) {
            list.innerHTML = '<div style="color: #64748b; padding: 24px; text-align: center; background: white; border-radius: 8px; border: 1px solid #e2e8f0;">No posts or projects currently published.</div>';
            return;
        }

        list.innerHTML = combined.map(item => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:white; padding:12px 16px; border-radius:8px; border:1px solid #e2e8f0; gap:16px;">
                <div style="display:flex; flex-direction:column; gap:4px; min-width:0; overflow:hidden;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span style="font-size:0.75rem; font-weight:700; padding:2px 8px; border-radius:4px; background:${item._bg}; color:${item._color};">${item._label.toUpperCase()}</span>
                        <span style="font-size:0.8rem; color:#64748b; font-weight:500; text-transform:uppercase;">${escapeHtml(item.platform || 'web')}</span>
                        <span style="font-size:0.8rem; color:#94a3b8;">• ${formatPostDate(item.date)}</span>
                    </div>
                    <strong style="font-size:0.95rem; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</strong>
                </div>
                <button onclick="deleteAnyPost(${jsArg(item._category)}, ${jsArg(item.id)})" style="background:#ef4444; color:white; border:none; border-radius:6px; padding:6px 14px; cursor:pointer; font-weight:600; font-size:0.85rem; flex-shrink:0; transition:all 0.2s;" onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'">Delete</button>
            </div>
        `).join('');
    }

    window.deleteAnyPost = async (category, id) => {
        if (!confirm('Are you sure you want to delete this item?')) return;
        
        // 1. Instantly record in local blacklist so neither cache nor static fallbacks can resurrect it
        const currentList = category === 'articles' ? allPosts :
                           (category === 'projects' ? allProjects :
                           (category === 'tech' ? allTechPosts : allCommunityPosts));
        const postToDelete = currentList.find(p => p.id === id);
        if (postToDelete) {
            if (postToDelete.link) addDeletedKey(postToDelete.link.trim().toLowerCase().replace(/\/+$/, ''));
            if (postToDelete.title) addDeletedKey(postToDelete.title.trim().toLowerCase());
        }
        addDeletedId(id);

        // 2. Immediately purge from in-memory arrays for immediate UI response
        if (category === 'articles') allPosts = allPosts.filter(p => p.id !== id);
        if (category === 'projects') allProjects = allProjects.filter(p => p.id !== id);
        if (category === 'tech') allTechPosts = allTechPosts.filter(p => p.id !== id);
        if (category === 'community') allCommunityPosts = allCommunityPosts.filter(p => p.id !== id);

        // 3. Immediately re-render Admin view and current category feed
        renderAdminAllPosts();
        if (category === 'articles') renderPosts();
        if (category === 'projects') renderProjects();
        if (category === 'tech') renderTechPosts();
        if (category === 'community') renderCommunityPosts();

        // 4. Delete from Cloud Firestore via Client SDK (if connected)
        if (window.firebaseService && window.firebaseService.isConnected) {
            try {
                const { db, doc, deleteDoc } = window.firebaseService;
                await deleteDoc(doc(db, 'content', id));
            } catch (fbErr) {
                console.warn('Client Firestore deleteDoc note:', fbErr.message);
            }
        }

        // 5. Call server endpoint so server deletes from Firestore using Service Account credentials
        // and updates local JSON stores
        const endpoints = {
            'articles': '/api/posts/', 'projects': '/api/projects/',
            'tech': '/api/tech/', 'community': '/api/community/'
        };
        try {
            await fetch((endpoints[category] || '/api/posts/') + encodeURIComponent(id), { method: 'DELETE' });
        } catch (netErr) {
            console.warn('Server delete note:', netErr.message);
        }

        // 6. Reload feeds in background to verify full consistency
        if (category === 'articles') await loadPosts();
        if (category === 'projects') await loadProjects();
        if (category === 'tech') await loadTechPosts();
        if (category === 'community') await loadCommunityPosts();
        renderAdminAllPosts();
    };

    window.deletePost = (id) => window.deleteAnyPost('articles', id);
    window.deleteProject = (id) => window.deleteAnyPost('projects', id);
    window.deleteTechPost = (id) => window.deleteAnyPost('tech', id);
    window.deleteCommunityPost = (id) => window.deleteAnyPost('community', id);

    // Sidebar Navigation Logic
    const sidebarItems = document.querySelectorAll('#sidebarNav .sidebar-item');
    const contentSections = document.querySelectorAll('.content-section');

    // Special Sections dropdown (phones & tablets, see style.css): the toggle shows the current section
    const sidebarNavToggle = document.getElementById('sidebarNavToggle');
    const sidebarSectionsCard = sidebarNavToggle ? sidebarNavToggle.closest('.sidebar-sections') : null;

    function setSidebarNavOpen(open) {
        if (!sidebarSectionsCard) return;
        sidebarSectionsCard.classList.toggle('is-open', open);
        sidebarNavToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function syncSidebarNavToggle() {
        const active = document.querySelector('#sidebarNav .sidebar-item.active');
        if (!sidebarNavToggle || !active) return;
        document.getElementById('sidebarNavCurrentIcon').className = active.querySelector('i').className;
        document.getElementById('sidebarNavCurrentText').textContent = active.querySelector('span').textContent;
    }

    if (sidebarNavToggle) {
        sidebarNavToggle.addEventListener('click', () => {
            setSidebarNavOpen(!sidebarSectionsCard.classList.contains('is-open'));
        });
        // Close when tapping anywhere else on the page
        document.addEventListener('click', (e) => {
            if (!sidebarSectionsCard.contains(e.target)) setSidebarNavOpen(false);
        });
    }

    function activateSection(targetId) {
        if (targetId === 'section-messages') {
            const currentUser = window.firebaseService?.getCurrentUser?.();
            if (!checkIsSuperAdmin(currentUser)) return;
        }

        sidebarItems.forEach(nav => {
            if (nav.getAttribute('data-target') === targetId) {
                nav.classList.add('active');
            } else {
                nav.classList.remove('active');
            }
        });
        syncSidebarNavToggle();
        setSidebarNavOpen(false);

        contentSections.forEach(section => section.style.display = 'none');

        const targetSection = document.getElementById(targetId);
        if (targetSection) {
            targetSection.style.display = (targetId === 'section-overview' || targetId === 'section-projects' || targetId === 'section-services' || targetId === 'section-services2' || targetId === 'section-apps' || targetId === 'section-david' || targetId === 'section-messages') ? 'flex' : 'block';
        }

        if (targetId === 'section-messages') {
            const coreBox = document.getElementById('messageBoxCoreContainer');
            const pageMount = document.getElementById('sectionMessagesMount');
            if (coreBox && pageMount && coreBox.parentElement !== pageMount) {
                pageMount.appendChild(coreBox);
            }
            if (typeof loadMessageBox === 'function') loadMessageBox();
        }
    }
    window.activateSection = activateSection;

    function scrollToContentOnMobile() {
        if (window.innerWidth <= 1024) {
            const mainContent = document.querySelector('.dashboard-content');
            if (mainContent) {
                const headerOffset = 80;
                const elementPosition = mainContent.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        }
    }

    sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.getAttribute('data-target');
            if (!targetId) return;
            activateSection(targetId);
            const hash = targetId === 'section-overview' ? 'articles' : targetId.replace('section-', '');
            if (window.location.hash !== '#' + hash) {
                history.pushState(null, null, '#' + hash);
            }
            scrollToContentOnMobile();
        });
    });

    // Hash change & initial hash listener
    function handleHash() {
        const hash = window.location.hash.replace('#', '');
        let targetId = null;
        if (hash === 'projects') {
            targetId = 'section-projects';
        } else if (hash === 'services' || hash === 'services2') {
            // The original Services section is hidden for now, so #services opens Services 2 too
            targetId = 'section-services2';
        } else if (hash === 'apps') {
            targetId = 'section-apps';
        } else if (hash === 'education' || hash === 'classroom') {
            targetId = 'section-education';
        } else if (hash === 'david' || hash === 'contact') {
            targetId = 'section-david';
        } else if (hash === 'messages') {
            if (checkIsSuperAdmin(window.firebaseService?.getCurrentUser?.())) {
                targetId = 'section-messages';
            }
        } else if (hash === 'articles' || hash === 'overview') {
            targetId = 'section-overview';
        }

        if (targetId) {
            activateSection(targetId);
            if (hash === 'david' || hash === 'contact') {
                if (typeof syncContactUsRegistrationState === 'function') {
                    syncContactUsRegistrationState();
                }
                setTimeout(() => {
                    const contactForm = document.getElementById('contactForm');
                    if (contactForm) {
                        contactForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        focusContactUsPrimaryControl();
                    }
                }, 150);
            } else if (hash) {
                setTimeout(scrollToContentOnMobile, 120);
            }
        }
    }

    // Contact Us: two-step direct messaging to David (Super Admin) — register first, then send in-app (no emails)
    let contactProfileState = { uid: '', loaded: false, detailsRegistered: false, displayName: '', email: '' };
    let contactProfileFetchPromise = null;

    function splitContactDisplayName(fullName) {
        const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
        return {
            firstName: parts[0] || '',
            lastName: parts.slice(1).join(' ')
        };
    }

    function setContactFormStatus(message, tone = 'info') {
        const statusEl = document.getElementById('contactFormStatus');
        if (!statusEl) return;
        if (!message) {
            statusEl.hidden = true;
            statusEl.textContent = '';
            statusEl.className = 'contact-status-msg';
            return;
        }
        statusEl.hidden = false;
        statusEl.textContent = message;
        statusEl.className = `contact-status-msg is-${tone}`;
    }

    function markContactProfileRegistered(user, displayName) {
        if (!user || !user.uid) return;
        contactProfileState = {
            uid: user.uid,
            loaded: true,
            detailsRegistered: true,
            displayName: (displayName || user.displayName || '').trim(),
            email: user.email || ''
        };
        syncContactUsRegistrationState();
    }

    function focusContactUsPrimaryControl() {
        const currentUser = window.firebaseService?.getCurrentUser?.();
        if (!currentUser) {
            document.getElementById('contactSignInRegisterBtn')?.focus();
            return;
        }
        if (!contactProfileState.detailsRegistered) {
            const firstInput = document.getElementById('contactFirstName');
            if (firstInput && !firstInput.value.trim()) {
                firstInput.focus();
            } else {
                document.getElementById('contactInlineRegisterBtn')?.focus();
            }
            return;
        }
        const subjectInput = document.getElementById('contactSubject');
        const messageInput = document.getElementById('contactMessage');
        if (subjectInput && !subjectInput.value.trim()) {
            subjectInput.focus();
        } else if (messageInput) {
            messageInput.focus();
        }
    }

    async function loadContactProfileOnce(user, forceFetch = false) {
        if (!user || !user.uid) return contactProfileState;
        if (!forceFetch && contactProfileState.uid === user.uid && contactProfileState.loaded) {
            return contactProfileState;
        }
        if (!forceFetch && contactProfileFetchPromise && contactProfileState.uid === user.uid) {
            return contactProfileFetchPromise;
        }
        contactProfileState = {
            uid: user.uid,
            loaded: false,
            detailsRegistered: false,
            displayName: user.displayName || '',
            email: user.email || ''
        };
        contactProfileFetchPromise = (async () => {
            let profile = null;
            try {
                profile = await window.firebaseService?.getUserProfile?.(user.uid);
            } catch (err) {
                console.warn('[Contact Us Profile] Notice:', err.message);
            }
            const nextDisplayName = (profile?.displayName || user.displayName || '').trim();
            contactProfileState = {
                uid: user.uid,
                loaded: true,
                detailsRegistered: Boolean(profile && profile.detailsRegistered === true),
                displayName: nextDisplayName,
                email: profile?.email || user.email || ''
            };
            return contactProfileState;
        })();
        try {
            return await contactProfileFetchPromise;
        } finally {
            contactProfileFetchPromise = null;
        }
    }

    function applyContactUsGateDom(currentUser, state) {
        const gateSignedOut = document.getElementById('contactGateSignedOut');
        const gateUnregistered = document.getElementById('contactGateUnregistered');
        const registeredBadge = document.getElementById('contactRegisteredBadge');
        const registeredUserEl = document.getElementById('contactRegisteredUser');
        const firstInput = document.getElementById('contactFirstName');
        const lastInput = document.getElementById('contactLastName');
        const subjectInput = document.getElementById('contactSubject');
        const messageInput = document.getElementById('contactMessage');
        const submitBtn = document.getElementById('contactSubmitBtn');
        const openChatBtn = document.getElementById('contactOpenDirectChatBtn');
        if (!gateSignedOut || !gateUnregistered || !registeredBadge) return;

        if (!currentUser) {
            gateSignedOut.hidden = false;
            gateUnregistered.hidden = true;
            registeredBadge.hidden = true;
            if (openChatBtn) openChatBtn.hidden = true;
            [firstInput, lastInput, subjectInput, messageInput].forEach(el => { if (el) el.disabled = true; });
            if (submitBtn) submitBtn.disabled = true;
            return;
        }

        const displayName = (state.displayName || currentUser.displayName || '').trim();
        const split = splitContactDisplayName(displayName);
        if (firstInput) {
            firstInput.disabled = false;
            if (!firstInput.value.trim() && split.firstName) firstInput.value = split.firstName;
        }
        if (lastInput) {
            lastInput.disabled = false;
            if (!lastInput.value.trim() && split.lastName) lastInput.value = split.lastName;
        }

        const isRegistered = Boolean(state.detailsRegistered);
        gateSignedOut.hidden = true;
        gateUnregistered.hidden = isRegistered;
        registeredBadge.hidden = !isRegistered;
        if (openChatBtn) openChatBtn.hidden = !isRegistered;

        if (registeredUserEl && isRegistered) {
            const labelName = displayName || currentUser.email || 'Supporter';
            registeredUserEl.textContent = currentUser.email && labelName !== currentUser.email
                ? `${labelName} (${currentUser.email})`
                : labelName;
        }

        if (subjectInput) subjectInput.disabled = !isRegistered;
        if (messageInput) messageInput.disabled = !isRegistered;
        if (submitBtn) submitBtn.disabled = !isRegistered;
    }

    async function syncContactUsRegistrationState(options = {}) {
        const { forceFetch = false } = options;
        const currentUser = window.firebaseService?.getCurrentUser?.();
        if (!currentUser) {
            contactProfileState = { uid: '', loaded: false, detailsRegistered: false, displayName: '', email: '' };
            applyContactUsGateDom(null, contactProfileState);
            return contactProfileState;
        }
        applyContactUsGateDom(currentUser, contactProfileState);
        const state = await loadContactProfileOnce(currentUser, forceFetch);
        applyContactUsGateDom(currentUser, state);
        return state;
    }

    async function completeContactRegistration(currentUser, firstName, lastName) {
        const fullName = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim()
            || (currentUser.displayName || '').trim();
        if (!fullName) {
            throw new Error('Please enter your first and last name to complete registration.');
        }

        const isSuper = checkIsSuperAdmin(currentUser);
        const isAdmin = isSuper || checkIsAdmin(currentUser);
        const supporterRole = isSuper ? 'superadmin' : (isAdmin ? 'admin' : 'supporter');
        const supporterStatus = isSuper ? 'superadmin' : (isAdmin ? 'admin' : 'supporter');
        const registeredAt = new Date().toISOString();

        const profileUpdate = {
            displayName: fullName,
            role: supporterRole,
            status: supporterStatus,
            classification: isSuper ? 'Superadmin' : (isAdmin ? 'Admin' : 'Supporter'),
            isSuperAdmin: isSuper,
            detailsRegistered: true,
            registeredAt
        };

        if (window.firebaseService?.syncUserProfile) {
            await window.firebaseService.syncUserProfile(currentUser, profileUpdate);
        } else {
            const syncRes = await fetch('/api/auth/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    displayName: fullName,
                    detailsRegistered: true,
                    registeredAt
                })
            });
            if (!syncRes.ok) {
                throw new Error('Could not complete profile registration.');
            }
        }

        if (userDisplayName) userDisplayName.textContent = fullName.split(' ')[0];
        if (menuUserName) menuUserName.textContent = fullName;
        markContactProfileRegistered(currentUser, fullName);
        return fullName;
    }

    function navigateToContactForm(prefillSubject = '') {
        activateSection('section-david');
        if (window.location.hash !== '#david') {
            history.pushState(null, null, '#david');
        }
        if (prefillSubject) {
            const subjectInput = document.getElementById('contactSubject');
            if (subjectInput) subjectInput.value = String(prefillSubject).trim();
        }
        syncContactUsRegistrationState();
        const contactForm = document.getElementById('contactForm');
        if (contactForm) {
            contactForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(focusContactUsPrimaryControl, 300);
        }
    }
    window.navigateToContactForm = navigateToContactForm;

    window.addEventListener('hashchange', handleHash);
    handleHash();

    document.getElementById('contactSignInRegisterBtn')?.addEventListener('click', async () => {
        setContactFormStatus('');
        try {
            if (window.firebaseService?.signInWithGoogle) {
                await window.firebaseService.signInWithGoogle();
                await syncContactUsRegistrationState({ forceFetch: true });
                focusContactUsPrimaryControl();
            } else {
                setContactFormStatus('Authentication service is still initializing. Please try again in a moment.', 'error');
            }
        } catch (err) {
            if (err?.code !== 'auth/popup-closed-by-user') {
                setContactFormStatus(err?.message || 'Could not complete Google sign-in.', 'error');
            }
        }
    });

    document.getElementById('contactInlineRegisterBtn')?.addEventListener('click', async () => {
        const currentUser = window.firebaseService?.getCurrentUser?.();
        if (!currentUser) {
            setContactFormStatus('Please sign in first to register.', 'error');
            return;
        }
        const firstName = (document.getElementById('contactFirstName')?.value || '').trim();
        const lastName = (document.getElementById('contactLastName')?.value || '').trim();
        const btn = document.getElementById('contactInlineRegisterBtn');
        if (!firstName || !lastName) {
            setContactFormStatus('Please enter both your first name and last name to complete registration.', 'error');
            if (!firstName) document.getElementById('contactFirstName')?.focus();
            else document.getElementById('contactLastName')?.focus();
            return;
        }
        if (btn) btn.disabled = true;
        setContactFormStatus('Saving your registration...', 'info');
        try {
            await completeContactRegistration(currentUser, firstName, lastName);
            setContactFormStatus('Registration complete! Step 2 is unlocked — you can now send your message direct to David (Super Admin).', 'success');
            focusContactUsPrimaryControl();
        } catch (err) {
            setContactFormStatus(err?.message || 'Could not complete registration.', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    document.getElementById('contactOpenRegisterBtn')?.addEventListener('click', () => {
        openUserDetailsModal();
    });

    document.getElementById('contactEditDetailsBtn')?.addEventListener('click', () => {
        openUserDetailsModal();
    });

    document.getElementById('contactOpenDirectChatBtn')?.addEventListener('click', () => {
        const currentUser = window.firebaseService?.getCurrentUser?.();
        if (!currentUser) return;
        const targetTab = checkIsSuperAdmin(currentUser) ? 'admin-supporter-chat' : 'supporter-tab-chat';
        openAuthenticatedPanel(targetTab);
    });

    document.getElementById('contactForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentUser = window.firebaseService?.getCurrentUser?.();
        if (!currentUser) {
            setContactFormStatus('Please sign in and register first before sending a message to David (Super Admin).', 'error');
            document.getElementById('contactSignInRegisterBtn')?.focus();
            return;
        }

        const firstName = (document.getElementById('contactFirstName')?.value || '').trim();
        const lastName = (document.getElementById('contactLastName')?.value || '').trim();
        const subject = (document.getElementById('contactSubject')?.value || '').trim();
        const message = (document.getElementById('contactMessage')?.value || '').trim();

        if (!contactProfileState.detailsRegistered) {
            setContactFormStatus('Please complete Step 1 registration above before messaging David (Super Admin).', 'error');
            document.getElementById('contactInlineRegisterBtn')?.focus();
            return;
        }
        if (!firstName || !lastName) {
            setContactFormStatus('Please enter both your first name and last name.', 'error');
            return;
        }
        if (!subject || !message) {
            setContactFormStatus('Please enter both a subject and message for David (Super Admin).', 'error');
            return;
        }

        const submitBtn = document.getElementById('contactSubmitBtn');
        const submitLabel = document.getElementById('contactSubmitBtnLabel');
        if (submitBtn) submitBtn.disabled = true;
        if (submitLabel) submitLabel.textContent = 'Sending direct to David...';
        setContactFormStatus('Sending your message direct to David (Super Admin)...', 'info');

        try {
            const fullName = `${firstName} ${lastName}`.trim();
            if (fullName !== contactProfileState.displayName) {
                await completeContactRegistration(currentUser, firstName, lastName);
            }

            const formattedMessage = `[Subject: ${subject}]\n\n${message}`;
            if (window.firebaseService?.sendChatMessage) {
                await window.firebaseService.sendChatMessage({
                    directToSuperAdmin: true,
                    senderUid: currentUser.uid,
                    senderEmail: currentUser.email,
                    senderName: fullName,
                    senderPhoto: currentUser.photoURL || '',
                    recipientUid: 'superadmin',
                    recipientEmail: 'support@aifoundation.net.au',
                    recipientName: 'David (Super Admin)',
                    subject,
                    userMessage: formattedMessage,
                    hasUploads: false
                });
            } else {
                const res = await fetch('/api/chat/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        directToSuperAdmin: true,
                        senderName: fullName,
                        recipientUid: 'superadmin',
                        recipientEmail: 'support@aifoundation.net.au',
                        recipientName: 'David (Super Admin)',
                        subject,
                        userMessage: formattedMessage,
                        hasUploads: false
                    })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data.success) {
                    throw new Error(data.error || 'Failed to send message.');
                }
            }

            const subjectEl = document.getElementById('contactSubject');
            const messageEl = document.getElementById('contactMessage');
            if (subjectEl) subjectEl.value = '';
            if (messageEl) messageEl.value = '';
            const openChatBtn = document.getElementById('contactOpenDirectChatBtn');
            if (openChatBtn) openChatBtn.hidden = false;
            setContactFormStatus('Message sent direct to David (Super Admin)! You can continue the conversation anytime via Direct Chat.', 'success');
        } catch (err) {
            console.error('[Contact Direct Send Error]:', err);
            setContactFormStatus('Could not send message: ' + (err?.message || 'Please try again.'), 'error');
        } finally {
            if (submitBtn) submitBtn.disabled = !contactProfileState.detailsRegistered;
            if (submitLabel) submitLabel.textContent = 'Send Message Direct to David (Super Admin)';
        }
    });

    syncContactUsRegistrationState();

    // Return URLs from Stripe Checkout (tokens and the paid AI services)
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');

    // Back from Stripe after buying tokens: once the sign-in is restored, open Buy Tokens to confirm the payment
    const tokensReturnStatus = urlParams.get('tokens');
    if ((tokensReturnStatus === 'success' && sessionId) || tokensReturnStatus === 'cancelled') {
        buyTokensReturn = tokensReturnStatus === 'success' ? { sessionId } : { cancelled: true };
        window.history.replaceState({}, document.title, window.location.pathname);
        const openBuyTokens = () => openAuthenticatedPanel('admin-buy-tokens');
        if (window.firebaseService?.getCurrentUser?.()) {
            openBuyTokens();
        } else {
            const onSignedIn = (e) => {
                if (!e.detail?.user) return;
                window.removeEventListener('firebaseAuthChanged', onSignedIn);
                openBuyTokens();
            };
            window.addEventListener('firebaseAuthChanged', onSignedIn);
        }
    }

    // =========================================================================
    // Services: Google AI Strategy & First-Month Plan (Advisory-Only Modal & Briefs)
    // =========================================================================
    function downloadPlainTextFile(fileName, content) {
        const blob = new Blob([String(content || '')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName || 'strategy-advisory-report.txt';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    const strategyModal = document.getElementById('strategyPlanModal');
    const openStrategyModalBtn = document.getElementById('openStrategyPlanModalBtn');
    const closeStrategyModalBtn = document.getElementById('closeStrategyModalBtn');
    const strategyAuthGate = document.getElementById('strategyAuthGate');
    const strategySignInBtn = document.getElementById('strategySignInBtn');
    const strategyPaymentGate = document.getElementById('strategyPaymentGate');
    const strategyPricingBreakdown = document.getElementById('strategyPricingBreakdown');
    const strategyCheckoutBtn = document.getElementById('strategyCheckoutBtn');
    const strategyIntakeView = document.getElementById('strategyIntakeView');
    const strategyProgressLabel = document.getElementById('strategyProgressLabel');
    const strategyProgressEta = document.getElementById('strategyProgressEta');
    const strategyProgressFill = document.getElementById('strategyProgressFill');
    const strategyRedactionBanner = document.getElementById('strategyRedactionBanner');
    const strategyDropzoneNotice = document.getElementById('strategyDropzoneNotice');
    const strategyChatFeed = document.getElementById('strategyChatFeed');
    const strategyChatForm = document.getElementById('strategyChatForm');
    const strategyChatInput = document.getElementById('strategyChatInput');
    const strategySendBtn = document.getElementById('strategySendBtn');
    const strategyReportCard = document.getElementById('strategyReportCard');
    const strategyReportFileName = document.getElementById('strategyReportFileName');
    const strategyReportPreview = document.getElementById('strategyReportPreview');
    const strategyDownloadTxtBtn = document.getElementById('strategyDownloadTxtBtn');
    const strategyStatusMsg = document.getElementById('strategyStatusMsg');

    let activeStrategySession = null;
    let activeStrategyPricing = null;

    function setStrategyStatus(msg, isError = false) {
        if (!strategyStatusMsg) return;
        if (!msg) {
            strategyStatusMsg.style.display = 'none';
            strategyStatusMsg.textContent = '';
            return;
        }
        strategyStatusMsg.textContent = msg;
        strategyStatusMsg.style.display = 'block';
        strategyStatusMsg.className = `service-prices-status ${isError ? 'is-error' : 'is-success'}`;
    }

    function renderStrategyModalState() {
        if (!strategyModal) return;
        const user = window.firebaseService?.getCurrentUser?.();
        setStrategyStatus('');

        if (!user) {
            if (strategyAuthGate) strategyAuthGate.style.display = 'flex';
            if (strategyPaymentGate) strategyPaymentGate.style.display = 'none';
            if (strategyIntakeView) strategyIntakeView.style.display = 'none';
            if (strategyReportCard) strategyReportCard.style.display = 'none';
            return;
        }

        if (strategyAuthGate) strategyAuthGate.style.display = 'none';

        const session = activeStrategySession;
        if (!session || session.paymentStatus !== 'paid') {
            if (strategyPaymentGate) strategyPaymentGate.style.display = 'flex';
            if (strategyIntakeView) strategyIntakeView.style.display = 'none';
            if (strategyReportCard) strategyReportCard.style.display = 'none';
            if (strategyPricingBreakdown && activeStrategyPricing) {
                const p = activeStrategyPricing;
                strategyPricingBreakdown.textContent = `Consultation Fee: AUD $${p.exGstAud.toFixed(2)} + 10% GST (AUD $${p.gstAud.toFixed(2)}) = AUD $${p.totalIncGstAud.toFixed(2)} total (tax calculated exclusively at Stripe Checkout).`;
            }
            return;
        }

        if (strategyPaymentGate) strategyPaymentGate.style.display = 'none';
        if (strategyIntakeView) strategyIntakeView.style.display = 'flex';

        const step = session.status === 'completed' ? 6 : Math.min(6, Math.max(1, session.currentStep || 1));
        const pct = Math.round((session.status === 'completed' ? 6 : Math.max(0, step - 1)) / 6 * 100);
        if (strategyProgressLabel) {
            strategyProgressLabel.textContent = session.status === 'completed' ? 'Completed (6 of 6)' : `Question ${step} of 6`;
        }
        if (strategyProgressEta) {
            strategyProgressEta.textContent = session.status === 'completed' ? 'Advisory ready' : '~5–8 mins total';
        }
        if (strategyProgressFill) {
            strategyProgressFill.style.width = `${pct}%`;
        }

        if (strategyChatFeed) {
            strategyChatFeed.innerHTML = (session.messages || []).map(msg => `
                <div class="strategy-bubble ${msg.role === 'user' ? 'strategy-bubble-user' : 'strategy-bubble-assistant'}">${escapeHtml(msg.content)}</div>
            `).join('');
            strategyChatFeed.scrollTop = strategyChatFeed.scrollHeight;
        }

        if (session.status === 'completed' && session.preliminaryReport) {
            if (strategyChatForm) strategyChatForm.style.display = 'none';
            if (strategyReportCard) strategyReportCard.style.display = 'flex';
            if (strategyReportFileName) strategyReportFileName.textContent = session.preliminaryReport.fileName;
            if (strategyReportPreview) strategyReportPreview.textContent = session.preliminaryReport.content;
        } else {
            if (strategyChatForm) strategyChatForm.style.display = 'flex';
            if (strategyReportCard) strategyReportCard.style.display = 'none';
        }
    }

    async function refreshStrategySession() {
        const user = window.firebaseService?.getCurrentUser?.();
        if (!user) {
            renderStrategyModalState();
            return;
        }
        try {
            const res = await fetch('/api/strategy-plan/session');
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                activeStrategyPricing = data.pricing || null;
                activeStrategySession = data.session || null;
            }
        } catch (err) {
            console.warn('[Strategy Plan] Session refresh warning:', err.message);
        }
        renderStrategyModalState();
    }

    function openStrategyPlanModal() {
        if (!strategyModal) return;
        strategyModal.style.display = 'flex';
        refreshStrategySession();
    }

    function closeStrategyPlanModal() {
        if (!strategyModal) return;
        strategyModal.style.display = 'none';
    }

    if (openStrategyModalBtn) {
        openStrategyModalBtn.addEventListener('click', openStrategyPlanModal);
    }
    if (closeStrategyModalBtn) {
        closeStrategyModalBtn.addEventListener('click', closeStrategyPlanModal);
    }
    if (strategyModal) {
        strategyModal.addEventListener('click', (e) => {
            if (e.target === strategyModal) closeStrategyPlanModal();
        });
        // Reject dragged files or file drops explicitly inside the advisory-only modal
        strategyModal.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        strategyModal.addEventListener('drop', (e) => {
            e.preventDefault();
            if (strategyDropzoneNotice) strategyDropzoneNotice.style.display = 'block';
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && strategyModal.style.display === 'flex') {
                closeStrategyPlanModal();
            }
        });
    }

    if (strategySignInBtn) {
        strategySignInBtn.addEventListener('click', async () => {
            try {
                if (window.firebaseService?.signInWithGoogle) {
                    await window.firebaseService.signInWithGoogle();
                }
            } catch (e) {
                setStrategyStatus(e.message || 'Sign-in could not be completed.', true);
            }
        });
    }

    window.addEventListener('firebaseAuthChanged', () => {
        if (strategyModal && strategyModal.style.display === 'flex') {
            refreshStrategySession();
        }
    });

    if (strategyCheckoutBtn) {
        strategyCheckoutBtn.addEventListener('click', async () => {
            strategyCheckoutBtn.disabled = true;
            strategyCheckoutBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Opening Stripe Checkout...';
            setStrategyStatus('');
            try {
                const res = await fetch('/api/strategy-plan/checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ returnPath: window.location.pathname || '/' })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data.url) {
                    throw new Error(data.error || 'Could not start Stripe Checkout.');
                }
                window.location.href = data.url;
            } catch (err) {
                setStrategyStatus(err.message || 'Checkout failed.', true);
                strategyCheckoutBtn.disabled = false;
                strategyCheckoutBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Continue to Stripe Checkout (AUD)';
            }
        });
    }

    if (strategyChatForm) {
        strategyChatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!activeStrategySession || !strategyChatInput) return;
            const msg = strategyChatInput.value.trim();
            if (!msg) return;

            if (strategySendBtn) {
                strategySendBtn.disabled = true;
                strategySendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
            }
            setStrategyStatus('');
            if (strategyRedactionBanner) strategyRedactionBanner.style.display = 'none';

            try {
                const res = await fetch('/api/strategy-plan/message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: activeStrategySession.id,
                        message: msg
                    })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.error || 'Could not save your response.');
                }
                activeStrategySession = data.session;
                strategyChatInput.value = '';
                if (data.redactedWarning && strategyRedactionBanner) {
                    strategyRedactionBanner.textContent = data.redactedWarning;
                    strategyRedactionBanner.style.display = 'block';
                }
                renderStrategyModalState();
            } catch (err) {
                setStrategyStatus(err.message || 'Failed to send response.', true);
            } finally {
                if (strategySendBtn) {
                    strategySendBtn.disabled = false;
                    strategySendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Answer';
                }
            }
        });
    }

    if (strategyDownloadTxtBtn) {
        strategyDownloadTxtBtn.addEventListener('click', () => {
            const report = activeStrategySession?.preliminaryReport;
            if (!report) return;
            downloadPlainTextFile(report.fileName, report.content);
        });
    }

    // Stripe return handler for Strategy Plan checkout (?strategy_plan=success&session_id=...)
    const strategyReturnStatus = urlParams.get('strategy_plan');
    if ((strategyReturnStatus === 'success' && sessionId) || strategyReturnStatus === 'cancelled') {
        const returnedStripeSessionId = sessionId;
        window.history.replaceState({}, document.title, window.location.pathname + '#services2');
        if (typeof handleHash === 'function') handleHash();

        const handleStrategyReturn = async () => {
            openStrategyPlanModal();
            if (strategyReturnStatus === 'cancelled') {
                setStrategyStatus('Checkout was cancelled. You can restart whenever you are ready.', true);
                return;
            }
            setStrategyStatus('Confirming Stripe payment...');
            try {
                const res = await fetch('/api/strategy-plan/confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: returnedStripeSessionId })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Payment confirmation failed.');
                activeStrategySession = data.session;
                renderStrategyModalState();
            } catch (err) {
                setStrategyStatus(err.message || 'Could not confirm Stripe payment.', true);
            }
        };

        if (window.firebaseService?.getCurrentUser?.()) {
            handleStrategyReturn();
        } else {
            openStrategyPlanModal();
            const onStratSignedIn = (e) => {
                if (!e.detail?.user) return;
                window.removeEventListener('firebaseAuthChanged', onStratSignedIn);
                handleStrategyReturn();
            };
            window.addEventListener('firebaseAuthChanged', onStratSignedIn);
        }
    }

    // =========================================================================
    // SuperAdmin: AI Strategy Advisory Briefs Tab (#admin-strategy-briefs)
    // =========================================================================
    const strategyBriefsList = document.getElementById('strategyBriefsList');
    const strategyBriefsUnreadBadge = document.getElementById('strategyBriefsUnreadBadge');
    const strategyBriefDetail = document.getElementById('strategyBriefDetail');
    const strategyBriefDetailTitle = document.getElementById('strategyBriefDetailTitle');
    const strategyBriefDetailMeta = document.getElementById('strategyBriefDetailMeta');
    const strategyBriefDetailContent = document.getElementById('strategyBriefDetailContent');
    const refreshStrategyBriefsBtn = document.getElementById('refreshStrategyBriefsBtn');
    const downloadSuperAdminBriefBtn = document.getElementById('downloadSuperAdminBriefBtn');
    const deleteSuperAdminBriefBtn = document.getElementById('deleteSuperAdminBriefBtn');
    const confirmDeleteStrategyBriefWrap = document.getElementById('confirmDeleteStrategyBriefWrap');
    const confirmDeleteStrategyBriefBtn = document.getElementById('confirmDeleteStrategyBriefBtn');
    const cancelDeleteStrategyBriefBtn = document.getElementById('cancelDeleteStrategyBriefBtn');
    const strategyBriefsStatus = document.getElementById('strategyBriefsStatus');

    let loadedStrategyBriefs = [];
    let selectedStrategyBrief = null;

    function setStrategyBriefsStatus(msg, isError = false) {
        if (!strategyBriefsStatus) return;
        if (!msg) {
            strategyBriefsStatus.style.display = 'none';
            strategyBriefsStatus.textContent = '';
            return;
        }
        strategyBriefsStatus.textContent = msg;
        strategyBriefsStatus.style.display = 'block';
        strategyBriefsStatus.className = `service-prices-status ${isError ? 'is-error' : 'is-success'}`;
    }

    function renderStrategyBriefDetail(brief) {
        selectedStrategyBrief = brief || null;
        if (confirmDeleteStrategyBriefWrap) confirmDeleteStrategyBriefWrap.hidden = true;
        if (deleteSuperAdminBriefBtn) deleteSuperAdminBriefBtn.hidden = false;

        if (!strategyBriefDetail) return;
        if (!brief) {
            strategyBriefDetail.hidden = true;
            return;
        }
        strategyBriefDetail.hidden = false;
        if (strategyBriefDetailTitle) strategyBriefDetailTitle.textContent = brief.clientBusinessName;
        if (strategyBriefDetailMeta) {
            strategyBriefDetailMeta.textContent = `${brief.fileName} • Stripe ${brief.stripeSessionId} • AUD $${Number(brief.amountPaidExGstAud || 0).toFixed(2)} ex GST`;
        }
        if (strategyBriefDetailContent) strategyBriefDetailContent.textContent = brief.content || '';
    }

    function renderStrategyBriefsList() {
        if (!strategyBriefsList) return;
        if (!loadedStrategyBriefs.length) {
            strategyBriefsList.innerHTML = '<div style="padding: 16px; color: #64748b; font-size: 0.88rem; border: 1px dashed #cbd5e1; border-radius: 10px;">No strategy advisory briefs yet.</div>';
            renderStrategyBriefDetail(null);
            return;
        }
        strategyBriefsList.innerHTML = loadedStrategyBriefs.map(b => `
            <button type="button" class="strategy-brief-item ${selectedStrategyBrief?.id === b.id ? 'active' : ''} ${!b.read ? 'is-unread' : ''}" data-brief-id="${escapeHtml(b.id)}" data-agent-id="select-strategy-brief-${escapeHtml(b.id)}" data-testid="select-strategy-brief">
                <strong style="font-size: 0.9rem; color: #0f172a;">${escapeHtml(b.clientBusinessName)}</strong>
                <span style="font-size: 0.78rem; color: #475569;">${escapeHtml(b.clientEmail || b.uid)}</span>
                <small style="font-size: 0.74rem; color: #64748b;">${!b.read ? 'Unread • ' : ''}${escapeHtml((b.createdAt || '').slice(0, 10))}</small>
            </button>
        `).join('');

        strategyBriefsList.querySelectorAll('.strategy-brief-item').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-brief-id');
                const brief = loadedStrategyBriefs.find(x => x.id === id);
                if (!brief) return;
                renderStrategyBriefDetail(brief);
                if (!brief.read) {
                    try {
                        const res = await fetch(`/api/strategy-plan/superadmin/briefs/${encodeURIComponent(id)}/read`, { method: 'POST' });
                        if (res.ok) {
                            brief.read = true;
                            const unread = loadedStrategyBriefs.filter(x => !x.read).length;
                            if (strategyBriefsUnreadBadge) {
                                strategyBriefsUnreadBadge.textContent = `${unread} unread`;
                                strategyBriefsUnreadBadge.style.display = unread > 0 ? 'inline-block' : 'none';
                            }
                            renderStrategyBriefsList();
                        }
                    } catch {
                        // Best-effort mark read
                    }
                }
            });
        });
    }

    async function loadStrategyBriefs() {
        if (!strategyBriefsList) return;
        setStrategyBriefsStatus('');
        try {
            const res = await fetch('/api/strategy-plan/superadmin/briefs');
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not load briefs.');
            loadedStrategyBriefs = Array.isArray(data.briefs) ? data.briefs : [];
            const unread = Number(data.unreadCount) || 0;
            if (strategyBriefsUnreadBadge) {
                strategyBriefsUnreadBadge.textContent = `${unread} unread`;
                strategyBriefsUnreadBadge.style.display = unread > 0 ? 'inline-block' : 'none';
            }
            if (selectedStrategyBrief) {
                selectedStrategyBrief = loadedStrategyBriefs.find(b => b.id === selectedStrategyBrief.id) || loadedStrategyBriefs[0] || null;
            } else {
                selectedStrategyBrief = loadedStrategyBriefs[0] || null;
            }
            renderStrategyBriefsList();
            renderStrategyBriefDetail(selectedStrategyBrief);
        } catch (err) {
            setStrategyBriefsStatus(err.message || 'Failed to load strategy advisory briefs.', true);
        }
    }

    if (refreshStrategyBriefsBtn) {
        refreshStrategyBriefsBtn.addEventListener('click', loadStrategyBriefs);
    }
    if (downloadSuperAdminBriefBtn) {
        downloadSuperAdminBriefBtn.addEventListener('click', () => {
            if (!selectedStrategyBrief) return;
            downloadPlainTextFile(selectedStrategyBrief.fileName, selectedStrategyBrief.content);
        });
    }
    if (deleteSuperAdminBriefBtn) {
        deleteSuperAdminBriefBtn.addEventListener('click', () => {
            if (!selectedStrategyBrief) return;
            deleteSuperAdminBriefBtn.hidden = true;
            if (confirmDeleteStrategyBriefWrap) confirmDeleteStrategyBriefWrap.hidden = false;
        });
    }
    if (cancelDeleteStrategyBriefBtn) {
        cancelDeleteStrategyBriefBtn.addEventListener('click', () => {
            if (confirmDeleteStrategyBriefWrap) confirmDeleteStrategyBriefWrap.hidden = true;
            if (deleteSuperAdminBriefBtn) deleteSuperAdminBriefBtn.hidden = false;
        });
    }
    if (confirmDeleteStrategyBriefBtn) {
        confirmDeleteStrategyBriefBtn.addEventListener('click', async () => {
            if (!selectedStrategyBrief) return;
            const targetId = selectedStrategyBrief.id;
            confirmDeleteStrategyBriefBtn.disabled = true;
            try {
                const res = await fetch(`/api/strategy-plan/superadmin/briefs/${encodeURIComponent(targetId)}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ confirmDelete: true })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Delete failed.');
                selectedStrategyBrief = null;
                setStrategyBriefsStatus('Advisory brief deleted.');
                await loadStrategyBriefs();
            } catch (err) {
                setStrategyBriefsStatus(err.message || 'Could not delete advisory brief.', true);
            } finally {
                confirmDeleteStrategyBriefBtn.disabled = false;
            }
        });
    }

    // =========================================================================
    // SERVICES - REGIONAL EDUCATION & AI LITERACY (CLIENT MODAL & SUPERADMIN STUDIO)
    // =========================================================================
    const openRegionalEduModalBtn = document.getElementById('openRegionalEduModalBtn');
    const regionalEduModal = document.getElementById('regionalEduModal');
    const closeRegionalEduModalBtn = document.getElementById('closeRegionalEduModalBtn');
    const regEduAuthGate = document.getElementById('regEduAuthGate');
    const regEduSignInBtn = document.getElementById('regEduSignInBtn');
    const regEduPayGate = document.getElementById('regEduPayGate');
    const regEduPriceSummary = document.getElementById('regEduPriceSummary');
    const regEduPayBtn = document.getElementById('regEduPayBtn');
    const regEduChatStage = document.getElementById('regEduChatStage');
    const regEduProgressLabel = document.getElementById('regEduProgressLabel');
    const regEduProgressFill = document.getElementById('regEduProgressFill');
    const regEduMessages = document.getElementById('regEduMessages');
    const regEduAnswerInput = document.getElementById('regEduAnswerInput');
    const regEduSendBtn = document.getElementById('regEduSendBtn');
    const regEduDeliverablesStage = document.getElementById('regEduDeliverablesStage');
    const regEduStatusBadge = document.getElementById('regEduStatusBadge');
    const regEduFinalCard = document.getElementById('regEduFinalCard');
    const regEduFinalFileName = document.getElementById('regEduFinalFileName');
    const regEduDownloadFinalBtn = document.getElementById('regEduDownloadFinalBtn');
    const regEduFinalNote = document.getElementById('regEduFinalNote');
    const regEduFinalPreview = document.getElementById('regEduFinalPreview');
    const regEduPrelimCard = document.getElementById('regEduPrelimCard');
    const regEduPrelimFileName = document.getElementById('regEduPrelimFileName');
    const regEduDownloadPrelimBtn = document.getElementById('regEduDownloadPrelimBtn');
    const regEduPrelimPreview = document.getElementById('regEduPrelimPreview');
    const regEduModalStatus = document.getElementById('regEduModalStatus');

    const regEduUnreadBadge = document.getElementById('regEduUnreadBadge');
    const regEduFilterSelect = document.getElementById('regEduFilterSelect');
    const regEduRefreshBtn = document.getElementById('regEduRefreshBtn');
    const regEduQueueList = document.getElementById('regEduQueueList');
    const regEduStudioEmpty = document.getElementById('regEduStudioEmpty');
    const regEduStudioActive = document.getElementById('regEduStudioActive');
    const regEduDetailOrgTitle = document.getElementById('regEduDetailOrgTitle');
    const regEduDetailMetaLine = document.getElementById('regEduDetailMetaLine');
    const regEduDetailStatusBadge = document.getElementById('regEduDetailStatusBadge');
    const regEduDeleteBtn = document.getElementById('regEduDeleteBtn');
    const regEduDeleteConfirmWrap = document.getElementById('regEduDeleteConfirmWrap');
    const regEduConfirmDeleteBtn = document.getElementById('regEduConfirmDeleteBtn');
    const regEduCancelDeleteBtn = document.getElementById('regEduCancelDeleteBtn');
    const regEduIntakeTranscript = document.getElementById('regEduIntakeTranscript');
    const regEduResearchSummary = document.getElementById('regEduResearchSummary');
    const regEduPreliminaryRef = document.getElementById('regEduPreliminaryRef');
    const regEduWorkingDraftTextarea = document.getElementById('regEduWorkingDraftTextarea');
    const regEduDraftFileHint = document.getElementById('regEduDraftFileHint');
    const regEduExecutiveNoteInput = document.getElementById('regEduExecutiveNoteInput');
    const regEduSaveDraftBtn = document.getElementById('regEduSaveDraftBtn');
    const regEduDownloadWorkingBtn = document.getElementById('regEduDownloadWorkingBtn');
    const regEduLocalFileInput = document.getElementById('regEduLocalFileInput');
    const regEduApproveBtn = document.getElementById('regEduApproveBtn');
    const regEduApproveConfirmWrap = document.getElementById('regEduApproveConfirmWrap');
    const regEduConfirmApproveBtn = document.getElementById('regEduConfirmApproveBtn');
    const regEduCancelApproveBtn = document.getElementById('regEduCancelApproveBtn');
    const regEduStudioStatus = document.getElementById('regEduStudioStatus');

    let currentRegEduSession = null;
    let regEduReviewsCache = [];
    let selectedRegEduReview = null;
    let pendingStripeConfirmSessionId = '';

    function downloadRegEduTextFile(filename, content) {
        const blob = new Blob([String(content || '')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'Regional_Education_AI_Advisory.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    function setRegEduBoxStatus(el, msg, isError = false) {
        if (!el) return;
        if (!msg) {
            el.style.display = 'none';
            el.textContent = '';
            el.classList.remove('is-error');
            return;
        }
        el.textContent = msg;
        el.classList.toggle('is-error', Boolean(isError));
        el.style.display = 'block';
    }

    async function getRegEduFirebaseUser() {
        if (window.firebaseService && typeof window.firebaseService.getCurrentUser === 'function') {
            const u = window.firebaseService.getCurrentUser();
            if (u) return u;
        }
        if (window.firebaseService?.auth?.currentUser) {
            return window.firebaseService.auth.currentUser;
        }
        return null;
    }

    async function regEduApiFetch(url, options = {}) {
        const user = await getRegEduFirebaseUser();
        if (!user || typeof user.getIdToken !== 'function') {
            const err = new Error('Please sign in first.');
            err.statusCode = 401;
            throw err;
        }
        const token = await user.getIdToken();
        const headers = {
            ...(options.headers || {}),
            Authorization: `Bearer ${token}`
        };
        if (options.body && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
        const res = await fetch(url, { ...options, headers });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.error || `Request failed (${res.status})`);
            err.statusCode = res.status;
            throw err;
        }
        return data;
    }

    function openRegionalEduModal() {
        if (!regionalEduModal) return;
        regionalEduModal.dataset.stage = 'landing';
        regionalEduModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        if (closeRegionalEduModalBtn) closeRegionalEduModalBtn.focus();
        loadRegionalEduModalState();
    }

    function closeRegionalEduModal() {
        if (!regionalEduModal) return;
        regionalEduModal.style.display = 'none';
        document.body.style.overflow = '';
    }

    function renderRegEduModalView(payload) {
        const pricing = payload?.pricing;
        const session = payload?.session || null;
        currentRegEduSession = session;

        if (regEduAuthGate) regEduAuthGate.style.display = 'none';
        if (regEduPayGate) regEduPayGate.style.display = 'none';
        if (regEduChatStage) regEduChatStage.style.display = 'none';
        if (regEduDeliverablesStage) regEduDeliverablesStage.style.display = 'none';

        if (pricing && regEduPriceSummary) {
            regEduPriceSummary.textContent = `Consultation Fee: AUD $${Number(pricing.exGstAud || 199).toFixed(2)} ex GST (+ AUD $${Number(pricing.gstAud || 19.9).toFixed(2)} GST where applicable). Subsidized training promo codes supported at Stripe Checkout.`;
        }

        if (!session || session.paymentStatus !== 'paid' || session.status === 'pending_payment') {
            if (regionalEduModal) regionalEduModal.dataset.stage = 'landing';
            if (regEduPayGate) regEduPayGate.style.display = 'block';
            if (regEduPayBtn) regEduPayBtn.disabled = payload?.canPay === false;
            return;
        }

        if (session.status === 'paid_intake_ready' || session.status === 'generating_preliminary_draft') {
            if (regionalEduModal) regionalEduModal.dataset.stage = 'chat';
            if (regEduChatStage) regEduChatStage.style.display = 'block';
            const step = Math.min(Math.max(Number(session.currentStep) || 1, 1), 6);
            const minsLeft = Math.max(1, 7 - step);
            if (regEduProgressLabel) {
                regEduProgressLabel.textContent = `Question ${step} of 6 — ~${minsLeft} mins remaining | Advisory Intake`;
            }
            if (regEduProgressFill) {
                regEduProgressFill.style.width = `${Math.round((step / 6) * 100)}%`;
            }
            if (regEduMessages) {
                const msgs = Array.isArray(session.messages) ? session.messages : [];
                regEduMessages.innerHTML = msgs.map(m => {
                    const cls = m.role === 'user' ? 'is-user' : 'is-assistant';
                    return `<div class="reg-edu-msg ${cls}">${escapeHtml(m.content || '')}</div>`;
                }).join('');
                regEduMessages.scrollTop = regEduMessages.scrollHeight;
            }
            return;
        }

        // Stage 2 or Stage 3 Deliverables
        if (regionalEduModal) regionalEduModal.dataset.stage = 'deliverables';
        if (regEduDeliverablesStage) regEduDeliverablesStage.style.display = 'flex';
        const isFinalDelivered = session.status === 'final_improved_delivered' && session.finalImprovedReport;

        if (regEduStatusBadge) {
            regEduStatusBadge.classList.toggle('is-delivered', Boolean(isFinalDelivered));
            regEduStatusBadge.textContent = isFinalDelivered
                ? 'Final Improved Advisory Plan Delivered — Ready for immediate download below.'
                : 'Under Superadmin Analysis — Your preliminary TXT draft is ready now while a human specialist refines your Final Improved Plan (24–48 business hours).';
        }

        if (regEduFinalCard) {
            if (isFinalDelivered) {
                regEduFinalCard.style.display = 'flex';
                if (regEduFinalFileName) regEduFinalFileName.textContent = session.finalImprovedReport.fileName || 'FINAL_REVIEWED_Regional_Education_AI_Advisory.txt';
                if (regEduFinalPreview) regEduFinalPreview.textContent = session.finalImprovedReport.content || '';
                if (regEduFinalNote) {
                    if (session.superadminExecutiveNote) {
                        regEduFinalNote.textContent = `Specialist Note: ${session.superadminExecutiveNote}`;
                        regEduFinalNote.style.display = 'block';
                    } else {
                        regEduFinalNote.style.display = 'none';
                    }
                }
            } else {
                regEduFinalCard.style.display = 'none';
            }
        }

        if (regEduPrelimCard && session.preliminaryReport) {
            regEduPrelimCard.style.display = 'flex';
            if (regEduPrelimFileName) regEduPrelimFileName.textContent = session.preliminaryReport.fileName || 'PRELIMINARY_Regional_Education_AI_Advisory.txt';
            if (regEduPrelimPreview) regEduPrelimPreview.textContent = session.preliminaryReport.content || '';
        }
    }

    async function loadRegionalEduModalState() {
        setRegEduBoxStatus(regEduModalStatus, '');
        const user = await getRegEduFirebaseUser();
        if (!user) {
            if (regionalEduModal) regionalEduModal.dataset.stage = 'landing';
            if (regEduAuthGate) regEduAuthGate.style.display = 'block';
            if (regEduPayGate) regEduPayGate.style.display = 'none';
            if (regEduChatStage) regEduChatStage.style.display = 'none';
            if (regEduDeliverablesStage) regEduDeliverablesStage.style.display = 'none';
            return;
        }
        try {
            if (pendingStripeConfirmSessionId) {
                const confirmId = pendingStripeConfirmSessionId;
                pendingStripeConfirmSessionId = '';
                await regEduApiFetch('/api/regional-edu/confirm', {
                    method: 'POST',
                    body: JSON.stringify({ sessionId: confirmId })
                });
            }
            const data = await regEduApiFetch('/api/regional-edu/session');
            renderRegEduModalView(data);
        } catch (err) {
            setRegEduBoxStatus(regEduModalStatus, err.message || 'Could not load consultation status.', true);
        }
    }

    if (openRegionalEduModalBtn) {
        openRegionalEduModalBtn.addEventListener('click', openRegionalEduModal);
    }
    if (closeRegionalEduModalBtn) {
        closeRegionalEduModalBtn.addEventListener('click', closeRegionalEduModal);
    }
    if (regionalEduModal) {
        regionalEduModal.addEventListener('click', (e) => {
            if (e.target === regionalEduModal) closeRegionalEduModal();
        });
        // Reject file drag-and-drop onto the zero-upload customer modal
        ['dragover', 'drop'].forEach(evtName => {
            regionalEduModal.addEventListener(evtName, (e) => {
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    e.preventDefault();
                    setRegEduBoxStatus(regEduModalStatus, 'File uploads are disabled in this advisory consultation. Please enter plain text only.', true);
                }
            });
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && regionalEduModal && regionalEduModal.style.display === 'flex') {
            closeRegionalEduModal();
        }
    });

    if (regEduSignInBtn) {
        regEduSignInBtn.addEventListener('click', async () => {
            try {
                if (window.firebaseService && typeof window.firebaseService.signInWithGoogle === 'function') {
                    await window.firebaseService.signInWithGoogle();
                }
            } catch (err) {
                setRegEduBoxStatus(regEduModalStatus, err.message || 'Google sign-in was cancelled.', true);
            }
        });
    }

    if (regEduPayBtn) {
        regEduPayBtn.addEventListener('click', async () => {
            try {
                regEduPayBtn.disabled = true;
                setRegEduBoxStatus(regEduModalStatus, 'Creating secure Stripe AUD checkout...');
                const data = await regEduApiFetch('/api/regional-edu/checkout', {
                    method: 'POST',
                    body: JSON.stringify({ returnPath: window.location.pathname || '/' })
                });
                if (!data.url) throw new Error('Stripe checkout URL missing.');
                window.location.assign(data.url);
            } catch (err) {
                setRegEduBoxStatus(regEduModalStatus, err.message || 'Could not start Stripe checkout.', true);
                regEduPayBtn.disabled = false;
            }
        });
    }

    async function sendRegEduAnswer() {
        if (!currentRegEduSession || !regEduAnswerInput) return;
        const text = regEduAnswerInput.value.trim();
        if (text.length < 2) {
            setRegEduBoxStatus(regEduModalStatus, 'Please enter a short plain-text answer before sending.', true);
            return;
        }
        try {
            if (regEduSendBtn) regEduSendBtn.disabled = true;
            setRegEduBoxStatus(regEduModalStatus, 'Analysing answer and preparing next advisory step...');
            const result = await regEduApiFetch('/api/regional-edu/message', {
                method: 'POST',
                body: JSON.stringify({ sessionId: currentRegEduSession.id, message: text })
            });
            regEduAnswerInput.value = '';
            setRegEduBoxStatus(regEduModalStatus, result.redactedWarning || '', Boolean(result.redactedWarning));
            renderRegEduModalView({ pricing: null, canPay: true, session: result.session });
        } catch (err) {
            setRegEduBoxStatus(regEduModalStatus, err.message || 'Could not submit answer.', true);
        } finally {
            if (regEduSendBtn) regEduSendBtn.disabled = false;
        }
    }

    if (regEduSendBtn) {
        regEduSendBtn.addEventListener('click', sendRegEduAnswer);
    }
    if (regEduAnswerInput) {
        regEduAnswerInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendRegEduAnswer();
            }
        });
    }
    if (regEduDownloadPrelimBtn) {
        regEduDownloadPrelimBtn.addEventListener('click', () => {
            const report = currentRegEduSession?.preliminaryReport;
            if (report) downloadRegEduTextFile(report.fileName, report.content);
        });
    }
    if (regEduDownloadFinalBtn) {
        regEduDownloadFinalBtn.addEventListener('click', () => {
            const report = currentRegEduSession?.finalImprovedReport;
            if (report) downloadRegEduTextFile(report.fileName, report.content);
        });
    }

    // SuperAdmin Studio Helpers
    function formatReviewStatusMeta(reviewStatus) {
        if (reviewStatus === 'final_improved_delivered') return { label: 'Final Delivered', cls: 'is-delivered' };
        if (reviewStatus === 'in_review_editing') return { label: 'In Review / Editing', cls: 'is-editing' };
        return { label: 'Unread Analysis', cls: 'is-unread' };
    }

    function renderRegEduQueue() {
        if (!regEduQueueList) return;
        const filterVal = regEduFilterSelect ? regEduFilterSelect.value : 'all';
        const items = filterVal === 'all'
            ? regEduReviewsCache
            : regEduReviewsCache.filter(r => r.reviewStatus === filterVal);

        if (!items.length) {
            regEduQueueList.innerHTML = '<p class="reg-edu-empty-note">No Regional Education reviews match this filter.</p>';
            return;
        }

        regEduQueueList.innerHTML = items.map(r => {
            const st = formatReviewStatusMeta(r.reviewStatus);
            const selectedCls = selectedRegEduReview && selectedRegEduReview.id === r.id ? 'is-selected' : '';
            const unreadCls = !r.read ? 'is-unread' : '';
            return `
                <button type="button" class="reg-edu-queue-item ${selectedCls} ${unreadCls}" data-review-id="${escapeHtml(r.id)}" data-agent-id="reg-edu-queue-item-${escapeHtml(r.id)}">
                    <div class="reg-edu-queue-item-top">
                        <strong>${escapeHtml(r.clientOrganizationName || 'Client Organization')}</strong>
                        <span class="reg-edu-status-pill ${st.cls}">${escapeHtml(st.label)}</span>
                    </div>
                    <small>${escapeHtml(r.clientEmail || r.uid || '')}</small>
                    <small>AUD $${Number(r.amountPaidExGstAud || 0).toFixed(2)} ex GST &bull; ${escapeHtml((r.createdAt || '').slice(0, 10))}</small>
                </button>
            `;
        }).join('');
    }

    function showRegEduReviewDetail(review) {
        selectedRegEduReview = review || null;
        if (!regEduStudioEmpty || !regEduStudioActive) return;
        if (regEduDeleteConfirmWrap) regEduDeleteConfirmWrap.style.display = 'none';
        if (regEduApproveConfirmWrap) regEduApproveConfirmWrap.style.display = 'none';

        if (!review) {
            regEduStudioEmpty.style.display = 'block';
            regEduStudioActive.style.display = 'none';
            return;
        }

        regEduStudioEmpty.style.display = 'none';
        regEduStudioActive.style.display = 'block';

        const st = formatReviewStatusMeta(review.reviewStatus);
        if (regEduDetailOrgTitle) regEduDetailOrgTitle.textContent = review.clientOrganizationName || 'Client Organization';
        if (regEduDetailMetaLine) {
            regEduDetailMetaLine.textContent = `${review.clientEmail || 'N/A'} | Stripe: ${review.stripeSessionId} | Model: ${review.modelUsed}`;
        }
        if (regEduDetailStatusBadge) {
            regEduDetailStatusBadge.textContent = st.label;
            regEduDetailStatusBadge.className = `reg-edu-status-pill ${st.cls}`;
        }
        if (regEduIntakeTranscript) regEduIntakeTranscript.textContent = review.intakeTranscript || '';
        if (regEduResearchSummary) regEduResearchSummary.textContent = review.researchSummary || '';
        if (regEduPreliminaryRef) regEduPreliminaryRef.textContent = review.preliminaryTxtContent || '';
        if (regEduWorkingDraftTextarea) regEduWorkingDraftTextarea.value = review.workingDraftContent || review.preliminaryTxtContent || '';
        if (regEduExecutiveNoteInput) regEduExecutiveNoteInput.value = review.superadminNote || '';
        if (regEduDraftFileHint) {
            regEduDraftFileHint.textContent = review.finalFileName
                ? `Delivered file: ${review.finalFileName}`
                : `Baseline: ${review.preliminaryFileName}`;
        }
    }

    async function loadRegionalEduStudio() {
        setRegEduBoxStatus(regEduStudioStatus, '');
        try {
            const data = await regEduApiFetch('/api/regional-edu/superadmin/reviews');
            regEduReviewsCache = Array.isArray(data.reviews) ? data.reviews : [];
            const unreadCount = Number(data.unreadCount) || 0;
            if (regEduUnreadBadge) {
                regEduUnreadBadge.textContent = `${unreadCount} unread`;
                regEduUnreadBadge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
            }
            if (selectedRegEduReview) {
                const updatedSelection = regEduReviewsCache.find(r => r.id === selectedRegEduReview.id) || null;
                showRegEduReviewDetail(updatedSelection);
            } else {
                showRegEduReviewDetail(regEduReviewsCache[0] || null);
            }
            renderRegEduQueue();
        } catch (err) {
            setRegEduBoxStatus(regEduStudioStatus, err.message || 'Could not load Regional Education reviews.', true);
        }
    }
    window.loadRegionalEduStudio = loadRegionalEduStudio;

    if (regEduFilterSelect) {
        regEduFilterSelect.addEventListener('change', renderRegEduQueue);
    }
    if (regEduRefreshBtn) {
        regEduRefreshBtn.addEventListener('click', loadRegionalEduStudio);
    }
    if (regEduQueueList) {
        regEduQueueList.addEventListener('click', async (e) => {
            const btn = e.target.closest('.reg-edu-queue-item');
            if (!btn) return;
            const id = btn.getAttribute('data-review-id');
            const found = regEduReviewsCache.find(r => r.id === id);
            if (!found) return;
            showRegEduReviewDetail(found);
            renderRegEduQueue();
            if (!found.read || found.reviewStatus === 'unread_analysis') {
                try {
                    const res = await regEduApiFetch(`/api/regional-edu/superadmin/reviews/${encodeURIComponent(found.id)}/read`, {
                        method: 'POST'
                    });
                    if (res.review) {
                        const idx = regEduReviewsCache.findIndex(r => r.id === res.review.id);
                        if (idx >= 0) regEduReviewsCache[idx] = res.review;
                        showRegEduReviewDetail(res.review);
                        renderRegEduQueue();
                    }
                } catch {
                    // Non-blocking read mark error
                }
            }
        });
    }

    if (regEduSaveDraftBtn) {
        regEduSaveDraftBtn.addEventListener('click', async () => {
            if (!selectedRegEduReview || !regEduWorkingDraftTextarea) return;
            try {
                regEduSaveDraftBtn.disabled = true;
                setRegEduBoxStatus(regEduStudioStatus, 'Saving working plain-text draft...');
                const res = await regEduApiFetch(`/api/regional-edu/superadmin/reviews/${encodeURIComponent(selectedRegEduReview.id)}/draft`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        improvedTxtContent: regEduWorkingDraftTextarea.value,
                        superadminNote: regEduExecutiveNoteInput ? regEduExecutiveNoteInput.value : ''
                    })
                });
                if (res.review) {
                    const idx = regEduReviewsCache.findIndex(r => r.id === res.review.id);
                    if (idx >= 0) regEduReviewsCache[idx] = res.review;
                    showRegEduReviewDetail(res.review);
                    renderRegEduQueue();
                }
                setRegEduBoxStatus(regEduStudioStatus, 'Working TXT draft saved.');
            } catch (err) {
                setRegEduBoxStatus(regEduStudioStatus, err.message || 'Could not save working draft.', true);
            } finally {
                regEduSaveDraftBtn.disabled = false;
            }
        });
    }

    if (regEduDownloadWorkingBtn) {
        regEduDownloadWorkingBtn.addEventListener('click', () => {
            if (!selectedRegEduReview || !regEduWorkingDraftTextarea) return;
            const slugName = (selectedRegEduReview.clientOrganizationName || 'Organization').replace(/[^A-Za-z0-9]+/g, '_');
            downloadRegEduTextFile(`WORKING_Regional_Education_AI_Advisory_${slugName}.txt`, regEduWorkingDraftTextarea.value);
        });
    }

    if (regEduLocalFileInput) {
        regEduLocalFileInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const isTxt = /\.txt$/i.test(file.name) || file.type === 'text/plain';
            if (!isTxt) {
                setRegEduBoxStatus(regEduStudioStatus, 'Please select a plain-text .txt file only.', true);
                regEduLocalFileInput.value = '';
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                if (regEduWorkingDraftTextarea) {
                    regEduWorkingDraftTextarea.value = String(reader.result || '');
                }
                setRegEduBoxStatus(regEduStudioStatus, `Loaded ${file.name} into the SuperAdmin editor. Click Save Draft or Approve & Send Improved Plan.`);
                regEduLocalFileInput.value = '';
            };
            reader.onerror = () => {
                setRegEduBoxStatus(regEduStudioStatus, 'Could not read the selected .txt file.', true);
                regEduLocalFileInput.value = '';
            };
            reader.readAsText(file, 'UTF-8');
        });
    }

    if (regEduApproveBtn && regEduApproveConfirmWrap) {
        regEduApproveBtn.addEventListener('click', () => {
            regEduApproveConfirmWrap.style.display = 'flex';
        });
    }
    if (regEduCancelApproveBtn && regEduApproveConfirmWrap) {
        regEduCancelApproveBtn.addEventListener('click', () => {
            regEduApproveConfirmWrap.style.display = 'none';
        });
    }
    if (regEduConfirmApproveBtn) {
        regEduConfirmApproveBtn.addEventListener('click', async () => {
            if (!selectedRegEduReview || !regEduWorkingDraftTextarea) return;
            try {
                regEduConfirmApproveBtn.disabled = true;
                setRegEduBoxStatus(regEduStudioStatus, 'Approving and delivering final improved TXT plan to client...');
                const res = await regEduApiFetch(`/api/regional-edu/superadmin/reviews/${encodeURIComponent(selectedRegEduReview.id)}/approve`, {
                    method: 'POST',
                    body: JSON.stringify({
                        improvedTxtContent: regEduWorkingDraftTextarea.value,
                        executiveNote: regEduExecutiveNoteInput ? regEduExecutiveNoteInput.value : '',
                        confirmApprove: true
                    })
                });
                if (res.review) {
                    const idx = regEduReviewsCache.findIndex(r => r.id === res.review.id);
                    if (idx >= 0) regEduReviewsCache[idx] = res.review;
                    showRegEduReviewDetail(res.review);
                    renderRegEduQueue();
                }
                setRegEduBoxStatus(regEduStudioStatus, 'Final Improved TXT Plan approved and delivered to client portal.');
            } catch (err) {
                setRegEduBoxStatus(regEduStudioStatus, err.message || 'Could not approve and deliver final plan.', true);
            } finally {
                regEduConfirmApproveBtn.disabled = false;
            }
        });
    }

    if (regEduDeleteBtn && regEduDeleteConfirmWrap) {
        regEduDeleteBtn.addEventListener('click', () => {
            regEduDeleteConfirmWrap.style.display = 'flex';
        });
    }
    if (regEduCancelDeleteBtn && regEduDeleteConfirmWrap) {
        regEduCancelDeleteBtn.addEventListener('click', () => {
            regEduDeleteConfirmWrap.style.display = 'none';
        });
    }
    if (regEduConfirmDeleteBtn) {
        regEduConfirmDeleteBtn.addEventListener('click', async () => {
            if (!selectedRegEduReview) return;
            try {
                regEduConfirmDeleteBtn.disabled = true;
                await regEduApiFetch(`/api/regional-edu/superadmin/reviews/${encodeURIComponent(selectedRegEduReview.id)}`, {
                    method: 'DELETE',
                    body: JSON.stringify({ confirmDelete: true })
                });
                selectedRegEduReview = null;
                setRegEduBoxStatus(regEduStudioStatus, 'Regional Education review record deleted.');
                await loadRegionalEduStudio();
            } catch (err) {
                setRegEduBoxStatus(regEduStudioStatus, err.message || 'Could not delete review record.', true);
            } finally {
                regEduConfirmDeleteBtn.disabled = false;
            }
        });
    }

    // Handle Stripe return (?regional_edu=success&session_id=...) and auth state sync
    const regEduParams = new URLSearchParams(window.location.search);
    const regEduReturnStatus = regEduParams.get('regional_edu');
    const regEduReturnSession = regEduParams.get('session_id');
    if (regEduReturnStatus === 'success' && regEduReturnSession && regionalEduModal) {
        pendingStripeConfirmSessionId = regEduReturnSession;
        openRegionalEduModal();
        regEduParams.delete('regional_edu');
        regEduParams.delete('session_id');
        const nextQs = regEduParams.toString();
        history.replaceState(null, '', `${window.location.pathname}${nextQs ? `?${nextQs}` : ''}${window.location.hash || ''}`);
    } else if (regEduReturnStatus === 'cancelled' && regionalEduModal) {
        openRegionalEduModal();
        setRegEduBoxStatus(regEduModalStatus, 'Stripe checkout was cancelled. You can retry whenever you are ready.', true);
        regEduParams.delete('regional_edu');
        const nextQs = regEduParams.toString();
        history.replaceState(null, '', `${window.location.pathname}${nextQs ? `?${nextQs}` : ''}${window.location.hash || ''}`);
    }

    window.addEventListener('firebaseAuthChanged', () => {
        if (regionalEduModal && regionalEduModal.style.display === 'flex') {
            loadRegionalEduModalState();
        }
        const studioPane = document.getElementById('admin-regional-edu-studio');
        if (studioPane && studioPane.style.display === 'block') {
            loadRegionalEduStudio();
        }
    });

    // Shared DRY controller for Services 3 (Tool Governance) & 4 (Managed AI Agent Hosting)
    function initAdvisoryServiceController(cfg) {
        const p = cfg.prefix;
        const openBtn = document.getElementById(cfg.openBtnId);
        const modal = document.getElementById(cfg.modalId);
        const closeBtn = document.getElementById(cfg.closeBtnId);
        const authGate = document.getElementById(`${p}AuthGate`);
        const signInBtn = document.getElementById(`${p}SignInBtn`);
        const payGate = document.getElementById(`${p}PayGate`);
        const priceSummary = document.getElementById(`${p}PriceSummary`);
        const payBtn = document.getElementById(`${p}PayBtn`);
        const chatStage = document.getElementById(`${p}ChatStage`);
        const progressLabel = document.getElementById(`${p}ProgressLabel`);
        const progressFill = document.getElementById(`${p}ProgressFill`);
        const messagesEl = document.getElementById(`${p}Messages`);
        const answerInput = document.getElementById(`${p}AnswerInput`);
        const sendBtn = document.getElementById(`${p}SendBtn`);
        const deliverablesStage = document.getElementById(`${p}DeliverablesStage`);
        const statusBadge = document.getElementById(`${p}StatusBadge`);
        const finalCard = document.getElementById(`${p}FinalCard`);
        const finalFileName = document.getElementById(`${p}FinalFileName`);
        const downloadFinalBtn = document.getElementById(`${p}DownloadFinalBtn`);
        const finalNote = document.getElementById(`${p}FinalNote`);
        const finalPreview = document.getElementById(`${p}FinalPreview`);
        const prelimCard = document.getElementById(`${p}PrelimCard`);
        const prelimFileName = document.getElementById(`${p}PrelimFileName`);
        const downloadPrelimBtn = document.getElementById(`${p}DownloadPrelimBtn`);
        const prelimPreview = document.getElementById(`${p}PrelimPreview`);
        const modalStatus = document.getElementById(`${p}ModalStatus`);

        const unreadBadge = document.getElementById(`${p}UnreadBadge`);
        const filterSelect = document.getElementById(`${p}FilterSelect`);
        const refreshBtn = document.getElementById(`${p}RefreshBtn`);
        const queueList = document.getElementById(`${p}QueueList`);
        const studioEmpty = document.getElementById(`${p}StudioEmpty`);
        const studioActive = document.getElementById(`${p}StudioActive`);
        const detailOrgTitle = document.getElementById(`${p}DetailOrgTitle`);
        const detailMetaLine = document.getElementById(`${p}DetailMetaLine`);
        const detailStatusBadge = document.getElementById(`${p}DetailStatusBadge`);
        const deleteBtn = document.getElementById(`${p}DeleteBtn`);
        const deleteConfirmWrap = document.getElementById(`${p}DeleteConfirmWrap`);
        const confirmDeleteBtn = document.getElementById(`${p}ConfirmDeleteBtn`);
        const cancelDeleteBtn = document.getElementById(`${p}CancelDeleteBtn`);
        const intakeTranscript = document.getElementById(`${p}IntakeTranscript`);
        const researchSummary = document.getElementById(`${p}ResearchSummary`);
        const preliminaryRef = document.getElementById(`${p}PreliminaryRef`);
        const workingDraftTextarea = document.getElementById(`${p}WorkingDraftTextarea`);
        const draftFileHint = document.getElementById(`${p}DraftFileHint`);
        const executiveNoteInput = document.getElementById(`${p}ExecutiveNoteInput`);
        const saveDraftBtn = document.getElementById(`${p}SaveDraftBtn`);
        const downloadWorkingBtn = document.getElementById(`${p}DownloadWorkingBtn`);
        const localFileInput = document.getElementById(`${p}LocalFileInput`);
        const approveBtn = document.getElementById(`${p}ApproveBtn`);
        const approveConfirmWrap = document.getElementById(`${p}ApproveConfirmWrap`);
        const confirmApproveBtn = document.getElementById(`${p}ConfirmApproveBtn`);
        const cancelApproveBtn = document.getElementById(`${p}CancelApproveBtn`);
        const studioStatus = document.getElementById(`${p}StudioStatus`);

        let currentSession = null;
        let reviewsCache = [];
        let selectedReview = null;
        let pendingStripeSession = '';

        function openModal() {
            if (!modal) return;
            modal.dataset.stage = 'landing';
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            if (closeBtn) closeBtn.focus();
            loadModalState();
        }

        function closeModal() {
            if (!modal) return;
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }

        function renderModalView(payload) {
            const pricing = payload?.pricing;
            const session = payload?.session || null;
            currentSession = session;

            if (authGate) authGate.style.display = 'none';
            if (payGate) payGate.style.display = 'none';
            if (chatStage) chatStage.style.display = 'none';
            if (deliverablesStage) deliverablesStage.style.display = 'none';

            if (pricing && priceSummary) {
                priceSummary.textContent = `Consultation Fee: AUD $${Number(pricing.exGstAud || cfg.defaultAud).toFixed(2)} ex GST (+ AUD $${Number(pricing.gstAud || cfg.defaultAud * 0.1).toFixed(2)} GST where applicable).`;
            }

            if (!session || session.paymentStatus !== 'paid' || session.status === 'pending_payment') {
                if (modal) modal.dataset.stage = 'landing';
                if (payGate) payGate.style.display = 'block';
                if (payBtn) payBtn.disabled = payload?.canPay === false;
                return;
            }

            if (session.status === 'paid_intake_ready' || session.status === 'generating_preliminary_draft') {
                if (modal) modal.dataset.stage = 'chat';
                if (chatStage) chatStage.style.display = 'block';
                const step = Math.min(Math.max(Number(session.currentStep) || 1, 1), 6);
                const minsLeft = Math.max(1, 7 - step);
                if (progressLabel) {
                    progressLabel.textContent = `Question ${step} of 6 — ~${minsLeft} mins remaining | ${cfg.scopingTag}`;
                }
                if (progressFill) {
                    progressFill.style.width = `${Math.round((step / 6) * 100)}%`;
                }
                if (messagesEl) {
                    const msgs = Array.isArray(session.messages) ? session.messages : [];
                    messagesEl.innerHTML = msgs.map(m => {
                        const cls = m.role === 'user' ? 'is-user' : 'is-assistant';
                        return `<div class="reg-edu-msg ${cls}">${escapeHtml(m.content || '')}</div>`;
                    }).join('');
                    messagesEl.scrollTop = messagesEl.scrollHeight;
                }
                return;
            }

            if (modal) modal.dataset.stage = 'deliverables';
            if (deliverablesStage) deliverablesStage.style.display = 'flex';
            const isFinalDelivered = session.status === 'final_improved_delivered' && session.finalImprovedReport;

            if (statusBadge) {
                statusBadge.classList.toggle('is-delivered', Boolean(isFinalDelivered));
                statusBadge.textContent = isFinalDelivered
                    ? cfg.finalDeliveredBanner
                    : 'Under Superadmin Analysis — You will be notified when your final vetted & improved .txt advisory plan is ready (24–48 business hours).';
            }

            if (finalCard) {
                if (isFinalDelivered) {
                    finalCard.style.display = 'flex';
                    if (finalFileName) finalFileName.textContent = session.finalImprovedReport.fileName || cfg.defaultFinalName;
                    if (finalPreview) finalPreview.textContent = session.finalImprovedReport.content || '';
                    if (finalNote) {
                        if (session.superadminExecutiveNote) {
                            finalNote.textContent = `Executive Counsel Note: ${session.superadminExecutiveNote}`;
                            finalNote.style.display = 'block';
                        } else {
                            finalNote.style.display = 'none';
                        }
                    }
                } else {
                    finalCard.style.display = 'none';
                }
            }

            if (prelimCard && session.preliminaryReport) {
                prelimCard.style.display = 'flex';
                if (prelimFileName) prelimFileName.textContent = session.preliminaryReport.fileName || cfg.defaultPrelimName;
                if (prelimPreview) prelimPreview.textContent = session.preliminaryReport.content || '';
            }
        }

        async function loadModalState() {
            setRegEduBoxStatus(modalStatus, '');
            const user = await getRegEduFirebaseUser();
            if (!user) {
                if (modal) modal.dataset.stage = 'landing';
                if (authGate) authGate.style.display = 'block';
                if (payGate) payGate.style.display = 'none';
                if (chatStage) chatStage.style.display = 'none';
                if (deliverablesStage) deliverablesStage.style.display = 'none';
                return;
            }
            try {
                if (pendingStripeSession) {
                    const confirmId = pendingStripeSession;
                    pendingStripeSession = '';
                    await regEduApiFetch(`${cfg.apiBase}/confirm`, {
                        method: 'POST',
                        body: JSON.stringify({ sessionId: confirmId })
                    });
                }
                const data = await regEduApiFetch(`${cfg.apiBase}/session`);
                renderModalView(data);
            } catch (err) {
                setRegEduBoxStatus(modalStatus, err.message || 'Could not load advisory status.', true);
            }
        }

        if (openBtn) openBtn.addEventListener('click', openModal);
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
            ['dragover', 'drop'].forEach(evtName => {
                modal.addEventListener(evtName, (e) => {
                    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        e.preventDefault();
                        setRegEduBoxStatus(modalStatus, 'File uploads are disabled in this advisory consultation. Please enter plain text only.', true);
                    }
                });
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal && modal.style.display === 'flex') closeModal();
        });

        if (signInBtn) {
            signInBtn.addEventListener('click', async () => {
                try {
                    if (window.firebaseService && typeof window.firebaseService.signInWithGoogle === 'function') {
                        await window.firebaseService.signInWithGoogle();
                    }
                } catch (err) {
                    setRegEduBoxStatus(modalStatus, err.message || 'Google sign-in was cancelled.', true);
                }
            });
        }

        if (payBtn) {
            payBtn.addEventListener('click', async () => {
                try {
                    payBtn.disabled = true;
                    setRegEduBoxStatus(modalStatus, 'Creating secure Stripe AUD checkout...');
                    const data = await regEduApiFetch(`${cfg.apiBase}/checkout`, {
                        method: 'POST',
                        body: JSON.stringify({ returnPath: window.location.pathname || '/' })
                    });
                    if (!data.url) throw new Error('Stripe checkout URL missing.');
                    window.location.assign(data.url);
                } catch (err) {
                    setRegEduBoxStatus(modalStatus, err.message || 'Could not start Stripe checkout.', true);
                    payBtn.disabled = false;
                }
            });
        }

        async function sendAnswer() {
            if (!currentSession || !answerInput) return;
            const text = answerInput.value.trim();
            if (text.length < 2) {
                setRegEduBoxStatus(modalStatus, 'Please enter a short plain-text answer before sending.', true);
                return;
            }
            try {
                if (sendBtn) sendBtn.disabled = true;
                setRegEduBoxStatus(modalStatus, 'Analysing answer and preparing next advisory step...');
                const result = await regEduApiFetch(`${cfg.apiBase}/message`, {
                    method: 'POST',
                    body: JSON.stringify({ sessionId: currentSession.id, message: text })
                });
                answerInput.value = '';
                setRegEduBoxStatus(modalStatus, result.redactedWarning || '', Boolean(result.redactedWarning));
                renderModalView({ pricing: null, canPay: true, session: result.session });
            } catch (err) {
                setRegEduBoxStatus(modalStatus, err.message || 'Could not submit answer.', true);
            } finally {
                if (sendBtn) sendBtn.disabled = false;
            }
        }

        if (sendBtn) sendBtn.addEventListener('click', sendAnswer);
        if (answerInput) {
            answerInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendAnswer();
                }
            });
        }
        if (downloadPrelimBtn) {
            downloadPrelimBtn.addEventListener('click', () => {
                const report = currentSession?.preliminaryReport;
                if (report) downloadRegEduTextFile(report.fileName, report.content);
            });
        }
        if (downloadFinalBtn) {
            downloadFinalBtn.addEventListener('click', () => {
                const report = currentSession?.finalImprovedReport;
                if (report) downloadRegEduTextFile(report.fileName, report.content);
            });
        }

        function renderQueue() {
            if (!queueList) return;
            const filterVal = filterSelect ? filterSelect.value : 'all';
            const items = filterVal === 'all' ? reviewsCache : reviewsCache.filter(r => r.reviewStatus === filterVal);
            if (!items.length) {
                queueList.innerHTML = '<p class="reg-edu-empty-note">No reviews match this filter.</p>';
                return;
            }
            queueList.innerHTML = items.map(r => {
                const st = formatReviewStatusMeta(r.reviewStatus);
                const selectedCls = selectedReview && selectedReview.id === r.id ? 'is-selected' : '';
                const unreadCls = !r.read ? 'is-unread' : '';
                return `
                    <button type="button" class="reg-edu-queue-item ${selectedCls} ${unreadCls}" data-review-id="${escapeHtml(r.id)}">
                        <div class="reg-edu-queue-item-top">
                            <strong>${escapeHtml(r.clientOrganizationName || 'Client Organization')}</strong>
                            <span class="reg-edu-status-pill ${st.cls}">${escapeHtml(st.label)}</span>
                        </div>
                        <small>${escapeHtml(r.sectorOrWorkflowTag || '')} &bull; ${escapeHtml(r.clientEmail || r.uid || '')}</small>
                        <small>AUD $${Number(r.amountPaidExGstAud || 0).toFixed(2)} ex GST &bull; ${escapeHtml((r.createdAt || '').slice(0, 10))}</small>
                    </button>
                `;
            }).join('');
        }

        function showReviewDetail(review) {
            selectedReview = review || null;
            if (!studioEmpty || !studioActive) return;
            if (deleteConfirmWrap) deleteConfirmWrap.style.display = 'none';
            if (approveConfirmWrap) approveConfirmWrap.style.display = 'none';

            if (!review) {
                studioEmpty.style.display = 'block';
                studioActive.style.display = 'none';
                return;
            }
            studioEmpty.style.display = 'none';
            studioActive.style.display = 'block';

            const st = formatReviewStatusMeta(review.reviewStatus);
            if (detailOrgTitle) detailOrgTitle.textContent = review.clientOrganizationName || 'Client Organization';
            if (detailMetaLine) {
                detailMetaLine.textContent = `${review.sectorOrWorkflowTag || ''} | ${review.clientEmail || 'N/A'} | Stripe: ${review.stripeSessionId}`;
            }
            if (detailStatusBadge) {
                detailStatusBadge.textContent = st.label;
                detailStatusBadge.className = `reg-edu-status-pill ${st.cls}`;
            }
            if (intakeTranscript) intakeTranscript.textContent = review.intakeTranscript || '';
            if (researchSummary) researchSummary.textContent = review.researchSummary || '';
            if (preliminaryRef) preliminaryRef.textContent = review.preliminaryTxtContent || '';
            if (workingDraftTextarea) workingDraftTextarea.value = review.workingDraftContent || review.preliminaryTxtContent || '';
            if (executiveNoteInput) executiveNoteInput.value = review.superadminNote || '';
            if (draftFileHint) {
                draftFileHint.textContent = review.finalFileName
                    ? `Delivered: ${review.finalFileName}`
                    : `Baseline: ${review.preliminaryFileName}`;
            }
        }

        async function loadStudio() {
            setRegEduBoxStatus(studioStatus, '');
            try {
                const data = await regEduApiFetch(`${cfg.apiBase}/superadmin/reviews`);
                reviewsCache = Array.isArray(data.reviews) ? data.reviews : [];
                const unreadCount = Number(data.unreadCount) || 0;
                if (unreadBadge) {
                    unreadBadge.textContent = `${unreadCount} unread`;
                    unreadBadge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
                }
                if (selectedReview) {
                    showReviewDetail(reviewsCache.find(r => r.id === selectedReview.id) || null);
                } else {
                    showReviewDetail(reviewsCache[0] || null);
                }
                renderQueue();
            } catch (err) {
                setRegEduBoxStatus(studioStatus, err.message || 'Could not load reviews.', true);
            }
        }
        window[cfg.studioGlobalName] = loadStudio;

        if (filterSelect) filterSelect.addEventListener('change', renderQueue);
        if (refreshBtn) refreshBtn.addEventListener('click', loadStudio);
        if (queueList) {
            queueList.addEventListener('click', async (e) => {
                const btn = e.target.closest('.reg-edu-queue-item');
                if (!btn) return;
                const id = btn.getAttribute('data-review-id');
                const found = reviewsCache.find(r => r.id === id);
                if (!found) return;
                showReviewDetail(found);
                renderQueue();
                if (!found.read || found.reviewStatus === 'unread_analysis') {
                    try {
                        const res = await regEduApiFetch(`${cfg.apiBase}/superadmin/reviews/${encodeURIComponent(found.id)}/read`, { method: 'POST' });
                        if (res.review) {
                            const idx = reviewsCache.findIndex(r => r.id === res.review.id);
                            if (idx >= 0) reviewsCache[idx] = res.review;
                            showReviewDetail(res.review);
                            renderQueue();
                        }
                    } catch {
                        // Non-blocking read mark
                    }
                }
            });
        }

        if (saveDraftBtn) {
            saveDraftBtn.addEventListener('click', async () => {
                if (!selectedReview || !workingDraftTextarea) return;
                try {
                    saveDraftBtn.disabled = true;
                    setRegEduBoxStatus(studioStatus, 'Saving working plain-text draft...');
                    const res = await regEduApiFetch(`${cfg.apiBase}/superadmin/reviews/${encodeURIComponent(selectedReview.id)}/draft`, {
                        method: 'PUT',
                        body: JSON.stringify({
                            improvedTxtContent: workingDraftTextarea.value,
                            superadminNote: executiveNoteInput ? executiveNoteInput.value : ''
                        })
                    });
                    if (res.review) {
                        const idx = reviewsCache.findIndex(r => r.id === res.review.id);
                        if (idx >= 0) reviewsCache[idx] = res.review;
                        showReviewDetail(res.review);
                        renderQueue();
                    }
                    setRegEduBoxStatus(studioStatus, 'Working TXT draft saved.');
                } catch (err) {
                    setRegEduBoxStatus(studioStatus, err.message || 'Could not save working draft.', true);
                } finally {
                    saveDraftBtn.disabled = false;
                }
            });
        }

        if (downloadWorkingBtn) {
            downloadWorkingBtn.addEventListener('click', () => {
                if (!selectedReview || !workingDraftTextarea) return;
                const slugName = (selectedReview.clientOrganizationName || 'Organization').replace(/[^A-Za-z0-9]+/g, '_');
                downloadRegEduTextFile(`WORKING_${cfg.workingPrefix}_${slugName}.txt`, workingDraftTextarea.value);
            });
        }

        if (localFileInput) {
            localFileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                if (!/\.txt$/i.test(file.name) && file.type !== 'text/plain') {
                    setRegEduBoxStatus(studioStatus, 'Please select a plain-text .txt file only.', true);
                    localFileInput.value = '';
                    return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                    if (workingDraftTextarea) workingDraftTextarea.value = String(reader.result || '');
                    setRegEduBoxStatus(studioStatus, `Loaded ${file.name} into the SuperAdmin editor.`);
                    localFileInput.value = '';
                };
                reader.onerror = () => {
                    setRegEduBoxStatus(studioStatus, 'Could not read the selected .txt file.', true);
                    localFileInput.value = '';
                };
                reader.readAsText(file, 'UTF-8');
            });
        }

        if (approveBtn && approveConfirmWrap) {
            approveBtn.addEventListener('click', () => { approveConfirmWrap.style.display = 'flex'; });
        }
        if (cancelApproveBtn && approveConfirmWrap) {
            cancelApproveBtn.addEventListener('click', () => { approveConfirmWrap.style.display = 'none'; });
        }
        if (confirmApproveBtn) {
            confirmApproveBtn.addEventListener('click', async () => {
                if (!selectedReview || !workingDraftTextarea) return;
                try {
                    confirmApproveBtn.disabled = true;
                    setRegEduBoxStatus(studioStatus, 'Approving and delivering final improved TXT plan...');
                    const res = await regEduApiFetch(`${cfg.apiBase}/superadmin/reviews/${encodeURIComponent(selectedReview.id)}/approve`, {
                        method: 'POST',
                        body: JSON.stringify({
                            improvedTxtContent: workingDraftTextarea.value,
                            executiveNote: executiveNoteInput ? executiveNoteInput.value : '',
                            confirmApprove: true
                        })
                    });
                    if (res.review) {
                        const idx = reviewsCache.findIndex(r => r.id === res.review.id);
                        if (idx >= 0) reviewsCache[idx] = res.review;
                        showReviewDetail(res.review);
                        renderQueue();
                    }
                    setRegEduBoxStatus(studioStatus, 'Final Improved TXT Plan approved and delivered to client.');
                } catch (err) {
                    setRegEduBoxStatus(studioStatus, err.message || 'Could not approve final plan.', true);
                } finally {
                    confirmApproveBtn.disabled = false;
                }
            });
        }

        if (deleteBtn && deleteConfirmWrap) {
            deleteBtn.addEventListener('click', () => { deleteConfirmWrap.style.display = 'flex'; });
        }
        if (cancelDeleteBtn && deleteConfirmWrap) {
            cancelDeleteBtn.addEventListener('click', () => { deleteConfirmWrap.style.display = 'none'; });
        }
        if (confirmDeleteBtn) {
            confirmDeleteBtn.addEventListener('click', async () => {
                if (!selectedReview) return;
                try {
                    confirmDeleteBtn.disabled = true;
                    await regEduApiFetch(`${cfg.apiBase}/superadmin/reviews/${encodeURIComponent(selectedReview.id)}`, {
                        method: 'DELETE',
                        body: JSON.stringify({ confirmDelete: true })
                    });
                    selectedReview = null;
                    setRegEduBoxStatus(studioStatus, 'Advisory review record deleted.');
                    await loadStudio();
                } catch (err) {
                    setRegEduBoxStatus(studioStatus, err.message || 'Could not delete review record.', true);
                } finally {
                    confirmDeleteBtn.disabled = false;
                }
            });
        }

        const params = new URLSearchParams(window.location.search);
        const retStatus = params.get(cfg.queryKey);
        const retSession = params.get('session_id');
        if (retStatus === 'success' && retSession && modal) {
            pendingStripeSession = retSession;
            openModal();
            params.delete(cfg.queryKey);
            params.delete('session_id');
            const qs = params.toString();
            history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash || ''}`);
        } else if (retStatus === 'cancelled' && modal) {
            openModal();
            setRegEduBoxStatus(modalStatus, 'Stripe checkout was cancelled. You can retry whenever ready.', true);
            params.delete(cfg.queryKey);
            const qs = params.toString();
            history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash || ''}`);
        }

        window.addEventListener('firebaseAuthChanged', () => {
            if (modal && modal.style.display === 'flex') loadModalState();
            const pane = document.getElementById(cfg.studioPaneId);
            if (pane && pane.style.display === 'block') loadStudio();
        });
    }

    initAdvisoryServiceController({
        prefix: 'toolGov',
        apiBase: '/api/tool-governance',
        openBtnId: 'openToolGovernanceModalBtn',
        modalId: 'toolGovernanceModal',
        closeBtnId: 'closeToolGovernanceModalBtn',
        studioPaneId: 'admin-tool-governance-studio',
        studioGlobalName: 'loadToolGovernanceStudio',
        queryKey: 'tool_governance',
        defaultAud: 399,
        scopingTag: 'Zero-Access Advisory Scoping',
        finalDeliveredBanner: 'Final Vetted Tool & Compliance Plan Delivered — Ready for immediate download.',
        defaultPrelimName: 'PRELIMINARY_AI_Tool_Selection_Governance_Advisory.txt',
        defaultFinalName: 'FINAL_VETTED_AI_Tool_Selection_Governance_Advisory.txt',
        workingPrefix: 'AI_Tool_Selection_Governance'
    });

    initAdvisoryServiceController({
        prefix: 'mgAgent',
        apiBase: '/api/managed-agent',
        openBtnId: 'openManagedAgentModalBtn',
        modalId: 'managedAgentModal',
        closeBtnId: 'closeManagedAgentModalBtn',
        studioPaneId: 'admin-managed-agent-studio',
        studioGlobalName: 'loadManagedAgentStudio',
        queryKey: 'managed_agent',
        defaultAud: 349,
        scopingTag: 'Zero-Access Agent Scoping',
        finalDeliveredBanner: 'Final Reviewed Agent Hosting Blueprint Delivered — Ready for immediate download.',
        defaultPrelimName: 'PRELIMINARY_Managed_AI_Agent_Hosting_Advisory.txt',
        defaultFinalName: 'FINAL_REVIEWED_Managed_AI_Agent_Hosting_Advisory.txt',
        workingPrefix: 'Managed_AI_Agent_Hosting'
    });

    loadPosts();
    loadProjects();
    loadCommunityPosts();
    loadTechPosts();
    loadServicePrices();
});