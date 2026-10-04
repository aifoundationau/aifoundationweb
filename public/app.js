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

    document.getElementById('finalImageUrl')?.addEventListener('input', (e) => {
        const url = e.target.value.trim();
        if (url) {
            document.getElementById('imagePreview').src = url;
            document.getElementById('imgbbStatus').textContent = 'Custom image URL set';
        }
    });

    async function loadPosts() {
        const res = await fetch('/api/posts');
        allPosts = await res.json();
        renderPosts();
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
            <div class="admin-form" style="margin-bottom: 24px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px; position: relative;">
                <div style="display: flex; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                    <h4 style="margin: 0;">Link Entry</h4>
                    <button type="button" class="removeRowBtn" style="background: none; color: #ef4444; border: none; cursor: pointer; font-size: 1.2rem;">&times;</button>
                </div>
                <input type="text" class="multiLinkInput" placeholder="Enter URL to scrape" style="margin-bottom: 8px;" />
                <button type="button" class="multiExtractBtn" style="background: #0f172a; color: white; padding: 10px; border-radius: 8px; font-weight: bold; width: 100%; border: none; cursor: pointer;">Extract Metadata</button>
                
                <div class="multiPreviewCard" style="display: none; margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; gap: 16px; align-items: center;">
                        <img class="multiImagePreview" src="" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px;" />
                        <span style="font-size: 0.85rem; color: #64748b;">Ready...</span>
                    </div>
                    <input type="text" class="multiImageUrl" placeholder="Image URL" required style="width: 100%; box-sizing: border-box;"/>
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
        btn.innerHTML = 'Publishing...';
        
        let successCount = 0;
        for (const row of rows) {
            const title = row.querySelector('.multiPostTitle')?.value;
            const link = row.querySelector('.multiPostLink')?.value;
            if (!title || !link || row.querySelector('.multiPreviewCard').style.display === 'none') continue; 
            
            const payload = {
                title,
                summary: row.querySelector('.multiPostSummary').value,
                link,
                imageUrl: row.querySelector('.multiImageUrl').value,
                platform: row.querySelector('.multiPostPlatform').value,
                author: 'Admin'
            };
            
            const endpoints = {
                'articles': '/api/posts',
                'tech': '/api/tech',
                'community': '/api/community'
            };
            const endpoint = endpoints[category];

            await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            successCount++;
        }
        
        btn.innerHTML = 'Publish All Posts';
        alert(`Published ${successCount} post(s)!`);
        document.getElementById('multiLinksContainer').innerHTML = '';
        createLinkRow(); 
        
        if (category === 'articles') loadPosts();
        if (category === 'tech') loadTechPosts();
        if (category === 'community') loadCommunityPosts();
        
        const adminModal = document.getElementById('adminModal');
        if(adminModal) adminModal.style.display = 'none';
    });

    // Initialize first row
    const container = document.getElementById('multiLinksContainer');
    if (container && container.innerHTML.trim() === '') {
        createLinkRow();
    }

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