let contestants = [];
let judges = [];
let judgeGroups = [];
let scoringRounds = [];
let events = [];
let currentEventId = null;
let currentRoundId = null;
let systemState = null;
let subscriptions = [];
let confirmCallback = null;
let currentAdmin = null;
let selectedTheme = 1;

const ADMIN_SESSION_KEY = 'admin_session';

document.addEventListener('DOMContentLoaded', async () => {
    initEventListeners();
    await checkAuth();
});

function initEventListeners() {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    document.querySelectorAll('input[name="displayMode"]').forEach(radio => {
        radio.addEventListener('change', handleDisplayModeChange);
    });
    
    document.getElementById('lockBtn').addEventListener('click', handleLockToggle);
    document.getElementById('resetScoresBtn').addEventListener('click', handleResetScores);
    document.getElementById('addContestantBtn').addEventListener('click', () => openContestantModal());
    document.getElementById('addJudgeBtn').addEventListener('click', () => openJudgeModal());
    document.getElementById('addGroupBtn').addEventListener('click', () => openGroupModal());
    document.getElementById('addRoundBtn').addEventListener('click', () => openRoundModal());
    
    document.getElementById('contestantForm').addEventListener('submit', handleContestantSubmit);
    document.getElementById('judgeForm').addEventListener('submit', handleJudgeSubmit);
    document.getElementById('groupForm').addEventListener('submit', handleGroupSubmit);
    document.getElementById('roundForm').addEventListener('submit', handleRoundSubmit);
    document.getElementById('eventForm').addEventListener('submit', handleEventSubmit);
    document.getElementById('copyEventForm').addEventListener('submit', handleCopyEventSubmit);
    document.getElementById('confirmBtn').addEventListener('click', handleConfirm);
    
    document.getElementById('eventDropdownBtn').addEventListener('click', toggleEventDropdown);
    document.getElementById('manageEventsBtn').addEventListener('click', openEventListModal);
    
    document.getElementById('avatarInput').addEventListener('change', handleAvatarUpload);
    
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => switchSettingsTab(tab.dataset.settingsTab));
    });
    
    initThemeSettings();
}

async function checkAuth() {
    const savedAdmin = localStorage.getItem(ADMIN_SESSION_KEY);
    if (savedAdmin) {
        try {
            currentAdmin = JSON.parse(savedAdmin);
            showAdminSection();
            await loadEvents();
            await loadData();
            subscribeToChanges();
        } catch (error) {
            localStorage.removeItem(ADMIN_SESSION_KEY);
            currentAdmin = null;
        }
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const result = await db.verifyAdminLogin(username, password);
        if (!result || result.length === 0) {
            throw new Error('用户名或密码错误');
        }
        
        currentAdmin = result[0];
        localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(currentAdmin));
        
        showAdminSection();
        await loadEvents();
        await loadData();
        subscribeToChanges();
        showToast('登录成功', 'success');
    } catch (error) {
        showToast(error.message || '登录失败', 'error');
    }
}

function handleLogout() {
    subscriptions.forEach(sub => sub.unsubscribe());
    localStorage.removeItem(ADMIN_SESSION_KEY);
    currentAdmin = null;
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('adminSection').classList.add('hidden');
    showToast('已退出登录', 'success');
}

function showAdminSection() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('adminSection').classList.remove('hidden');
    document.getElementById('adminUsername').textContent = currentAdmin.username;
}

async function loadEvents() {
    try {
        events = await db.getEvents();
        
        const state = await db.getSystemState();
        systemState = state;
        
        if (state.current_event_id) {
            currentEventId = state.current_event_id;
        }
        
        updateEventDropdown();
        updateEventStatus();
    } catch (error) {
        showToast('加载活动失败', 'error');
        console.error(error);
    }
}

function updateEventDropdown() {
    const dropdown = document.getElementById('eventDropdown');
    const list = document.getElementById('eventList');
    
    list.innerHTML = events.map(event => `
        <button class="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-slate-700 transition-colors ${event.id === currentEventId ? 'bg-indigo-600/20 text-indigo-300' : 'text-white'}"
                onclick="selectEvent('${event.id}')">
            <span class="truncate">${event.name}</span>
            <span class="text-xs px-1.5 py-0.5 rounded-full ${getStatusClass(event.status)}">${getStatusText(event.status)}</span>
        </button>
    `).join('');
    
    updateCurrentEventDisplay();
}

function updateCurrentEventDisplay() {
    const event = events.find(e => e.id === currentEventId);
    const nameEl = document.getElementById('currentEventName');
    const statusEl = document.getElementById('currentEventStatus');
    
    if (event) {
        nameEl.textContent = event.name;
        statusEl.textContent = getStatusText(event.status);
        statusEl.className = `text-xs px-1.5 py-0.5 rounded-full ${getStatusClass(event.status)}`;
    } else {
        nameEl.textContent = '选择活动';
        statusEl.textContent = '';
    }
}

function getStatusClass(status) {
    const classes = {
        'draft': 'bg-slate-500/20 text-slate-400',
        'active': 'bg-emerald-500/20 text-emerald-400',
        'paused': 'bg-amber-500/20 text-amber-400',
        'completed': 'bg-blue-500/20 text-blue-400'
    };
    return classes[status] || classes['draft'];
}

function getStatusText(status) {
    const texts = {
        'draft': '草稿',
        'active': '进行中',
        'paused': '已暂停',
        'completed': '已完成'
    };
    return texts[status] || status;
}

function toggleEventDropdown() {
    const dropdown = document.getElementById('eventDropdown');
    dropdown.classList.toggle('hidden');
}

async function selectEvent(eventId) {
    if (currentEventId && currentEventId !== eventId) {
        openConfirmModal('切换活动', '切换活动将保存当前活动的数据，确定要切换吗？', async () => {
            await switchToEvent(eventId);
        });
    } else {
        await switchToEvent(eventId);
    }
    document.getElementById('eventDropdown').classList.add('hidden');
}

async function switchToEvent(eventId) {
    try {
        await db.switchEvent(eventId);
        currentEventId = eventId;
        updateEventDropdown();
        updateEventStatus();
        await loadData();
        showToast('已切换活动', 'success');
    } catch (error) {
        showToast('切换活动失败', 'error');
        console.error(error);
    }
}

function updateEventStatus() {
    const event = events.find(e => e.id === currentEventId);
    if (event) {
        document.getElementById('currentEventStatus').textContent = getStatusText(event.status);
        document.getElementById('currentEventStatus').className = `text-xs px-1.5 py-0.5 rounded-full ${getStatusClass(event.status)}`;
    }
}

async function loadData() {
    if (!currentEventId) {
        contestants = [];
        judges = [];
        judgeGroups = [];
        scoringRounds = [];
        currentRoundId = null;
        updateUI();
        return;
    }
    
    try {
        const [state, contestantList, judgeList, groupList, roundList] = await Promise.all([
            db.getSystemState(),
            db.getContestants(currentEventId),
            db.getJudges(currentEventId),
            db.getJudgeGroups(currentEventId),
            db.getScoringRounds(currentEventId)
        ]);
        
        systemState = state;
        contestants = contestantList;
        judges = judgeList;
        judgeGroups = groupList;
        scoringRounds = roundList;
        
        if (state.current_round_id) {
            currentRoundId = state.current_round_id;
        } else if (roundList.length > 0) {
            const activeRound = roundList.find(r => r.is_active);
            currentRoundId = activeRound ? activeRound.id : roundList[0].id;
        }
        
        selectedTheme = state?.display_theme || 1;
        updateUI();
    } catch (error) {
        showToast('加载数据失败', 'error');
        console.error(error);
    }
}

