/**
 * 资源分享站 - 主交互脚本
 * 负责：资源渲染、搜索筛选排序、分类展示、与 data.js 联动
 * 兼容 upload.html 的局部数据同步
 */

// 全局资源数组 (从 data.js 的 window.allResources 读取)
let currentResources = [];

// 当前页面标志
let currentPage = 'index'; // 'index', 'resources'

// 筛选排序状态 (资源大厅页用)
let currentSearchTerm = '';
let currentCategory = 'all';
let currentSort = 'default'; // default, latest, hot

// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', function() {
    // 确保 window.allResources 已存在 (由 data.js 注入)
    if (typeof window.allResources !== 'undefined' && Array.isArray(window.allResources)) {
        currentResources = [...window.allResources];
        // 尝试从 localStorage 读取用户分享的新增资源，合并数据 (优先使用localstorage的扩展)
        loadMergedResources();
    } else {
        console.warn('data.js 未正确加载，等待模拟数据');
        // 延迟再试一次
        setTimeout(() => {
            if (typeof window.allResources !== 'undefined') {
                currentResources = [...window.allResources];
                loadMergedResources();
                initPageByPath();
            } else {
                console.error('资源数据加载失败');
            }
        }, 100);
        return;
    }

    // 根据当前页面路径执行不同初始化
    initPageByPath();
});

// 合并 localStorage 中用户分享的资源 (维持持久)
function loadMergedResources() {
    const stored = localStorage.getItem('mock_resources_data');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                // 合并: 保留原有资源 + 新增用户提交的资源(去重基于id)
                const existingIds = new Set(currentResources.map(r => r.id));
                const newOnes = parsed.filter(r => !existingIds.has(r.id));
                if (newOnes.length) {
                    currentResources = [...newOnes, ...currentResources];
                    window.allResources = currentResources;  // 同步全局
                }
            }
        } catch(e) {}
    }
    // 确保分类数据展示
}

// 根据路径识别页面
function initPageByPath() {
    const path = window.location.pathname;
    if (path.includes('resources.html')) {
        currentPage = 'resources';
        initResourcesPage();
    } else if (path.includes('upload.html')) {
        currentPage = 'upload';
        initUploadPage();
    } else {
        currentPage = 'index';
        initHomePage();
    }
}

// ======================= 首页逻辑 =======================
function initHomePage() {
    // 展示最新资源 (前6条)
    const latestResources = [...currentResources].sort((a,b) => {
        // 按 dateAdded 倒序（新资源在前），没有dateAdded则按id
        const dateA = a.dateAdded ? new Date(a.dateAdded) : 0;
        const dateB = b.dateAdded ? new Date(b.dateAdded) : 0;
        if (dateA > dateB) return -1;
        if (dateA < dateB) return 1;
        return b.id - a.id;
    }).slice(0, 6);
    
    const gridContainer = document.getElementById('latestResourcesGrid');
    if (gridContainer) {
        renderResourceGrid('latestResourcesGrid', latestResources);
    }
    
    // 渲染热门分类快速入口 (去重分类)
    initCategoriesGrid();
}

// 动态生成分类快捷入口 (首页与公共)
function initCategoriesGrid() {
    const categoriesSet = new Set();
    currentResources.forEach(res => {
        if (res.category) categoriesSet.add(res.category);
    });
    // 预定义分类图标顺序
    const categoryList = Array.from(categoriesSet).slice(0, 6);
    const container = document.getElementById('quickCategories');
    if (!container) return;
    
    if (categoryList.length === 0) {
        container.innerHTML = '<span>暂无分类数据</span>';
        return;
    }
    
    container.innerHTML = categoryList.map(cat => 
        `<span class="category-chip" data-category="${cat}">${cat}</span>`
    ).join('');
    
    // 绑定点击事件，跳转到资源大厅并带上分类参数
    document.querySelectorAll('.category-chip').forEach(chip => {
        chip.addEventListener('click', function(e) {
            const category = this.getAttribute('data-category');
            if (category) {
                sessionStorage.setItem('preload_category', category);
                window.location.href = 'resources.html';
            }
        });
    });
}

// ======================= 资源大厅完整逻辑 (搜索/筛选/排序/渲染) =======================
function initResourcesPage() {
    currentPage = 'resources';
    // 设置分类选择框的选项
    populateCategoryFilter();
    
    // 获取上次可能预存的分类 (从首页跳转)
    const preCategory = sessionStorage.getItem('preload_category');
    if (preCategory) {
        currentCategory = preCategory;
        const categorySelect = document.getElementById('categorySelect');
        if (categorySelect && categorySelect.querySelector(`option[value="${preCategory}"]`)) {
            categorySelect.value = preCategory;
        }
        sessionStorage.removeItem('preload_category');
    }
    
    // 绑定筛选控件事件
    const searchInput = document.getElementById('searchInput');
    const categorySelect = document.getElementById('categorySelect');
    const sortBtns = document.querySelectorAll('.sort-btn');
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearchTerm = e.target.value.toLowerCase();
            applyFiltersAndRender();
        });
    }
    
    if (categorySelect) {
        categorySelect.addEventListener('change', (e) => {
            currentCategory = e.target.value;
            applyFiltersAndRender();
        });
    }
    
    sortBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const sortType = btn.getAttribute('data-sort');
            if (sortType) {
                currentSort = sortType;
                sortBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                applyFiltersAndRender();
            }
        });
    });
    
    // 初次渲染
    applyFiltersAndRender();
}

