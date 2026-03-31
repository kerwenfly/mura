// 评委评分页面逻辑
let currentJudge = null;
let currentEvent = null;
let currentContestant = null;
let currentScore = null;
let currentRound = null;
let scoringRounds = [];
let systemState = null;
let subscriptions = [];
let scoreInput = '';
let showPassword = false;

// 页面初始化
document.addEventListener('DOMContentLoaded', async () => {
    initEventListeners();
    await initPage();
});

// 初始化事件监听器
function initEventListeners() {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('submitBtn').addEventListener('click', handleSubmitScore);
    document.getElementById('backToEventBtn').addEventListener('click', backToEventSelect);
    document.getElementById('togglePasswordBtn').addEventListener('click', togglePasswordVisibility);
    document.getElementById('showHistoryBtn').addEventListener('click', toggleHistoryPanel);
    document.getElementById('closeHistoryBtn').addEventListener('click', toggleHistoryPanel);
    document.getElementById('historyOverlay').addEventListener('click', toggleHistoryPanel);
}

// 初始化页面
async function initPage() {
    const savedEventId = judgeAuth.getCurrentEventId();
    const savedJudge = judgeAuth.getCurrentJudge();

    if (savedEventId && savedJudge) {
        currentEvent = { id: savedEventId };
        currentJudge = savedJudge;
        await loadEventInfo();
        if (currentEvent && currentEvent.name) {
            showScoringSection();
            await loadData();
            subscribeToChanges();
        }
    } else if (savedEventId) {
        currentEvent = { id: savedEventId };
        await loadEventInfo();
        if (currentEvent && currentEvent.name) {
            showLoginSection();
        }
    } else {
        await loadActiveEvents();
    }
}

// 加载可用活动列表
async function loadActiveEvents() {
    try {
        const events = await db.getActiveEvents();
        const container = document.getElementById('eventList');

        if (!container) return;

        if (!events || events.length === 0) {
            container.innerHTML = `
                <div class="text-center py-16 text-slate-500">
                    <svg class="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <p>暂无可用的活动</p>
                    <p class="text-sm mt-2">请联系管理员创建活动</p>
                </div>
            `;
            return;
        }

        container.innerHTML = events.map(event => `
            <button class="w-full flex items-center justify-between bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/30 rounded-xl p-4 text-left transition-all group"
                    onclick="selectEvent('${event.id}', '${event.name}')">
                <div>
                    <h3 class="font-semibold text-white">${event.name}</h3>
                    ${event.description ? `<p class="text-sm text-slate-400 mt-0.5">${event.description}</p>` : ''}
                    ${event.start_time ? `<p class="text-xs text-slate-500 mt-1">${new Date(event.start_time).toLocaleDateString()}</p>` : ''}
                </div>
                <svg class="w-5 h-5 text-slate-500 group-hover:text-emerald-400 transition-colors shrink-0 ml-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            </button>
        `).join('');
    } catch (error) {
        showToast('加载活动失败', 'error');
        console.error(error);
    }
}

// 选择活动
function selectEvent(eventId, eventName) {
    currentEvent = { id: eventId, name: eventName };
    judgeAuth.setCurrentEvent(eventId);
    showLoginSection();
}

// 加载活动信息
async function loadEventInfo() {
    try {
        const event = await db.getEvent(currentEvent.id);
        if (!event) {
            judgeAuth.clearCurrentEvent();
            currentEvent = null;
            showToast('活动不存在，请重新选择', 'error');
            document.getElementById('eventSelectSection').classList.remove('hidden');
            document.getElementById('loginSection').classList.add('hidden');
            loadActiveEvents();
            return;
        }
        currentEvent = event;
        const nameEl = document.getElementById('currentEventName');
        if (nameEl) nameEl.textContent = event.name;
    } catch (error) {
        console.error('加载活动信息失败:', error);
        judgeAuth.clearCurrentEvent();
        currentEvent = null;
        showToast('活动不存在，请重新选择', 'error');
        document.getElementById('eventSelectSection').classList.remove('hidden');
        document.getElementById('loginSection').classList.add('hidden');
        loadActiveEvents();
    }
}