function updateUI() {
    updateDisplayModeButtons();
    updateLockButton();
    updateCurrentContestantPreview();
    updateContestantListControl();
    updateContestantListSettings();
    updateGroupList();
    updateJudgeList();
    updateRoundListControl();
    updateRoundListSettings();
    updateThemeSelection();
    updateScoreProgress();
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    document.getElementById('controlTab').classList.toggle('hidden', tabName !== 'control');
    document.getElementById('settingsTab').classList.toggle('hidden', tabName !== 'settings');
    document.getElementById('dataTab').classList.toggle('hidden', tabName !== 'data');
    
    const settingsSubTabs = document.getElementById('settingsSubTabs');
    if (tabName === 'settings') {
        settingsSubTabs.classList.remove('hidden');
    } else {
        settingsSubTabs.classList.add('hidden');
    }

    if (tabName === 'data') {
        updateDataRoundSelect();
        loadDataResults();
        loadJudgeDetailResults();
    }
}

function switchSettingsTab(tabName) {
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.settingsTab === tabName);
    });
    
    document.getElementById('settingsContestantsTab').classList.toggle('hidden', tabName !== 'contestants');
    document.getElementById('settingsJudgesTab').classList.toggle('hidden', tabName !== 'judges');
    document.getElementById('settingsRoundsTab').classList.toggle('hidden', tabName !== 'rounds');
    document.getElementById('settingsThemeTab').classList.toggle('hidden', tabName !== 'theme');
}

function updateDisplayModeRadios() {
    const mode = systemState?.display_mode || 'waiting';
    document.querySelectorAll('input[name="displayMode"]').forEach(radio => {
        radio.checked = radio.value === mode;
    });
}

