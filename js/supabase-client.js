const SUPABASE_URL = 'https://wbhhcqmcltodpemjmdsq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiaGhjcW1jbHRvZHBlbWptZHNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NDA3NjQsImV4cCI6MjA5MDAxNjc2NH0.Z8qgPb3Oe59Yn-VCaVDjXFz4D2JbkIlvOJzso0_MBww';

let supabaseClient = null;

function getSupabase() {
    if (!supabaseClient) {
        if (typeof window.supabase === 'undefined') {
            throw new Error('Supabase library not loaded. Make sure to include the Supabase CDN script.');
        }
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true
            },
            realtime: {
                params: {
                    eventsPerSecond: 10
                }
            }
        });
    }
    return supabaseClient;
}

const db = {
    async getContestants(eventId = null) {
        const supabase = getSupabase();
        let query = supabase.from('contestants').select('*').order('order_index', { ascending: true });
        if (eventId) query = query.eq('event_id', eventId);
        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    async getContestant(id) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('contestants').select('*').eq('id', id).single();
        if (error) throw error;
        return data;
    },

    async createContestant(contestant) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('contestants').insert(contestant).select().single();
        if (error) throw error;
        return data;
    },

    async updateContestant(id, updates) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('contestants').update(updates).eq('id', id).select().single();
        if (error) throw error;
        return data;
    },

    async deleteContestant(id) {
        const supabase = getSupabase();
        const { error } = await supabase.from('contestants').delete().eq('id', id);
        if (error) throw error;
    },

    async getJudges(eventId = null) {
        const supabase = getSupabase();
        let query = supabase.from('judges')
            .select('id, username, judge_number, created_at, group_id, judge_groups(id, name, weight)')
            .order('judge_number', { ascending: true });
        if (eventId) query = query.eq('event_id', eventId);
        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    async getJudgeById(id) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('judges').select('*').eq('id', id).single();
        if (error) throw error;
        return data;
    },

    async createJudge(judge) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('judges').insert(judge).select('id, username, judge_number, created_at, group_id').single();
        if (error) throw error;
        return data;
    },

    async updateJudge(id, updates) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('judges').update(updates).eq('id', id).select('id, username, judge_number, created_at, group_id').single();
        if (error) throw error;
        return data;
    },

    async deleteJudge(id) {
        const supabase = getSupabase();
        const { error } = await supabase.from('judges').delete().eq('id', id);
        if (error) throw error;
    },

    async getJudgeGroups(eventId) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('judge_groups')
            .select('*')
            .eq('event_id', eventId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data;
    },

    async createJudgeGroup(group) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('judge_groups').insert(group).select().single();
        if (error) throw error;
        return data;
    },

    async updateJudgeGroup(id, updates) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('judge_groups').update(updates).eq('id', id).select().single();
        if (error) throw error;
        return data;
    },

    async deleteJudgeGroup(id) {
        const supabase = getSupabase();
        const { error } = await supabase.from('judge_groups').delete().eq('id', id);
        if (error) throw error;
    },

    async getScore(contestantId, judgeId) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('scores').select('*').eq('contestant_id', contestantId).eq('judge_id', judgeId).maybeSingle();
        if (error) throw error;
        return data;
    },

    async getScoresByContestant(contestantId) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('scores').select('*, judges(judge_number)').eq('contestant_id', contestantId);
        if (error) throw error;
        return data;
    },

    async getScoresByJudge(judgeId, eventId = null) {
        const supabase = getSupabase();
        let query = supabase.from('scores').select('*, contestants(name, number)').eq('judge_id', judgeId);
        if (eventId) query = query.eq('event_id', eventId);
        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    async submitScore(contestantId, judgeId, score, eventId = null) {
        const supabase = getSupabase();
        const scoreData = {
            contestant_id: contestantId,
            judge_id: judgeId,
            score: score,
            updated_at: new Date().toISOString()
        };
        if (eventId) scoreData.event_id = eventId;
        
        const { data, error } = await supabase.from('scores').upsert(scoreData, { onConflict: 'contestant_id,judge_id' }).select().single();
        if (error) throw error;
        return data;
    },

    async deleteScoresByContestant(contestantId) {
        const supabase = getSupabase();
        const { error } = await supabase.from('scores').delete().eq('contestant_id', contestantId);
        if (error) throw error;
    },

    async deleteAllScores(eventId = null) {
        const supabase = getSupabase();
        let query = supabase.from('scores').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (eventId) query = query.eq('event_id', eventId);
        const { error } = await query;
        if (error) throw error;
    },

    async getSystemState() {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('system_state').select('*').eq('id', 1).single();
        if (error) throw error;
        return data;
    },

    async updateSystemState(updates) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('system_state').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', 1).select().single();
        if (error) throw error;
        return data;
    },

    async getFinalResults() {
        const supabase = getSupabase();
        const { data, error } = await supabase.rpc('get_final_results');
        if (error) throw error;
        return data;
    },

    async getContestantScores(contestantId) {
        const supabase = getSupabase();
        const { data, error } = await supabase.rpc('get_contestant_scores', { p_contestant_id: contestantId });
        if (error) throw error;
        return data;
    },

    // 活动管理
    async getEvents() {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('events').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    async getActiveEvents() {
        const supabase = getSupabase();
        const { data, error } = await supabase.rpc('get_active_events');
        if (error) throw error;
        return data;
    },

    async getEvent(id) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('events').select('*').eq('id', id).single();
        if (error) throw error;
        return data;
    },

    async createEvent(event) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('events').insert(event).select().single();
        if (error) throw error;
        return data;
    },

    async updateEvent(id, updates) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('events').update(updates).eq('id', id).select().single();
        if (error) throw error;
        return data;
    },

    async deleteEvent(id) {
        const supabase = getSupabase();
        const { error } = await supabase.from('events').delete().eq('id', id);
        if (error) throw error;
    },

    async copyEvent(eventId, newName) {
        const supabase = getSupabase();
        const { data, error } = await supabase.rpc('copy_event', { p_event_id: eventId, p_new_name: newName });
        if (error) throw error;
        return data;
    },

    async switchEvent(eventId) {
        const supabase = getSupabase();
        await supabase.from('events').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000');
        const { data, error } = await supabase.from('events').update({ is_active: true, status: 'active' }).eq('id', eventId).select().single();
        if (error) throw error;
        await this.updateSystemState({ current_event_id: eventId });
        return data;
    },

    subscribeToScores(callback) {
        const supabase = getSupabase();
        return supabase.channel('scores-channel').on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, callback).subscribe();
    },

    subscribeToSystemState(callback) {
        const supabase = getSupabase();
        return supabase.channel('system-state-channel').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'system_state' }, callback).subscribe();
    },

    subscribeToContestants(callback) {
        const supabase = getSupabase();
        return supabase.channel('contestants-channel').on('postgres_changes', { event: '*', schema: 'public', table: 'contestants' }, callback).subscribe();
    },

    subscribeToEvents(callback) {
        const supabase = getSupabase();
        return supabase.channel('events-channel').on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, callback).subscribe();
    },

    subscribeToJudgeGroups(callback) {
        const supabase = getSupabase();
        return supabase.channel('judge-groups-channel').on('postgres_changes', { event: '*', schema: 'public', table: 'judge_groups' }, callback).subscribe();
    },

    async verifyAdminLogin(username, password) {
        const supabase = getSupabase();
        const { data, error } = await supabase.rpc('verify_admin_login', { p_username: username, p_password: password });
        if (error) throw error;
        return data;
    }
};

