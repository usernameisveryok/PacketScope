// 全局配置
const CONFIG = {
    // apiUrl: 'http://140.143.125.86:8080', // API基础URL，根据实际情况修改
    apiUrl: 'http://localhost:8080', // API基础URL，根据实际情况修改
    refreshInterval: 5000, // 自动刷新间隔，单位毫秒
    maxEntries: 1000, // 最大显示条目数
    itemsPerPage: 10, // 每页显示条目数
    autoRefresh: true // 默认开启自动刷新
};

// 全局变量
let autoRefreshTimer = null;
let lastConnectionsData = [];
let lastIcmpData = [];
let lastStatsData = {};
let currentConnPage = 1;
let currentIcmpPage = 1;

// DOM元素
const refreshBtn = document.getElementById('refresh-btn');
const loadingSpinner = document.getElementById('loading-spinner');
const connectionsTable = document.getElementById('connections-table');
const icmpTable = document.getElementById('icmp-table');
const statsContainer = document.getElementById('stats-container');
const connSearchInput = document.getElementById('conn-search');
const icmpSearchInput = document.getElementById('icmp-search');
const connCountBadge = document.getElementById('conn-count');
const icmpCountBadge = document.getElementById('icmp-count');
const connUpdateTime = document.getElementById('conn-update-time');
const icmpUpdateTime = document.getElementById('icmp-update-time');
const statsUpdateTime = document.getElementById('stats-update-time');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 初始数据加载
    refreshAllData();

    // 设置自动刷新
    startAutoRefresh();

    // 绑定事件处理器
    refreshBtn.addEventListener('click', refreshAllData);

    // 搜索功能
    connSearchInput.addEventListener('input', () => filterTable('connections'));
    icmpSearchInput.addEventListener('input', () => filterTable('icmp'));
});

// 开始自动刷新
function startAutoRefresh() {
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
    }

    if (CONFIG.autoRefresh) {
        autoRefreshTimer = setInterval(refreshAllData, CONFIG.refreshInterval);
        console.log(`自动刷新已启动，间隔 ${CONFIG.refreshInterval}ms`);
    }
}

// 获取当前格式化时间
function getFormattedTime() {
    const now = new Date();
    return now.toLocaleTimeString();
}

// 刷新所有数据
async function refreshAllData() {
    loadingSpinner.classList.remove('d-none');

    try {
        // 并行请求所有API
        const [connectionsResponse, icmpResponse, statsResponse] = await Promise.all([
            fetch(`${CONFIG.apiUrl}/api/connections`),
            fetch(`${CONFIG.apiUrl}/api/icmp`),
            fetch(`${CONFIG.apiUrl}/api/stats`)
        ]);

        if (!connectionsResponse.ok || !icmpResponse.ok || !statsResponse.ok) {
            throw new Error('API请求失败');
        }

        // 解析数据
        const connectionsData = await connectionsResponse.json();
        const icmpData = await icmpResponse.json();
        const statsData = await statsResponse.json();

        // 更新数据和UI
        updateConnectionsTable(connectionsData);
        updateIcmpTable(icmpData);
        updateStatsContainer(statsData);

        // 更新时间戳
        const timeStr = getFormattedTime();
        connUpdateTime.textContent = timeStr;
        icmpUpdateTime.textContent = timeStr;
        statsUpdateTime.textContent = timeStr;

        // 保存数据备份
        lastConnectionsData = connectionsData;
        lastIcmpData = icmpData;
        lastStatsData = statsData;
    } catch (error) {
        console.error('刷新数据失败:', error);
    } finally {
        loadingSpinner.classList.add('d-none');
    }
}

// 更新连接表
function updateConnectionsTable(data) {
    // 更新计数
    const totalItems = data.length;
    connCountBadge.textContent = `${totalItems} 条目`;

    // 如果没有数据
    if (totalItems === 0) {
        connectionsTable.innerHTML = `
            <tr>
                <td colspan="2" class="text-center">没有连接数据</td>
            </tr>
        `;
        updatePagination('connections', 0);
        return;
    }

    // 计算分页
    const totalPages = Math.ceil(totalItems / CONFIG.itemsPerPage);
    const startIndex = (currentConnPage - 1) * CONFIG.itemsPerPage;
    const endIndex = Math.min(startIndex + CONFIG.itemsPerPage, totalItems);
    const pageData = data.slice(startIndex, endIndex);

    // 构建HTML
    let html = '';
    pageData.forEach(conn => {
        // 判断连接类型添加样式
        let connClass = '';
        if (conn.key.includes('TCP')) {
            if (conn.info.includes('SYN|ACK') || conn.info.includes('ACK')) {
                connClass = 'tcp-established';
            } else {
                connClass = 'tcp-closed';
            }
        } else if (conn.key.includes('UDP')) {
            connClass = 'udp';
        }

        html += `
            <tr>
                <td class="${connClass}">${escapeHtml(conn.key)}</td>
                <td>${escapeHtml(conn.info)}</td>
            </tr>
        `;
    });

    connectionsTable.innerHTML = html;
    updatePagination('connections', totalPages);

    // 应用搜索过滤
    if (connSearchInput.value.trim() !== '') {
        filterTable('connections');
    }
}