// 显示登录区域
function showLoginSection() {
    document.getElementById('eventSelectSection').classList.add('hidden');
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('scoringSection').classList.add('hidden');

    if (currentEvent) {
        const nameEl = document.getElementById('currentEventName');
        if (nameEl) nameEl.textContent = currentEvent.name;
    }
}

// 返回活动选择
function backToEventSelect() {
    judgeAuth.clearCurrentEvent();
    currentEvent = null;
    document.getElementById('eventSelectSection').classList.remove('hidden');
    document.getElementById('loginSection').classList.add('hidden');
    loadActiveEvents();
}

// 切换密码显示
function togglePasswordVisibility() {
    showPassword = !showPassword;
    const passwordInput = document.getElementById('password');
    const eyeIcon = document.getElementById('eyeIcon');

    passwordInput.type = showPassword ? 'text' : 'password';
    eyeIcon.innerHTML = showPassword
        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>'
        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>';
}

// 处理登录
async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('loginBtn');

    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="loading-spinner"></span> 登录中...';

    try {
        currentJudge = await judgeAuth.login(username, password);

        // 验证评委是否属于当前活动
        const judge = await db.getJudgeById(currentJudge.id);
        if (judge.event_id !== currentEvent.id) {
            judgeAuth.logout();
            currentJudge = null;
            showToast('该评委不属于当前活动', 'error');
            loginBtn.disabled = false;
            loginBtn.textContent = '登录';
            return;
        }

        showScoringSection();
        await loadData();
        subscribeToChanges();
        showToast('登录成功', 'success');
    } catch (error) {
        showToast(error.message || '登录失败', 'error');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = '登录';
    }
}

// 处理登出
function handleLogout() {
    subscriptions.forEach(sub => sub.unsubscribe());
    judgeAuth.logout();
    currentJudge = null;
    currentContestant = null;
    currentScore = null;
    currentRound = null;
    document.getElementById('eventSelectSection').classList.remove('hidden');
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('scoringSection').classList.add('hidden');
    loadActiveEvents();
    showToast('已退出登录', 'success');
}

// 显示评分区域
function showScoringSection() {
    document.getElementById('eventSelectSection').classList.add('hidden');
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('scoringSection').classList.remove('hidden');

    const judgeNameEl = document.getElementById('judgeName');
    if (judgeNameEl) {
        judgeNameEl.textContent = `评委 ${currentJudge?.judge_number || ''}`;
    }

    const navEventNameEl = document.getElementById('navEventName');
    if (navEventNameEl && currentEvent) {
        navEventNameEl.textContent = currentEvent.name;
    }
}

