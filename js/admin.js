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
    document.getElementById('confirmBtn').addEventListener('click', handleConfirm);
    
    document.getElementById('eventSelect').addEventListener('change', handleEventChange);
    document.getElementById('manageEventsBtn').addEventListener('click', openEventListModal);
    document.getElementById('addEventBtn').addEventListener('click', () => openEventModal());
    document.getElementById('eventForm').addEventListener('submit', handleEventSubmit);
    document.getElementById('copyEventForm').addEventListener('submit', handleCopyEventSubmit);
    
    document.getElementById('avatarInput').addEventListener('change', handleAvatarUpload);
    
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
}

async function loadEvents() {
    try {
        events = await db.getEvents();
        updateEventSelect();
        
        const state = await db.getSystemState();
        systemState = state;
        
        if (state.current_event_id) {
            currentEventId = state.current_event_id;
            document.getElementById('eventSelect').value = currentEventId;
            updateEventStatus();
        }
    } catch (error) {
        showToast('加载活动失败', 'error');
        console.error(error);
    }
}

function updateEventSelect() {
    const select = document.getElementById('eventSelect');
    select.innerHTML = '<option value="">请选择活动</option>';
    
    events.forEach(event => {
        const option = document.createElement('option');
        option.value = event.id;
        option.textContent = event.name + (event.is_active ? ' (当前)' : '');
        select.appendChild(option);
    });
    
    if (currentEventId) {
        select.value = currentEventId;
    }
}

function updateEventStatus() {
    const event = events.find(e => e.id === currentEventId);
    const infoDiv = document.getElementById('currentEventInfo');
    const statusDiv = document.getElementById('eventStatus');
    
    if (event) {
        infoDiv.classList.remove('hidden');
        const statusMap = {
            'draft': '草稿',
            'active': '进行中',
            'paused': '已暂停',
            'completed': '已完成'
        };
        statusDiv.textContent = statusMap[event.status] || event.status;
    } else {
        infoDiv.classList.add('hidden');
    }
}

async function handleEventChange(e) {
    const newEventId = e.target.value;
    
    if (!newEventId) {
        currentEventId = null;
        contestants = [];
        judges = [];
        updateUI();
        return;
    }
    
    if (currentEventId && currentEventId !== newEventId) {
        openConfirmModal('切换活动', '切换活动将保存当前活动的数据，确定要切换吗？', async () => {
            await switchToEvent(newEventId);
        });
        document.getElementById('eventSelect').value = currentEventId || '';
    } else {
        await switchToEvent(newEventId);
    }
}

async function switchToEvent(eventId) {
    try {
        await db.switchEvent(eventId);
        currentEventId = eventId;
        updateEventStatus();
        await loadData();
        showToast('已切换活动', 'success');
    } catch (error) {
        showToast('切换活动失败', 'error');
        console.error(error);
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
        
        updateUI();
    } catch (error) {
        showToast('加载数据失败', 'error');
        console.error(error);
    }
}

function updateUI() {
    updateDisplayModeRadios();
    updateLockButton();
    updateCurrentRoundBadge();
    updateCurrentContestantPreview();
    updateContestantList();
    updateGroupList();
    updateJudgeList();
    updateRoundList();
}

function updateDisplayModeRadios() {
    const mode = systemState?.display_mode || 'waiting';
    document.querySelectorAll('input[name="displayMode"]').forEach(radio => {
        radio.checked = radio.value === mode;
    });
}

