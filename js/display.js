let systemState = null;
let currentEvent = null;
let contestants = [];
let judges = [];
let subscriptions = [];

const EVENT_STORAGE_KEY = 'display_current_event_id';

document.addEventListener('DOMContentLoaded', async () => {
    const savedEventId = localStorage.getItem(EVENT_STORAGE_KEY);
    
    if (savedEventId) {
        currentEvent = { id: savedEventId };
        await loadEventInfo();
        showDisplaySection();
        await loadData();
        subscribeToChanges();
    } else {
        await loadActiveEvents();
    }
});

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
        console.error('加载活动失败:', error);
        const container = document.getElementById('eventList');
        if (container) {
            container.innerHTML = `
                <div class="empty-state py-4">
                    <p class="text-muted">加载活动失败</p>
                </div>
            `;
        }
    }
}

function selectEvent(eventId, eventName) {
    currentEvent = { id: eventId, name: eventName };
    localStorage.setItem(EVENT_STORAGE_KEY, eventId);
    showDisplaySection();
    loadEventInfo();
    loadData();
    subscribeToChanges();
}

async function loadEventInfo() {
    try {
        const event = await db.getEvent(currentEvent.id);
        currentEvent = event;
        const titleEl = document.getElementById('eventTitle');
        if (titleEl && event) {
            titleEl.textContent = event.name;
        }
    } catch (error) {
        console.error('加载活动信息失败:', error);
    }
}

function showDisplaySection() {
    document.getElementById('eventSelectSection').classList.add('hidden');
    document.getElementById('displaySection').classList.remove('hidden');
}

async function loadData() {
    try {
        const [state, contestantList, judgeList] = await Promise.all([
            db.getSystemState(),
            db.getContestants(currentEvent.id),
            db.getJudges(currentEvent.id)
        ]);
        
        systemState = state;
        contestants = contestantList;
        judges = judgeList;
        
        updateDisplay();
    } catch (error) {
        console.error('加载数据失败:', error);
    }
}

function updateDisplay() {
    const mode = systemState?.display_mode || 'waiting';
    
    document.getElementById('waitingMode').classList.add('hidden');
    document.getElementById('scoringMode').classList.add('hidden');
    document.getElementById('resultMode').classList.add('hidden');
    document.getElementById('finalMode').classList.add('hidden');
    
    switch (mode) {
        case 'waiting':
            showWaitingMode();
            break;
        case 'scoring':
            showScoringMode();
            break;
        case 'result':
            showResultMode();
            break;
        case 'final':
            showFinalMode();
            break;
        default:
            showWaitingMode();
    }
}

function showWaitingMode() {
    document.getElementById('waitingMode').classList.remove('hidden');
}

async function showScoringMode() {
    const contestantId = systemState?.current_contestant_id;
    if (!contestantId) {
        showWaitingMode();
        return;
    }
    
    const contestant = contestants.find(c => c.id === contestantId);
    if (!contestant) {
        showWaitingMode();
        return;
    }
    
    document.getElementById('scoringMode').classList.remove('hidden');
    document.getElementById('scoringName').textContent = contestant.name;
    document.getElementById('scoringNumber').textContent = contestant.number.toString().padStart(2, '0');
    document.getElementById('scoringDepartment').textContent = contestant.department || '';
    document.getElementById('scoringDescription').textContent = contestant.description || '';
    
    const avatarContainer = document.querySelector('#scoringMode .contestant-avatar');
    if (avatarContainer) {
        if (contestant.avatar_url) {
            avatarContainer.innerHTML = `<img src="${contestant.avatar_url}" alt="${contestant.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            avatarContainer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
        }
    }
    
    await updateScoringProgress(contestantId);
}

async function updateScoringProgress(contestantId) {
    try {
        const scores = await db.getScoresByContestant(contestantId);
        document.getElementById('receivedCount').textContent = scores.length;
        document.getElementById('totalCount').textContent = judges.length;
    } catch (error) {
        console.error('更新评分进度失败:', error);
    }
}

async function showResultMode() {
    const contestantId = systemState?.current_contestant_id;
    if (!contestantId) {
        showWaitingMode();
        return;
    }
    
    const contestant = contestants.find(c => c.id === contestantId);
    if (!contestant) {
        showWaitingMode();
        return;
    }
    
    document.getElementById('resultMode').classList.remove('hidden');
    document.getElementById('resultName').textContent = contestant.name;
    document.getElementById('resultNumber').textContent = contestant.number.toString().padStart(2, '0');
    document.getElementById('resultDepartment').textContent = contestant.department || '';
    
    const avatarContainer = document.querySelector('#resultMode .contestant-avatar');
    if (avatarContainer) {
        if (contestant.avatar_url) {
            avatarContainer.innerHTML = `<img src="${contestant.avatar_url}" alt="${contestant.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            avatarContainer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
        }
    }
    
    await updateScoreGrid(contestantId);
}

