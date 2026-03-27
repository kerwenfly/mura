-- ============================================
-- 多人在线实时评分系统 初始化脚本 
-- 支持多轮评分
-- ============================================

-- ============================================
-- 1. 创建基础表
-- ============================================

-- 活动表
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
    is_active BOOLEAN DEFAULT FALSE,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    settings JSONB DEFAULT '{}'
);

-- 管理员表
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);

-- 选手表
CREATE TABLE IF NOT EXISTS contestants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    number INTEGER NOT NULL,
    department TEXT,
    avatar_url TEXT,
    description TEXT,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 评委分组表（移除权重字段）
CREATE TABLE IF NOT EXISTS judge_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id, name)
);

-- 评委表
CREATE TABLE IF NOT EXISTS judges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    group_id UUID REFERENCES judge_groups(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    judge_number INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id, username),
    UNIQUE(event_id, judge_number)
);

-- 评分轮次表（新增）
CREATE TABLE IF NOT EXISTS scoring_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    weight DECIMAL(5,2) DEFAULT 1.00 CHECK (weight >= 0 AND weight <= 10),
    calculation_method TEXT DEFAULT 'average' CHECK (calculation_method IN ('average', 'trimmed_average')),
    round_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id, name)
);

-- 轮次分组设置表（每个分组在每个轮次的去高低分设置）
CREATE TABLE IF NOT EXISTS round_group_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID REFERENCES scoring_rounds(id) ON DELETE CASCADE,
    group_id UUID REFERENCES judge_groups(id) ON DELETE CASCADE,
    trim_high_count INTEGER DEFAULT 1 CHECK (trim_high_count >= 0),
    trim_low_count INTEGER DEFAULT 1 CHECK (trim_low_count >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(round_id, group_id)
);

-- 评分表（增加轮次关联）
CREATE TABLE IF NOT EXISTS scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    contestant_id UUID REFERENCES contestants(id) ON DELETE CASCADE,
    judge_id UUID REFERENCES judges(id) ON DELETE CASCADE,
    round_id UUID REFERENCES scoring_rounds(id) ON DELETE CASCADE,
    score DECIMAL(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(contestant_id, judge_id, round_id)
);

-- 系统状态表（增加当前轮次和主题设置）
CREATE TABLE IF NOT EXISTS system_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    current_event_id UUID REFERENCES events(id),
    current_contestant_id UUID REFERENCES contestants(id) ON DELETE SET NULL,
    current_round_id UUID REFERENCES scoring_rounds(id) ON DELETE SET NULL,
    display_mode TEXT DEFAULT 'waiting' CHECK (display_mode IN ('waiting', 'scoring', 'result', 'final')),
    display_theme INTEGER DEFAULT 1 CHECK (display_theme >= 1 AND display_theme <= 10),
    is_locked BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. 创建索引
-- ============================================

-- 如果 system_state 表已存在，添加 display_theme 字段
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_state' AND column_name = 'display_theme') THEN
        NULL;
    ELSE
        ALTER TABLE system_state ADD COLUMN display_theme INTEGER DEFAULT 1 CHECK (display_theme >= 1 AND display_theme <= 10);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contestants_event ON contestants(event_id);
CREATE INDEX IF NOT EXISTS idx_judge_groups_event ON judge_groups(event_id);
CREATE INDEX IF NOT EXISTS idx_judges_event ON judges(event_id);
CREATE INDEX IF NOT EXISTS idx_judges_group ON judges(group_id);
CREATE INDEX IF NOT EXISTS idx_scores_event ON scores(event_id);
CREATE INDEX IF NOT EXISTS idx_scores_contestant ON scores(contestant_id);
CREATE INDEX IF NOT EXISTS idx_scores_judge ON scores(judge_id);
CREATE INDEX IF NOT EXISTS idx_scores_round ON scores(round_id);
CREATE INDEX IF NOT EXISTS idx_scoring_rounds_event ON scoring_rounds(event_id);

-- ============================================
-- 3. 初始化系统状态
-- ============================================

