document.addEventListener('DOMContentLoaded', () => {
    const adminToggleBtn = document.getElementById('adminToggleBtn');
    const closeAdminBtn = document.getElementById('closeAdminBtn');
    const adminModal = document.getElementById('adminModal');
    const postsGrid = document.getElementById('postsGrid');
    const linkInput = document.getElementById('linkInput');
    const extractBtn = document.getElementById('extractBtn');
    const previewCard = document.getElementById('previewCard');

    let allPosts = [];
    let currentFilter = 'all';
    let allCommunityPosts = [];
    let allTechPosts = [];

// IntersectionObserver to trigger fade‑in animation for post cards
const postObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      postObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

    function truncateSummary(text) {
        if (!text) return '';
        const words = text.split(/\s+/);
        if (words.length > 30) {
            return words.slice(0, 30).join(' ') + '...';
        }
        return text;
    }

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    }

    adminToggleBtn.addEventListener('click', () => {
        adminModal.style.display = 'flex';
        
        if (getCookie('adminAuth') === 'true') {
            document.getElementById('adminLoginView').style.display = 'none';
            document.getElementById('adminPanelView').style.display = 'block';
            renderAdminPosts();
        } else {
            document.getElementById('adminPanelView').style.display = 'none';
            document.getElementById('adminLoginView').style.display = 'block';
        }
    });

    document.getElementById('adminLoginBtn').addEventListener('click', () => {
        const code1 = document.getElementById('accessCode1').value.replace(/\D/g, '');
        const code2 = document.getElementById('accessCode2').value.replace(/\D/g, '');
        const errorMsg = document.getElementById('adminLoginError');

        if (code1 === '0495019791' && code2 === '19011979') {
            // Set cookie for 365 days
            document.cookie = "adminAuth=true; max-age=" + (365 * 24 * 60 * 60) + "; path=/";
            errorMsg.style.display = 'none';
            document.getElementById('adminLoginView').style.display = 'none';
            document.getElementById('adminPanelView').style.display = 'block';
            renderAdminPosts();
        } else {
            errorMsg.style.display = 'block';
        }
    });

    closeAdminBtn.addEventListener('click', () => adminModal.style.display = 'none');

    // Admin Tab Switching
    const adminTabs = document.querySelectorAll('#adminTabs .sidebar-item');
    const adminTabContents = document.querySelectorAll('.admin-tab-content');
    adminTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            adminTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-target');
            adminTabContents.forEach(content => {
                content.style.display = content.id === targetId ? 'block' : 'none';
            });
        });
    });

    // Community Posts Logic
    async function loadCommunityPosts() {
        const res = await fetch('/api/community');
        allCommunityPosts = await res.json();
        renderCommunityPosts();
        renderAdminCommunityPosts();
    }

    function renderCommunityPosts() {
        const grid = document.getElementById('communityPostsGrid');
        if (!grid) return;
        grid.innerHTML = allCommunityPosts.map(post => `
            <article class="post-card">
                <div class="post-image-box">
                    <img src="${post.imageUrl || 'assets/logo.png'}" class="post-image" onerror="this.src='assets/logo.png'">
                    <span class="platform-badge platform-linkedin" style="background: var(--primary);">COMMUNITY</span>
                </div>
                <div class="post-content">
                    <h3 class="post-title">${post.title}</h3>
                    <p class="post-summary">${truncateSummary(post.summary)}</p>
                    <div class="post-footer">
                        <span>${new Date(post.date).toLocaleDateString()}</span>
                        ${post.link ? `<a href="${post.link}" target="_blank">View Post ↗</a>` : ''}
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
                <span><strong>${p.title}</strong></span>
                <button onclick="deleteCommunityPost('${p.id}')" style="background:#ef4444; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer;">Delete</button>
            </div>
        `).join('');
    }

    window.deleteCommunityPost = async (id) => {
        await fetch('/api/community/' + id, { method: 'DELETE' });
        loadCommunityPosts();
    };

    // Tech Posts Logic
    async function loadTechPosts() {
        const res = await fetch('/api/tech');
        allTechPosts = await res.json();
        renderTechPosts();
        renderAdminTechPosts();
    }

    function renderTechPosts() {
        const grid = document.getElementById('techPostsGrid');
        if (!grid) return;
        grid.innerHTML = allTechPosts.map(post => `
            <article class="post-card">
                <div class="post-image-box">
                    <img src="${post.imageUrl || 'assets/logo.png'}" class="post-image" onerror="this.src='assets/logo.png'">
                    <span class="platform-badge platform-linkedin" style="background: var(--primary);">TECH R&D</span>
                </div>
                <div class="post-content">
                    <h3 class="post-title">${post.title}</h3>
                    <p class="post-summary">${truncateSummary(post.summary)}</p>
                    <div class="post-footer">
                        <span>${new Date(post.date).toLocaleDateString()}</span>
                        ${post.link ? `<a href="${post.link}" target="_blank">View Post ↗</a>` : ''}
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
                <span><strong>${p.title}</strong></span>
                <button onclick="deleteTechPost('${p.id}')" style="background:#ef4444; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer;">Delete</button>
            </div>
        `).join('');
    }

    window.deleteTechPost = async (id) => {
        await fetch('/api/tech/' + id, { method: 'DELETE' });
        loadTechPosts();
    };


    document.querySelectorAll('.sample-chip').forEach(chip => {
        chip.addEventListener('click', () => linkInput.value = chip.dataset.url);
    });

    async function loadPosts() {
        const res = await fetch('/api/posts');
        allPosts = await res.json();
        renderPosts();
    }

    function renderPosts() {
        const filtered = currentFilter === 'all' ? allPosts : allPosts.filter(p => p.platform === currentFilter);
        postsGrid.innerHTML = filtered.map(post => `
            <article class="post-card">
                <div class="post-image-box">
                    <img src="${post.imageUrl || 'assets/logo.png'}" class="post-image" onerror="this.src='assets/logo.png'">
                    <span class="platform-badge platform-${post.platform}">${post.platform.toUpperCase()}</span>
                </div>
                <div class="post-content">
                    <h3 class="post-title">${post.title}</h3>
                    <p class="post-summary">${truncateSummary(post.summary)}</p>
                    <div class="post-footer">
                        <span>${new Date(post.date).toLocaleDateString()}</span>
                        <a href="${post.link}" target="_blank">View Post ↗</a>
                    </div>
                </div>
            </article>
        `).join('');
    // Observe newly added post cards for fade‑in animation
    document.querySelectorAll('.post-card').forEach(card => postObserver.observe(card));
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderPosts();
        });
    });

    extractBtn.addEventListener('click', async () => {
        const url = linkInput.value.trim();
        if (!url) return alert('Enter a link');

        extractBtn.innerHTML = 'Extracting...';
        const res = await fetch('/api/extract-metadata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await res.json();

        document.getElementById('postTitle').value = data.title;
        document.getElementById('postSummary').value = data.summary;
        document.getElementById('postPlatform').value = data.platform;
        document.getElementById('postLink').value = data.link;

        const img = data.imageUrl || 'assets/logo.png';
        document.getElementById('imagePreview').src = img;
        document.getElementById('finalImageUrl').value = img;
        document.getElementById('imgbbStatus').textContent = data.imageUrl ? 'Image linked directly' : 'No image found';
        
        document.getElementById('previewCard').style.display = 'block';
        extractBtn.innerHTML = 'Extract Metadata';
    });

    document.getElementById('createPostForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const category = document.getElementById('postCategory').value;
        const endpoints = {
            'articles': '/api/posts',
            'tech': '/api/tech',
            'community': '/api/community'
        };
        const endpoint = endpoints[category];

        await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: document.getElementById('postTitle').value,
                summary: document.getElementById('postSummary').value,
                platform: document.getElementById('postPlatform').value,
                link: document.getElementById('postLink').value,
                imageUrl: document.getElementById('finalImageUrl').value
            })
        });
        alert(`Published update to ${category}!`);
        previewCard.style.display = 'none';
        
        if (category === 'articles') loadPosts();
        if (category === 'tech') loadTechPosts();
        if (category === 'community') loadCommunityPosts();
    });

    function renderAdminPosts() {
        document.getElementById('adminPostsList').innerHTML = allPosts.map(p => `
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; background:white; padding:8px; border-radius:6px;">
                <span><strong>${p.title}</strong> (${p.platform})</span>
                <button onclick="deletePost('${p.id}')">Delete</button>
            </div>
        `).join('');
    }

    window.deletePost = async (id) => {
        await fetch('/api/posts/' + id, { method: 'DELETE' });
        loadPosts();
        renderAdminPosts();
    };

    // Sidebar Navigation Logic
    const sidebarItems = document.querySelectorAll('#sidebarNav .sidebar-item');
    const contentSections = document.querySelectorAll('.content-section');

    sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            sidebarItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            contentSections.forEach(section => section.style.display = 'none');

            const targetId = item.getAttribute('data-target');
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.style.display = targetId === 'section-overview' ? 'flex' : 'block';
            }
        });
    });

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

    document.getElementById('manageCategory')?.addEventListener('change', (e) => {
        const cat = e.target.value;
        document.getElementById('manage-articles-view').style.display = cat === 'articles' ? 'block' : 'none';
        document.getElementById('manage-tech-view').style.display = cat === 'tech' ? 'block' : 'none';
        document.getElementById('manage-community-view').style.display = cat === 'community' ? 'block' : 'none';
    });

    loadPosts();
    loadCommunityPosts();
    loadTechPosts();
});