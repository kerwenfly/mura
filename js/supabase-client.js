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
            .select('id, username, judge_number, created_at, group_id, avatar_url, judge_groups(id, name)')
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
        const { data, error } = await supabase.from('judges').insert(judge).select('id, username, judge_number, created_at, group_id, avatar_url').single();
        if (error) throw error;
        return data;
    },

    async updateJudge(id, updates) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('judges').update(updates).eq('id', id).select('id, username, judge_number, created_at, group_id, avatar_url').single();
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

    async getScoringRounds(eventId) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('scoring_rounds')
            .select('*')
            .eq('event_id', eventId)
            .order('round_order', { ascending: true });
        if (error) throw error;
        return data;
    },

    async getScoringRound(id) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('scoring_rounds').select('*').eq('id', id).single();
        if (error) throw error;
        return data;
    },

    async createScoringRound(round) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('scoring_rounds').insert(round).select().single();
        if (error) throw error;
        return data;
    },

    async updateScoringRound(id, updates) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('scoring_rounds').update(updates).eq('id', id).select().single();
        if (error) throw error;
        return data;
    },

    async deleteScoringRound(id) {
        const supabase = getSupabase();
        const { error } = await supabase.from('scoring_rounds').delete().eq('id', id);
        if (error) throw error;
    },

    async setActiveRound(roundId) {
        const supabase = getSupabase();
        const { error } = await supabase.rpc('set_active_round', { p_round_id: roundId });
        if (error) throw error;
    },

    async getRoundGroupSettings(roundId) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('round_group_settings')
            .select('*, judge_groups(name)')
            .eq('round_id', roundId);
        if (error) throw error;
        return data;
    },

    async createRoundGroupSetting(setting) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('round_group_settings').insert(setting).select().single();
        if (error) throw error;
        return data;
    },

    async updateRoundGroupSetting(id, updates) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('round_group_settings').update(updates).eq('id', id).select().single();
        if (error) throw error;
        return data;
    },

    async deleteRoundGroupSettings(roundId) {
        const supabase = getSupabase();
        const { error } = await supabase.from('round_group_settings').delete().eq('round_id', roundId);
        if (error) throw error;
    },

    async saveRoundGroupSettings(roundId, settings) {
        const supabase = getSupabase();
        for (const setting of settings) {
            const { error } = await supabase.from('round_group_settings')
                .upsert(setting, { onConflict: 'round_id,group_id' })
                .select();
            if (error) throw error;
        }
    },

    async getScore(contestantId, judgeId, roundId) {
        const supabase = getSupabase();
        let query = supabase.from('scores').select('*')
            .eq('contestant_id', contestantId)
            .eq('judge_id', judgeId);
        if (roundId) query = query.eq('round_id', roundId);
        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        return data;
    },

    async getScoresByContestant(contestantId, roundId = null) {
        const supabase = getSupabase();
        let query = supabase.from('scores').select('*, judges(judge_number)').eq('contestant_id', contestantId);
        if (roundId) query = query.eq('round_id', roundId);
        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    async getScoresByJudge(judgeId, eventId = null) {
        const supabase = getSupabase();
        let query = supabase.from('scores').select('*, contestants(name, number), scoring_rounds(name)').eq('judge_id', judgeId);
        if (eventId) query = query.eq('event_id', eventId);
        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    async getScoresByRound(roundId) {
        const supabase = getSupabase();
        const { data, error } = await supabase.from('scores')
            .select('*, judges(judge_number, username), contestants(name, number)')
            .eq('round_id', roundId);
        if (error) throw error;
        return data;
    },

    async submitScore(contestantId, judgeId, score, eventId, roundId) {
        const supabase = getSupabase();
        const scoreData = {
            contestant_id: contestantId,
            judge_id: judgeId,
            score: score,
            event_id: eventId,
            round_id: roundId,
            updated_at: new Date().toISOString()
        };
        
        const { data, error } = await supabase.from('scores')
            .upsert(scoreData, { onConflict: 'contestant_id,judge_id,round_id' })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async deleteScoresByContestant(contestantId) {
        const supabase = getSupabase();
        const { error } = await supabase.from('scores').delete().eq('contestant_id', contestantId);
        if (error) throw error;
    },

    async deleteAllScores(eventId = null, roundId = null) {
        const supabase = getSupabase();
        let query = supabase.from('scores').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (eventId) query = query.eq('event_id', eventId);
        if (roundId) query = query.eq('round_id', roundId);
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

    async getRoundResults(roundId) {
        const supabase = getSupabase();
        const { data, error } = await supabase.rpc('get_round_results', { p_round_id: roundId });
        if (error) throw error;
        return data;
    },

    async getFinalResultsWithRounds(eventId) {
        const supabase = getSupabase();
        const { data, error } = await supabase.rpc('get_final_results_with_rounds', { p_event_id: eventId });
        if (error) throw error;
        return data;
    },

    async getContestantRoundScores(contestantId, roundId) {
        const supabase = getSupabase();
        const { data, error } = await supabase.rpc('get_contestant_round_scores', { 
            p_contestant_id: contestantId, 
            p_round_id: roundId 
        });
        if (error) throw error;
        return data;
    },

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

    subscribeToScoringRounds(callback) {
        const supabase = getSupabase();
        return supabase.channel('scoring-rounds-channel').on('postgres_changes', { event: '*', schema: 'public', table: 'scoring_rounds' }, callback).subscribe();
    },

    subscribeToRoundGroupSettings(callback) {
        const supabase = getSupabase();
        return supabase.channel('round-group-settings-channel').on('postgres_changes', { event: '*', schema: 'public', table: 'round_group_settings' }, callback).subscribe();
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

const calculationMethods = {
    average: { name: '平均分', description: '所有评委评分的平均值' },
    trimmed_average: { name: '去高低分平均', description: '去除指定数量的最高分和最低分后的平均值' }
};

window.db = db;
window.auth = auth;
window.judgeAuth = judgeAuth;
window.calculationMethods = calculationMethods;
window.getSupabase = getSupabase;