async function updateScoreGrid(contestantId) {
    try {
        const scores = await db.getScoresByContestant(contestantId);
        const grid = document.getElementById('scoreGrid');
        
        if (scores.length === 0) {
            grid.innerHTML = '<p class="text-muted text-center col-span-full">暂无评分</p>';
            document.getElementById('finalScore').textContent = '0.00';
            return;
        }
        
        grid.innerHTML = scores.map(score => `
            <div class="score-item">
                <div class="text-muted text-sm mb-1">评委${score.judges?.judge_number || ''}</div>
                <div class="text-2xl font-bold text-primary">${score.score}</div>
            </div>
        `).join('');
        
        const finalScore = calculateFinalScore(scores);
        animateScore(finalScore);
    } catch (error) {
        console.error('更新评分网格失败:', error);
    }
}

function calculateFinalScore(scores) {
    if (!scores || scores.length === 0) return 0;
    
    const scoreValues = scores.map(s => parseFloat(s.score));
    const rule = systemState?.scoring_rule || 'average_all';
    
    switch (rule) {
        case 'average_all':
            return scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
        
        case 'average_trimmed':
            if (scoreValues.length <= 2) {
                return scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
            }
            const sorted = [...scoreValues].sort((a, b) => a - b);
            const trimmed = sorted.slice(1, -1);
            return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
        
        case 'median':
            const sortedMedian = [...scoreValues].sort((a, b) => a - b);
            const mid = Math.floor(sortedMedian.length / 2);
            if (sortedMedian.length % 2 === 0) {
                return (sortedMedian[mid - 1] + sortedMedian[mid]) / 2;
            }
            return sortedMedian[mid];
        
        case 'weighted':
            return scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
        
        default:
            return scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
    }
}

function animateScore(targetScore) {
    const element = document.getElementById('finalScore');
    const duration = 1500;
    const startTime = performance.now();
    const startScore = 0;
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentScore = startScore + (targetScore - startScore) * easeOut;
        
        element.textContent = currentScore.toFixed(2);
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

async function showFinalMode() {
    document.getElementById('finalMode').classList.remove('hidden');
    await updateRankingList();
}

async function updateRankingList() {
    try {
        const results = await db.getFinalResults();
        const container = document.getElementById('rankingList');
        
        if (!results || results.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">暂无排名数据</p>';
            return;
        }
        
        const eventResults = results.filter(r => contestants.some(c => c.id === r.id));
        
        container.innerHTML = eventResults.map((result, index) => {
            const rank = index + 1;
            let medalClass = '';
            let medal = '';
            
            if (rank === 1) {
                medalClass = 'text-gold';
                medal = '🥇';
            } else if (rank === 2) {
                medalClass = 'text-silver';
                medal = '🥈';
            } else if (rank === 3) {
                medalClass = 'text-bronze';
                medal = '🥉';
            }
            
            return `
                <div class="rank-item">
                    <div class="rank-number ${medalClass}">
                        ${medal || `第${rank}名`}
                    </div>
                    <div class="flex-1">
                        <div class="flex items-center gap-2">
                            <span class="badge badge-primary">${result.number}</span>
                            <span class="font-semibold">${result.name}</span>
                            ${result.department ? `<span class="text-muted text-sm">${result.department}</span>` : ''}
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-2xl font-bold text-primary">${parseFloat(result.final_score).toFixed(2)}</div>
                        <div class="text-muted text-sm">${result.total_judges} 位评委</div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('更新排名列表失败:', error);
    }
}

function subscribeToChanges() {
    const stateSub = db.subscribeToSystemState(async (payload) => {
        systemState = payload.new;
        updateDisplay();
    });
    subscriptions.push(stateSub);
    
    const scoreSub = db.subscribeToScores(async () => {
        const mode = systemState?.display_mode;
        const contestantId = systemState?.current_contestant_id;
        
        if (mode === 'scoring' && contestantId) {
            await updateScoringProgress(contestantId);
        } else if (mode === 'result' && contestantId) {
            await updateScoreGrid(contestantId);
        } else if (mode === 'final') {
            await updateRankingList();
        }
    });
    subscriptions.push(scoreSub);
    
    const contestantSub = db.subscribeToContestants(async () => {
        contestants = await db.getContestants(currentEvent.id);
        updateDisplay();
    });
    subscriptions.push(contestantSub);
}

window.addEventListener('beforeunload', () => {
    subscriptions.forEach(sub => sub.unsubscribe());
});

window.selectEvent = selectEvent;