// 填充分类下拉框
function populateCategoryFilter() {
    const select = document.getElementById('categorySelect');
    if (!select) return;
    const categoriesSet = new Set();
    currentResources.forEach(res => {
        if (res.category) categoriesSet.add(res.category);
    });
    const sortedCats = Array.from(categoriesSet).sort();
    sortedCats.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
    });
}

// 应用搜索、分类、排序 并渲染
function applyFiltersAndRender() {
    let filtered = [...currentResources];
    
    // 分类筛选
    if (currentCategory !== 'all') {
        filtered = filtered.filter(res => res.category === currentCategory);
    }
    
    // 搜索 (标题、描述、标签)
    if (currentSearchTerm) {
        filtered = filtered.filter(res => {
            const titleMatch = res.title && res.title.toLowerCase().includes(currentSearchTerm);
            const descMatch = res.description && res.description.toLowerCase().includes(currentSearchTerm);
            let tagsMatch = false;
            if (res.tags && Array.isArray(res.tags)) {
                tagsMatch = res.tags.some(tag => tag.toLowerCase().includes(currentSearchTerm));
            } else if (res.tags && typeof res.tags === 'string') {
                tagsMatch = res.tags.toLowerCase().includes(currentSearchTerm);
            }
            return titleMatch || descMatch || tagsMatch;
        });
    }
    
    // 排序
    if (currentSort === 'latest') {
        filtered.sort((a,b) => {
            const dateA = a.dateAdded ? new Date(a.dateAdded) : new Date(a.id);
            const dateB = b.dateAdded ? new Date(b.dateAdded) : new Date(b.id);
            return dateB - dateA;
        });
    } else if (currentSort === 'hot') {
        filtered.sort((a,b) => (b.downloads || 0) - (a.downloads || 0));
    } else {
        // 默认按 id 降序
        filtered.sort((a,b) => b.id - a.id);
    }
    
    // 更新计数显示
    const countSpan = document.getElementById('resourcesCount');
    if (countSpan) countSpan.innerText = `找到 ${filtered.length} 个资源`;
    
    const noResultsDiv = document.getElementById('noResultsMessage');
    const gridContainer = document.getElementById('allResourcesGrid');
    
    if (filtered.length === 0) {
        if (gridContainer) gridContainer.style.display = 'none';
        if (noResultsDiv) noResultsDiv.style.display = 'block';
    } else {
        if (gridContainer) {
            gridContainer.style.display = 'grid';
            renderResourceGrid('allResourcesGrid', filtered);
        }
        if (noResultsDiv) noResultsDiv.style.display = 'none';
    }
}

// ======================= 通用渲染卡片 =======================
function renderResourceGrid(containerId, resourcesArray) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!resourcesArray || resourcesArray.length === 0) {
        container.innerHTML = '<div class="loading-placeholder">暂无资源</div>';
        return;
    }
    
    const cardsHtml = resourcesArray.map(res => {
        // 处理缩略图
        let thumbImg = res.thumbnail || 'https://picsum.photos/300/160?random=' + res.id;
        // 分类样式展示
        const categoryDisplay = res.categoryName || res.category || '未分类';
        const safeTitle = escapeHtml(res.title || '无标题');
        const safeDesc = escapeHtml(res.description || '暂无描述').substring(0, 100);
        const downloads = res.downloads || 0;
        
        return `
            <div class="resource-card" data-id="${res.id}">
                <img class="card-thumb" src="${thumbImg}" alt="${safeTitle}" loading="lazy" onerror="this.src='https://picsum.photos/300/160?random=fallback'">
                <div class="card-content">
                    <span class="card-category">${escapeHtml(categoryDisplay)}</span>
                    <h3 class="card-title">${safeTitle}</h3>
                    <p class="card-desc">${safeDesc}</p>
                    <div class="card-meta">
                        <span>⬇️ ${downloads} 次下载</span>
                        <a href="${res.link || '#'}" target="_blank" class="btn-sm" rel="noopener noreferrer">查看详情 →</a>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = cardsHtml;
}

// 辅助函数：防XSS
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    }).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function(c) {
        return c;
    });
}

// ======================= 上传页面辅助 (外部调用) =======================
function initUploadPage() {
    // upload.html 中已有独立的内嵌逻辑，这里补充全局同步函数
    // 提供同步方法供 upload 调用
    window.syncResourcesToLocalStorage = function() {
        if (window.allResources) {
            localStorage.setItem('mock_resources_data', JSON.stringify(window.allResources));
        }
    };
    // 额外检查已经存在的localstorage记录再次合并
    const stored = localStorage.getItem('mock_resources_data');
    if (stored && window.allResources) {
        try {
            const parsed = JSON.parse(stored);
            if (parsed.length > window.allResources.length) {
                window.allResources = parsed;
                currentResources = parsed;
            }
        } catch(e) {}
    }
}

// 导出全局函数供 html 内联调用 (可选)
window.renderResourceGrid = renderResourceGrid;
window.initHomePage = initHomePage;
window.initResourcesPage = initResourcesPage;
window.initUploadPage = initUploadPage;
window.applyFiltersAndRender = applyFiltersAndRender;
window.initCategoriesGrid = initCategoriesGrid;
window.syncResourcesToLocalStorage = function() {
    if (window.allResources) localStorage.setItem('mock_resources_data', JSON.stringify(window.allResources));
};