function updateLockButton() {
    const btn = document.getElementById('lockBtn');
    const isLocked = systemState?.is_locked;
    
    btn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            ${isLocked 
                ? '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>'
                : '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>'
            }
        </svg>
        <span>${isLocked ? '解锁评分' : '锁定评分'}</span>
    `;
    
    btn.className = `btn ${isLocked ? 'btn-warning' : 'btn-secondary'}`;
}

function updateCurrentRoundBadge() {
    const badge = document.getElementById('currentRoundBadge');
    const currentRound = scoringRounds.find(r => r.id === currentRoundId);
    
    if (currentRound) {
        badge.textContent = currentRound.name;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function updateCurrentContestantPreview() {
    const container = document.getElementById('currentContestantPreview');
    const status = document.getElementById('currentContestantStatus');
    
    const contestantId = systemState?.current_contestant_id;
    const contestant = contestants.find(c => c.id === contestantId);
    
    if (contestant) {
        status.textContent = '已选择';
        status.className = 'badge badge-success';
        
        const avatarHtml = contestant.avatar_url 
            ? `<img src="${contestant.avatar_url}" alt="${contestant.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : `<svg class="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/></svg>`;
        
        const roundSelectHtml = scoringRounds.length > 0 ? `
            <div class="mt-4">
                <label class="form-label text-sm">当前评分轮次</label>
                <select id="contestantRoundSelect" class="form-select" onchange="handleContestantRoundChange()">
                    ${scoringRounds.map(round => `
                        <option value="${round.id}" ${round.id === currentRoundId ? 'selected' : ''}>${round.name}</option>
                    `).join('')}
                </select>
            </div>
        ` : '';
        
        container.innerHTML = `
            <div class="flex flex-col md:flex-row items-center gap-4">
                <div class="avatar avatar-lg">
                    ${avatarHtml}
                </div>
                <div class="text-center md:text-left flex-1">
                    <h4 class="text-xl font-semibold text-white">${contestant.name}</h4>
                    <div class="flex flex-col items-center justify-center md:items-start md:justify-start gap-1 mt-1">
                        <span class="badge badge-primary">${contestant.number}</span>
                        <span class="text-slate-400">${contestant.department || ''}</span>
                    </div>
                    <p class="text-slate-500 mt-2">${contestant.description || '暂无简介'}</p>
                    ${roundSelectHtml}
                </div>
            </div>
        `;
    } else {
        status.textContent = '未选择';
        status.className = 'badge badge-warning';
        
        container.innerHTML = `
            <div class="text-slate-500">
                <svg class="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <p>请从选手列表中选择当前选手</p>
            </div>
        `;
    }
}

async function handleContestantRoundChange() {
    const select = document.getElementById('contestantRoundSelect');
    const newRoundId = select.value;
    
    if (newRoundId && newRoundId !== currentRoundId) {
        await setActiveRound(newRoundId);
    }
}

function updateContestantListControl() {
    const container = document.getElementById('contestantListControl');
    
    if (!currentEventId) {
        container.innerHTML = '<p class="text-slate-500 text-center py-4">请先选择活动</p>';
        return;
    }
    
    if (contestants.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-center py-4">暂无选手</p>';
        return;
    }
    
    container.innerHTML = contestants.map(contestant => {
        const isCurrent = contestant.id === systemState?.current_contestant_id;
        const avatarHtml = contestant.avatar_url 
            ? `<img src="${contestant.avatar_url}" alt="${contestant.name}" class="w-10 h-10 rounded-full object-cover">`
            : `<div class="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center"><svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/></svg></div>`;
        
        return `
            <div class="flex items-center justify-between p-3 rounded-lg ${isCurrent ? 'ring-2 ring-indigo-500' : ''}">
                <div class="flex items-center gap-3">
                    ${avatarHtml}
                    <div>
                        <div class="font-medium text-white">${contestant.name}</div>
                        <div class="text-slate-500 text-sm">${contestant.department || ''}</div>
                    </div>
                    <span class="badge ${isCurrent ? 'badge-success' : 'badge-primary'}">${contestant.number}</span>
                </div>
                ${!isCurrent ? `<button class="btn btn-secondary btn-sm" onclick="selectContestant('${contestant.id}')" title="设为当前选手">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </button>` : ''}
            </div>
        `;
    }).join('');
}

function updateContestantListSettings() {
    const container = document.getElementById('contestantListSettings');
    
    if (!currentEventId) {
        container.innerHTML = '<p class="text-slate-500 text-center py-4">请先选择活动</p>';
        return;
    }
    
    if (contestants.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-center py-4">暂无选手</p>';
        return;
    }
    
    container.innerHTML = contestants.map(contestant => {
        const avatarHtml = contestant.avatar_url 
            ? `<img src="${contestant.avatar_url}" alt="${contestant.name}" class="w-10 h-10 rounded-full object-cover">`
            : `<div class="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center"><svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/></svg></div>`;
        
        return `
            <div class="flex items-center justify-between p-3 rounded-lg">
                <div class="flex items-center gap-3">
                    ${avatarHtml}
                    <div>
                        <div class="font-medium text-white">${contestant.name}</div>
                        <div class="text-slate-500 text-sm">${contestant.department || ''}</div>
                    </div>
                    <span class="badge badge-primary">${contestant.number}</span>
                </div>
                <div class="flex items-center gap-2">
                    <button class="btn btn-secondary btn-sm" onclick="editContestant('${contestant.id}')" title="编辑">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteContestant('${contestant.id}')" title="删除">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function updateGroupList() {
    const container = document.getElementById('groupList');
    
    if (!currentEventId) {
        container.innerHTML = '<p class="text-slate-500 text-center py-4">请先选择活动</p>';
        return;
    }
    
    if (judgeGroups.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-center py-4">暂无分组</p>';
        return;
    }
    
    container.innerHTML = judgeGroups.map(group => {
        const judgeCount = judges.filter(j => j.group_id === group.id).length;
        return `
            <div class="flex items-center justify-between p-3 rounded-lg">
                <div class="flex items-center gap-3">
                    <div>
                        <div class="font-medium text-white">${group.name}</div>
                        <div class="text-slate-500 text-sm">评委: ${judgeCount}人</div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button class="btn btn-secondary btn-sm" onclick="editGroup('${group.id}')" title="编辑">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteGroup('${group.id}')" title="删除" ${group.name === '默认分组' ? 'disabled' : ''}>
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function updateJudgeList() {
    const container = document.getElementById('judgeList');
    
    if (!currentEventId) {
        container.innerHTML = '<p class="text-slate-500 text-center py-4">请先选择活动</p>';
        return;
    }
    
    if (judges.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-center py-4">暂无评委</p>';
        return;
    }
    
    container.innerHTML = judges.map(judge => {
        const groupName = judge.judge_groups ? judge.judge_groups.name : '未分组';
        return `
            <div class="flex items-center justify-between p-3 rounded-lg">
                <div class="flex items-center gap-3">
                    <span class="badge badge-primary">${judge.judge_number}</span>
                    <div>
                        <div class="font-medium text-white">${judge.username}</div>
                        <div class="text-slate-500 text-sm">${groupName}</div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button class="btn btn-secondary btn-sm" onclick="editJudge('${judge.id}')" title="编辑">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteJudge('${judge.id}')" title="删除">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function updateRoundListControl() {
    const container = document.getElementById('roundListControl');
    
    if (!currentEventId) {
        container.innerHTML = '<p class="text-slate-500 text-center py-4">请先选择活动</p>';
        return;
    }
    
    if (scoringRounds.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-center py-4">暂无评分轮次</p>';
        return;
    }
    
    container.innerHTML = scoringRounds.map(round => {
        const isCurrent = round.id === currentRoundId;
        
        return `
            <div class="flex items-center justify-between p-3 rounded-lg ${isCurrent ? 'ring-2 ring-indigo-500' : ''}">
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <span class="font-medium text-white">${round.name}</span>
                        ${isCurrent ? '<span class="badge badge-success">当前</span>' : ''}
                    </div>
                </div>
                ${!isCurrent ? `<button class="btn btn-secondary btn-sm" onclick="setActiveRound('${round.id}')" title="设为当前">设为当前</button>` : ''}
            </div>
        `;
    }).join('');
}

function updateRoundListSettings() {
    const container = document.getElementById('roundListSettings');
    
    if (!currentEventId) {
        container.innerHTML = '<p class="text-slate-500 text-center py-4">请先选择活动</p>';
        return;
    }
    
    if (scoringRounds.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-center py-4">暂无评分轮次</p>';
        return;
    }
    
    container.innerHTML = scoringRounds.map(round => {
        const methodText = round.calculation_method === 'trimmed_average' 
            ? '去高低分平均'
            : '平均分';
        
        return `
            <div class="flex items-center justify-between p-3 rounded-lg">
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <span class="font-medium text-white">${round.name}</span>
                    </div>
                    <div class="text-slate-500 text-sm mt-1">
                        权重: ${round.weight} | ${methodText}
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button class="btn btn-secondary btn-sm" onclick="editRound('${round.id}')" title="编辑">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteRound('${round.id}')" title="删除" ${scoringRounds.length <= 1 ? 'disabled' : ''}>
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function handleDisplayModeChange(e) {
    const mode = e.target.value;
    try {
        await db.updateSystemState({ display_mode: mode });
        showToast('显示模式已更新', 'success');
    } catch (error) {
        showToast('更新失败', 'error');
    }
}

async function handleLockToggle() {
    const newLockState = !systemState?.is_locked;
    try {
        await db.updateSystemState({ is_locked: newLockState });
        showToast(newLockState ? '评分已锁定' : '评分已解锁', 'success');
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function handleResetScores() {
    if (!currentEventId) {
        showToast('请先选择活动', 'error');
        return;
    }
    
    if (!currentRoundId) {
        showToast('请先选择评分轮次', 'error');
        return;
    }
    
    const currentRound = scoringRounds.find(r => r.id === currentRoundId);
    const roundName = currentRound ? currentRound.name : '当前轮次';
    
    openConfirmModal('重置评分', `确定要重置"${roundName}"的所有评分数据吗？此操作不可恢复。`, async () => {
        try {
            await db.deleteAllScores(currentEventId, currentRoundId);
            showToast('评分已重置', 'success');
        } catch (error) {
            showToast('重置失败', 'error');
        }
    });
}

async function selectContestant(id) {
    try {
        await db.updateSystemState({ 
            current_contestant_id: id,
            display_mode: 'scoring'
        });
        showToast('已切换选手', 'success');
    } catch (error) {
        showToast('切换失败', 'error');
    }
}

async function setActiveRound(roundId) {
    try {
        await db.setActiveRound(roundId);
        currentRoundId = roundId;
        updateUI();
        showToast('已切换评分轮次', 'success');
    } catch (error) {
        showToast('切换失败', 'error');
    }
}

function openContestantModal(contestant = null) {
    if (!currentEventId) {
        showToast('请先选择活动', 'error');
        return;
    }
    
    const modal = document.getElementById('contestantModal');
    const title = document.getElementById('contestantModalTitle');
    const preview = document.getElementById('avatarPreview');
    const clearBtn = document.getElementById('clearAvatarBtn');
    
    if (contestant) {
        title.textContent = '编辑选手';
        document.getElementById('contestantId').value = contestant.id;
        document.getElementById('contestantNameInput').value = contestant.name;
        document.getElementById('contestantNumberInput').value = contestant.number;
        document.getElementById('contestantDept').value = contestant.department || '';
        document.getElementById('contestantDesc').value = contestant.description || '';
        document.getElementById('contestantAvatarUrl').value = contestant.avatar_url || '';
        
        if (contestant.avatar_url) {
            preview.innerHTML = `<img src="${contestant.avatar_url}" alt="头像" style="width:100%;height:100%;object-fit:cover;">`;
            clearBtn.classList.remove('hidden');
        } else {
            preview.innerHTML = `<svg class="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/></svg>`;
            clearBtn.classList.add('hidden');
        }
    } else {
        title.textContent = '添加选手';
        document.getElementById('contestantForm').reset();
        document.getElementById('contestantId').value = '';
        document.getElementById('contestantAvatarUrl').value = '';
        preview.innerHTML = `<svg class="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/></svg>`;
        clearBtn.classList.add('hidden');
    }
    
    modal.classList.add('active');
}

function closeContestantModal() {
    document.getElementById('contestantModal').classList.remove('active');
}

function editContestant(id) {
    const contestant = contestants.find(c => c.id === id);
    if (contestant) {
        openContestantModal(contestant);
    }
}

async function handleContestantSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('contestantId').value;
    const data = {
        name: document.getElementById('contestantNameInput').value,
        number: parseInt(document.getElementById('contestantNumberInput').value),
        department: document.getElementById('contestantDept').value,
        description: document.getElementById('contestantDesc').value,
        avatar_url: document.getElementById('contestantAvatarUrl').value,
        event_id: currentEventId
    };
    
    try {
        if (id) {
            await db.updateContestant(id, data);
            showToast('选手已更新', 'success');
        } else {
            data.order_index = contestants.length + 1;
            await db.createContestant(data);
            showToast('选手已添加', 'success');
        }
        closeContestantModal();
        contestants = await db.getContestants(currentEventId);
        updateUI();
    } catch (error) {
        showToast(error.message || '操作失败', 'error');
    }
}

function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 200 * 1024) {
        showToast('图片大小不能超过 200KB', 'error');
        e.target.value = '';
        return;
    }
    
    if (!file.type.startsWith('image/')) {
        showToast('请选择图片文件', 'error');
        e.target.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(event) {
        const base64 = event.target.result;
        document.getElementById('contestantAvatarUrl').value = base64;
        
        const preview = document.getElementById('avatarPreview');
        preview.innerHTML = `<img src="${base64}" alt="头像预览" style="width:100%;height:100%;object-fit:cover;">`;
        
        document.getElementById('clearAvatarBtn').classList.remove('hidden');
        showToast('图片已选择', 'success');
    };
    reader.onerror = function() {
        showToast('读取图片失败', 'error');
    };
    reader.readAsDataURL(file);
}

