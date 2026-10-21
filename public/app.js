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
        { id: 'admin-supporter-chat', icon: 'fa-solid fa-comments', title: 'Supporter Messages' },
        { id: 'admin-upload-post', icon: 'fa-solid fa-upload', title: 'Upload Content' },
        { id: 'admin-upload-image', icon: 'fa-solid fa-cloud-arrow-up', title: 'Upload Image' },
        { id: 'admin-manage-posts', icon: 'fa-solid fa-list-check', title: 'Manage Posts' },
        { id: 'admin-database-activity', icon: 'fa-solid fa-database', title: 'Database Activity' }
    ];

    const SUPPORTER_TABS = [
        { id: 'supporter-tab-chat', icon: 'fa-solid fa-comments', title: 'Direct Chat with Team' },
        { id: 'admin-register-details', icon: 'fa-solid fa-id-card', title: 'Register Your Details' },
        { id: 'supporter-tab-donate', icon: 'fa-solid fa-heart', title: 'Donation Option', iconColor: '#ef4444' }
    ];

    // Mobile Collapsible Top Menu Helpers
    function renderMobileMenuItems(isSuperAdmin) {
        const list = document.getElementById('adminMobileItemsList');
        if (!list) return;

        const tabs = isSuperAdmin ? SUPER_ADMIN_TABS : SUPPORTER_TABS;
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

        // Show matching content pane
        const adminTabContents = document.querySelectorAll('.admin-tab-content');
        adminTabContents.forEach(content => {
            content.style.display = content.id === targetId ? 'block' : 'none';
        });

        const currentUser = window.firebaseService?.getCurrentUser?.();

        // Trigger dynamic tab loaders
        if (targetId === 'admin-manage-posts') {
            if (typeof renderAdminAllPosts === 'function') renderAdminAllPosts();
        } else if (targetId === 'admin-database-activity') {
            if (typeof loadDatabaseRecentInputs === 'function') loadDatabaseRecentInputs();
        } else if (targetId === 'admin-supporter-chat') {
            if (typeof loadAdminChatConversations === 'function') loadAdminChatConversations();
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

            renderMobileMenuItems(true);

            if (mobileSelect) {
                mobileSelect.innerHTML = `
                    <option value="admin-register-details">Register Your Details/ Update name, email &amp; phone</option>
                    <option value="admin-settings-overview">Settings &amp; Admin Panel</option>
                    <option value="admin-supporter-chat">Supporter Messages</option>
                    <option value="admin-upload-post">Upload Content</option>
                    <option value="admin-upload-image">Upload Image</option>
                    <option value="admin-manage-posts">Manage Posts</option>
                    <option value="admin-database-activity">Database Activity</option>
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
                    <option value="supporter-tab-donate">Donation option (same as website front page)</option>
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

    // Sign Out Button inside Admin Panel Footer
    const panelSignOutBtn = document.getElementById('panelSignOutBtn');
    if (panelSignOutBtn) {
        panelSignOutBtn.addEventListener('click', async () => {
            closeAdminPanel();
            if (window.firebaseService?.signOut) {
                await window.firebaseService.signOut();
            }
        });
    }

    // Admin Overview Quick-Jump Cards
    document.querySelectorAll('.admin-overview-card').forEach(card => {
        card.addEventListener('click', () => {
            const jumpTarget = card.getAttribute('data-jump');
            if (jumpTarget) switchAdminTab(jumpTarget);
        });
    });

    // Panel Donation Option Input & Stripe Action
    const panelDonationAmountInput = document.getElementById('panelDonationAmountInput') || document.getElementById('panelDonationCustomAmount');
    const panelPayWithStripeBtn = document.getElementById('panelPayWithStripeBtn');
    const panelDonationStatusMsg = document.getElementById('panelDonationStatusMsg');

    if (panelDonationAmountInput) {
        panelDonationAmountInput.addEventListener('input', function() {
            const cleanVal = this.value.replace(/\D/g, '');
            this.value = cleanVal;
            const parsed = parseInt(cleanVal, 10);
            if (parsed >= 50) {
                selectedDonationAmount = parsed;
                if (panelDonationStatusMsg) panelDonationStatusMsg.style.display = 'none';
            }
            const mainInput = document.getElementById('donationAmountInput') || document.getElementById('donationCustomAmount');
            if (mainInput && mainInput !== this) {
                mainInput.value = this.value;
            }
        });
        panelDonationAmountInput.addEventListener('blur', function() {
            const cleanVal = this.value.replace(/\D/g, '');
            const parsed = parseInt(cleanVal, 10);
            if (!parsed || parsed < 50) {
                this.value = '50';
                selectedDonationAmount = 50;
                const mainInput = document.getElementById('donationAmountInput') || document.getElementById('donationCustomAmount');
                if (mainInput) mainInput.value = '50';
            } else {
                selectedDonationAmount = parsed;
            }
        });
    }

    if (panelPayWithStripeBtn) {
        panelPayWithStripeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const input = document.getElementById('panelDonationAmountInput') || document.getElementById('panelDonationCustomAmount');
            const cleanVal = input ? input.value.replace(/\D/g, '') : '';
            const parsed = parseInt(cleanVal, 10);
            if (!parsed || parsed < 50) {
                if (input) {
                    input.value = '50';
                    input.focus();
                }
                selectedDonationAmount = 50;
                if (panelDonationStatusMsg) {
                    panelDonationStatusMsg.style.display = 'block';
                    panelDonationStatusMsg.style.color = '#ef4444';
                    panelDonationStatusMsg.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Minimum donation amount is AUD $50.';
                    setTimeout(() => { if (panelDonationStatusMsg) panelDonationStatusMsg.style.display = 'none'; }, 4000);
                }
                return;
            }
            selectedDonationAmount = parsed;
            if (panelDonationStatusMsg) panelDonationStatusMsg.style.display = 'none';
            if (typeof openPaymentModal === 'function') {
                openPaymentModal('stripe');
            }
        });
    }

    if (adminModal) {
        adminModal.addEventListener('click', (e) => {
            if (e.target === adminModal) {
                closeAdminPanel();
            }
        });
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
            document.cookie = "adminAuth=; max-age=0; path=/";
            document.cookie = "adminAuth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            document.cookie = "userAuth=; max-age=0; path=/";
            document.cookie = "userAuth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
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
            try {
                if (userDropdownMenu) userDropdownMenu.style.display = 'none';
                if (adminModal) adminModal.style.display = 'none';
                document.cookie = "adminAuth=; max-age=0; path=/";
                document.cookie = "adminAuth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                document.cookie = "userAuth=; max-age=0; path=/";
                document.cookie = "userAuth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                if (window.firebaseService?.signOutGoogle) {
                    await window.firebaseService.signOutGoogle();
                }
            } catch (err) {
                console.error('[Firebase Auth] Sign out error:', err);
            }
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

            const dateStr = d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
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
    let currentAdminActiveConvId = null;
    let currentAdminActiveSupporter = null;

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
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' • ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    function formatRetentionUntilDate(isoDate) {
        if (!isoDate) {
            const d = new Date();
            d.setFullYear(d.getFullYear() + 7);
            return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
        }
        const d = new Date(isoDate);
        if (isNaN(d.getTime())) return '7 Years';
        return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
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
            const messages = data.messages || [];

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
                const isSentByMe = (msg.senderUid === uid) || (msg.senderRole === 'supporter');
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
    // Admin Supporter Chat Inbox (SuperAdmin Panel Tab)
    // =========================================================================
    const adminThreadsList = document.getElementById('adminThreadsList');
    const adminThreadCount = document.getElementById('adminThreadCount');
    const adminNoThreadSelected = document.getElementById('adminNoThreadSelected');
    const adminThreadConversationView = document.getElementById('adminThreadConversationView');
    const adminThreadAvatar = document.getElementById('adminThreadAvatar');
    const adminThreadUserName = document.getElementById('adminThreadUserName');
    const adminThreadUserEmail = document.getElementById('adminThreadUserEmail');
    const adminThreadFeed = document.getElementById('adminThreadFeed');
    const adminReplyForm = document.getElementById('adminReplyForm');
    const adminReplyInput = document.getElementById('adminReplyInput');
    const adminSendReplyBtn = document.getElementById('adminSendReplyBtn');
    const adminRefreshChatBtn = document.getElementById('adminRefreshChatBtn');

    async function loadAdminChatConversations() {
        if (!adminThreadsList) return;

        try {
            const currentUser = window.firebaseService?.getCurrentUser?.();
            const authParams = currentUser ? `?uid=${encodeURIComponent(currentUser.uid)}&email=${encodeURIComponent(currentUser.email || '')}` : '';
            const res = await fetch(`/api/chat/conversations${authParams}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const conversations = data.conversations || [];

            if (adminThreadCount) adminThreadCount.textContent = conversations.length;

            if (conversations.length === 0) {
                adminThreadsList.innerHTML = `
                    <div style="padding: 24px 12px; text-align: center; color: #94a3b8; font-size: 0.85rem;">
                        <i class="fa-solid fa-inbox" style="font-size: 1.8rem; color: #cbd5e1; margin-bottom: 8px; display: block;"></i>
                        No supporter messages yet.
                    </div>
                `;
                if (!currentAdminActiveConvId) {
                    if (adminNoThreadSelected) adminNoThreadSelected.style.display = 'flex';
                    if (adminThreadConversationView) adminThreadConversationView.style.display = 'none';
                }
                return;
            }

            adminThreadsList.innerHTML = conversations.map(c => {
                const isActive = c.conversationId === currentAdminActiveConvId;
                const activeClass = isActive ? 'admin-thread-item active' : 'admin-thread-item';
                const timeStr = formatChatTimestamp(c.lastMessageAt);
                const tenantTag = c.tag || 'aifoundation';

                return `
                    <div class="${activeClass}" data-conv-id="${escapeHtml(c.conversationId)}" data-supporter-uid="${escapeHtml(c.supporterUid)}" data-supporter-name="${escapeHtmlChat(c.supporterName)}" data-supporter-email="${escapeHtmlChat(c.supporterEmail)}" data-tenant-tag="${escapeHtmlChat(tenantTag)}">
                        <div class="admin-thread-top">
                            <span class="admin-thread-name">${escapeHtmlChat(c.supporterName)}</span>
                            <span class="admin-thread-time">${timeStr}</span>
                        </div>
                        <div class="admin-thread-email-row">
                            <span class="admin-thread-email">${escapeHtmlChat(c.supporterEmail)}</span>
                            <span class="tenant-badge tag-${escapeHtmlChat(tenantTag)}" title="Tenant: ${escapeHtmlChat(tenantTag)} (SuperAdmin only)">
                                <i class="fa-solid fa-tag"></i> ${escapeHtmlChat(tenantTag)}
                            </span>
                        </div>
                        <div class="admin-thread-preview">${escapeHtmlChat(c.lastMessage)}</div>
                    </div>
                `;
            }).join('');

            // Wire up click handlers on thread items
            adminThreadsList.querySelectorAll('.admin-thread-item').forEach(item => {
                item.addEventListener('click', () => {
                    const convId = item.dataset.convId;
                    const supporterUid = item.dataset.supporterUid;
                    const supporterName = item.dataset.supporterName;
                    const supporterEmail = item.dataset.supporterEmail;
                    const tag = item.dataset.tenantTag || 'aifoundation';

                    selectAdminThread(convId, { supporterUid, supporterName, supporterEmail, tag });
                });
            });

            // If an active thread is selected, refresh its messages
            if (currentAdminActiveConvId) {
                await loadAdminThreadMessages(currentAdminActiveConvId, true);
            }

        } catch (err) {
            console.warn('[Admin Chat Conversations] Notice:', err.message);
        }
    }

    async function selectAdminThread(convId, supporterInfo) {
        currentAdminActiveConvId = convId;
        currentAdminActiveSupporter = supporterInfo;

        // Highlight selected thread item
        if (adminThreadsList) {
            adminThreadsList.querySelectorAll('.admin-thread-item').forEach(el => {
                el.classList.toggle('active', el.dataset.convId === convId);
            });
        }

        if (adminNoThreadSelected) adminNoThreadSelected.style.display = 'none';
        if (adminThreadConversationView) adminThreadConversationView.style.display = 'flex';

        if (adminThreadUserName) adminThreadUserName.textContent = supporterInfo.supporterName || 'Supporter';
        if (adminThreadUserEmail) adminThreadUserEmail.textContent = supporterInfo.supporterEmail || '';

        // Display tenant badge in SuperAdmin thread header
        const headerBadge = document.getElementById('adminThreadTenantBadge');
        if (headerBadge) {
            const tag = supporterInfo.tag || 'aifoundation';
            headerBadge.innerHTML = `<i class="fa-solid fa-tag"></i> ${escapeHtmlChat(tag)}`;
            headerBadge.className = `tenant-badge tag-${escapeHtmlChat(tag)}`;
            headerBadge.style.display = 'inline-flex';
        }

        await loadAdminThreadMessages(convId);
    }

    async function loadAdminThreadMessages(convId, isBackground = false) {
        if (!convId || !adminThreadFeed) return;

        try {
            const currentUser = window.firebaseService?.getCurrentUser?.();
            const authParams = currentUser ? `&uid=${encodeURIComponent(currentUser.uid)}&email=${encodeURIComponent(currentUser.email || '')}` : '';
            const res = await fetch(`/api/chat/messages?conversationId=${encodeURIComponent(convId)}${authParams}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const messages = data.messages || [];

            adminThreadFeed.innerHTML = messages.map(msg => {
                const isAdminSender = msg.senderRole === 'super_admin' || msg.senderRole === 'admin';
                const rowClass = isAdminSender ? 'chat-message-row sent' : 'chat-message-row received';
                const senderTitle = isAdminSender ? 'SuperAdmin (You)' : (msg.senderName || 'Supporter');
                const avatarIcon = isAdminSender ? '<div class="chat-avatar-icon" style="background: #004ecc;"><i class="fa-solid fa-shield-halved"></i></div>' : '<div class="chat-avatar-icon"><i class="fa-solid fa-user"></i></div>';
                const retentionDateStr = formatRetentionUntilDate(msg.retainedUntil);
                const tag = msg.tag || (currentAdminActiveSupporter?.tag) || 'aifoundation';

                return `
                    <div class="${rowClass}">
                        ${avatarIcon}
                        <div class="chat-bubble">
                            <div class="chat-bubble-sender">
                                <span>${escapeHtml(senderTitle)}</span>
                                <span class="role-tag">${escapeHtml(msg.senderRole || (isAdminSender ? 'Admin' : 'Supporter'))}</span>
                                <span class="chat-tenant-tag-badge tag-${escapeHtmlChat(tag)}" title="Tenant Tag (SuperAdmin Only)">
                                    <i class="fa-solid fa-tag"></i> ${escapeHtmlChat(tag)}
                                </span>
                            </div>
                            <div class="chat-bubble-text">${renderMessageWithLinks(msg.userMessage)}</div>
                            <div class="chat-bubble-footer">
                                <span>${formatChatTimestamp(msg.createdAt || msg.timestamp)}</span>
                                <span class="retention-tag-mini">
                                    <i class="fa-solid fa-clock-rotate-left"></i> Retained 7 yrs (until ${retentionDateStr})
                                </span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Scroll feed to bottom
            adminThreadFeed.scrollTop = adminThreadFeed.scrollHeight;

        } catch (err) {
            console.warn('[Admin Thread Fetch Error]:', err.message);
        }
    }

    // SuperAdmin Reply Form Submission
    if (adminReplyForm) {
        adminReplyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentAdminActiveConvId || !currentAdminActiveSupporter) return;

            const replyText = (adminReplyInput?.value || '').trim();
            if (!replyText) return;

            const currentUser = window.firebaseService?.getCurrentUser?.();

            if (adminSendReplyBtn) {
                adminSendReplyBtn.disabled = true;
                adminSendReplyBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
            }

            try {
                const res = await fetch('/api/chat/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        senderUid: currentUser?.uid || 'superadmin',
                        senderEmail: currentUser?.email || 'support@aifoundation.net.au',
                        senderName: 'SuperAdmin',
                        senderRole: 'super_admin',
                        recipientUid: currentAdminActiveSupporter.supporterUid,
                        recipientEmail: currentAdminActiveSupporter.supporterEmail,
                        recipientName: currentAdminActiveSupporter.supporterName,
                        conversationId: currentAdminActiveConvId,
                        tag: currentAdminActiveSupporter.tag || 'aifoundation',
                        userMessage: replyText,
                        hasUploads: false
                    })
                });

                const data = await res.json();
                if (!res.ok || !data.success) {
                    throw new Error(data.error || 'Failed to send reply.');
                }

                if (adminReplyInput) adminReplyInput.value = '';
                await loadAdminThreadMessages(currentAdminActiveConvId);
                await loadAdminChatConversations();

            } catch (err) {
                alert('Could not send reply: ' + (err.message || 'Please try again.'));
            } finally {
                if (adminSendReplyBtn) {
                    adminSendReplyBtn.disabled = false;
                    adminSendReplyBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span>Reply</span>';
                }
            }
        });
    }

    if (adminRefreshChatBtn) {
        adminRefreshChatBtn.addEventListener('click', () => {
            loadAdminChatConversations();
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
        if (typeof d.toDate === 'function') return d.toDate().toLocaleDateString();
        if (d.seconds) return new Date(d.seconds * 1000).toLocaleDateString();
        const parsed = new Date(d);
        return isNaN(parsed.getTime()) ? 'Recent' : parsed.toLocaleDateString();
    }

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
                            <span>${new Date(post.date).toLocaleDateString()}</span>
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
                            <span>${new Date(post.date).toLocaleDateString()}</span>
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
                html += `<button onclick="changeProjectPage(-1)" style="background: white; color: var(--text-dark); border: 1px solid #e2e8f0; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: all 0.2s; display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-arrow-left"></i> PREV</button>`;
            }
            if (currentProjectPage < totalPages) {
                html += `<button onclick="changeProjectPage(1)" style="background: var(--primary); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600; box-shadow: 0 4px 12px rgba(0, 102, 255, 0.25); transition: all 0.2s; display: flex; align-items: center; gap: 8px;">MORE <i class="fa-solid fa-arrow-right"></i></button>`;
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
                html += `<button onclick="changePage(-1)" style="background: white; color: var(--text-dark); border: 1px solid #e2e8f0; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: all 0.2s; display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-arrow-left"></i> PREV</button>`;
            }
            if (currentPage < totalPages) {
                html += `<button onclick="changePage(1)" style="background: var(--primary); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600; box-shadow: 0 4px 12px rgba(0, 102, 255, 0.25); transition: all 0.2s; display: flex; align-items: center; gap: 8px;">MORE <i class="fa-solid fa-arrow-right"></i></button>`;
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
                    <button type="button" class="removeRowBtn" style="background: none; color: #ef4444; border: none; cursor: pointer; font-size: 1.3rem; padding: 4px 8px; line-height: 1;">&times;</button>
                </div>
                <input type="text" class="multiLinkInput" placeholder="Enter URL to scrape" style="margin-bottom: 8px;" />
                <button type="button" class="multiExtractBtn" style="background: #0f172a; color: white; padding: 12px; border-radius: 8px; font-weight: bold; width: 100%; border: none; cursor: pointer;">Extract Metadata</button>
                
                <div class="multiPreviewCard" style="margin-top: 14px; padding-top: 14px; border-top: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; gap: 14px; align-items: center; flex-wrap: wrap;">
                        <img class="multiImagePreview" src="" style="width: 72px; height: 72px; object-fit: cover; border-radius: 8px; border: 1px solid #e2e8f0; flex-shrink: 0;" />
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            <label style="background: #0284c7; color: white; padding: 7px 14px; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; width: fit-content;">
                                <i class="fa-solid fa-cloud-arrow-up"></i> Upload to ImgBB
                                <input type="file" class="multiFileImgbb" accept="image/*" style="display: none;" />
                            </label>
                            <span class="multiImgbbStatus" style="font-size: 0.8rem; color: #64748b;">Direct ImgBB Host</span>
                        </div>
                    </div>
                    <input type="text" class="multiImageUrl" placeholder="Image URL (ImgBB / Web)" required style="width: 100%; box-sizing: border-box;"/>
                    <input type="text" class="multiPostTitle" placeholder="Title" required style="width: 100%; box-sizing: border-box;"/>
                    <textarea class="multiPostSummary" placeholder="Summary" style="width: 100%; box-sizing: border-box; min-height: 80px;"></textarea>
                    <input type="text" class="multiPostPlatform" placeholder="Platform" required style="width: 100%; box-sizing: border-box;"/>
                    <input type="text" class="multiPostLink" placeholder="Final Link URL" required style="width: 100%; box-sizing: border-box;"/>
                </div>
            </div>
        `;

        const extractBtn = row.querySelector('.multiExtractBtn');
        extractBtn.addEventListener('click', async () => {
            const url = row.querySelector('.multiLinkInput').value.trim();
            if (!url) return alert('Enter a link');
            
            extractBtn.innerHTML = 'Extracting...';
            try {
                const res = await fetch('/api/extract-metadata', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                });
                const data = await res.json();
                
                row.querySelector('.multiPostTitle').value = data.title || '';
                row.querySelector('.multiPostSummary').value = data.summary || '';
                row.querySelector('.multiPostPlatform').value = data.platform || '';
                row.querySelector('.multiPostLink').value = data.link || '';
                const img = data.imageUrl || 'assets/logo.png';
                row.querySelector('.multiImagePreview').src = img;
                row.querySelector('.multiImageUrl').value = img;
                
                row.querySelector('.multiPreviewCard').style.display = 'flex';
                extractBtn.innerHTML = 'Metadata Extracted';
                extractBtn.style.background = '#10b981';
            } catch (err) {
                alert('Failed to extract');
                extractBtn.innerHTML = 'Extract Metadata';
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
                        <span style="font-size:0.8rem; color:#94a3b8;">• ${item.date ? new Date(item.date).toLocaleDateString() : 'Recent'}</span>
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

    function activateSection(targetId) {
        sidebarItems.forEach(nav => {
            if (nav.getAttribute('data-target') === targetId) {
                nav.classList.add('active');
            } else {
                nav.classList.remove('active');
            }
        });

        contentSections.forEach(section => section.style.display = 'none');

        const targetSection = document.getElementById(targetId);
        if (targetSection) {
            targetSection.style.display = (targetId === 'section-overview' || targetId === 'section-projects' || targetId === 'section-services') ? 'flex' : 'block';
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
        } else if (hash === 'services') {
            targetId = 'section-services';
        } else if (hash === 'education' || hash === 'classroom') {
            targetId = 'section-education';
        } else if (hash === 'david' || hash === 'contact') {
            targetId = 'section-david';
        } else if (hash === 'articles' || hash === 'overview') {
            targetId = 'section-overview';
        }

        if (targetId) {
            activateSection(targetId);
            if (hash) {
                setTimeout(scrollToContentOnMobile, 120);
            }
        }
    }

    window.addEventListener('hashchange', handleHash);
    handleHash();

    document.getElementById('contactForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const firstName = document.getElementById('contactFirstName').value;
        const lastName = document.getElementById('contactLastName').value;
        const subject = document.getElementById('contactSubject').value;
        const message = document.getElementById('contactMessage').value;

        const mailtoSubject = encodeURIComponent(subject);
        const mailtoBody = encodeURIComponent(`From: ${firstName} ${lastName}\n\n${message}`);

        window.location.href = `mailto:support@aifoundation.net.au?subject=${mailtoSubject}&body=${mailtoBody}`;
    });

    // ==========================================
    // Donation & Payment Bar + Foreground Popup Modal Logic
    // ==========================================
    let selectedDonationAmount = 50;
    const amountInput = document.getElementById('donationAmountInput') || document.getElementById('donationCustomAmount');
    const payStripeBtn = document.getElementById('payWithStripeBtn');
    const payPayPalBtn = document.getElementById('payWithPayPalBtn');
    const statusMsg = document.getElementById('donationStatusMsg');

    // Modal elements
    const paymentModal = document.getElementById('paymentPopupModal');
    const closePaymentModalBtn = document.getElementById('closePaymentModalBtn');
    const closeSuccessModalBtn = document.getElementById('closeSuccessModalBtn');
    const popupSelectedAmount = document.getElementById('popupSelectedAmount');
    const tabStripeBtn = document.getElementById('tabStripeBtn');
    const tabPayPalBtn = document.getElementById('tabPayPalBtn');
    const stripeMethodView = document.getElementById('stripeMethodView');
    const paypalMethodView = document.getElementById('paypalMethodView');
    const paymentSuccessView = document.getElementById('paymentSuccessView');
    const stripePaymentForm = document.getElementById('stripePaymentForm');
    const stripeLoadingIndicator = document.getElementById('stripeLoadingIndicator');
    const stripePaymentError = document.getElementById('stripePaymentError');
    const stripeSubmitBtn = document.getElementById('stripeSubmitBtn');
    const stripeSubmitText = document.getElementById('stripeSubmitText');
    const paypalLoadingIndicator = document.getElementById('paypalLoadingIndicator');
    const paypalButtonsContainer = document.getElementById('paypalButtonsContainer');
    const paypalPaymentError = document.getElementById('paypalPaymentError');

    let stripeClient = null;
    let stripeElements = null;
    let stripePaymentElementInstance = null;
    let currentLoadedStripeAmount = null;
    let currentLoadedPayPalAmount = null;
    let currentPaymentIntentId = null;

    async function syncTransactionSuccess(txId, provider, amt) {
        try {
            const currentUser = window.firebaseService?.getCurrentUser?.();
            const payload = {
                transactionId: txId || `tx_${Date.now()}`,
                status: 'succeeded',
                paymentMethod: provider || 'stripe',
                tag: 'aifoundation',
                businessId: 'aifoundation',
                amount: amt ? Number(amt) : (selectedDonationAmount || 50),
                customerEmail: currentUser?.email || '',
                customerName: currentUser?.displayName || '',
                userId: currentUser?.uid || ''
            };
            if (window.firebaseService?.recordTransaction) {
                await window.firebaseService.recordTransaction(payload);
            } else {
                await fetch('/api/transactions/confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
            console.log(`[Firebase] Transaction ${payload.transactionId} synced with tag: ${payload.tag}`);
        } catch (e) {
            console.warn('[Firebase Sync] Transaction sync note:', e);
        }
    }

    function setDonationStatus(msg, isError = false) {
        if (!statusMsg) return;
        statusMsg.style.display = 'block';
        statusMsg.style.color = isError ? '#ef4444' : '#059669';
        statusMsg.innerHTML = msg;
    }

    if (amountInput) {
        amountInput.addEventListener('input', function() {
            const cleanVal = this.value.replace(/\D/g, '');
            this.value = cleanVal;
            const parsed = parseInt(cleanVal, 10);
            if (parsed >= 50) {
                selectedDonationAmount = parsed;
                if (statusMsg) statusMsg.style.display = 'none';
            }
            const pInput = document.getElementById('panelDonationAmountInput') || document.getElementById('panelDonationCustomAmount');
            if (pInput && pInput !== this) {
                pInput.value = this.value;
            }
        });
        amountInput.addEventListener('blur', function() {
            const cleanVal = this.value.replace(/\D/g, '');
            const parsed = parseInt(cleanVal, 10);
            if (!parsed || parsed < 50) {
                this.value = '50';
                selectedDonationAmount = 50;
                const pInput = document.getElementById('panelDonationAmountInput') || document.getElementById('panelDonationCustomAmount');
                if (pInput) pInput.value = '50';
            } else {
                selectedDonationAmount = parsed;
            }
        });
    }

    // Preset amount buttons ($50 / $100 / $200) - drive the input so existing handlers keep both bars in sync
    const presetBtns = document.querySelectorAll('.donation-preset-btn');
    function syncPresetButtons(value) {
        presetBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.amount === String(value)));
    }
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.closest('.donation-bar-controls')?.querySelector('.donation-amount-input');
            if (!input) return;
            input.value = btn.dataset.amount;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    });
    document.querySelectorAll('.donation-amount-input').forEach(input => {
        input.addEventListener('input', () => syncPresetButtons(input.value));
        input.addEventListener('blur', () => syncPresetButtons(input.value));
    });

    // Modal Control Functions
    function openPaymentModal(method = 'stripe') {
        if (!paymentModal) return;
        if (!selectedDonationAmount || selectedDonationAmount < 50) {
            selectedDonationAmount = 50;
            const mInput = document.getElementById('donationAmountInput') || document.getElementById('donationCustomAmount');
            if (mInput) mInput.value = '50';
            const pInput = document.getElementById('panelDonationAmountInput') || document.getElementById('panelDonationCustomAmount');
            if (pInput) pInput.value = '50';
        }

        if (popupSelectedAmount) popupSelectedAmount.textContent = `AUD $${selectedDonationAmount}`;
        if (stripeSubmitText) stripeSubmitText.textContent = `Pay AUD $${selectedDonationAmount} Securely`;
        
        // Reset Views
        if (paymentSuccessView) paymentSuccessView.style.display = 'none';
        if (tabStripeBtn && tabStripeBtn.parentElement) {
            tabStripeBtn.parentElement.style.display = 'flex';
        }
        paymentModal.style.display = 'flex';

        switchPaymentTab(method);
    }

    function closePaymentModal() {
        if (!paymentModal) return;
        paymentModal.style.display = 'none';
    }

    if (closePaymentModalBtn) closePaymentModalBtn.addEventListener('click', closePaymentModal);
    if (closeSuccessModalBtn) closeSuccessModalBtn.addEventListener('click', closePaymentModal);
    if (paymentModal) {
        paymentModal.addEventListener('click', (e) => {
            if (e.target === paymentModal) closePaymentModal();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && paymentModal && paymentModal.style.display === 'flex') {
            closePaymentModal();
        }
    });

    function switchPaymentTab(targetMethod = 'stripe') {
        if (targetMethod === 'stripe' || !paypalMethodView) {
            if (tabStripeBtn) tabStripeBtn.classList.add('active');
            if (tabPayPalBtn) tabPayPalBtn.classList.remove('active');
            if (stripeMethodView) stripeMethodView.style.display = 'block';
            if (paypalMethodView) paypalMethodView.style.display = 'none';
            initStripeForm();
        } else {
            if (tabPayPalBtn) tabPayPalBtn.classList.add('active');
            if (tabStripeBtn) tabStripeBtn.classList.remove('active');
            if (paypalMethodView) paypalMethodView.style.display = 'block';
            if (stripeMethodView) stripeMethodView.style.display = 'none';
            initPayPalButtons();
        }
    }

    if (tabStripeBtn) tabStripeBtn.addEventListener('click', () => switchPaymentTab('stripe'));
    if (tabPayPalBtn) tabPayPalBtn.addEventListener('click', () => switchPaymentTab('paypal'));

    // Initialize Stripe Form in Modal
    async function initStripeForm() {
        const fallbackView = document.getElementById('stripeFallbackView');

        if (currentLoadedStripeAmount === selectedDonationAmount && stripeElements && stripePaymentElementInstance) {
            if (stripeLoadingIndicator) stripeLoadingIndicator.style.display = 'none';
            if (stripePaymentForm) stripePaymentForm.style.display = 'block';
            if (stripeSubmitBtn) stripeSubmitBtn.style.display = 'block';
            if (fallbackView) fallbackView.style.display = 'none';
            return; // Already initialized for this amount
        }

        if (stripePaymentElementInstance) {
            try {
                stripePaymentElementInstance.unmount();
                stripePaymentElementInstance.destroy();
            } catch (e) {
                console.warn('Stripe element unmount error:', e);
            }
            stripePaymentElementInstance = null;
            stripeElements = null;
        }

        if (stripeLoadingIndicator) stripeLoadingIndicator.style.display = 'block';
        if (stripeSubmitBtn) stripeSubmitBtn.style.display = 'none';
        if (stripePaymentForm) stripePaymentForm.style.display = 'block';
        if (fallbackView) fallbackView.style.display = 'none';
        if (stripePaymentError) stripePaymentError.style.display = 'none';

        let readyHandled = false;
        let readyTimeout = null;

        try {
            const res = await fetch('/api/stripe/create-payment-intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: selectedDonationAmount })
            });
            const data = await res.json();
            if (!res.ok || !data.clientSecret) {
                throw new Error(data.error || 'Failed to start Stripe session');
            }
            currentPaymentIntentId = data.paymentIntentId || null;

            if (!stripeClient && window.Stripe) {
                stripeClient = window.Stripe(data.publishableKey);
            }

            if (!stripeClient) {
                throw new Error('Stripe JS library could not be loaded.');
            }

            stripeElements = stripeClient.elements({
                clientSecret: data.clientSecret,
                appearance: {
                    theme: 'flat',
                    variables: {
                        colorPrimary: '#635bff',
                        colorBackground: '#ffffff',
                        colorText: '#0f172a',
                        borderRadius: '12px'
                    }
                }
            });

            stripePaymentElementInstance = stripeElements.create('payment');
            const container = document.getElementById('stripePaymentElement');
            if (container) container.innerHTML = '';
            stripePaymentElementInstance.mount('#stripePaymentElement');

            // Safety timeout: Ensure user is never stuck in an infinite loading pattern
            readyTimeout = setTimeout(() => {
                if (!readyHandled) {
                    if (stripeLoadingIndicator) stripeLoadingIndicator.style.display = 'none';
                    if (stripeSubmitBtn) stripeSubmitBtn.style.display = 'block';
                    currentLoadedStripeAmount = selectedDonationAmount;
                }
            }, 3000);

            stripePaymentElementInstance.on('ready', () => {
                readyHandled = true;
                if (readyTimeout) clearTimeout(readyTimeout);
                if (stripeLoadingIndicator) stripeLoadingIndicator.style.display = 'none';
                if (stripePaymentForm) stripePaymentForm.style.display = 'block';
                if (stripeSubmitBtn) stripeSubmitBtn.style.display = 'block';
                currentLoadedStripeAmount = selectedDonationAmount;
            });

            stripePaymentElementInstance.on('loaderror', (event) => {
                readyHandled = true;
                if (readyTimeout) clearTimeout(readyTimeout);
                if (stripeLoadingIndicator) stripeLoadingIndicator.style.display = 'none';
                if (stripePaymentError) {
                    stripePaymentError.textContent = (event && event.error && event.error.message) || 'Unable to load card element. You can checkout directly via Stripe below.';
                    stripePaymentError.style.display = 'block';
                }
                if (fallbackView) fallbackView.style.display = 'block';
            });
        } catch (err) {
            if (readyTimeout) clearTimeout(readyTimeout);
            if (stripeLoadingIndicator) stripeLoadingIndicator.style.display = 'none';
            if (stripePaymentError) {
                stripePaymentError.textContent = err.message || 'Error loading Stripe checkout.';
                stripePaymentError.style.display = 'block';
            }
            if (fallbackView) fallbackView.style.display = 'block';
        }
    }

    // Direct Stripe Hosted Checkout Redirect
    async function redirectToStripeCheckout() {
        const directBtn = document.getElementById('stripeDirectLinkBtn');
        const fallbackBtn = document.getElementById('stripeFallbackBtn');
        const origDirect = directBtn ? directBtn.innerHTML : '';
        const origFallback = fallbackBtn ? fallbackBtn.innerHTML : '';

        if (directBtn) directBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Connecting to Stripe...';
        if (fallbackBtn) fallbackBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Connecting to Stripe...';

        try {
            const res = await fetch('/api/stripe/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: selectedDonationAmount,
                    returnPath: window.location.pathname
                })
            });
            const data = await res.json();
            if (!res.ok || !data.url) {
                throw new Error(data.error || 'Failed to create Stripe Checkout session');
            }
            window.location.href = data.url;
        } catch (err) {
            if (directBtn) directBtn.innerHTML = origDirect;
            if (fallbackBtn) fallbackBtn.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i> Continue to Stripe Checkout';
            if (stripePaymentError) {
                stripePaymentError.textContent = err.message || 'Failed to connect to Stripe checkout.';
                stripePaymentError.style.display = 'block';
            }
        }
    }

    // Stripe Submit Form
    if (stripePaymentForm) {
        stripePaymentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!stripeClient || !stripeElements) return;

            stripeSubmitBtn.disabled = true;
            const originalText = stripeSubmitText.innerHTML;
            stripeSubmitText.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...';
            if (stripePaymentError) stripePaymentError.style.display = 'none';

            try {
                const returnUrl = `${window.location.origin}${window.location.pathname}?donation=stripe_success&amt=${selectedDonationAmount}`;
                const { error, paymentIntent } = await stripeClient.confirmPayment({
                    elements: stripeElements,
                    confirmParams: {
                        return_url: returnUrl
                    },
                    redirect: 'if_required'
                });

                if (error) {
                    if (stripePaymentError) {
                        stripePaymentError.textContent = error.message;
                        stripePaymentError.style.display = 'block';
                    }
                    stripeSubmitBtn.disabled = false;
                    stripeSubmitText.innerHTML = originalText;
                } else if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
                    syncTransactionSuccess(paymentIntent.id || currentPaymentIntentId, 'stripe', selectedDonationAmount);
                    showPaymentSuccess(`AUD $${selectedDonationAmount}`, 'Card / Stripe');
                } else {
                    syncTransactionSuccess(paymentIntent?.id || currentPaymentIntentId, 'stripe', selectedDonationAmount);
                    showPaymentSuccess(`AUD $${selectedDonationAmount}`, 'Stripe');
                }
            } catch (err) {
                if (stripePaymentError) {
                    stripePaymentError.textContent = err.message || 'Payment processing failed.';
                    stripePaymentError.style.display = 'block';
                }
                stripeSubmitBtn.disabled = false;
                stripeSubmitText.innerHTML = originalText;
            }
        });
    }

    document.getElementById('stripeDirectLinkBtn')?.addEventListener('click', redirectToStripeCheckout);
    document.getElementById('stripeFallbackBtn')?.addEventListener('click', redirectToStripeCheckout);

    // Initialize PayPal Buttons in Modal
    function initPayPalButtons() {
        if (currentLoadedPayPalAmount === selectedDonationAmount && paypalButtonsContainer.children.length > 0) {
            return;
        }

        paypalButtonsContainer.innerHTML = '';
        paypalLoadingIndicator.style.display = 'block';
        if (paypalPaymentError) paypalPaymentError.style.display = 'none';

        if (!window.paypal || !window.paypal.Buttons) {
            paypalLoadingIndicator.style.display = 'none';
            if (paypalPaymentError) {
                paypalPaymentError.textContent = 'PayPal SDK could not be loaded.';
                paypalPaymentError.style.display = 'block';
            }
            return;
        }

        try {
            window.paypal.Buttons({
                style: {
                    layout: 'vertical',
                    color: 'gold',
                    shape: 'rect',
                    borderRadius: 12,
                    label: 'donate'
                },
                createOrder: async () => {
                    const res = await fetch('/api/paypal/create-order', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount: selectedDonationAmount })
                    });
                    const data = await res.json();
                    if (!res.ok || !data.orderId) {
                        throw new Error(data.error || 'Failed to create PayPal order');
                    }
                    return data.orderId;
                },
                onApprove: async (data) => {
                    try {
                        const captureRes = await fetch(`/api/paypal/capture-order/${data.orderID}`, {
                            method: 'POST'
                        });
                        const captureData = await captureRes.json();
                        syncTransactionSuccess(data.orderID, 'paypal', selectedDonationAmount);
                        showPaymentSuccess(`AUD $${selectedDonationAmount}`, 'PayPal');
                    } catch (err) {
                        syncTransactionSuccess(data.orderID, 'paypal', selectedDonationAmount);
                        showPaymentSuccess(`AUD $${selectedDonationAmount}`, 'PayPal');
                    }
                },
                onError: (err) => {
                    if (paypalPaymentError) {
                        paypalPaymentError.textContent = 'PayPal encountered an error. Please try again.';
                        paypalPaymentError.style.display = 'block';
                    }
                }
            }).render('#paypalButtonsContainer').then(() => {
                paypalLoadingIndicator.style.display = 'none';
                currentLoadedPayPalAmount = selectedDonationAmount;
            });
        } catch (err) {
            paypalLoadingIndicator.style.display = 'none';
            if (paypalPaymentError) {
                paypalPaymentError.textContent = err.message || 'Error rendering PayPal buttons.';
                paypalPaymentError.style.display = 'block';
            }
        }
    }

    function showPaymentSuccess(amountStr, provider) {
        stripeMethodView.style.display = 'none';
        paypalMethodView.style.display = 'none';
        tabStripeBtn.parentElement.style.display = 'none';
        paymentSuccessView.style.display = 'block';

        const successMsg = document.getElementById('paymentSuccessMsg');
        if (successMsg) {
            successMsg.innerHTML = `Your contribution of <strong>${escapeHtml(amountStr)}</strong> via ${escapeHtml(provider)} was successful!<br>Your support powers open AI tools, educational equity, and community learning across Australia.`;
        }
    }

    // Attach click events on the bottom footer bar buttons to trigger the popup
    if (payStripeBtn) {
        payStripeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const input = document.getElementById('donationAmountInput') || document.getElementById('donationCustomAmount');
            const cleanVal = input ? input.value.replace(/\D/g, '') : '';
            const parsed = parseInt(cleanVal, 10);
            if (!parsed || parsed < 50) {
                if (input) {
                    input.value = '50';
                    input.focus();
                }
                selectedDonationAmount = 50;
                setDonationStatus('<i class="fa-solid fa-circle-exclamation"></i> Minimum donation amount is AUD $50.', true);
                setTimeout(() => { if (statusMsg) statusMsg.style.display = 'none'; }, 4000);
                return;
            }
            selectedDonationAmount = parsed;
            if (statusMsg) statusMsg.style.display = 'none';
            openPaymentModal('stripe');
        });
    }
    if (payPayPalBtn) {
        payPayPalBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const input = document.getElementById('donationAmountInput') || document.getElementById('donationCustomAmount');
            const cleanVal = input ? input.value.replace(/\D/g, '') : '';
            const parsed = parseInt(cleanVal, 10);
            if (!parsed || parsed < 50) {
                if (input) {
                    input.value = '50';
                    input.focus();
                }
                selectedDonationAmount = 50;
                setDonationStatus('<i class="fa-solid fa-circle-exclamation"></i> Minimum donation amount is AUD $50.', true);
                setTimeout(() => { if (statusMsg) statusMsg.style.display = 'none'; }, 4000);
                return;
            }
            selectedDonationAmount = parsed;
            if (statusMsg) statusMsg.style.display = 'none';
            openPaymentModal('paypal');
        });
    }

    // Check for Return URLs (Success / Cancel)
    const urlParams = new URLSearchParams(window.location.search);
    const donationStatus = urlParams.get('donation');
    // Only accept a whole-number amount from the return URL
    const donatedAmt = /^\d{1,7}$/.test(urlParams.get('amt') || '') ? urlParams.get('amt') : null;

    const sessionId = urlParams.get('session_id');

    if (donationStatus === 'stripe_success' || donationStatus === 'paypal_success' || donationStatus === 'success') {
        const amtStr = donatedAmt ? ` of AUD $${donatedAmt}` : '';
        const providerStr = donationStatus === 'paypal_success' ? 'PayPal' : 'Stripe';
        if (sessionId) {
            syncTransactionSuccess(sessionId, 'stripe', donatedAmt);
        }
        openPaymentModal('stripe');
        showPaymentSuccess(amtStr || 'your donation', providerStr);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (donationStatus === 'cancelled') {
        setDonationStatus('Payment was cancelled. You can try again at any time.', true);
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    loadPosts();
    loadProjects();
    loadCommunityPosts();
    loadTechPosts();
});