function updateLockButton() {
    const btn = document.getElementById('lockBtn');
    
    if (systemState?.is_locked) {
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-warning');
        btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
            </svg>
            <span>解锁评分</span>
        `;
    } else {
        btn.classList.remove('btn-warning');
        btn.classList.add('btn-secondary');
        btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span>锁定评分</span>
        `;
    }
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
    const status = document.getElementById('currentStatus');
    
    const contestantId = systemState?.current_contestant_id;
    const contestant = contestants.find(c => c.id === contestantId);
    
    if (contestant) {
        status.textContent = '已选择';
        status.classList.remove('badge-warning');
        status.classList.add('badge-success');
        
        const avatarHtml = contestant.avatar_url 
            ? `<img src="${contestant.avatar_url}" alt="${contestant.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
        
        // 生成轮次选择下拉框
        const roundSelectHtml = scoringRounds.length > 0 ? `
            <div class="mt-4">
                <label class="form-label text-sm">当前评分轮次</label>
                <select id="contestantRoundSelect" class="form-input" onchange="handleContestantRoundChange()">
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
                    <h4 class="text-xl font-semibold">${contestant.name}</h4>
                    <div class="flex flex-col items-center justify-center md:items-start md:justify-start gap-1 mt-1">
                        <span class="badge badge-primary">${contestant.number}</span>
                        <span class="text-muted">${contestant.department || ''}</span>
                    </div>
                    <p class="text-muted mt-2">${contestant.description || '暂无简介'}</p>
                    ${roundSelectHtml}
                </div>
            </div>
        `;
    } else {
        status.textContent = '未选择';
        status.classList.remove('badge-success');
        status.classList.add('badge-warning');
        
        container.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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

function updateContestantList() {
    const container = document.getElementById('contestantList');
    
    if (!currentEventId) {
        container.innerHTML = `
            <div class="empty-state py-4">
                <p class="text-muted">请先选择活动</p>
            </div>
        `;
        return;
    }
    
    if (contestants.length === 0) {
        container.innerHTML = `
            <div class="empty-state py-4">
                <p class="text-muted">暂无选手</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = contestants.map(contestant => {
        const isCurrent = contestant.id === systemState?.current_contestant_id;
        const avatarHtml = contestant.avatar_url 
            ? `<img src="${contestant.avatar_url}" alt="${contestant.name}" class="w-10 h-10 rounded-full object-cover">`
            : `<div class="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>`;
        
        return `
            <div class="flex items-center justify-between p-3 rounded-lg bg-background ${isCurrent ? 'ring-2 ring-[var(--primary)]' : ''}">
                <div class="flex items-center gap-3">
                    ${avatarHtml}
                    <div>
                        <div class="font-medium">${contestant.name}</div>
                        <div class="text-muted text-sm">${contestant.department || ''}</div>
                    </div>
                    <span class="badge ${isCurrent ? 'badge-success' : 'badge-primary'}">${contestant.number}</span>
                </div>
                <div class="flex items-center gap-2">
                    <button class="btn btn-secondary btn-sm" onclick="selectContestant('${contestant.id}')" title="设为当前选手">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="editContestant('${contestant.id}')" title="编辑">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteContestant('${contestant.id}')" title="删除">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
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
        container.innerHTML = `
            <div class="empty-state py-4">
                <p class="text-muted">请先选择活动</p>
            </div>
        `;
        return;
    }
    
    if (judgeGroups.length === 0) {
        container.innerHTML = `
            <div class="empty-state py-4">
                <p class="text-muted">暂无分组</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = judgeGroups.map(group => {
        const judgeCount = judges.filter(j => j.group_id === group.id).length;
        return `
            <div class="flex items-center justify-between p-3 rounded-lg bg-background">
                <div class="flex items-center gap-3">
                    <div>
                        <div class="font-medium">${group.name}</div>
                        <div class="text-muted text-sm">评委: ${judgeCount}人</div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button class="btn btn-secondary btn-sm" onclick="editGroup('${group.id}')" title="编辑">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteGroup('${group.id}')" title="删除" ${group.name === '默认分组' ? 'disabled' : ''}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
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
        container.innerHTML = `
            <div class="empty-state py-4">
                <p class="text-muted">请先选择活动</p>
            </div>
        `;
        return;
    }
    
    if (judges.length === 0) {
        container.innerHTML = `
            <div class="empty-state py-4">
                <p class="text-muted">暂无评委</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = judges.map(judge => {
        const groupName = judge.judge_groups ? judge.judge_groups.name : '未分组';
        return `
            <div class="flex items-center justify-between p-3 rounded-lg bg-background">
                <div class="flex items-center gap-3">
                    <span class="badge badge-primary">${judge.judge_number}</span>
                    <div>
                        <div class="font-medium">${judge.username}</div>
                        <div class="text-muted text-sm">${groupName}</div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button class="btn btn-secondary btn-sm" onclick="editJudge('${judge.id}')" title="编辑">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteJudge('${judge.id}')" title="删除">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function updateRoundList() {
    const container = document.getElementById('roundList');
    
    if (!currentEventId) {
        container.innerHTML = `
            <div class="empty-state py-4">
                <p class="text-muted">请先选择活动</p>
            </div>
        `;
        return;
    }
    
    if (scoringRounds.length === 0) {
        container.innerHTML = `
            <div class="empty-state py-4">
                <p class="text-muted">暂无评分轮次</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = scoringRounds.map(round => {
        const isCurrent = round.id === currentRoundId;
        const methodText = round.calculation_method === 'trimmed_average' 
            ? '去高低分平均'
            : '平均分';
        
        return `
            <div class="flex items-center justify-between p-3 rounded-lg bg-background ${isCurrent ? 'ring-2 ring-[var(--primary)]' : ''}">
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <span class="font-medium">${round.name}</span>
                        ${isCurrent ? '<span class="badge badge-success">当前</span>' : ''}
                    </div>
                    <div class="text-muted text-sm mt-1">
                        权重: ${round.weight} | ${methodText}
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    ${!isCurrent ? `<button class="btn btn-secondary btn-sm" onclick="setActiveRound('${round.id}')" title="设为当前">设为当前</button>` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="editRound('${round.id}')" title="编辑">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteRound('${round.id}')" title="删除" ${scoringRounds.length <= 1 ? 'disabled' : ''}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
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
        updateRoundList();
        updateCurrentRoundBadge();
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
    
    if (contestant) {
        title.textContent = '编辑选手';
        document.getElementById('contestantId').value = contestant.id;
        document.getElementById('contestantNameInput').value = contestant.name;
        document.getElementById('contestantNumberInput').value = contestant.number;
        document.getElementById('contestantDept').value = contestant.department || '';
        document.getElementById('contestantDesc').value = contestant.description || '';
        document.getElementById('contestantAvatarUrl').value = contestant.avatar_url || '';
        
        if (contestant.avatar_url) {
            preview.innerHTML = `<img src="${contestant.avatar_url}" alt="头像">`;
        } else {
            preview.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
        }
    } else {
        title.textContent = '添加选手';
        document.getElementById('contestantForm').reset();
        document.getElementById('contestantId').value = '';
        document.getElementById('contestantAvatarUrl').value = '';
        preview.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
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
        preview.innerHTML = `<img src="${base64}" alt="头像预览">`;
        
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
    preview.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
    showToast('已清除图片', 'success');
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
    select.innerHTML = '<option value="">请选择分组</option>';
    
    judgeGroups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        select.appendChild(option);
    });
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
        updateEventSelect();
        updateEventListModal();
    } catch (error) {
        showToast(error.message || '操作失败', 'error');
    }
}

function openEventListModal() {
    updateEventListModal();
    document.getElementById('eventListModal').classList.add('active');
}

function closeEventListModal() {
    document.getElementById('eventListModal').classList.remove('active');
}

function updateEventListModal() {
    const container = document.getElementById('eventListContainer');
    
    if (events.length === 0) {
        container.innerHTML = `
            <div class="empty-state py-4">
                <p class="text-muted">暂无活动</p>
            </div>
        `;
        return;
    }
    
    const statusMap = {
        'draft': { text: '草稿', class: 'badge-secondary' },
        'active': { text: '进行中', class: 'badge-success' },
        'paused': { text: '已暂停', class: 'badge-warning' },
        'completed': { text: '已完成', class: 'badge-primary' }
    };
    
    container.innerHTML = events.map(event => {
        const status = statusMap[event.status] || { text: event.status, class: 'badge-secondary' };
        const isCurrent = event.id === currentEventId;
        
        return `
            <div class="flex items-center justify-between p-4 rounded-lg bg-background ${isCurrent ? 'ring-2 ring-[var(--primary)]' : ''}">
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <span class="font-medium">${event.name}</span>
                        <span class="badge ${status.class}">${status.text}</span>
                        ${isCurrent ? '<span class="badge badge-primary">当前</span>' : ''}
                    </div>
                    <div class="text-sm text-muted mt-1">
                        ${event.description || '暂无描述'}
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button class="btn btn-secondary btn-sm" onclick="activateEvent('${event.id}')" title="激活" ${isCurrent ? 'disabled' : ''}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="editEvent('${event.id}')" title="编辑">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="openCopyEventModal('${event.id}', '${event.name}')" title="复制">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="toggleEventStatus('${event.id}', '${event.status}')" title="${event.status === 'active' ? '暂停' : '启用'}">
                        ${event.status === 'active' 
                            ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>'
                            : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>'
                        }
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteEvent('${event.id}')" title="删除">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function editEvent(id) {
    const event = events.find(e => e.id === id);
    if (event) {
        openEventModal(event);
    }
}

async function activateEvent(eventId) {
    openConfirmModal('激活活动', '激活此活动将切换到该活动，确定要激活吗？', async () => {
        try {
            await switchToEvent(eventId);
            closeEventListModal();
            events = await db.getEvents();
            updateEventSelect();
            updateEventListModal();
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
        updateEventListModal();
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
            updateEventSelect();
            updateEventListModal();
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
        updateEventSelect();
        updateEventListModal();
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

// 评分轮次管理
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
        
        // 加载轮次分组设置
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
        container.innerHTML = '<p class="text-muted">暂无评委分组，请先添加分组</p>';
        return;
    }
    
    container.innerHTML = judgeGroups.map(group => {
        const existingSetting = roundGroupSettings.find(s => s.group_id === group.id);
        const trimHigh = existingSetting?.trim_high_count ?? 1;
        const trimLow = existingSetting?.trim_low_count ?? 1;
        
        return `
            <div class="p-3 rounded-lg bg-background border border-[var(--border)]">
                <div class="font-medium mb-2">${group.name}</div>
                <div class="grid grid-cols-2 gap-3">
                    <div class="form-group mb-0">
                        <label class="form-label text-sm">去除最高分</label>
                        <input type="number" class="form-input" min="0" max="10" value="${trimHigh}" 
                               data-group-id="${group.id}" data-field="trim_high">
                    </div>
                    <div class="form-group mb-0">
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
        
        // 保存分组设置
        if (method === 'trimmed_average') {
            const groupSettingsContainer = document.getElementById('groupTrimSettings');
            const inputs = groupSettingsContainer.querySelectorAll('input[data-group-id]');
            const settings = [];
            
            inputs.forEach(input => {
                const groupId = input.dataset.groupId;
                const field = input.dataset.field;
                const value = parseInt(input.value) || 0;
                
                let setting = settings.find(s => s.group_id === groupId);
                if (!setting) {
                    setting = {
                        round_id: roundId,
                        group_id: groupId,
                        trim_high_count: 1,
                        trim_low_count: 1
                    };
                    settings.push(setting);
                }
                
                if (field === 'trim_high') {
                    setting.trim_high_count = value;
                } else if (field === 'trim_low') {
                    setting.trim_low_count = value;
                }
            });
            
            // 保存每个分组设置
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
        updateEventSelect();
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

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${type === 'success' 
                ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'
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
window.clearAvatar = clearAvatar;
window.selectTheme = selectTheme;

// 背景主题设置
const AVAILABLE_THEMES = 4;
let selectedTheme = 1;

function initThemeSettings() {
    const grid = document.getElementById('themePreviewGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    for (let i = 1; i <= AVAILABLE_THEMES; i++) {
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
    
    const themeName = document.getElementById('currentThemeName');
    if (themeName) {
        themeName.textContent = `主题 ${themeId}`;
    }
}

async function loadCurrentTheme() {
    try {
        const state = await db.getSystemState();
        const theme = state?.display_theme || 1;
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