function clearAvatar() {
    document.getElementById('contestantAvatarUrl').value = '';
    document.getElementById('avatarInput').value = '';
    
    const preview = document.getElementById('avatarPreview');
    preview.innerHTML = `<svg class="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/></svg>`;
    
    document.getElementById('clearAvatarBtn').classList.add('hidden');
    showToast('头像已清除', 'success');
}

async function deleteContestant(id) {
    openConfirmModal('删除选手', '确定要删除该选手吗？相关的评分数据也会被删除。', async () => {
        try {
            await db.deleteContestant(id);
            contestants = await db.getContestants(currentEventId);
            updateUI();
            showToast('选手已删除', 'success');
        } catch (error) {
            showToast('删除失败', 'error');
        }
    });
}

function openJudgeModal(judge = null) {
    if (!currentEventId) {
        showToast('请先选择活动', 'error');
        return;
    }
    
    updateGroupSelect();
    
    const modal = document.getElementById('judgeModal');
    const title = document.getElementById('judgeModalTitle');
    
    if (judge) {
        title.textContent = '编辑评委';
        document.getElementById('judgeId').value = judge.id;
        document.getElementById('judgeUsernameInput').value = judge.username;
        document.getElementById('judgePasswordInput').value = '';
        document.getElementById('judgePasswordInput').placeholder = '留空则不修改密码';
        document.getElementById('judgePasswordInput').required = false;
        document.getElementById('judgeNumberInput').value = judge.judge_number;
        document.getElementById('judgeGroupSelect').value = judge.group_id || '';
    } else {
        title.textContent = '添加评委';
        document.getElementById('judgeForm').reset();
        document.getElementById('judgeId').value = '';
        document.getElementById('judgePasswordInput').placeholder = '请输入登录密码';
        document.getElementById('judgePasswordInput').required = true;
        if (judgeGroups.length > 0) {
            document.getElementById('judgeGroupSelect').value = judgeGroups[0].id;
        }
    }
    
    modal.classList.add('active');
}

function updateGroupSelect() {
    const select = document.getElementById('judgeGroupSelect');
    select.innerHTML = '<option value="">请选择分组</option>' + 
        judgeGroups.map(group => `<option value="${group.id}">${group.name}</option>`).join('');
}

function closeJudgeModal() {
    document.getElementById('judgeModal').classList.remove('active');
}

function editJudge(id) {
    const judge = judges.find(j => j.id === id);
    if (judge) {
        openJudgeModal(judge);
    }
}

async function handleJudgeSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('judgeId').value;
    const data = {
        username: document.getElementById('judgeUsernameInput').value,
        judge_number: parseInt(document.getElementById('judgeNumberInput').value),
        group_id: document.getElementById('judgeGroupSelect').value || null,
        event_id: currentEventId
    };
    
    const password = document.getElementById('judgePasswordInput').value;
    if (password) {
        data.password = password;
    }
    
    try {
        if (id) {
            await db.updateJudge(id, data);
            showToast('评委已更新', 'success');
        } else {
            if (!password) {
                showToast('请输入密码', 'error');
                return;
            }
            await db.createJudge(data);
            showToast('评委已添加', 'success');
        }
        closeJudgeModal();
        judges = await db.getJudges(currentEventId);
        updateUI();
    } catch (error) {
        showToast(error.message || '操作失败', 'error');
    }
}

async function deleteJudge(id) {
    openConfirmModal('删除评委', '确定要删除该评委吗？相关的评分数据也会被删除。', async () => {
        try {
            await db.deleteJudge(id);
            judges = await db.getJudges(currentEventId);
            updateUI();
            showToast('评委已删除', 'success');
        } catch (error) {
            showToast('删除失败', 'error');
        }
    });
}

function openGroupModal(group = null) {
    if (!currentEventId) {
        showToast('请先选择活动', 'error');
        return;
    }
    
    const modal = document.getElementById('groupModal');
    const title = document.getElementById('groupModalTitle');
    
    if (group) {
        title.textContent = '编辑分组';
        document.getElementById('groupId').value = group.id;
        document.getElementById('groupNameInput').value = group.name;
    } else {
        title.textContent = '添加分组';
        document.getElementById('groupForm').reset();
        document.getElementById('groupId').value = '';
    }
    
    modal.classList.add('active');
}

function closeGroupModal() {
    document.getElementById('groupModal').classList.remove('active');
}

function editGroup(id) {
    const group = judgeGroups.find(g => g.id === id);
    if (group) {
        openGroupModal(group);
    }
}

async function handleGroupSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('groupId').value;
    const data = {
        name: document.getElementById('groupNameInput').value,
        event_id: currentEventId
    };
    
    try {
        if (id) {
            await db.updateJudgeGroup(id, data);
            showToast('分组已更新', 'success');
        } else {
            await db.createJudgeGroup(data);
            showToast('分组已添加', 'success');
        }
        closeGroupModal();
        judgeGroups = await db.getJudgeGroups(currentEventId);
        updateUI();
    } catch (error) {
        showToast(error.message || '操作失败', 'error');
    }
}

async function deleteGroup(id) {
    const group = judgeGroups.find(g => g.id === id);
    if (group && group.name === '默认分组') {
        showToast('默认分组不能删除', 'error');
        return;
    }
    
    const judgeCount = judges.filter(j => j.group_id === id).length;
    const message = judgeCount > 0 
        ? `确定要删除该分组吗？该分组下的 ${judgeCount} 名评委将变为未分组状态。`
        : '确定要删除该分组吗？';
    
    openConfirmModal('删除分组', message, async () => {
        try {
            await db.deleteJudgeGroup(id);
            judgeGroups = await db.getJudgeGroups(currentEventId);
            judges = await db.getJudges(currentEventId);
            updateUI();
            showToast('分组已删除', 'success');
        } catch (error) {
            showToast('删除失败', 'error');
        }
    });
}

let roundGroupSettings = [];

async function openRoundModal(round = null) {
    if (!currentEventId) {
        showToast('请先选择活动', 'error');
        return;
    }
    
    const modal = document.getElementById('roundModal');
    const title = document.getElementById('roundModalTitle');
    
    if (round) {
        title.textContent = '编辑评分轮次';
        document.getElementById('roundId').value = round.id;
        document.getElementById('roundNameInput').value = round.name;
        document.getElementById('roundWeightInput').value = round.weight;
        document.getElementById('roundMethodSelect').value = round.calculation_method;
        
        try {
            roundGroupSettings = await db.getRoundGroupSettings(round.id);
        } catch (error) {
            roundGroupSettings = [];
        }
        
        handleMethodChange();
    } else {
        title.textContent = '添加评分轮次';
        document.getElementById('roundForm').reset();
        document.getElementById('roundId').value = '';
        document.getElementById('roundWeightInput').value = '1.00';
        document.getElementById('roundMethodSelect').value = 'average';
        roundGroupSettings = [];
        document.getElementById('trimSettings').classList.add('hidden');
    }
    
    modal.classList.add('active');
}

function closeRoundModal() {
    document.getElementById('roundModal').classList.remove('active');
    roundGroupSettings = [];
}

async function editRound(id) {
    const round = scoringRounds.find(r => r.id === id);
    if (round) {
        await openRoundModal(round);
    }
}

