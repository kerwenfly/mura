let contestants = [];
let judges = [];
let events = [];
let currentEventId = null;
let systemState = null;
let subscriptions = [];
let confirmCallback = null;

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
    
    document.querySelectorAll('input[name="scoringRule"]').forEach(radio => {
        radio.addEventListener('change', handleScoringRuleChange);
    });
    
    document.getElementById('lockBtn').addEventListener('click', handleLockToggle);
    document.getElementById('resetScoresBtn').addEventListener('click', handleResetScores);
    document.getElementById('addContestantBtn').addEventListener('click', () => openContestantModal());
    document.getElementById('addJudgeBtn').addEventListener('click', () => openJudgeModal());
    
    document.getElementById('contestantForm').addEventListener('submit', handleContestantSubmit);
    document.getElementById('judgeForm').addEventListener('submit', handleJudgeSubmit);
    document.getElementById('confirmBtn').addEventListener('click', handleConfirm);
    
    document.getElementById('eventSelect').addEventListener('change', handleEventChange);
    document.getElementById('manageEventsBtn').addEventListener('click', openEventListModal);
    document.getElementById('addEventBtn').addEventListener('click', () => openEventModal());
    document.getElementById('eventForm').addEventListener('submit', handleEventSubmit);
    document.getElementById('copyEventForm').addEventListener('submit', handleCopyEventSubmit);
    
    document.getElementById('avatarInput').addEventListener('change', handleAvatarUpload);
}

async function checkAuth() {
    const session = await auth.getSession();
    if (session) {
        showAdminSection();
        await loadEvents();
        await loadData();
        subscribeToChanges();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
        await auth.signIn(email, password);
        showAdminSection();
        await loadEvents();
        await loadData();
        subscribeToChanges();
        showToast('登录成功', 'success');
    } catch (error) {
        showToast(error.message || '登录失败', 'error');
    }
}

async function handleLogout() {
    subscriptions.forEach(sub => sub.unsubscribe());
    await auth.signOut();
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
    try {
        const [state, contestantList, judgeList] = await Promise.all([
            db.getSystemState(),
            db.getContestants(currentEventId),
            db.getJudges(currentEventId)
        ]);
        
        systemState = state;
        contestants = contestantList;
        judges = judgeList;
        
        updateUI();
    } catch (error) {
        showToast('加载数据失败', 'error');
        console.error(error);
    }
}

function updateUI() {
    updateDisplayModeRadios();
    updateScoringRuleRadios();
    updateLockButton();
    updateCurrentContestantPreview();
    updateContestantList();
    updateJudgeList();
}

function updateDisplayModeRadios() {
    const mode = systemState?.display_mode || 'waiting';
    document.querySelectorAll('input[name="displayMode"]').forEach(radio => {
        radio.checked = radio.value === mode;
    });
}

function updateScoringRuleRadios() {
    const rule = systemState?.scoring_rule || 'average_all';
    document.querySelectorAll('input[name="scoringRule"]').forEach(radio => {
        radio.checked = radio.value === rule;
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
        
        container.innerHTML = `
            <div class="flex flex-col md:flex-row items-center gap-4">
                <div class="avatar avatar-lg">
                    ${avatarHtml}
                </div>
                <div class="text-center md:text-left">
                    <h4 class="text-xl font-semibold">${contestant.name}</h4>
                    <div class="flex items-center justify-center md:justify-start gap-2 mt-1">
                        <span class="badge badge-primary">${contestant.number}</span>
                        <span class="text-muted">${contestant.department || ''}</span>
                    </div>
                    <p class="text-muted mt-2">${contestant.description || '暂无简介'}</p>
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
            : `<div class="avatar"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>`;
        
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
    
    container.innerHTML = judges.map(judge => `
        <div class="flex items-center justify-between p-3 rounded-lg bg-background">
            <div class="flex items-center gap-3">
                <span class="badge badge-primary">${judge.judge_number}</span>
                <div>
                    <div class="font-medium">${judge.username}</div>
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
    `).join('');
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

async function handleScoringRuleChange(e) {
    const rule = e.target.value;
    try {
        await db.updateSystemState({ scoring_rule: rule });
        showToast('评分规则已更新', 'success');
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
    
    openConfirmModal('重置所有评分', '确定要重置当前活动的所有评分数据吗？此操作不可恢复。', async () => {
        try {
            await db.deleteAllScores(currentEventId);
            showToast('所有评分已重置', 'success');
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
    } else {
        title.textContent = '添加评委';
        document.getElementById('judgeForm').reset();
        document.getElementById('judgeId').value = '';
        document.getElementById('judgePasswordInput').placeholder = '请输入登录密码';
        document.getElementById('judgePasswordInput').required = true;
    }
    
    modal.classList.add('active');
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

function subscribeToChanges() {
    const stateSub = db.subscribeToSystemState((payload) => {
        systemState = payload.new;
        updateUI();
    });
    subscriptions.push(stateSub);
    
    const contestantSub = db.subscribeToContestants(async () => {
        contestants = await db.getContestants(currentEventId);
        updateUI();
    });
    subscriptions.push(contestantSub);
    
    const eventSub = db.subscribeToEvents(async () => {
        events = await db.getEvents();
        updateEventSelect();
        updateEventStatus();
    });
    subscriptions.push(eventSub);
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
window.closeContestantModal = closeContestantModal;
window.closeJudgeModal = closeJudgeModal;
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