const auth = {
    async signIn(email, password) {
        const supabase = getSupabase();
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    },

    async signOut() {
        const supabase = getSupabase();
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    },

    async getSession() {
        const supabase = getSupabase();
        const { data: { session } } = await supabase.auth.getSession();
        return session;
    },

    async getCurrentUser() {
        const supabase = getSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    },

    onAuthStateChange(callback) {
        const supabase = getSupabase();
        return supabase.auth.onAuthStateChange(callback);
    }
};

const judgeAuth = {
    STORAGE_KEY: 'judge_session',
    EVENT_KEY: 'current_event_id',

    async login(username, password) {
        const supabase = getSupabase();
        const { data, error } = await supabase.rpc('verify_judge', { p_username: username, p_password: password });
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('用户名或密码错误');
        const judge = data[0];
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(judge));
        return judge;
    },

    logout() {
        localStorage.removeItem(this.STORAGE_KEY);
        localStorage.removeItem(this.EVENT_KEY);
    },

    getCurrentJudge() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (!stored) return null;
        try {
            return JSON.parse(stored);
        } catch {
            return null;
        }
    },

    isLoggedIn() {
        return this.getCurrentJudge() !== null;
    },

    setCurrentEvent(eventId) {
        localStorage.setItem(this.EVENT_KEY, eventId);
    },

    getCurrentEventId() {
        return localStorage.getItem(this.EVENT_KEY);
    },

    clearCurrentEvent() {
        localStorage.removeItem(this.EVENT_KEY);
    }
};

const scoringRules = {
    average_all: { name: '平均分', description: '所有评委评分的平均值' },
    average_trimmed: { name: '去高低分平均', description: '去掉一个最高分和一个最低分后的平均值' },
    median: { name: '中位数', description: '所有评委评分的中位数' },
    weighted: { name: '加权平均', description: '根据评委权重计算加权平均分' }
};

window.db = db;
window.auth = auth;
window.judgeAuth = judgeAuth;
window.scoringRules = scoringRules;
window.getSupabase = getSupabase;