function handleMethodChange() {
    const method = document.getElementById('roundMethodSelect').value;
    const trimSettings = document.getElementById('trimSettings');
    
    if (method === 'trimmed_average') {
        trimSettings.classList.remove('hidden');
        renderGroupTrimSettings();
    } else {
        trimSettings.classList.add('hidden');
    }
}

function renderGroupTrimSettings() {
    const container = document.getElementById('groupTrimSettings');
    
    if (judgeGroups.length === 0) {
        container.innerHTML = '<p class="text-slate-500">暂无评委分组，请先添加分组</p>';
        return;
    }
    
    container.innerHTML = judgeGroups.map(group => {
        const existingSetting = roundGroupSettings.find(s => s.group_id === group.id);
        const weight = existingSetting?.weight ?? 1.00;
        const trimHigh = existingSetting?.trim_high_count ?? 1;
        const trimLow = existingSetting?.trim_low_count ?? 1;
        
        return `
            <div class="p-3 rounded-lg bg-slate-700 border border-slate-600">
                <div class="font-medium text-white mb-2">${group.name}</div>
                <div class="grid grid-cols-3 gap-3">
                    <div>
                        <label class="form-label text-sm">权重</label>
                        <input type="number" class="form-input" min="0" max="10" step="0.01" value="${weight}" 
                               data-group-id="${group.id}" data-field="weight">
                    </div>
                    <div>
                        <label class="form-label text-sm">去除最高分</label>
                        <input type="number" class="form-input" min="0" max="10" value="${trimHigh}" 
                               data-group-id="${group.id}" data-field="trim_high">
                    </div>
                    <div>
                        <label class="form-label text-sm">去除最低分</label>
                        <input type="number" class="form-input" min="0" max="10" value="${trimLow}"
                               data-group-id="${group.id}" data-field="trim_low">
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function handleRoundSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('roundId').value;
    const method = document.getElementById('roundMethodSelect').value;
    
    const data = {
        name: document.getElementById('roundNameInput').value,
        weight: parseFloat(document.getElementById('roundWeightInput').value),
        calculation_method: method,
        event_id: currentEventId
    };
    
    if (!id) {
        data.round_order = scoringRounds.length + 1;
    }
    
    try {
        let roundId = id;
        
        if (id) {
            await db.updateScoringRound(id, data);
            showToast('轮次已更新', 'success');
        } else {
            const newRound = await db.createScoringRound(data);
            roundId = newRound.id;
            if (scoringRounds.length === 0) {
                await db.setActiveRound(newRound.id);
                currentRoundId = newRound.id;
            }
            showToast('轮次已添加', 'success');
        }
        
        if (method === 'trimmed_average') {
            const groupSettingsContainer = document.getElementById('groupTrimSettings');
            const inputs = groupSettingsContainer.querySelectorAll('input[data-group-id]');
            const settings = [];
            
            inputs.forEach(input => {
                const groupId = input.dataset.groupId;
                const field = input.dataset.field;
                const value = parseFloat(input.value) || 0;
                
                let setting = settings.find(s => s.group_id === groupId);
                if (!setting) {
                    setting = {
                        round_id: roundId,
                        group_id: groupId,
                        weight: 1.00,
                        trim_high_count: 1,
                        trim_low_count: 1
                    };
                    settings.push(setting);
                }
                
                if (field === 'weight') {
                    setting.weight = value;
                } else if (field === 'trim_high') {
                    setting.trim_high_count = parseInt(value);
                } else if (field === 'trim_low') {
                    setting.trim_low_count = parseInt(value);
                }
            });
            
            for (const setting of settings) {
                await db.createRoundGroupSetting(setting);
            }
        }
        
        closeRoundModal();
        scoringRounds = await db.getScoringRounds(currentEventId);
        updateUI();
    } catch (error) {
        showToast(error.message || '操作失败', 'error');
    }
}

async function deleteRound(id) {
    if (scoringRounds.length <= 1) {
        showToast('至少需要保留一个评分轮次', 'error');
        return;
    }
    
    openConfirmModal('删除评分轮次', '确定要删除该评分轮次吗？该轮次的所有评分数据都会被删除。', async () => {
        try {
            await db.deleteScoringRound(id);
            scoringRounds = await db.getScoringRounds(currentEventId);
            
            if (currentRoundId === id && scoringRounds.length > 0) {
                currentRoundId = scoringRounds[0].id;
                await db.setActiveRound(currentRoundId);
            }
            
            updateUI();
            showToast('轮次已删除', 'success');
        } catch (error) {
            showToast('删除失败', 'error');
        }
    });
}

function openEventListModal() {
    updateEventListContainer();
    document.getElementById('eventListModal').classList.add('active');
}

function closeEventListModal() {
    document.getElementById('eventListModal').classList.remove('active');
}

function updateEventListContainer() {
    const container = document.getElementById('eventListContainer');
    
    if (events.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-center py-4">暂无活动</p>';
        return;
    }
    
    container.innerHTML = events.map(event => {
        const isCurrent = event.id === currentEventId;
        
        return `
            <div class="flex items-center justify-between p-4 rounded-lg bg-slate-800 ${isCurrent ? 'ring-2 ring-indigo-500' : ''}">
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <span class="font-medium text-white">${event.name}</span>
                        <span class="badge ${getStatusClass(event.status)}">${getStatusText(event.status)}</span>
                        ${isCurrent ? '<span class="badge badge-primary">当前</span>' : ''}
                    </div>
                    <div class="text-sm text-slate-500 mt-1">
                        ${event.description || '暂无描述'}
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button class="btn btn-secondary btn-sm" onclick="activateEvent('${event.id}')" title="激活" ${isCurrent ? 'disabled' : ''}>
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="editEvent('${event.id}')" title="编辑">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="openCopyEventModal('${event.id}', '${event.name}')" title="复制">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                        </svg>
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="toggleEventStatus('${event.id}', '${event.status}')" title="${event.status === 'active' ? '暂停' : '启用'}">
                        ${event.status === 'active' 
                            ? '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>'
                            : '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>'
                        }
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteEvent('${event.id}')" title="删除">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function openEventModal(event = null) {
    const modal = document.getElementById('eventModal');
    const title = document.getElementById('eventModalTitle');
    
    if (event) {
        title.textContent = '编辑活动';
        document.getElementById('eventId').value = event.id;
        document.getElementById('eventNameInput').value = event.name;
        document.getElementById('eventDescInput').value = event.description || '';
        document.getElementById('eventStartTime').value = event.start_time ? event.start_time.slice(0, 16) : '';
        document.getElementById('eventEndTime').value = event.end_time ? event.end_time.slice(0, 16) : '';
    } else {
        title.textContent = '创建活动';
        document.getElementById('eventForm').reset();
        document.getElementById('eventId').value = '';
    }
    
    modal.classList.add('active');
}

function closeEventModal() {
    document.getElementById('eventModal').classList.remove('active');
}

function editEvent(id) {
    const event = events.find(e => e.id === id);
    if (event) {
        openEventModal(event);
    }
}

async function handleEventSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('eventId').value;
    const data = {
        name: document.getElementById('eventNameInput').value,
        description: document.getElementById('eventDescInput').value,
        start_time: document.getElementById('eventStartTime').value || null,
        end_time: document.getElementById('eventEndTime').value || null
    };
    
    try {
        if (id) {
            await db.updateEvent(id, data);
            showToast('活动已更新', 'success');
        } else {
            data.status = 'draft';
            await db.createEvent(data);
            showToast('活动已创建', 'success');
        }
        closeEventModal();
        events = await db.getEvents();
        updateEventDropdown();
        updateEventListContainer();
    } catch (error) {
        showToast(error.message || '操作失败', 'error');
    }
}

async function activateEvent(eventId) {
    openConfirmModal('激活活动', '激活此活动将切换到该活动，确定要激活吗？', async () => {
        try {
            await switchToEvent(eventId);
            closeEventListModal();
            events = await db.getEvents();
            updateEventDropdown();
            updateEventListContainer();
        } catch (error) {
            showToast('激活失败', 'error');
        }
    });
}

async function toggleEventStatus(eventId, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
        await db.updateEvent(eventId, { status: newStatus });
        events = await db.getEvents();
        updateEventListContainer();
        updateEventStatus();
        showToast(newStatus === 'active' ? '活动已启用' : '活动已暂停', 'success');
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

async function deleteEvent(id) {
    if (id === currentEventId) {
        showToast('无法删除当前活动', 'error');
        return;
    }
    
    openConfirmModal('删除活动', '确定要删除该活动吗？该活动下的所有选手、评委和评分数据都会被删除。', async () => {
        try {
            await db.deleteEvent(id);
            events = await db.getEvents();
            updateEventDropdown();
            updateEventListContainer();
            showToast('活动已删除', 'success');
        } catch (error) {
            showToast('删除失败', 'error');
        }
    });
}

function openCopyEventModal(eventId, eventName) {
    document.getElementById('copyEventId').value = eventId;
    document.getElementById('copyEventName').value = eventName + ' (副本)';
    document.getElementById('copyEventModal').classList.add('active');
}

function closeCopyEventModal() {
    document.getElementById('copyEventModal').classList.remove('active');
}

async function handleCopyEventSubmit(e) {
    e.preventDefault();
    
    const eventId = document.getElementById('copyEventId').value;
    const newName = document.getElementById('copyEventName').value;
    
    try {
        await db.copyEvent(eventId, newName);
        closeCopyEventModal();
        events = await db.getEvents();
        updateEventDropdown();
        updateEventListContainer();
        showToast('活动已复制', 'success');
    } catch (error) {
        showToast(error.message || '复制失败', 'error');
    }
}

function openConfirmModal(title, message, callback) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    confirmCallback = callback;
    document.getElementById('confirmModal').classList.add('active');
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('active');
    confirmCallback = null;
}

async function handleConfirm() {
    if (confirmCallback) {
        await confirmCallback();
    }
    closeConfirmModal();
}

function subscribeToChanges() {
    const stateSub = db.subscribeToSystemState((payload) => {
        systemState = payload.new;
        updateUI();
    });
    subscriptions.push(stateSub);
    
    const contestantSub = db.subscribeToContestants(async () => {
        if (currentEventId) {
            contestants = await db.getContestants(currentEventId);
            updateUI();
        }
    });
    subscriptions.push(contestantSub);
    
    const eventSub = db.subscribeToEvents(async () => {
        events = await db.getEvents();
        updateEventDropdown();
        updateEventStatus();
    });
    subscriptions.push(eventSub);
    
    const groupSub = db.subscribeToJudgeGroups(async () => {
        if (currentEventId) {
            judgeGroups = await db.getJudgeGroups(currentEventId);
            updateUI();
        }
    });
    subscriptions.push(groupSub);
    
    const roundSub = db.subscribeToScoringRounds(async () => {
        if (currentEventId) {
            scoringRounds = await db.getScoringRounds(currentEventId);
            updateUI();
        }
    });
    subscriptions.push(roundSub);
}

function initThemeSettings() {
    const grid = document.getElementById('themePreviewGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    for (let i = 1; i <= 4; i++) {
        const themeItem = document.createElement('div');
        themeItem.className = 'theme-preview-item';
        themeItem.setAttribute('data-theme', i);
        themeItem.onclick = () => selectTheme(i);
        
        themeItem.innerHTML = `
            <img src="img/${i}-1.jpg" alt="主题 ${i} - 等待" class="theme-preview-img">
            <div class="theme-preview-label">主题 ${i}</div>
        `;
        
        grid.appendChild(themeItem);
    }
    
    loadCurrentTheme();
    
    document.getElementById('applyThemeBtn').addEventListener('click', applyTheme);
}

function selectTheme(themeId) {
    selectedTheme = themeId;
    
    document.querySelectorAll('.theme-preview-item').forEach(item => {
        item.classList.remove('selected');
        if (parseInt(item.getAttribute('data-theme')) === themeId) {
            item.classList.add('selected');
        }
    });
}

function updateThemeSelection() {
    selectTheme(selectedTheme);
}

async function loadCurrentTheme() {
    try {
        const state = await db.getSystemState();
        const theme = state?.display_theme || 1;
        selectedTheme = theme;
        selectTheme(theme);
    } catch (error) {
        console.error('加载主题设置失败:', error);
    }
}

async function applyTheme() {
    try {
        await db.updateSystemState({ display_theme: selectedTheme });
        showToast('主题已应用', 'success');
    } catch (error) {
        showToast('应用主题失败', 'error');
        console.error(error);
    }
}

async function setDisplayMode(mode) {
    try {
        await db.updateSystemState({ display_mode: mode });
        
        document.querySelectorAll('.display-mode-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.mode === mode) {
                btn.classList.add('active');
            }
        });
        
        showToast('显示模式已更新', 'success');
    } catch (error) {
        showToast('更新显示模式失败', 'error');
        console.error(error);
    }
}