// 加载数据
async function loadData() {
    try {
        const [state, rounds] = await Promise.all([
            db.getSystemState(),
            db.getScoringRounds(currentEvent.id)
        ]);

        systemState = state;
        scoringRounds = rounds;

        // 获取当前轮次
        if (state.current_round_id) {
            currentRound = rounds.find(r => r.id === state.current_round_id);
        } else if (rounds.length > 0) {
            const activeRound = rounds.find(r => r.is_active);
            currentRound = activeRound || rounds[0];
        }

        updateRoundInfo();
        updateLockStatus();

        if (state.current_contestant_id) {
            currentContestant = await db.getContestant(state.current_contestant_id);
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

// 更新轮次信息
function updateRoundInfo() {
    const roundBadgeEl = document.getElementById('roundBadge');

    if (currentRound) {
        if (roundBadgeEl) {
            roundBadgeEl.textContent = currentRound.name;
            roundBadgeEl.classList.remove('hidden');
        }
    } else {
        if (roundBadgeEl) roundBadgeEl.classList.add('hidden');
    }
}

// 更新锁定状态
function updateLockStatus() {
    const lockedAlert = document.getElementById('lockedAlert');
    const submitBtn = document.getElementById('submitBtn');

    if (systemState?.is_locked) {
        if (lockedAlert) lockedAlert.classList.remove('hidden');
        if (submitBtn) submitBtn.disabled = true;
    } else {
        if (lockedAlert) lockedAlert.classList.add('hidden');
        if (submitBtn) submitBtn.disabled = !currentContestant || !currentRound;
    }
}

// 更新选手信息
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
    const submitBtn = document.getElementById('submitBtn');

    if (nameEl) nameEl.textContent = currentContestant.name;
    if (numberEl) numberEl.textContent = `#${currentContestant.number}`;
    if (deptEl) deptEl.textContent = currentContestant.department || '';
    if (submitBtn) submitBtn.disabled = systemState?.is_locked || !currentRound;

    // 更新头像
    const avatarContainer = document.getElementById('avatarContainer');
    if (avatarContainer) {
        if (currentContestant.avatar_url) {
            avatarContainer.innerHTML = `<img src="${currentContestant.avatar_url}" alt="${currentContestant.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            const initials = currentContestant.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            avatarContainer.innerHTML = initials;
        }
    }
}

// 显示无选手状态
function showNoContestant() {
    const scoringArea = document.getElementById('scoringArea');
    const noContestantArea = document.getElementById('noContestantArea');
    const submitBtn = document.getElementById('submitBtn');

    if (scoringArea) scoringArea.classList.add('hidden');
    if (noContestantArea) noContestantArea.classList.remove('hidden');
    if (submitBtn) submitBtn.disabled = true;
}

// 加载当前评分
async function loadCurrentScore() {
    if (!currentContestant || !currentJudge || !currentRound) return;

    try {
        currentScore = await db.getScore(currentContestant.id, currentJudge.id, currentRound.id);
        const submittedInfo = document.getElementById('submittedInfo');

        if (currentScore) {
            scoreInput = currentScore.score.toString();
            updateScoreDisplay();
            if (submittedInfo) submittedInfo.classList.remove('hidden');
        } else {
            scoreInput = '';
            updateScoreDisplay();
            if (submittedInfo) submittedInfo.classList.add('hidden');
        }
        updateSubmitButton();
    } catch (error) {
        console.error('加载评分失败:', error);
    }
}

// 加载已评分列表
async function loadScoredList() {
    if (!currentJudge || !currentEvent) return;

    try {
        const scores = await db.getScoresByJudge(currentJudge.id, currentEvent.id);
        const container = document.getElementById('historyList');

        if (!container) return;

        if (scores.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4 text-slate-500">
                    <p>暂无评分记录</p>
                </div>
            `;
            return;
        }

        container.innerHTML = scores.map(score => `
            <div class="flex items-center justify-between p-3 rounded-lg">
                <div class="flex items-center gap-3">
                    <span class="badge badge-primary">${score.contestants?.number || '--'}</span>
                    <div>
                        <div class="font-medium text-white">${score.contestants?.name || '未知选手'}</div>
                        <div class="text-slate-500 text-sm">${score.scoring_rounds?.name || '未知轮次'}</div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-emerald-400 font-semibold">${score.score.toFixed(2)} 分</span>
                    <span class="badge badge-success">已评分</span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('加载已评分列表失败:', error);
    }
}

// 数字键盘输入
function inputNumber(num) {
    if (systemState?.is_locked) return;

    // 限制输入长度
    if (scoreInput.length >= 6) return;

    // 处理前导零
    if (scoreInput === '0' && num !== '.') {
        scoreInput = num;
    } else {
        scoreInput += num;
    }

    validateAndUpdateScore();
}

// 输入小数点
function inputDecimal() {
    if (systemState?.is_locked) return;

    // 已有小数点则不再添加
    if (scoreInput.includes('.')) return;

    if (scoreInput === '') {
        scoreInput = '0.';
    } else {
        scoreInput += '.';
    }

    validateAndUpdateScore();
}

// 清除输入
function clearScore() {
    scoreInput = '';
    updateScoreDisplay();
    updateSubmitButton();
}

// 退格删除
function backspace() {
    if (systemState?.is_locked) return;
    scoreInput = scoreInput.slice(0, -1);
    updateScoreDisplay();
    updateSubmitButton();
}

// 验证并更新分数
function validateAndUpdateScore() {
    let score = parseFloat(scoreInput);

    if (isNaN(score)) {
        score = 0;
    }

    // 限制分数范围 0-100
    if (score > 100) {
        score = 100;
        scoreInput = '100';
    }

    if (score < 0) {
        score = 0;
        scoreInput = '0';
    }

    updateScoreDisplay();
    updateSubmitButton();
}

// 更新分数显示
function updateScoreDisplay() {
    const scoreValue = document.getElementById('scoreValue');
    if (scoreValue) {
        const displayValue = scoreInput === '' ? '0' : scoreInput;
        scoreValue.textContent = displayValue;
        scoreValue.className = scoreInput
            ? 'text-5xl font-black tabular-nums text-white'
            : 'text-5xl font-black tabular-nums text-slate-700';
    }
}

// 更新提交按钮状态
function updateSubmitButton() {
    const submitBtn = document.getElementById('submitBtn');
    const score = parseFloat(scoreInput) || 0;
    const isValid = score >= 0 && score <= 100 && currentContestant && currentRound && !systemState?.is_locked;

    if (submitBtn) {
        submitBtn.disabled = !isValid;
    }
}

// 提交评分
async function handleSubmitScore() {
    if (!currentContestant || !currentJudge || !currentRound || systemState?.is_locked) return;

    const score = parseFloat(scoreInput) || 0;
    if (score < 0 || score > 100) {
        showToast('请输入有效的评分 (0-100)', 'error');
        return;
    }

    const submitBtn = document.getElementById('submitBtn');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const submittedInfo = document.getElementById('submittedInfo');

    submitBtn.disabled = true;
    submitBtn.textContent = '提交中...';

    try {
        await db.submitScore(currentContestant.id, currentJudge.id, score, currentEvent.id, currentRound.id);
        currentScore = { score };

        // 显示成功状态
        scoreDisplay.classList.remove('border-slate-700', 'bg-slate-900');
        scoreDisplay.classList.add('border-emerald-500', 'bg-emerald-500/10');

        if (submittedInfo) submittedInfo.classList.remove('hidden');

        showToast('评分提交成功', 'success');

        // 2秒后恢复原状
        setTimeout(() => {
            scoreDisplay.classList.remove('border-emerald-500', 'bg-emerald-500/10');
            scoreDisplay.classList.add('border-slate-700', 'bg-slate-900');
        }, 2000);

        await loadScoredList();
    } catch (error) {
        showToast(error.message || '提交失败', 'error');
    } finally {
        submitBtn.disabled = systemState?.is_locked;
        submitBtn.textContent = '提交';
    }
}

// 切换历史面板
function toggleHistoryPanel() {
    const panel = document.getElementById('historyPanel');
    const overlay = document.getElementById('historyOverlay');

    const isOpen = !panel.classList.contains('translate-y-full');

    if (isOpen) {
        panel.classList.add('translate-y-full');
        overlay.classList.add('hidden');
    } else {
        panel.classList.remove('translate-y-full');
        overlay.classList.remove('hidden');
    }
}

// 订阅实时变化
function subscribeToChanges() {
    // 订阅系统状态变化
    const stateSub = db.subscribeToSystemState(async (payload) => {
        const prevState = systemState;
        systemState = payload.new;
        updateLockStatus();

        // 检查轮次是否变化
        if (systemState.current_round_id !== prevState?.current_round_id) {
            const rounds = await db.getScoringRounds(currentEvent.id);
            scoringRounds = rounds;
            currentRound = rounds.find(r => r.id === systemState.current_round_id);
            updateRoundInfo();
            await loadCurrentScore();
        }

        // 检查选手是否变化
        if (systemState.current_contestant_id !== currentContestant?.id) {
            currentContestant = systemState.current_contestant_id
                ? await db.getContestant(systemState.current_contestant_id)
                : null;
            updateContestantInfo();
            await loadCurrentScore();
        }
    });
    subscriptions.push(stateSub);

    // 订阅评分变化
    const scoreSub = db.subscribeToScores(async (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            if (payload.new.judge_id === currentJudge?.id && payload.new.round_id === currentRound?.id) {
                currentScore = payload.new;
                scoreInput = currentScore.score.toString();
                updateScoreDisplay();
                const submittedInfo = document.getElementById('submittedInfo');
                if (submittedInfo) submittedInfo.classList.remove('hidden');
            }
            await loadScoredList();
        }
    });
    subscriptions.push(scoreSub);
}

// 显示提示消息
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

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

// 暴露全局函数
window.selectEvent = selectEvent;
window.inputNumber = inputNumber;
window.inputDecimal = inputDecimal;
window.clearScore = clearScore;
window.backspace = backspace;