// 更新ICMP表
function updateIcmpTable(data) {
    // 更新计数
    const totalItems = data.length;
    icmpCountBadge.textContent = `${totalItems} 条目`;

    // 如果没有数据
    if (totalItems === 0) {
        icmpTable.innerHTML = `
            <tr>
                <td colspan="2" class="text-center">没有ICMP数据</td>
            </tr>
        `;
        updatePagination('icmp', 0);
        return;
    }

    // 计算分页
    const totalPages = Math.ceil(totalItems / CONFIG.itemsPerPage);
    const startIndex = (currentIcmpPage - 1) * CONFIG.itemsPerPage;
    const endIndex = Math.min(startIndex + CONFIG.itemsPerPage, totalItems);
    const pageData = data.slice(startIndex, endIndex);

    // 构建HTML
    let html = '';
    pageData.forEach(icmp => {
        html += `
            <tr>
                <td>${escapeHtml(icmp.key)}</td>
                <td>${escapeHtml(icmp.info)}</td>
            </tr>
        `;
    });

    icmpTable.innerHTML = html;
    updatePagination('icmp', totalPages);

    // 应用搜索过滤
    if (icmpSearchInput.value.trim() !== '') {
        filterTable('icmp');
    }
}

// 更新统计信息
function updateStatsContainer(data) {
    // 格式化统计数据
    let html = '';

    // 一般统计
    html += `<div class="stat-section">
        <h6 class="text-primary">一般统计</h6>
        ${createStatItem('总数据包', data.TotalPackets || 0)}
        ${createStatItem('总字节数', formatBytes(data.TotalBytes || 0))}
        ${createStatItem('丢弃的数据包', data.DroppedPackets || 0)}
        ${createStatItem('格式错误的数据包', data.MalformedPackets || 0)}
    </div>`;

    // TCP统计
    html += `<div class="stat-section mt-3">
        <h6 class="text-primary">TCP统计</h6>
        ${createStatItem('重传', data.TCPRetrans || 0)}
        ${createStatItem('重复ACK', data.TCPDuplicateAck || 0)}
        ${createStatItem('乱序包', data.TCPOutOfOrder || 0)}
        ${createStatItem('零窗口', data.TCPZeroWindow || 0)}
        ${createStatItem('小窗口', data.TCPSmallWindow || 0)}
    </div>`;

    // ICMP类型统计
    if (data.ICMPTypeCounts) {
        let icmpTypeHtml = '';
        const icmpTypes = Object.entries(data.ICMPTypeCounts).filter(([_, count]) => count > 0);

        if (icmpTypes.length > 0) {
            icmpTypeHtml = '<div class="row">';
            icmpTypes.forEach(([type, count]) => {
                const typeName = getIcmpTypeName(parseInt(type));
                icmpTypeHtml += `
                    <div class="col-md-6">
                        ${createStatItem(`${typeName} (${type})`, count)}
                    </div>
                `;
            });
            icmpTypeHtml += '</div>';
        } else {
            icmpTypeHtml = '<p class="text-muted">无ICMP流量</p>';
        }

        html += `<div class="stat-section mt-3">
            <h6 class="text-primary">ICMP类型统计</h6>
            ${icmpTypeHtml}
        </div>`;
    }

    statsContainer.innerHTML = html;
}

// 创建统计项HTML
function createStatItem(label, value) {
    return `
    <div class="stat-item">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${value}</div>
    </div>
    `;
}