async function toggleContestant(contestantId) {
    if (!currentEventId) {
        showToast('请先选择活动', 'error');
        return;
    }
    
    try {
        await db.updateSystemState({ 
            current_contestant_id: contestantId,
            display_mode: 'scoring'
        });
        
        contestants = await db.getContestants(currentEventId);
        updateUI();
        
        showToast('已切换选手', 'success');
    } catch (error) {
        showToast('切换选手失败', 'error');
        console.error(error);
    }
}

async function toggleRound(roundId) {
    if (!currentEventId) {
        showToast('请先选择活动', 'error');
        return;
    }
    
    try {
        await db.setActiveRound(roundId);
        currentRoundId = roundId;
        
        scoringRounds = await db.getScoringRounds(currentEventId);
        updateUI();
        
        showToast('已切换轮次', 'success');
    } catch (error) {
        showToast('切换轮次失败', 'error');
        console.error(error);
    }
}

function updateContestantListControl() {
    const container = document.getElementById('contestantListControl');
    
    if (!currentEventId) {
        container.innerHTML = '<p class="text-slate-500 text-center py-4">请先选择活动</p>';
        return;
    }
    
    if (contestants.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-center py-4">暂无选手</p>';
        return;
    }
    
    container.innerHTML = contestants.map(contestant => {
        const isActive = contestant.id === systemState?.current_contestant_id;
        const avatarText = contestant.name ? contestant.name.charAt(0).toUpperCase() : '?';
        const avatarHtml = contestant.avatar_url 
            ? `<img src="${contestant.avatar_url}" alt="${contestant.name}">`
            : `<span>${avatarText}</span>`;
        
        const scores = contestant.scores || [];
        const submittedCount = scores.filter(s => s.score !== null).length;
        const totalCount = judges.length;
        const avgScore = submittedCount > 0 
            ? (scores.reduce((sum, s) => sum + (s.score || 0), 0) / submittedCount).toFixed(2)
            : null;
        
        return `
            <button class="contestant-item ${isActive ? 'active' : ''}" onclick="toggleContestant('${contestant.id}')">
                <div class="contestant-avatar">
                    ${avatarHtml}
                </div>
                <div class="contestant-info">
                    <div class="flex items-center gap-1.5">
                        <span class="contestant-number">#${contestant.number}</span>
                        ${isActive ? '<span class="contestant-active-badge">当前</span>' : ''}
                    </div>
                    <div class="contestant-name">${contestant.name}</div>
                    <div class="contestant-dept">${contestant.department || ''}</div>
                </div>
                ${totalCount > 0 ? `
                    <div class="contestant-score-info">
                        <div class="contestant-score-count">${submittedCount}/${totalCount}</div>
                        ${avgScore ? `<div class="contestant-score">${avgScore}</div>` : ''}
                    </div>
                ` : ''}
            </button>
        `;
    }).join('');
}

