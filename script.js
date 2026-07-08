// ===== 郑航指南 - 搜索与交互逻辑 =====

document.addEventListener('DOMContentLoaded', function() {
    // ===== DOM元素 =====
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const resultsSection = document.getElementById('resultsSection');
    const resultsGrid = document.getElementById('resultsGrid');
    const resultsTitle = document.getElementById('resultsTitle');
    const resultsCount = document.getElementById('resultsCount');
    const noResults = document.getElementById('noResults');
    const categoryGrid = document.getElementById('categoryGrid');
    const categoriesSection = document.getElementById('categories');

    // ===== 初始化：渲染分类卡片 =====
    function renderCategories() {
        // 去重分类
        const categories = [...new Set(SITE_DATA.map(item => item.category))];
        categoryGrid.innerHTML = categories.map(cat => {
            const item = SITE_DATA.find(d => d.category === cat);
            return `
                <div class="card" onclick="showDetail('${item.id}')" data-id="${item.id}">
                    <div class="card-icon">${item.icon}</div>
                    <div class="card-title">${cat}</div>
                    <div class="card-desc">${item.summary}</div>
                    <span class="card-category">${SITE_DATA.filter(d => d.category === cat).length}篇文章</span>
                </div>
            `;
        }).join('');
    }
    renderCategories();

    // ===== 搜索功能 =====
    // 生成中文搜索用的分词（单字+2字组合+3字组合）
    function tokenizeChinese(text) {
        const cleaned = text.replace(/\s+/g, '');
        const tokens = new Set();
        // 逐字
        for (let i = 0; i < cleaned.length; i++) {
            tokens.add(cleaned[i]);
        }
        // 2字组合 (bigrams)
        for (let i = 0; i < cleaned.length - 1; i++) {
            tokens.add(cleaned.substring(i, i + 2));
        }
        // 3字组合
        for (let i = 0; i < cleaned.length - 2; i++) {
            tokens.add(cleaned.substring(i, i + 3));
        }
        return [...tokens];
    }

    function search(query) {
        if (!query || !query.trim()) return [];

        const q = query.trim().toLowerCase();
        // 同时保留空格分词和中文分词
        const spaceTokens = q.split(/\s+/).filter(k => k.length > 0);
        // 对每个空格token再做中文分词
        let allTokens = [];
        spaceTokens.forEach(t => {
            if (t.length <= 5) {
                allTokens.push(t); // 短词直接保留
            }
            // 中文分词
            const chineseTokens = tokenizeChinese(t);
            allTokens.push(...chineseTokens);
        });
        // 去重
        allTokens = [...new Set(allTokens)];

        return SITE_DATA.map(item => {
            let score = 0;
            const titleLower = item.title.toLowerCase();
            const summaryLower = item.summary.toLowerCase();
            const tagsLower = item.tags.join(' ').toLowerCase();
            const categoryLower = item.category.toLowerCase();
            const contentText = item.content.replace(/<[^>]*>/g, '').toLowerCase();
            const allText = titleLower + ' ' + summaryLower + ' ' + tagsLower + ' ' + categoryLower + ' ' + contentText;

            // 完整查询匹配（最高权重）
            if (allText.includes(q)) score += 30;

            // 各token匹配
            allTokens.forEach(tk => {
                if (tk.length < 1) return;
                const weight = tk.length >= 3 ? 8 : tk.length >= 2 ? 5 : 2;
                if (titleLower.includes(tk)) score += weight * 2;
                if (tagsLower.includes(tk)) score += weight * 2;
                if (summaryLower.includes(tk)) score += weight;
                if (categoryLower.includes(tk)) score += weight;
                if (contentText.includes(tk)) score += Math.floor(weight / 2);
            });

            return { item, score };
        })
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score);
    }

    // ===== 渲染搜索结果 =====
    function renderResults(results, query) {
        resultsGrid.innerHTML = '';
        noResults.style.display = 'none';

        if (results.length === 0) {
            noResults.style.display = 'block';
            resultsCount.textContent = '';
            return;
        }

        resultsCount.textContent = `共找到 ${results.length} 个相关结果`;

        results.forEach(r => {
            const summary = highlightText(r.item.summary, query);
            const card = document.createElement('div');
            card.className = 'result-card';
            card.onclick = () => showDetail(r.item.id);
            card.innerHTML = `
                <h3>
                    ${r.item.icon} ${highlightText(r.item.title, query)}
                    ${r.score >= 25 ? '<span class="match-badge">🔥 高匹配</span>' : ''}
                </h3>
                <p class="result-summary">${summary}</p>
                <span class="result-category">📂 ${r.item.category}</span>
            `;
            resultsGrid.appendChild(card);
        });
    }

    // ===== 高亮匹配文本（支持中文分词） =====
    function highlightText(text, query) {
        if (!query || !query.trim()) return text;
        const q = query.trim();
        // 生成所有可能匹配的子串
        const tokens = new Set();
        tokens.add(q); // 完整查询
        // 空格分词
        q.split(/\s+/).filter(k => k.length >= 2).forEach(t => tokens.add(t));
        // 中文分词（从查询中取2-4字组合）
        const cleaned = q.replace(/\s+/g, '');
        for (let i = 0; i < cleaned.length - 1; i++) {
            tokens.add(cleaned.substring(i, i + 2));
        }
        for (let i = 0; i < cleaned.length - 2; i++) {
            tokens.add(cleaned.substring(i, i + 3));
        }

        let result = text;
        // 按长度降序排列，优先匹配长词
        const sortedTokens = [...tokens].sort((a, b) => b.length - a.length);
        const replaced = new Set();
        sortedTokens.forEach(tk => {
            if (tk.length < 2) return;
            const regex = new RegExp(escapeRegExp(tk), 'gi');
            result = result.replace(regex, match => {
                return `<span class="highlight">${match}</span>`;
            });
        });
        return result;
    }

    function escapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ===== 执行搜索 =====
    function doSearch() {
        const query = searchInput.value.trim();

        // 更新URL
        if (query) {
            const url = new URL(window.location);
            url.searchParams.set('q', query);
            window.history.replaceState({}, '', url);
        } else {
            const url = new URL(window.location);
            url.searchParams.delete('q');
            window.history.replaceState({}, '', url);
        }

        if (!query) {
            // 空搜索：回到分类视图
            resultsSection.style.display = 'none';
            categoriesSection.style.display = 'block';
            return;
        }

        const results = search(query);
        resultsSection.style.display = 'block';
        categoriesSection.style.display = 'none';
        resultsTitle.textContent = `🔍 搜索结果：${query}`;
        renderResults(results, query);

        // 滚动到结果
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ===== 搜索事件绑定 =====
    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') doSearch();
    });

    // ===== 热门标签点击 =====
    document.querySelectorAll('.hot-tags .tag').forEach(tag => {
        tag.addEventListener('click', function() {
            const query = this.getAttribute('data-search');
            searchInput.value = query;
            doSearch();
        });
    });

    // ===== 详情弹窗 =====
    window.showDetail = function(id) {
        const item = SITE_DATA.find(d => d.id === id);
        if (!item) return;

        const existing = document.querySelector('.modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h2>${item.icon} ${item.title}</h2>
                    <button class="modal-close">✕</button>
                </div>
                <div class="modal-body">
                    ${item.content}
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // 关闭事件
        const closeBtn = overlay.querySelector('.modal-close');
        closeBtn.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) overlay.remove();
        });
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', escHandler);
            }
        });

        // 防止body滚动
        document.body.style.overflow = 'hidden';
        const observer = new MutationObserver(() => {
            if (!document.contains(overlay)) {
                document.body.style.overflow = '';
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true });
    };

    // ===== 支持URL参数搜索（方便分享链接） =====
    const urlParams = new URLSearchParams(window.location.search);
    const urlQuery = urlParams.get('q');
    if (urlQuery) {
        searchInput.value = urlQuery;
        doSearch();
    }
});
