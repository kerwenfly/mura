// 展示大屏逻辑

// 全局状态
let currentEvent = null;
let systemState = null;
let scoringRounds = [];
let currentRound = null;
let contestants = [];
let judges = [];
let subscriptions = [];
let currentTheme = 1;
let isFullscreen = false;

// 初始化页面
document.addEventListener('DOMContentLoaded', async () => {
    await initPage();
});

async function initPage() {
    await loadActiveEvents();
    setupEventListeners();
}

// 设置事件监听器
function setupEventListeners() {
    // 全屏按钮
    document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);

    // 返回按钮
    document.getElementById('backBtn').addEventListener('click', () => {
        // 清理订阅
        subscriptions.forEach(sub => sub?.unsubscribe?.());
        subscriptions = [];

        // 显示活动选择区域
        document.getElementById('displaySection').classList.add('hidden');
        document.getElementById('eventSelectSection').classList.remove('hidden');

        // 清理状态
        currentEvent = null;
        systemState = null;
    });

    // 监听全屏变化
    document.addEventListener('fullscreenchange', () => {
        isFullscreen = !!document.fullscreenElement;
        const btn = document.getElementById('fullscreenBtn');
        btn.innerHTML = isFullscreen
            ? '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>'
            : '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>';
    });
}

// 切换全屏
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error('无法进入全屏模式:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

// 应用背景主题
function applyBackgroundTheme(theme, mode) {
    const themeNum = theme || 1;

    // 根据模式选择背景图
    let bgSuffix = '-1.jpg'; // 等待状态
    if (mode === 'scoring' || mode === 'result' || mode === 'final') {
        bgSuffix = '-2.jpg'; // 评分中/结果/排名状态
    }

    document.body.style.backgroundImage = `url('img/${themeNum}${bgSuffix}')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundRepeat = 'no-repeat';
    document.body.style.backgroundAttachment = 'fixed';
}

// 加载活动列表
async function loadActiveEvents() {
    try {
        const events = await db.getActiveEvents();
        const container = document.getElementById('eventList');

        if (!events || events.length === 0) {
            container.innerHTML = `
                <div class="text-center py-16 text-slate-500">
                    <svg class="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                    </svg>
                    <p>暂无可用的活动</p>
                </div>
            `;
            return;
        }

        container.innerHTML = events.map(event => `
            <button class="w-full flex items-center justify-between bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/30 rounded-xl p-4 text-left transition-all group" onclick="selectEvent('${event.id}', '${event.name}')">
                <div>
                    <h3 class="font-semibold text-white">${event.name}</h3>
                    ${event.description ? `<p class="text-sm text-slate-400 mt-0.5">${event.description}</p>` : ''}
                </div>
                <svg class="w-5 h-5 text-slate-500 group-hover:text-amber-400 transition-colors shrink-0 ml-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
            </button>
        `).join('');
    } catch (error) {
        console.error('加载活动失败:', error);
        document.getElementById('eventList').innerHTML = `
            <div class="text-center py-16 text-slate-500">
                <p>加载失败，请刷新重试</p>
            </div>
        `;
    }
}

// 选择活动
async function selectEvent(eventId, eventName) {
    currentEvent = { id: eventId, name: eventName };

    // 切换显示区域
    document.getElementById('eventSelectSection').classList.add('hidden');
    document.getElementById('displaySection').classList.remove('hidden');
    document.getElementById('eventTitle').textContent = eventName;

    // 加载数据
    await loadData();

    // 订阅实时更新
    subscribeToChanges();
}

// 加载数据
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

// 更新轮次标签
function updateRoundBadge() {
    const badge = document.getElementById('currentRoundBadge');
    if (currentRound) {
        badge.textContent = currentRound.name;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// 更新显示模式
function updateDisplayMode() {
    const mode = systemState?.display_mode || 'waiting';

    // 隐藏所有模式
    document.getElementById('waitingMode').classList.add('hidden');
    document.getElementById('scoringMode').classList.add('hidden');
    document.getElementById('resultMode').classList.add('hidden');
    document.getElementById('contestantFinalMode').classList.add('hidden');
    document.getElementById('finalMode').classList.add('hidden');

    const header = document.getElementById('displayHeader');
    const modeBadge = document.getElementById('modeBadge');

    // 应用背景主题
    applyBackgroundTheme(currentTheme, mode);

    // 更新模式标签
    const modeLabels = {
        waiting: '等待中',
        scoring: '评分中',
        result: '显示结果',
        contestant_final: '最终结果',
        final: '最终排名'
    };
    modeBadge.textContent = modeLabels[mode] || mode;

    // 根据模式显示内容
    switch (mode) {
        case 'waiting':
            header.classList.add('hidden');
            document.getElementById('waitingMode').classList.remove('hidden');
            document.getElementById('waitingEventTitle').textContent = currentEvent?.name || 'ScoreLive';
            break;

        case 'scoring':
            header.classList.remove('hidden');
            document.getElementById('scoringMode').classList.remove('hidden');
            showScoringMode();
            break;

        case 'result':
            header.classList.remove('hidden');
            document.getElementById('resultMode').classList.remove('hidden');
            showResultMode();
            break;

        case 'contestant_final':
            header.classList.remove('hidden');
            document.getElementById('contestantFinalMode').classList.remove('hidden');
            showContestantFinalMode();
            break;

        case 'final':
            header.classList.remove('hidden');
            document.getElementById('finalMode').classList.remove('hidden');
            showFinalMode();
            break;

        default:
            header.classList.add('hidden');
            document.getElementById('waitingMode').classList.remove('hidden');
    }
}

// 显示评分模式
async function showScoringMode() {
    const contestantId = systemState?.current_contestant_id;

    if (!contestantId) {
        document.getElementById('scoringName').textContent = '等待选手...';
        document.getElementById('scoringNumber').textContent = '--';
        document.getElementById('scoringDepartment').textContent = '';
        document.getElementById('scoringDescription').textContent = '';
        return;
    }

    // 查找选手
    let contestant = contestants.find(c => c.id === contestantId);
    if (!contestant) {
        try {
            contestant = await db.getContestant(contestantId);
        } catch (error) {
            console.error('获取选手信息失败:', error);
            return;
        }
    }

    if (!contestant) return;

    // 更新显示
    updateScoringDisplay(contestant);
}

// 更新评分显示
function updateScoringDisplay(contestant) {
    document.getElementById('scoringName').textContent = contestant.name;
    document.getElementById('scoringNumber').textContent = contestant.number;
    document.getElementById('scoringDepartment').textContent = contestant.department || '';
    document.getElementById('scoringDescription').textContent = contestant.description || '';

    // 更新头像
    const avatarContainer = document.getElementById('scoringAvatar');
    if (contestant.avatar_url) {
        avatarContainer.innerHTML = `<img src="${contestant.avatar_url}" alt="${contestant.name}" class="w-full h-full object-cover">`;
    } else {
        const initials = getInitials(contestant.name);
        avatarContainer.innerHTML = `<span class="text-4xl font-black">${initials}</span>`;
    }

    // 更新轮次标签
    const roundTag = document.getElementById('scoringRoundTag');
    if (currentRound) {
        roundTag.textContent = currentRound.name;
        roundTag.classList.remove('hidden');
    } else {
        roundTag.classList.add('hidden');
    }

    // 更新评分进度
    updateScoringProgress(contestant.id);
}

// 更新评分进度
async function updateScoringProgress(contestantId) {
    if (!currentRound) return;

    try {
        const scores = await db.getScoresByContestant(contestantId, currentRound.id);
        const totalJudges = judges.length;
        const receivedCount = scores ? scores.length : 0;
        const progress = totalJudges > 0 ? (receivedCount / totalJudges) * 100 : 0;

        document.getElementById('receivedCount').textContent = receivedCount;
        document.getElementById('totalCount').textContent = totalJudges;
        document.getElementById('progressBar').style.width = `${progress}%`;
    } catch (error) {
        console.error('更新评分进度失败:', error);
    }
}

// 显示结果模式
async function showResultMode() {
    const contestantId = systemState?.current_contestant_id;
    if (!contestantId) return;

    // 查找选手
    let contestant = contestants.find(c => c.id === contestantId);
    if (!contestant) {
        try {
            contestant = await db.getContestant(contestantId);
        } catch (error) {
            console.error('获取选手信息失败:', error);
            return;
        }
    }

    if (!contestant) return;

    // 更新显示
    await updateResultDisplay(contestant);
}

// 更新结果显示
async function updateResultDisplay(contestant) {
    document.getElementById('resultName').textContent = contestant.name;
    document.getElementById('resultDepartment').textContent = contestant.department || '';

    // 更新头像
    const avatarContainer = document.getElementById('resultAvatar');
    if (contestant.avatar_url) {
        avatarContainer.innerHTML = `<img src="${contestant.avatar_url}" alt="${contestant.name}" class="w-full h-full object-cover">`;
    } else {
        const initials = getInitials(contestant.name);
        avatarContainer.innerHTML = `<span class="text-2xl font-black">${initials}</span>`;
    }

    // 更新轮次信息
    const roundInfo = document.getElementById('resultRoundInfo');
    const roundLabel = document.getElementById('resultRoundLabel');
    if (currentRound) {
        roundInfo.textContent = `${currentRound.name} · #${contestant.number}`;
        roundLabel.textContent = `${currentRound.name} 得分`;
    } else {
        roundInfo.textContent = `#${contestant.number}`;
        roundLabel.textContent = '本轮得分';
    }

    // 加载评分数据
    if (!currentRound) {
        document.getElementById('scoreGrid').innerHTML = '<p class="text-slate-500 text-center col-span-full">暂无评分数据</p>';
        document.getElementById('finalScore').textContent = '0.00';
        return;
    }

    try {
        const scores = await db.getScoresByContestant(contestant.id, currentRound.id);
        const scoreGrid = document.getElementById('scoreGrid');

        if (!scores || scores.length === 0) {
            scoreGrid.innerHTML = '<p class="text-slate-500 text-center col-span-full">暂无评分数据</p>';
            document.getElementById('finalScore').textContent = '0.00';
            return;
        }

        // 创建评委评分映射
        const scoreMap = new Map();
        scores.forEach(score => {
            scoreMap.set(score.judge_id, score.score);
        });

        // 渲染评分网格
        scoreGrid.innerHTML = judges.map((judge, index) => {
            const score = scoreMap.get(judge.id);
            const hasScore = score !== undefined;

            return `
                <div class="animate-scale-in text-center p-3 rounded-xl ${hasScore ? 'bg-white/10 border border-white/20' : 'bg-white/5 border border-white/5'}" style="animation-delay: ${index * 0.08}s">
                    <div class="text-white/40 text-xs mb-1">评委 ${judge.judge_number}</div>
                    <div class="font-bold text-lg ${hasScore ? 'text-white' : 'text-white/20'}">
                        ${hasScore ? score.toFixed(1) : '—'}
                    </div>
                </div>
            `;
        }).join('');

        // 获取最终得分
        const roundResults = await db.getRoundResults(currentRound.id);
        const contestantResult = roundResults?.find(r => r.contestant_id === contestant.id);
        const finalScore = contestantResult?.round_score || 0;

        // 动画显示得分
        animateScore(finalScore);
    } catch (error) {
        console.error('加载评分数据失败:', error);
        document.getElementById('scoreGrid').innerHTML = '<p class="text-slate-500 text-center col-span-full">加载失败</p>';
    }
}