function updateCurrentContestantPreview() {
    const container = document.getElementById('currentContestantPreview');
    const avatarEl = document.getElementById('currentContestantAvatar');
    const nameEl = document.getElementById('currentContestantName');
    const detailEl = document.getElementById('currentContestantDetail');
    const roundNameEl = document.getElementById('currentRoundName');
    
    const contestantId = systemState?.current_contestant_id;
    const contestant = contestants.find(c => c.id === contestantId);
    
    if (contestant) {
        const avatarText = contestant.name ? contestant.name.charAt(0).toUpperCase() : '?';
        avatarEl.innerHTML = contestant.avatar_url 
            ? `<img src="${contestant.avatar_url}" alt="${contestant.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
            : `<span>${avatarText}</span>`;
        
        nameEl.textContent = contestant.name;
        detailEl.textContent = ` · #${contestant.number}`;
        
        const currentRound = scoringRounds.find(r => r.id === currentRoundId);
        roundNameEl.textContent = currentRound ? currentRound.name : '-';
    } else {
        avatarEl.innerHTML = `
            <svg class="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/>
            </svg>
        `;
        nameEl.textContent = '未选择';
        detailEl.textContent = '';
        roundNameEl.textContent = '-';
    }
}

function updateRoundListControl() {
    const container = document.getElementById('roundListControl');
    
    if (!currentEventId) {
        container.innerHTML = '<p class="text-slate-500 text-center py-4">请先选择活动</p>';
        return;
    }
    
    if (scoringRounds.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-center py-4">暂无评分轮次</p>';
        return;
    }
    
    container.innerHTML = scoringRounds.map(round => {
        const isActive = round.id === currentRoundId;
        return `
            <button class="round-btn ${isActive ? 'active' : 'inactive'}" onclick="toggleRound('${round.id}')">
                ${round.name}
                <span class="round-dot ${isActive ? 'active-dot' : 'inactive-dot'}">●</span>
            </button>
        `;
    }).join('');
}

function updateLockButton() {
    const btn = document.getElementById('lockBtn');
    const icon = document.getElementById('lockIcon');
    const text = document.getElementById('lockBtnText');
    const isLocked = systemState?.is_locked;
    
    if (isLocked) {
        btn.classList.remove('unlocked');
        btn.classList.add('locked');
        icon.innerHTML = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>';
        text.textContent = '评分已锁定';
    } else {
        btn.classList.remove('locked');
        btn.classList.add('unlocked');
        icon.innerHTML = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>';
        text.textContent = '评分已开放';
    }
}

function updateDisplayModeButtons() {
    const mode = systemState?.display_mode || 'waiting';
    
    document.querySelectorAll('.display-mode-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.mode === mode) {
            btn.classList.add('active');
        }
    });
}

function updateRoundListControl() {
    const container = document.getElementById('roundListControl');
    
    if (!currentEventId) {
        container.innerHTML = '<p class="text-slate-500 text-center py-4">请先选择活动</p>';
        return;
    }
    
    if (scoringRounds.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-center py-4">暂无评分轮次</p>';
        return;
    }
    
    container.innerHTML = scoringRounds.map(round => {
        const isActive = round.id === currentRoundId;
        return `
            <button class="round-btn ${isActive ? 'active' : 'inactive'}" onclick="toggleRound('${round.id}')">
                ${round.name}
                <span class="round-dot ${isActive ? 'active-dot' : 'inactive-dot'}">●</span>
            </button>
        `;
    }).join('');
}

function updateThemeSelection() {
    selectTheme(selectedTheme);
}