INSERT INTO system_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 4. 创建触发器函数
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 评分表更新时间触发器
DROP TRIGGER IF EXISTS update_scores_updated_at ON scores;
CREATE TRIGGER update_scores_updated_at
    BEFORE UPDATE ON scores
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 系统状态表更新时间触发器
DROP TRIGGER IF EXISTS update_system_state_updated_at ON system_state;
CREATE TRIGGER update_system_state_updated_at
    BEFORE UPDATE ON system_state
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 创建活动时自动创建默认分组和默认评分轮次
CREATE OR REPLACE FUNCTION create_default_judge_group_and_round()
RETURNS TRIGGER AS $$
DECLARE
    group_id UUID;
    round_id UUID;
BEGIN
    INSERT INTO judge_groups (event_id, name)
    VALUES (NEW.id, '默认分组')
    RETURNING id INTO group_id;
    
    INSERT INTO scoring_rounds (event_id, name, weight, calculation_method, round_order, is_active)
    VALUES (NEW.id, '第一轮评分', 1.00, 'average', 1, TRUE)
    RETURNING id INTO round_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_default_group_and_round ON events;
CREATE TRIGGER trigger_create_default_group_and_round
    AFTER INSERT ON events
    FOR EACH ROW
    EXECUTE FUNCTION create_default_judge_group_and_round();

-- ============================================
-- 5. 创建数据库函数
-- ============================================

