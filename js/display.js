let currentEvent = null;
let systemState = null;
let scoringRounds = [];
let currentRound = null;
let contestants = [];
let judges = [];
let subscriptions = [];
let currentTheme = 1;

document.addEventListener('DOMContentLoaded', async () => {
    await initPage();
});

async function initPage() {
    await loadActiveEvents();
}

function applyBackgroundTheme(theme, mode) {
    const body = document.body;
    const themeNum = theme || 1;
    
    // 根据模式选择背景图
    let bgSuffix = '-1.jpg'; // 等待状态
    if (mode === 'scoring' || mode === 'result' || mode === 'final') {
        bgSuffix = '-2.jpg'; // 评分中/结果/排名状态
    }
    
    body.style.backgroundImage = `url('img/${themeNum}${bgSuffix}')`;
    body.style.backgroundSize = 'cover';
    body.style.backgroundPosition = 'center';
    body.style.backgroundRepeat = 'no-repeat';
    body.style.backgroundAttachment = 'fixed';
}

async function loadActiveEvents() {
    try {
        const events = await db.getActiveEvents();
        const container = document.getElementById('eventList');
        
        if (!events || events.length === 0) {
            container.innerHTML = `
                <div class="empty-state py-4">
                    <p class="text-muted">暂无可用的活动</p>
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
        console.error('加载活动失败:', error);
        document.getElementById('eventList').innerHTML = `
            <div class="empty-state py-4">
                <p class="text-muted">加载失败，请刷新重试</p>
            </div>
        `;
    }
}

async function selectEvent(eventId, eventName) {
    currentEvent = { id: eventId, name: eventName };
    
    document.getElementById('eventSelectSection').classList.add('hidden');
    document.getElementById('displaySection').classList.remove('hidden');
    document.getElementById('eventTitle').textContent = eventName;
    const waitingTitle = document.getElementById('waitingEventTitle');
    if (waitingTitle) waitingTitle.textContent = eventName;
    
    await loadData();
    subscribeToChanges();
}

async function loadData() {
    try {
        const [state, rounds, contestantList, judgeList] = await Promise.all([
            db.getSystemState(),
            db.getScoringRounds(currentEvent.id),
            db.getContestants(currentEvent.id),
            db.getJudges(currentEvent.id)
        ]);
        
        systemState = state;
        scoringRounds = rounds;
        contestants = contestantList;
        judges = judgeList;
        currentTheme = state?.display_theme || 1;
        
        // 获取当前轮次
        if (state.current_round_id) {
            currentRound = rounds.find(r => r.id === state.current_round_id);
        } else if (rounds.length > 0) {
            const activeRound = rounds.find(r => r.is_active);
            currentRound = activeRound || rounds[0];
        }
        
        updateRoundBadge();
        updateDisplayMode();
    } catch (error) {
        console.error('加载数据失败:', error);
    }
}

function updateRoundBadge() {
    const badge = document.getElementById('currentRoundBadge');
    if (currentRound) {
        badge.textContent = currentRound.name;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function updateDisplayMode() {
    const mode = systemState?.display_mode || 'waiting';
    
    document.getElementById('waitingMode').classList.add('hidden');
    document.getElementById('scoringMode').classList.add('hidden');
    document.getElementById('resultMode').classList.add('hidden');
    document.getElementById('finalMode').classList.add('hidden');
    
    const header = document.getElementById('displayHeader');
    
    // 应用背景主题
    applyBackgroundTheme(currentTheme, mode);
    
    switch (mode) {
        case 'waiting':
            if (header) header.classList.add('hidden');
            document.getElementById('waitingMode').classList.remove('hidden');
            break;
        case 'scoring':
            if (header) header.classList.remove('hidden');
            showScoringMode();
            break;
        case 'result':
            if (header) header.classList.remove('hidden');
            showResultMode();
            break;
        case 'final':
            if (header) header.classList.remove('hidden');
            showFinalMode();
            break;
        default:
            if (header) header.classList.add('hidden');
            document.getElementById('waitingMode').classList.remove('hidden');
    }
}

async function showScoringMode() {
    document.getElementById('scoringMode').classList.remove('hidden');
    
    const contestantId = systemState?.current_contestant_id;
    if (!contestantId) {
        document.getElementById('scoringName').textContent = '等待选手...';
        document.getElementById('scoringNumber').textContent = '--';
        document.getElementById('scoringDepartment').textContent = '';
        document.getElementById('scoringDescription').textContent = '';
        return;
    }
    
    const contestant = contestants.find(c => c.id === contestantId);
    if (!contestant) {
        const contestantData = await db.getContestant(contestantId);
        if (contestantData) {
            updateScoringDisplay(contestantData);
        }
        return;
    }
    
    updateScoringDisplay(contestant);
}

function updateScoringDisplay(contestant) {
    document.getElementById('scoringName').textContent = contestant.name;
    document.getElementById('scoringNumber').textContent = contestant.number;
    document.getElementById('scoringDepartment').textContent = contestant.department || '';
    document.getElementById('scoringDescription').textContent = contestant.description || '';
    
    const avatarContainer = document.getElementById('scoringAvatar');
    if (contestant.avatar_url) {
        avatarContainer.innerHTML = `<img src="${contestant.avatar_url}" alt="${contestant.name}">`;
    } else {
        avatarContainer.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
        `;
    }
    
    updateScoringProgress(contestant.id);
}

async function updateScoringProgress(contestantId) {
    if (!currentRound) return;
    
    const scores = await db.getScoresByContestant(contestantId, currentRound.id);
    const totalJudges = judges.length;
    const receivedCount = scores ? scores.length : 0;
    
    document.getElementById('receivedCount').textContent = receivedCount;
    document.getElementById('totalCount').textContent = totalJudges;
}

async function showResultMode() {
    document.getElementById('resultMode').classList.remove('hidden');
    
    const contestantId = systemState?.current_contestant_id;
    if (!contestantId) return;
    
    const contestant = contestants.find(c => c.id === contestantId);
    if (!contestant) {
        const contestantData = await db.getContestant(contestantId);
        if (contestantData) {
            await updateResultDisplay(contestantData);
        }
        return;
    }
    
    await updateResultDisplay(contestant);
}

async function updateResultDisplay(contestant) {
    document.getElementById('resultName').textContent = contestant.name;
    document.getElementById('resultNumber').textContent = contestant.number;
    document.getElementById('resultDepartment').textContent = contestant.department || '';
    
    const avatarContainer = document.getElementById('resultAvatar');
    if (contestant.avatar_url) {
        avatarContainer.innerHTML = `<img src="${contestant.avatar_url}" alt="${contestant.name}">`;
    } else {
        avatarContainer.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
        `;
    }
    
    if (!currentRound) return;
    
    const scores = await db.getScoresByContestant(contestant.id, currentRound.id);
    const scoreGrid = document.getElementById('scoreGrid');
    
    if (!scores || scores.length === 0) {
        scoreGrid.innerHTML = '<p class="text-muted text-center col-span-full">暂无评分数据</p>';
        document.getElementById('finalScore').textContent = '0.00';
        return;
    }
    
    scoreGrid.innerHTML = scores.map(score => `
        <div class="score-item">
            <div class="text-muted text-sm mb-1">评委 ${score.judges?.judge_number || '--'}</div>
            <div class="text-2xl font-bold text-primary">${score.score}</div>
        </div>
    `).join('');
    
    const roundResults = await db.getRoundResults(currentRound.id);
    const contestantResult = roundResults?.find(r => r.contestant_id === contestant.id);
    const finalScore = contestantResult?.round_score || 0;
    
    animateScore(finalScore);
}

function animateScore(targetScore) {
    const scoreElement = document.getElementById('finalScore');
    const duration = 1500;
    const startTime = performance.now();
    const startScore = 0;
    
    function updateScore(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        const currentScore = startScore + (targetScore - startScore) * easeProgress;
        scoreElement.textContent = currentScore.toFixed(2);
        
        if (progress < 1) {
            requestAnimationFrame(updateScore);
        }
    }
    
    requestAnimationFrame(updateScore);
}

async function showFinalMode() {
    document.getElementById('finalMode').classList.remove('hidden');
    
    try {
        const results = await db.getFinalResultsWithRounds(currentEvent.id);
        const rankingList = document.getElementById('rankingList');
        
        if (!results || results.length === 0) {
            rankingList.innerHTML = '<p class="text-muted text-center">暂无排名数据</p>';
            return;
        }
        
        const medals = ['🥇', '🥈', '🥉'];
        
        rankingList.innerHTML = results.map((result, index) => {
            const rank = index + 1;
            const medal = medals[index] || '';
            
            let roundScoresHtml = '';
            if (result.round_scores && result.round_scores.length > 0) {
                roundScoresHtml = `
                    <div class="round-scores mt-2">
                        ${result.round_scores.map(rs => `
                            <span class="round-score-badge">
                                <span class="round-name">${rs.round_name}:</span>
                                <span class="round-value">${rs.score.toFixed(2)}</span>
                            </span>
                        `).join('')}
                    </div>
                `;
            }
            
            return `
                <div class="rank-item">
                    <div class="rank-number">${rank}</div>
                    ${medal ? `<div class="rank-medal">${medal}</div>` : ''}
                    <div class="flex-1">
                        <div class="font-medium text-lg">${result.name}</div>
                        <div class="text-muted text-sm">${result.department || ''}</div>
                        ${roundScoresHtml}
                    </div>
                    <div class="text-right">
                        <div class="text-2xl font-bold text-primary">${result.final_score.toFixed(2)}</div>
                        <div class="text-muted text-sm">最终得分</div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('加载最终排名失败:', error);
        document.getElementById('rankingList').innerHTML = '<p class="text-muted text-center">加载失败</p>';
    }
}

function subscribeToChanges() {
    const stateSub = db.subscribeToSystemState(async (payload) => {
        const prevState = systemState;
        systemState = payload.new;
        
        // 检查主题是否变化
        if (systemState.display_theme !== prevState?.display_theme) {
            currentTheme = systemState.display_theme || 1;
        }
        
        // 检查轮次是否变化
        if (systemState.current_round_id !== prevState?.current_round_id) {
            currentRound = scoringRounds.find(r => r.id === systemState.current_round_id);
            updateRoundBadge();
        }
        
        updateDisplayMode();
    });
    subscriptions.push(stateSub);
    
    const scoreSub = db.subscribeToScores(async (payload) => {
        if (systemState?.display_mode === 'scoring' && systemState?.current_contestant_id) {
            await updateScoringProgress(systemState.current_contestant_id);
        }
    });
    subscriptions.push(scoreSub);
    
    const roundSub = db.subscribeToScoringRounds(async () => {
        scoringRounds = await db.getScoringRounds(currentEvent.id);
        if (systemState?.current_round_id) {
            currentRound = scoringRounds.find(r => r.id === systemState.current_round_id);
        }
        updateRoundBadge();
    });
    subscriptions.push(roundSub);
}

window.selectEvent = selectEvent;