async function updateScoreProgress() {
    if (!currentEventId || !currentRoundId || !systemState?.current_contestant_id) {
        return;
    }
    
    const contestantId = systemState.current_contestant_id;
    
    try {
        const scores = await db.getScoresByContestant(contestantId, currentRoundId);
        const submittedCount = scores.filter(s => s.score !== null).length;
        const totalCount = judges.length;
        
        const progressFill = document.getElementById('scoreProgressFill');
        const progressText = document.getElementById('scoreProgressText');
        const progressTitle = document.getElementById('scoreProgressTitle');
        const scoresGrid = document.getElementById('judgeScoresGrid');
        
        const currentRound = scoringRounds.find(r => r.id === currentRoundId);
        progressTitle.textContent = `评分进度 — ${currentRound ? currentRound.name : '当前轮次'}`;
        
        const percentage = totalCount > 0 ? (submittedCount / totalCount * 100) : 0;
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `${submittedCount}/${totalCount}`;
        
        scoresGrid.innerHTML = judges.map(judge => {
            const score = scores.find(s => s.judge_id === judge.id);
            const hasScore = score && score.score !== null;
            
            return `
                <div class="judge-score-item ${hasScore ? 'submitted' : 'pending'}">
                    <span class="judge-number">${judge.judge_number}</span>
                    <span class="judge-score-value ${hasScore ? 'submitted-value' : 'pending-value'}">
                        ${hasScore ? parseFloat(score.score).toFixed(1) : '—'}
                    </span>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('更新评分进度失败:', error);
    }
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            ${type === 'success' 
                ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'
                : '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>'
            }
        </svg>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

window.selectContestant = selectContestant;
window.editContestant = editContestant;
window.deleteContestant = deleteContestant;
window.editJudge = editJudge;
window.deleteJudge = deleteJudge;
window.editGroup = editGroup;
window.deleteGroup = deleteGroup;
window.setActiveRound = setActiveRound;
window.editRound = editRound;
window.deleteRound = deleteRound;
window.handleMethodChange = handleMethodChange;
window.handleContestantRoundChange = handleContestantRoundChange;
window.closeContestantModal = closeContestantModal;
window.closeJudgeModal = closeJudgeModal;
window.closeGroupModal = closeGroupModal;
window.closeRoundModal = closeRoundModal;
window.closeConfirmModal = closeConfirmModal;
window.closeEventModal = closeEventModal;
window.closeEventListModal = closeEventListModal;
window.closeCopyEventModal = closeCopyEventModal;
window.editEvent = editEvent;
window.activateEvent = activateEvent;
window.toggleEventStatus = toggleEventStatus;
window.deleteEvent = deleteEvent;
window.openCopyEventModal = openCopyEventModal;
window.selectEvent = selectEvent;
window.selectTheme = selectTheme;
window.setDisplayMode = setDisplayMode;
window.toggleContestant = toggleContestant;
window.toggleRound = toggleRound;
window.clearAvatar = clearAvatar;

// 数据管理功能
function updateDataRoundSelect() {
    const select = document.getElementById('dataRoundSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="all">全部轮次</option>' +
        scoringRounds.map(round => `<option value="${round.id}">${round.name}</option>`).join('');
}

async function loadDataResults() {
    const tbody = document.getElementById('dataResultsBody');
    const roundSelect = document.getElementById('dataRoundSelect');
    const selectedRoundId = roundSelect ? roundSelect.value : 'all';
    
    if (!currentEventId) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-slate-500 py-8">请先选择活动</td></tr>';
        return;
    }
    
    if (contestants.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-slate-500 py-8">暂无选手数据</td></tr>';
        return;
    }
    
    try {
        const results = await db.getFinalResultsWithRounds(currentEventId);
        
        if (!results || results.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-slate-500 py-8">暂无评分数据</td></tr>';
            return;
        }
        
        let sortedResults = [...results].sort((a, b) => b.final_score - a.final_score);
        
        tbody.innerHTML = sortedResults.map((result, index) => {
            const rank = index + 1;
            const rankClass = rank <= 3 ? `rank-${rank}` : '';
            
            let roundScoresHtml = '';
            if (result.round_scores && result.round_scores.length > 0) {
                if (selectedRoundId === 'all') {
                    roundScoresHtml = result.round_scores.map(rs => {
                        const score = rs.score ? parseFloat(rs.score).toFixed(2) : '-';
                        return `<span class="inline-block px-2 py-0.5 rounded bg-slate-700 mr-1 text-xs">${rs.round_name}: ${score}</span>`;
                    }).join('');
                } else {
                    const selectedRound = result.round_scores.find(rs => rs.round_id === selectedRoundId);
                    const score = selectedRound && selectedRound.score ? parseFloat(selectedRound.score).toFixed(2) : '-';
                    roundScoresHtml = `<span class="score-cell">${score}</span>`;
                }
            }
            
            return `
                <tr>
                    <td class="${rankClass}">${rank}</td>
                    <td>#${result.number}</td>
                    <td class="font-medium">${result.name}</td>
                    <td class="text-slate-400">${result.department || '-'}</td>
                    <td>${roundScoresHtml || '-'}</td>
                    <td class="score-cell text-emerald-400">${parseFloat(result.final_score).toFixed(2)}</td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('加载评分结果失败:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-slate-500 py-8">加载失败</td></tr>';
    }
}

async function loadJudgeDetailResults() {
    const header = document.getElementById('judgeDetailHeader');
    const tbody = document.getElementById('judgeDetailBody');
    
    if (!currentEventId) {
        header.innerHTML = '<th>编号</th><th>选手姓名</th>';
        tbody.innerHTML = '<tr><td colspan="2" class="text-center text-slate-500 py-8">请先选择活动</td></tr>';
        return;
    }
    
    if (contestants.length === 0 || judges.length === 0) {
        header.innerHTML = '<th>编号</th><th>选手姓名</th>';
        tbody.innerHTML = '<tr><td colspan="2" class="text-center text-slate-500 py-8">暂无数据</td></tr>';
        return;
    }
    
    header.innerHTML = `
        <th>编号</th>
        <th>选手姓名</th>
        ${judges.map(j => `<th class="text-center">评委${j.judge_number}</th>`).join('')}
        <th class="text-center">平均分</th>
    `;
    
    try {
        const supabase = getSupabase();
        const { data: allScores, error } = await supabase
            .from('scores')
            .select('contestant_id, judge_id, score, round_id')
            .eq('event_id', currentEventId);
        
        if (error) throw error;
        
        tbody.innerHTML = contestants.map(contestant => {
            const contestantScores = allScores.filter(s => s.contestant_id === contestant.id);
            
            let totalScore = 0;
            let scoreCount = 0;
            
            const judgeCells = judges.map(judge => {
                const scores = contestantScores.filter(s => s.judge_id === judge.id);
                if (scores.length > 0) {
                    const avgScore = scores.reduce((sum, s) => sum + (s.score || 0), 0) / scores.length;
                    totalScore += avgScore;
                    scoreCount++;
                    return `<td class="text-center score-cell">${avgScore.toFixed(1)}</td>`;
                }
                return '<td class="text-center text-slate-600">-</td>';
            }).join('');
            
            const avgScore = scoreCount > 0 ? (totalScore / scoreCount).toFixed(2) : '-';
            
            return `
                <tr>
                    <td>#${contestant.number}</td>
                    <td class="font-medium">${contestant.name}</td>
                    ${judgeCells}
                    <td class="text-center score-cell text-emerald-400">${avgScore}</td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('加载评委明细失败:', error);
        tbody.innerHTML = '<tr><td colspan="2" class="text-center text-slate-500 py-8">加载失败</td></tr>';
    }
}

async function exportToXlsx() {
    if (!currentEventId) {
        showToast('请先选择活动', 'error');
        return;
    }
    
    try {
        const results = await db.getFinalResultsWithRounds(currentEventId);
        const event = events.find(e => e.id === currentEventId);
        const eventName = event ? event.name : '评分结果';
        
        if (!results || results.length === 0) {
            showToast('暂无数据可导出', 'error');
            return;
        }
        
        let sortedResults = [...results].sort((a, b) => b.final_score - a.final_score);
        
        const rounds = scoringRounds.map(r => r.name);
        
        const headers = ['排名', '编号', '选手姓名', '部门/单位', ...rounds, '最终得分'];
        
        const data = sortedResults.map((result, index) => {
            const row = [
                index + 1,
                result.number,
                result.name,
                result.department || '',
            ];
            
            if (result.round_scores) {
                rounds.forEach(roundName => {
                    const rs = result.round_scores.find(r => r.round_name === roundName);
                    row.push(rs && rs.score ? parseFloat(rs.score).toFixed(2) : '');
                });
            } else {
                rounds.forEach(() => row.push(''));
            }
            
            row.push(parseFloat(result.final_score).toFixed(2));
            return row;
        });
        
        const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '评分结果');
        
        const colWidths = headers.map((h, i) => {
            let maxLen = h.length;
            data.forEach(row => {
                const cellLen = String(row[i] || '').length;
                if (cellLen > maxLen) maxLen = cellLen;
            });
            return { wch: Math.min(maxLen + 2, 30) };
        });
        ws['!cols'] = colWidths;
        
        XLSX.writeFile(wb, `${eventName}_评分结果.xlsx`);
        showToast('导出成功', 'success');
        
    } catch (error) {
        console.error('导出失败:', error);
        showToast('导出失败', 'error');
    }
}

async function exportJudgeDetailsXlsx() {
    if (!currentEventId) {
        showToast('请先选择活动', 'error');
        return;
    }
    
    try {
        const supabase = getSupabase();
        const { data: allScores, error } = await supabase
            .from('scores')
            .select('contestant_id, judge_id, score, round_id')
            .eq('event_id', currentEventId);
        
        if (error) throw error;
        
        const event = events.find(e => e.id === currentEventId);
        const eventName = event ? event.name : '评分结果';
        
        const headers = ['编号', '选手姓名', ...judges.map(j => `评委${j.judge_number}`), '平均分'];
        
        const data = contestants.map(contestant => {
            const contestantScores = allScores.filter(s => s.contestant_id === contestant.id);
            
            let totalScore = 0;
            let scoreCount = 0;
            
            const judgeScores = judges.map(judge => {
                const scores = contestantScores.filter(s => s.judge_id === judge.id);
                if (scores.length > 0) {
                    const avgScore = scores.reduce((sum, s) => sum + (s.score || 0), 0) / scores.length;
                    totalScore += avgScore;
                    scoreCount++;
                    return parseFloat(avgScore.toFixed(1));
                }
                return '';
            });
            
            const avgScore = scoreCount > 0 ? parseFloat((totalScore / scoreCount).toFixed(2)) : '';
            
            return [contestant.number, contestant.name, ...judgeScores, avgScore];
        });
        
        const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '评委评分明细');
        
        const colWidths = headers.map((h, i) => {
            let maxLen = h.length;
            data.forEach(row => {
                const cellLen = String(row[i] || '').length;
                if (cellLen > maxLen) maxLen = cellLen;
            });
            return { wch: Math.min(maxLen + 2, 20) };
        });
        ws['!cols'] = colWidths;
        
        XLSX.writeFile(wb, `${eventName}_评委评分明细.xlsx`);
        showToast('导出成功', 'success');
        
    } catch (error) {
        console.error('导出失败:', error);
        showToast('导出失败', 'error');
    }
}

window.loadDataResults = loadDataResults;
window.loadJudgeDetailResults = loadJudgeDetailResults;
window.exportToXlsx = exportToXlsx;
window.exportJudgeDetailsXlsx = exportJudgeDetailsXlsx;