-- 验证评委登录
CREATE OR REPLACE FUNCTION verify_judge(p_username TEXT, p_password TEXT)
RETURNS TABLE (
    id UUID,
    username TEXT,
    judge_number INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT judges.id, judges.username, judges.judge_number
    FROM judges
    WHERE judges.username = p_username AND judges.password = p_password;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 获取活动列表
CREATE OR REPLACE FUNCTION get_active_events()
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    status TEXT,
    contestant_count BIGINT,
    judge_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.name,
        e.description,
        e.status,
        (SELECT COUNT(*) FROM contestants c WHERE c.event_id = e.id) AS contestant_count,
        (SELECT COUNT(*) FROM judges j WHERE j.event_id = e.id) AS judge_count
    FROM events e
    WHERE e.status IN ('active', 'draft')
    ORDER BY e.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 复制活动（包含选手、评委分组、评委和评分轮次）
CREATE OR REPLACE FUNCTION copy_event(p_event_id UUID, p_new_name TEXT)
RETURNS UUID AS $$
DECLARE
    new_event_id UUID;
    group_mapping JSONB := '[]'::JSONB;
    round_mapping JSONB := '[]'::JSONB;
    old_group_id UUID;
    new_group_id UUID;
    old_round_id UUID;
    new_round_id UUID;
BEGIN
    INSERT INTO events (name, description, status, settings)
    SELECT p_new_name, description, 'draft', settings
    FROM events WHERE id = p_event_id
    RETURNING id INTO new_event_id;
    
    INSERT INTO contestants (name, number, department, description, order_index, event_id)
    SELECT name, number, department, description, order_index, new_event_id
    FROM contestants WHERE event_id = p_event_id;
    
    FOR old_group_id, new_group_id IN
        INSERT INTO judge_groups (event_id, name)
        SELECT new_event_id, name
        FROM judge_groups WHERE event_id = p_event_id
        RETURNING (SELECT id FROM judge_groups WHERE event_id = p_event_id AND name = judge_groups.name LIMIT 1), id
    LOOP
        group_mapping := jsonb_set(group_mapping, array[jsonb_array_length(group_mapping)::text], 
            jsonb_build_object('old', old_group_id, 'new', new_group_id));
    END LOOP;
    
    FOR old_round_id, new_round_id IN
        INSERT INTO scoring_rounds (event_id, name, weight, calculation_method, trim_high_count, trim_low_count, round_order, is_active)
        SELECT new_event_id, name, weight, calculation_method, trim_high_count, trim_low_count, round_order, FALSE
        FROM scoring_rounds WHERE event_id = p_event_id
        RETURNING (SELECT id FROM scoring_rounds WHERE event_id = p_event_id AND name = scoring_rounds.name LIMIT 1), id
    LOOP
        round_mapping := jsonb_set(round_mapping, array[jsonb_array_length(round_mapping)::text], 
            jsonb_build_object('old', old_round_id, 'new', new_round_id));
    END LOOP;
    
    INSERT INTO judges (username, password, judge_number, event_id, group_id)
    SELECT j.username, j.password, j.judge_number, new_event_id,
           (SELECT elem->>'new' FROM jsonb_array_elements(group_mapping) elem 
            WHERE elem->>'old' = j.group_id::text)
    FROM judges j WHERE j.event_id = p_event_id;
    
    RETURN new_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 检查管理员过期
CREATE OR REPLACE FUNCTION check_admin_expiry()
RETURNS void AS $$
BEGIN
    UPDATE admins 
    SET is_active = FALSE 
    WHERE expires_at IS NOT NULL 
    AND expires_at < NOW() 
    AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 验证管理员登录（用户名/密码）
CREATE OR REPLACE FUNCTION verify_admin_login(p_username TEXT, p_password TEXT)
RETURNS TABLE (
    id UUID,
    username TEXT,
    email TEXT,
    is_active BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT a.id, a.username, a.email, a.is_active
    FROM admins a
    WHERE a.username = p_username 
    AND a.password = p_password
    AND a.is_active = TRUE
    AND (a.expires_at IS NULL OR a.expires_at > NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 计算某选手某轮得分（支持分组设置）
CREATE OR REPLACE FUNCTION calculate_round_score(p_contestant_id UUID, p_round_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_method TEXT;
    v_total_score NUMERIC := 0;
    v_total_count INTEGER := 0;
    v_group_record RECORD;
    v_group_score NUMERIC;
    v_trim_high INTEGER;
    v_trim_low INTEGER;
    v_score_count INTEGER;
BEGIN
    SELECT calculation_method INTO v_method
    FROM scoring_rounds WHERE id = p_round_id;
    
    IF v_method = 'average' THEN
        SELECT AVG(score) INTO v_total_score
        FROM scores WHERE contestant_id = p_contestant_id AND round_id = p_round_id;
        RETURN COALESCE(v_total_score, 0);
    END IF;
    
    -- 去高低分平均：按分组分别计算
    FOR v_group_record IN 
        SELECT jg.id AS group_id, rgs.trim_high_count, rgs.trim_low_count
        FROM judge_groups jg
        LEFT JOIN round_group_settings rgs ON rgs.group_id = jg.id AND rgs.round_id = p_round_id
        WHERE jg.event_id = (SELECT event_id FROM scoring_rounds WHERE id = p_round_id)
    LOOP
        v_trim_high := COALESCE(v_group_record.trim_high_count, 1);
        v_trim_low := COALESCE(v_group_record.trim_low_count, 1);
        
        SELECT COUNT(*), COALESCE(AVG(score), 0) INTO v_score_count, v_group_score
        FROM scores s
        JOIN judges j ON s.judge_id = j.id
        WHERE s.contestant_id = p_contestant_id 
        AND s.round_id = p_round_id 
        AND j.group_id = v_group_record.group_id;
        
        IF v_score_count > 0 THEN
            IF v_score_count <= (v_trim_high + v_trim_low + 1) THEN
                v_total_score := v_total_score + v_group_score * v_score_count;
                v_total_count := v_total_count + v_score_count;
            ELSE
                SELECT AVG(score) INTO v_group_score
                FROM (
                    SELECT s.score
                    FROM scores s
                    JOIN judges j ON s.judge_id = j.id
                    WHERE s.contestant_id = p_contestant_id 
                    AND s.round_id = p_round_id 
                    AND j.group_id = v_group_record.group_id
                    ORDER BY s.score
                    OFFSET v_trim_low
                    LIMIT v_score_count - v_trim_high - v_trim_low
                ) trimmed;
                v_total_score := v_total_score + v_group_score * (v_score_count - v_trim_high - v_trim_low);
                v_total_count := v_total_count + (v_score_count - v_trim_high - v_trim_low);
            END IF;
        END IF;
    END LOOP;
    
    IF v_total_count = 0 THEN
        RETURN 0;
    END IF;
    
    RETURN v_total_score / v_total_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 获取某轮评分结果
CREATE OR REPLACE FUNCTION get_round_results(p_round_id UUID)
RETURNS TABLE (
    contestant_id UUID,
    name TEXT,
    number INTEGER,
    department TEXT,
    round_score NUMERIC,
    judge_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id AS contestant_id,
        c.name,
        c.number,
        c.department,
        calculate_round_score(c.id, p_round_id) AS round_score,
        (SELECT COUNT(*) FROM scores s WHERE s.contestant_id = c.id AND s.round_id = p_round_id) AS judge_count
    FROM contestants c
    WHERE c.event_id = (SELECT event_id FROM scoring_rounds WHERE id = p_round_id)
    ORDER BY round_score DESC, c.number ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 获取带各轮得分的最终结果
CREATE OR REPLACE FUNCTION get_final_results_with_rounds(p_event_id UUID)
RETURNS TABLE (
    contestant_id UUID,
    name TEXT,
    number INTEGER,
    department TEXT,
    round_scores JSONB,
    final_score NUMERIC,
    total_judges BIGINT
) AS $$
DECLARE
    round_record RECORD;
    total_weight NUMERIC := 0;
BEGIN
    FOR round_record IN 
        SELECT id, weight FROM scoring_rounds 
        WHERE event_id = p_event_id 
        ORDER BY round_order
    LOOP
        total_weight := total_weight + round_record.weight;
    END LOOP;
    
    RETURN QUERY
    WITH contestant_rounds AS (
        SELECT 
            c.id AS c_id,
            c.name AS c_name,
            c.number AS c_number,
            c.department AS c_department,
            sr.id AS round_id,
            sr.name AS round_name,
            sr.weight AS round_weight,
            calculate_round_score(c.id, sr.id) AS round_score
        FROM contestants c
        CROSS JOIN scoring_rounds sr
        WHERE c.event_id = p_event_id AND sr.event_id = p_event_id
    ),
    aggregated AS (
        SELECT 
            cr.c_id AS contestant_id,
            cr.c_name,
            cr.c_number,
            cr.c_department,
            jsonb_agg(
                jsonb_build_object(
                    'round_id', cr.round_id,
                    'round_name', cr.round_name,
                    'score', cr.round_score,
                    'weight', cr.round_weight
                )
            ) AS round_scores,
            SUM(cr.round_score * cr.round_weight) / NULLIF(total_weight, 0) AS final_score
        FROM contestant_rounds cr
        GROUP BY cr.c_id, cr.c_name, cr.c_number, cr.c_department
    )
    SELECT 
        a.contestant_id,
        a.c_name AS name,
        a.c_number AS number,
        a.c_department AS department,
        a.round_scores,
        COALESCE(a.final_score, 0) AS final_score,
        (SELECT COUNT(*) FROM scores s WHERE s.contestant_id = a.contestant_id) AS total_judges
    FROM aggregated a
    ORDER BY a.final_score DESC, a.c_number ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 获取选手在某轮的评分详情
CREATE OR REPLACE FUNCTION get_contestant_round_scores(p_contestant_id UUID, p_round_id UUID)
RETURNS TABLE (
    judge_number INTEGER,
    score NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT j.judge_number, s.score
    FROM scores s
    JOIN judges j ON s.judge_id = j.id
    WHERE s.contestant_id = p_contestant_id AND s.round_id = p_round_id
    ORDER BY j.judge_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 设置当前活动轮次
CREATE OR REPLACE FUNCTION set_active_round(p_round_id UUID)
RETURNS void AS $$
DECLARE
    v_event_id UUID;
BEGIN
    SELECT event_id INTO v_event_id FROM scoring_rounds WHERE id = p_round_id;
    
    UPDATE scoring_rounds SET is_active = FALSE WHERE event_id = v_event_id;
    UPDATE scoring_rounds SET is_active = TRUE WHERE id = p_round_id;
    UPDATE system_state SET current_round_id = p_round_id, updated_at = NOW() WHERE id = 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. 启用行级安全策略 (RLS)
-- ============================================

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE contestants ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE judges ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_group_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_state ENABLE ROW LEVEL SECURITY;

-- 删除旧策略
DROP POLICY IF EXISTS "所有人可读活动" ON events;
DROP POLICY IF EXISTS "所有人可写活动" ON events;
DROP POLICY IF EXISTS "所有人可读管理员" ON admins;
DROP POLICY IF EXISTS "所有人可写管理员" ON admins;
DROP POLICY IF EXISTS "所有人可读选手" ON contestants;
DROP POLICY IF EXISTS "所有人可写选手" ON contestants;
DROP POLICY IF EXISTS "所有人可读评委分组" ON judge_groups;
DROP POLICY IF EXISTS "所有人可写评委分组" ON judge_groups;
DROP POLICY IF EXISTS "所有人可读评委" ON judges;
DROP POLICY IF EXISTS "所有人可写评委" ON judges;
DROP POLICY IF EXISTS "所有人可读评分" ON scores;
DROP POLICY IF EXISTS "所有人可写评分" ON scores;
DROP POLICY IF EXISTS "所有人可读系统状态" ON system_state;
DROP POLICY IF EXISTS "所有人可写系统状态" ON system_state;
DROP POLICY IF EXISTS "所有人可读评分轮次" ON scoring_rounds;
DROP POLICY IF EXISTS "所有人可写评分轮次" ON scoring_rounds;

-- 创建新策略
CREATE POLICY "所有人可读活动" ON events FOR SELECT USING (true);
CREATE POLICY "所有人可写活动" ON events FOR ALL USING (true);
CREATE POLICY "所有人可读管理员" ON admins FOR SELECT USING (true);
CREATE POLICY "所有人可写管理员" ON admins FOR ALL USING (true);
CREATE POLICY "所有人可读选手" ON contestants FOR SELECT USING (true);
CREATE POLICY "所有人可写选手" ON contestants FOR ALL USING (true);
CREATE POLICY "所有人可读评委分组" ON judge_groups FOR SELECT USING (true);
CREATE POLICY "所有人可写评委分组" ON judge_groups FOR ALL USING (true);
CREATE POLICY "所有人可读评委" ON judges FOR SELECT USING (true);
CREATE POLICY "所有人可写评委" ON judges FOR ALL USING (true);
CREATE POLICY "所有人可读评分" ON scores FOR SELECT USING (true);
CREATE POLICY "所有人可写评分" ON scores FOR ALL USING (true);
CREATE POLICY "所有人可读系统状态" ON system_state FOR SELECT USING (true);
CREATE POLICY "所有人可写系统状态" ON system_state FOR ALL USING (true);
CREATE POLICY "所有人可读评分轮次" ON scoring_rounds FOR SELECT USING (true);
CREATE POLICY "所有人可写评分轮次" ON scoring_rounds FOR ALL USING (true);
CREATE POLICY "所有人可读轮次分组设置" ON round_group_settings FOR SELECT USING (true);
CREATE POLICY "所有人可写轮次分组设置" ON round_group_settings FOR ALL USING (true);

-- ============================================
-- 7. 启用 Realtime
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE admins;
ALTER PUBLICATION supabase_realtime ADD TABLE contestants;
ALTER PUBLICATION supabase_realtime ADD TABLE judge_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE judges;
ALTER PUBLICATION supabase_realtime ADD TABLE scores;
ALTER PUBLICATION supabase_realtime ADD TABLE scoring_rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE round_group_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE system_state;

-- ============================================
-- 完成
-- ============================================

SELECT 'V3 初始化完成！支持多轮评分' AS message;
