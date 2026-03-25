let currentJudge = null;
let currentEvent = null;
let currentContestant = null;
let currentScore = null;
let systemState = null;
let subscriptions = [];

document.addEventListener('DOMContentLoaded', async () => {
    initEventListeners();
    await initPage();
});

function initEventListeners() {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('scoreSlider').addEventListener('input', handleScoreChange);
    document.getElementById('submitBtn').addEventListener('click', handleSubmitScore);
    document.getElementById('backToEventBtn').addEventListener('click', backToEventSelect);
}

async function initPage() {
    const savedEventId = judgeAuth.getCurrentEventId();
    const savedJudge = judgeAuth.getCurrentJudge();
    
    if (savedEventId && savedJudge) {
        currentEvent = { id: savedEventId };
        currentJudge = savedJudge;
        await loadEventInfo();
        showScoringSection();
        await loadData();
        subscribeToChanges();
    } else if (savedEventId) {
        currentEvent = { id: savedEventId };
        await loadEventInfo();
        showLoginSection();
    } else {
        await loadActiveEvents();
    }
}

async function loadActiveEvents() {
    try {
        const events = await db.getActiveEvents();
        const container = document.getElementById('eventList');
        
        if (!container) return;
        
        if (!events || events.length === 0) {
            container.innerHTML = `
                <div class="empty-state py-4">
                    <p class="text-muted">暂无可用的活动</p>
                    <p class="text-sm text-muted mt-2">请联系管理员创建活动</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = events.map(event => `
            <button class="w-full p-4 rounded-lg bg-background hover:bg-surface-hover transition-colors text-left" onclick="selectEvent('${event.id}', '${event.name}')">
                <div class="flex items-center justify-between">
                    <div>
                        <div class="font-medium">${event.name}</div>
                        <div class="text-sm text-muted">${event.description || '暂无描述'}</div>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </div>
            </button>
        `).join('');
    } catch (error) {
        showToast('加载活动失败', 'error');
        console.error(error);
    }
}

function selectEvent(eventId, eventName) {
    currentEvent = { id: eventId, name: eventName };
    judgeAuth.setCurrentEvent(eventId);
    showLoginSection();
}

async function loadEventInfo() {
    try {
        const event = await db.getEvent(currentEvent.id);
        currentEvent = event;
        const nameEl = document.getElementById('currentEventName');
        if (nameEl) nameEl.textContent = event.name;
    } catch (error) {
        console.error('加载活动信息失败:', error);
    }
}

function showLoginSection() {
    document.getElementById('eventSelectSection').classList.add('hidden');
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('scoringSection').classList.add('hidden');
    
    if (currentEvent) {
        const nameEl = document.getElementById('currentEventName');
        if (nameEl) nameEl.textContent = currentEvent.name;
    }
}

function backToEventSelect() {
    judgeAuth.clearCurrentEvent();
    currentEvent = null;
    document.getElementById('eventSelectSection').classList.remove('hidden');
    document.getElementById('loginSection').classList.add('hidden');
    loadActiveEvents();
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        currentJudge = await judgeAuth.login(username, password);
        
        const judge = await db.getJudgeById(currentJudge.id);
        if (judge.event_id !== currentEvent.id) {
            judgeAuth.logout();
            currentJudge = null;
            showToast('该评委不属于当前活动', 'error');
            return;
        }
        
        showScoringSection();
        await loadData();
        subscribeToChanges();
        showToast('登录成功', 'success');
    } catch (error) {
        showToast(error.message || '登录失败', 'error');
    }
}

function handleLogout() {
    subscriptions.forEach(sub => sub.unsubscribe());
    judgeAuth.logout();
    currentJudge = null;
    currentContestant = null;
    currentScore = null;
    document.getElementById('eventSelectSection').classList.remove('hidden');
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('scoringSection').classList.add('hidden');
    loadActiveEvents();
    showToast('已退出登录', 'success');
}

function showScoringSection() {
    document.getElementById('eventSelectSection').classList.add('hidden');
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('scoringSection').classList.remove('hidden');
    const judgeNameEl = document.getElementById('judgeName');
    if (judgeNameEl) {
        judgeNameEl.textContent = `评委 ${currentJudge?.judge_number || ''}`;
    }
}

async function loadData() {
    try {
        systemState = await db.getSystemState();
        updateLockStatus();
        
        if (systemState.current_contestant_id) {
            currentContestant = await db.getContestant(systemState.current_contestant_id);
            updateContestantInfo();
            await loadCurrentScore();
        } else {
            showNoContestant();
        }
        
        await loadScoredList();
    } catch (error) {
        showToast('加载数据失败', 'error');
        console.error(error);
    }
}

function updateLockStatus() {
    const lockedAlert = document.getElementById('lockedAlert');
    const submitBtn = document.getElementById('submitBtn');
    const slider = document.getElementById('scoreSlider');
    
    if (systemState?.is_locked) {
        if (lockedAlert) lockedAlert.classList.remove('hidden');
        if (submitBtn) submitBtn.disabled = true;
        if (slider) slider.disabled = true;
    } else {
        if (lockedAlert) lockedAlert.classList.add('hidden');
        if (submitBtn) submitBtn.disabled = !currentContestant;
        if (slider) slider.disabled = false;
    }
}

function updateContestantInfo() {
    if (!currentContestant) {
        showNoContestant();
        return;
    }
    
    const scoringArea = document.getElementById('scoringArea');
    const noContestantArea = document.getElementById('noContestantArea');
    
    if (scoringArea) scoringArea.classList.remove('hidden');
    if (noContestantArea) noContestantArea.classList.add('hidden');
    
    const nameEl = document.getElementById('contestantName');
    const numberEl = document.getElementById('contestantNumber');
    const deptEl = document.getElementById('contestantDepartment');
    const descEl = document.getElementById('contestantDescription');
    const submitBtn = document.getElementById('submitBtn');
    
    if (nameEl) nameEl.textContent = currentContestant.name;
    if (numberEl) numberEl.textContent = `编号: ${currentContestant.number}`;
    if (deptEl) deptEl.textContent = currentContestant.department || '';
    if (descEl) descEl.textContent = currentContestant.description || '暂无简介';
    if (submitBtn) submitBtn.disabled = systemState?.is_locked;
    
    const avatarContainer = document.querySelector('#contestantInfo .avatar');
    if (avatarContainer) {
        if (currentContestant.avatar_url) {
            avatarContainer.innerHTML = `<img src="${currentContestant.avatar_url}" alt="${currentContestant.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            avatarContainer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
        }
    }
}