// 过滤表格
function filterTable(tableType) {
    const searchInput = tableType === 'connections' ? connSearchInput : icmpSearchInput;
    const tableBody = tableType === 'connections' ? connectionsTable : icmpTable;
    const searchTerm = searchInput.value.trim().toLowerCase();

    if (searchTerm === '') {
        // 如果搜索词为空，恢复原始表格
        if (tableType === 'connections') {
            updateConnectionsTable(lastConnectionsData);
        } else {
            updateIcmpTable(lastIcmpData);
        }
        return;
    }

    // 遍历所有行
    const rows = tableBody.querySelectorAll('tr');
    let visibleCount = 0;

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 2) return; // 跳过加载行或提示行

        const key = cells[0].textContent.toLowerCase();
        const info = cells[1].textContent.toLowerCase();
        const isMatch = key.includes(searchTerm) || info.includes(searchTerm);

        row.style.display = isMatch ? '' : 'none';
        if (isMatch) visibleCount++;

        // 高亮匹配文本
        if (isMatch) {
            highlightText(cells[0], searchTerm);
            highlightText(cells[1], searchTerm);
        }
    });

    // 更新计数
    if (tableType === 'connections') {
        connCountBadge.textContent = `${visibleCount} / ${lastConnectionsData.length} 条目`;
    } else {
        icmpCountBadge.textContent = `${visibleCount} / ${lastIcmpData.length} 条目`;
    }

    // 如果没有匹配项，显示提示
    if (visibleCount === 0) {
        const colSpan = 2;
        const message = `没有匹配"${searchTerm}"的${tableType === 'connections' ? '连接' : 'ICMP'}数据`;

        const emptyRow = document.createElement('tr');
        emptyRow.innerHTML = `<td colspan="${colSpan}" class="text-center">${message}</td>`;
        tableBody.appendChild(emptyRow);
    }
}

// 高亮文本
function highlightText(element, searchTerm) {
    const originalText = element.textContent;
    const searchTermLower = searchTerm.toLowerCase();

    if (!originalText.toLowerCase().includes(searchTermLower)) {
        return;
    }

    let newHtml = '';
    let lastIndex = 0;

    // 不区分大小写查找
    const regex = new RegExp(escapeRegExp(searchTerm), 'gi');
    let match;

    while ((match = regex.exec(originalText)) !== null) {
        newHtml += escapeHtml(originalText.substring(lastIndex, match.index));
        newHtml += `<span class="highlight">${escapeHtml(match[0])}</span>`;
        lastIndex = regex.lastIndex;
    }

    newHtml += escapeHtml(originalText.substring(lastIndex));
    element.innerHTML = newHtml;
}

// 辅助函数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

function getIcmpTypeName(type) {
    const icmpTypes = {
        0: 'Echo Reply',
        3: 'Destination Unreachable',
        8: 'Echo Request',
        11: 'Time Exceeded',
        5: 'Redirect',
        13: 'Timestamp',
        14: 'Timestamp Reply'
    };

    return icmpTypes[type] || `Type ${type}`;
}

// 更新分页控件
function updatePagination(tableType, totalPages) {
    const container = document.getElementById(`${tableType}-pagination`);
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = `
        <nav aria-label="Page navigation">
            <ul class="pagination pagination-sm justify-content-end mb-0">
    `;

    // 上一页按钮
    html += `
        <li class="page-item ${tableType === 'connections' ? currentConnPage === 1 : currentIcmpPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="prev">上一页</a>
        </li>
    `;

    // 页码按钮
    for (let i = 1; i <= totalPages; i++) {
        const isActive = tableType === 'connections' ? i === currentConnPage : i === currentIcmpPage;
        html += `
            <li class="page-item ${isActive ? 'active' : ''}">
                <a class="page-link" href="#" data-page="${i}">${i}</a>
            </li>
        `;
    }

    // 下一页按钮
    html += `
        <li class="page-item ${tableType === 'connections' ? currentConnPage === totalPages : currentIcmpPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="next">下一页</a>
        </li>
    `;

    html += `
            </ul>
        </nav>
    `;

    container.innerHTML = html;

    // 添加分页事件监听
    container.querySelectorAll('.page-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            if (tableType === 'connections') {
                if (page === 'prev' && currentConnPage > 1) {
                    currentConnPage--;
                } else if (page === 'next' && currentConnPage < totalPages) {
                    currentConnPage++;
                } else if (!isNaN(page)) {
                    currentConnPage = parseInt(page);
                }
                updateConnectionsTable(lastConnectionsData);
            } else {
                if (page === 'prev' && currentIcmpPage > 1) {
                    currentIcmpPage--;
                } else if (page === 'next' && currentIcmpPage < totalPages) {
                    currentIcmpPage++;
                } else if (!isNaN(page)) {
                    currentIcmpPage = parseInt(page);
                }
                updateIcmpTable(lastIcmpData);
            }
        });
    });
} 