// 得分动画
function animateScore(targetScore) {
    const scoreElement = document.getElementById('finalScore');
    const duration = 2000;
    const startTime = performance.now();
    const startScore = 0;

    function updateScore(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // 缓动函数
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        const currentScore = startScore + (targetScore - startScore) * easeProgress;

        scoreElement.textContent = currentScore.toFixed(2);

        if (progress < 1) {
            requestAnimationFrame(updateScore);
        }
    }

    requestAnimationFrame(updateScore);
}

// 显示选手最终结果模式
async function showContestantFinalMode() {
    const contestantId = systemState?.current_contestant_id;
    if (!contestantId) return;

    // 查找选手
    let contestant = contestants.find(c => c.id === contestantId);
    if (!contestant) {
        try {
            contestant = await db.getContestant(contestantId);
        } catch (error) {
            console.error('获取选手信息失败:', error);
            return;
        }
    }

    if (!contestant) return;

    // 更新选手信息
    document.getElementById('contestantFinalNumber').textContent = contestant.number;
    document.getElementById('contestantFinalName').textContent = contestant.name;
    document.getElementById('contestantFinalDepartment').textContent = contestant.department || '';

    // 更新头像
    const avatarContainer = document.getElementById('contestantFinalAvatar');
    if (contestant.avatar_url) {
        avatarContainer.innerHTML = `<img src="${contestant.avatar_url}" alt="${contestant.name}" class="w-full h-full object-cover">`;
    } else {
        const initials = getInitials(contestant.name);
        avatarContainer.innerHTML = `<span class="text-3xl font-black">${initials}</span>`;
    }

    try {
        // 获取选手所有轮次的得分
        const results = await db.getFinalResultsWithRounds(currentEvent.id);
        const contestantResult = results?.find(r => r.contestant_id === contestant.id);

        // 显示各轮次得分
        const roundScoresContainer = document.getElementById('contestantFinalRoundScores');
        if (contestantResult && contestantResult.round_scores && contestantResult.round_scores.length > 0) {
            roundScoresContainer.innerHTML = contestantResult.round_scores.map(rs => {
                const round = scoringRounds.find(r => r.id === rs.round_id);
                const roundName = round ? round.name : rs.round_name;
                const score = rs.score ? parseFloat(rs.score).toFixed(2) : '0.00';
                return `
                    <div class="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                        <span class="text-white/60 text-sm">${roundName}</span>
                        <span class="text-white font-bold text-lg tabular-nums">${score}</span>
                    </div>
                `;
            }).join('');
        } else {
            roundScoresContainer.innerHTML = '<p class="text-white/30 text-center py-4">暂无轮次得分数据</p>';
        }

        // 获取所有评委对该选手的评分明细
        const supabase = getSupabase();
        const { data: allScores, error } = await supabase
            .from('scores')
            .select('judge_id, score, round_id')
            .eq('contestant_id', contestant.id)
            .eq('event_id', currentEvent.id);

        if (!error && allScores) {
            // 计算每位评委的平均分
            const judgeScoreMap = new Map();
            allScores.forEach(score => {
                if (!judgeScoreMap.has(score.judge_id)) {
                    judgeScoreMap.set(score.judge_id, { total: 0, count: 0 });
                }
                const data = judgeScoreMap.get(score.judge_id);
                data.total += score.score || 0;
                data.count++;
            });

            // 显示评委评分明细
            const judgeScoresContainer = document.getElementById('contestantFinalJudgeScores');
            judgeScoresContainer.innerHTML = judges.map((judge, index) => {
                const data = judgeScoreMap.get(judge.id);
                const avgScore = data ? (data.total / data.count).toFixed(1) : null;
                return `
                    <div class="animate-scale-in text-center p-3 rounded-xl ${avgScore ? 'bg-white/10 border border-white/20' : 'bg-white/5 border border-white/5'}" style="animation-delay: ${index * 0.05}s">
                        <div class="text-white/40 text-xs mb-1">评委 ${judge.judge_number}</div>
                        <div class="font-bold text-lg ${avgScore ? 'text-white' : 'text-white/20'}">
                            ${avgScore || '—'}
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 显示最终得分
        const finalScore = contestantResult?.final_score || 0;
        animateContestantFinalScore(finalScore);

    } catch (error) {
        console.error('加载选手最终结果失败:', error);
        document.getElementById('contestantFinalRoundScores').innerHTML = '<p class="text-white/30 text-center py-4">加载失败</p>';
    }
}

// 选手最终得分动画
function animateContestantFinalScore(targetScore) {
    const scoreElement = document.getElementById('contestantFinalTotalScore');
    const duration = 2000;
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

// 显示最终排名模式
async function showFinalMode() {
    try {
        const results = await db.getFinalResultsWithRounds(currentEvent.id);
        const rankingList = document.getElementById('rankingList');

        // 更新活动名称
        document.getElementById('finalEventName').textContent = currentEvent?.name || '';

        if (!results || results.length === 0) {
            rankingList.innerHTML = '<p class="text-white/30 text-center py-8">暂无排名数据</p>';
            return;
        }

        const medals = ['🥇', '🥈', '🥉'];

        rankingList.innerHTML = results.map((result, index) => {
            const rank = index + 1;
            const medal = medals[index] || '';

            // 轮次得分
            let roundScoresHtml = '';
            if (result.round_scores && result.round_scores.length > 0) {
                roundScoresHtml = `
                    <div class="hidden sm:flex items-center gap-1.5 shrink-0">
                        ${result.round_scores.map(rs => `
                            <div class="text-center bg-white/5 rounded-lg px-2 py-1">
                                <div class="text-white/30 text-xs">${rs.round_name.split(' ')[0]}</div>
                                <div class="text-white/70 text-sm font-medium">${rs.score.toFixed(1)}</div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            // 排名样式
            const rankStyle = rank === 1
                ? 'bg-gradient-to-r from-amber-900/40 to-yellow-900/30 border-amber-500/30'
                : rank === 2
                    ? 'bg-gradient-to-r from-slate-800/60 to-slate-700/30 border-slate-500/30'
                    : rank === 3
                        ? 'bg-gradient-to-r from-orange-900/30 to-amber-900/20 border-orange-500/20'
                        : 'bg-white/5 border-white/5';

            // 得分颜色
            const scoreColor = rank === 1
                ? 'text-amber-400'
                : rank === 2
                    ? 'text-slate-300'
                    : rank === 3
                        ? 'text-orange-400'
                        : 'text-white';

            // 头像
            const avatarHtml = result.avatar_url
                ? `<img src="${result.avatar_url}" alt="${result.name}" class="w-full h-full object-cover">`
                : `<span class="text-sm font-bold">${getInitials(result.name)}</span>`;

            return `
                <div class="animate-slide-in flex items-center gap-4 rounded-2xl px-4 py-3 border ${rankStyle}" style="animation-delay: ${index * 0.08}s">
                    <!-- 排名 -->
                    <div class="w-10 text-center shrink-0">
                        ${medal ? `<span class="text-2xl">${medal}</span>` : `<span class="text-white/30 font-bold text-lg">${rank}</span>`}
                    </div>

                    <!-- 头像 -->
                    <div class="w-10 h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-slate-700 text-white">
                        ${avatarHtml}
                    </div>

                    <!-- 信息 -->
                    <div class="flex-1 min-w-0">
                        <div class="text-xs text-white/30">#${result.contestant_number || '--'}</div>
                        <div class="font-bold text-white truncate">${result.name}</div>
                        <div class="text-xs text-white/40 truncate">${result.department || ''}</div>
                    </div>

                    <!-- 轮次得分 -->
                    ${roundScoresHtml}

                    <!-- 总分 -->
                    <div class="text-right shrink-0">
                        <div class="text-white/40 text-xs">总分</div>
                        <div class="font-black text-xl tabular-nums ${scoreColor}">
                            ${result.final_score.toFixed(2)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('加载最终排名失败:', error);
        document.getElementById('rankingList').innerHTML = '<p class="text-white/30 text-center py-8">加载失败</p>';
    }
}

// 订阅实时更新
function subscribeToChanges() {
    // 订阅系统状态变化
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

    // 订阅评分变化
    const scoreSub = db.subscribeToScores(async (payload) => {
        if (systemState?.display_mode === 'scoring' && systemState?.current_contestant_id) {
            await updateScoringProgress(systemState.current_contestant_id);
        }
    });
    subscriptions.push(scoreSub);

    // 订阅轮次变化
    const roundSub = db.subscribeToScoringRounds(async () => {
        scoringRounds = await db.getScoringRounds(currentEvent.id);
        if (systemState?.current_round_id) {
            currentRound = scoringRounds.find(r => r.id === systemState.current_round_id);
        }
        updateRoundBadge();
    });
    subscriptions.push(roundSub);
}

// 获取姓名首字母
function getInitials(name) {
    if (!name) return '??';
    return name.split(' ')
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

// 暴露全局函数
window.selectEvent = selectEvent;