function showNoContestant() {
    const scoringArea = document.getElementById('scoringArea');
    const noContestantArea = document.getElementById('noContestantArea');
    const submitBtn = document.getElementById('submitBtn');
    
    if (scoringArea) scoringArea.classList.add('hidden');
    if (noContestantArea) noContestantArea.classList.remove('hidden');
    if (submitBtn) submitBtn.disabled = true;
}

async function loadCurrentScore() {
    if (!currentContestant || !currentJudge) return;
    
    try {
        currentScore = await db.getScore(currentContestant.id, currentJudge.id);
        const slider = document.getElementById('scoreSlider');
        const scoreValue = document.getElementById('scoreValue');
        const submitBtnText = document.getElementById('submitBtnText');
        const submittedInfo = document.getElementById('submittedInfo');
        
        if (currentScore) {
            if (slider) slider.value = currentScore.score;
            if (scoreValue) scoreValue.textContent = currentScore.score;
            if (submitBtnText) submitBtnText.textContent = '修改评分';
            if (submittedInfo) submittedInfo.classList.remove('hidden');
        } else {
            if (slider) slider.value = 0;
            if (scoreValue) scoreValue.textContent = '0';
            if (submitBtnText) submitBtnText.textContent = '提交评分';
            if (submittedInfo) submittedInfo.classList.add('hidden');
        }
    } catch (error) {
        console.error('加载评分失败:', error);
    }
}

async function loadScoredList() {
    if (!currentJudge || !currentEvent) return;
    
    try {
        const scores = await db.getScoresByJudge(currentJudge.id, currentEvent.id);
        const container = document.getElementById('scoredList');
        
        if (!container) return;
        
        if (scores.length === 0) {
            container.innerHTML = `
                <div class="empty-state py-4">
                    <p class="text-muted">暂无已评分记录</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = scores.map(score => `
            <div class="flex items-center justify-between p-3 rounded-lg bg-background">
                <div class="flex items-center gap-3">
                    <span class="badge badge-primary">${score.contestants?.number || '--'}</span>
                    <span>${score.contestants?.name || '未知选手'}</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-primary font-semibold">${score.score} 分</span>
                    <span class="badge badge-success">已评分</span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('加载已评分列表失败:', error);
    }
}

function handleScoreChange(e) {
    const value = parseFloat(e.target.value);
    const scoreValue = document.getElementById('scoreValue');
    if (scoreValue) scoreValue.textContent = value.toFixed(1);
}

async function handleSubmitScore() {
    if (!currentContestant || !currentJudge || systemState?.is_locked) return;
    
    const slider = document.getElementById('scoreSlider');
    const score = parseFloat(slider ? slider.value : 0);
    const submitBtn = document.getElementById('submitBtn');
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="loading-spinner"></span> 提交中...';
    }
    
    try {
        await db.submitScore(currentContestant.id, currentJudge.id, score, currentEvent.id);
        currentScore = { score };
        
        const submitBtnText = document.getElementById('submitBtnText');
        const submittedInfo = document.getElementById('submittedInfo');
        
        if (submitBtnText) submitBtnText.textContent = '修改评分';
        if (submittedInfo) submittedInfo.classList.remove('hidden');
        showToast('评分提交成功', 'success');
        
        await loadScoredList();
    } catch (error) {
        showToast(error.message || '提交失败', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = systemState?.is_locked;
            submitBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <span id="submitBtnText">修改评分</span>
            `;
        }
    }
}

function subscribeToChanges() {
    const stateSub = db.subscribeToSystemState(async (payload) => {
        systemState = payload.new;
        updateLockStatus();
        
        if (systemState.current_contestant_id !== currentContestant?.id) {
            currentContestant = systemState.current_contestant_id 
                ? await db.getContestant(systemState.current_contestant_id)
                : null;
            updateContestantInfo();
            await loadCurrentScore();
        }
    });
    subscriptions.push(stateSub);
    
    const scoreSub = db.subscribeToScores(async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            if (payload.new.judge_id === currentJudge?.id) {
                currentScore = payload.new;
                const slider = document.getElementById('scoreSlider');
                const scoreValue = document.getElementById('scoreValue');
                const submitBtnText = document.getElementById('submitBtnText');
                const submittedInfo = document.getElementById('submittedInfo');
                
                if (slider) slider.value = currentScore.score;
                if (scoreValue) scoreValue.textContent = currentScore.score;
                if (submitBtnText) submitBtnText.textContent = '修改评分';
                if (submittedInfo) submittedInfo.classList.remove('hidden');
            }
            await loadScoredList();
        }
    });
    subscriptions.push(scoreSub);
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
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

window.selectEvent = selectEvent;
