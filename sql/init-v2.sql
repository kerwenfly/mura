-- ============================================
-- 多人在线实时评分系统 初始化脚本
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

-- 评委分组表
CREATE TABLE IF NOT EXISTS judge_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    weight DECIMAL(5,2) DEFAULT 1.00 CHECK (weight >= 0 AND weight <= 10),
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

-- 评分表
CREATE TABLE IF NOT EXISTS scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    contestant_id UUID REFERENCES contestants(id) ON DELETE CASCADE,
    judge_id UUID REFERENCES judges(id) ON DELETE CASCADE,
    score DECIMAL(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(contestant_id, judge_id)
);

-- 系统状态表
CREATE TABLE IF NOT EXISTS system_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    current_event_id UUID REFERENCES events(id),
    current_contestant_id UUID REFERENCES contestants(id) ON DELETE SET NULL,
    display_mode TEXT DEFAULT 'waiting' CHECK (display_mode IN ('waiting', 'scoring', 'result', 'final')),
    is_locked BOOLEAN DEFAULT FALSE,
    scoring_rule TEXT DEFAULT 'average_all' CHECK (scoring_rule IN ('average_all', 'average_trimmed', 'median', 'weighted')),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. 创建索引
-- ============================================

CREATE INDEX IF NOT EXISTS idx_contestants_event ON contestants(event_id);
CREATE INDEX IF NOT EXISTS idx_judge_groups_event ON judge_groups(event_id);
CREATE INDEX IF NOT EXISTS idx_judges_event ON judges(event_id);
CREATE INDEX IF NOT EXISTS idx_judges_group ON judges(group_id);
CREATE INDEX IF NOT EXISTS idx_scores_event ON scores(event_id);
CREATE INDEX IF NOT EXISTS idx_scores_contestant ON scores(contestant_id);
CREATE INDEX IF NOT EXISTS idx_scores_judge ON scores(judge_id);

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

-- 创建活动时自动创建默认分组
CREATE OR REPLACE FUNCTION create_default_judge_group()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO judge_groups (event_id, name, weight)
    VALUES (NEW.id, '默认分组', 1.00);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_default_group ON events;
CREATE TRIGGER trigger_create_default_group
    AFTER INSERT ON events
    FOR EACH ROW
    EXECUTE FUNCTION create_default_judge_group();

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

-- 复制活动（包含选手、评委分组和评委）
CREATE OR REPLACE FUNCTION copy_event(p_event_id UUID, p_new_name TEXT)
RETURNS UUID AS $$
DECLARE
    new_event_id UUID;
    group_mapping JSONB := '[]'::JSONB;
    old_group_id UUID;
    new_group_id UUID;
BEGIN
    INSERT INTO events (name, description, status, settings)
    SELECT p_new_name, description, 'draft', settings
    FROM events WHERE id = p_event_id
    RETURNING id INTO new_event_id;
    
    INSERT INTO contestants (name, number, department, description, order_index, event_id)
    SELECT name, number, department, description, order_index, new_event_id
    FROM contestants WHERE event_id = p_event_id;
    
    FOR old_group_id, new_group_id IN
        INSERT INTO judge_groups (event_id, name, weight)
        SELECT new_event_id, name, weight
        FROM judge_groups WHERE event_id = p_event_id
        RETURNING (SELECT id FROM judge_groups WHERE event_id = p_event_id AND name = judge_groups.name LIMIT 1), id
    LOOP
        group_mapping := jsonb_set(group_mapping, array[jsonb_array_length(group_mapping)::text], 
            jsonb_build_object('old', old_group_id, 'new', new_group_id));
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

-- 获取最终排名
CREATE OR REPLACE FUNCTION get_final_results()
RETURNS TABLE (
    contestant_id UUID,
    name TEXT,
    number INTEGER,
    department TEXT,
    final_score NUMERIC,
    total_judges BIGINT
) AS $$
DECLARE
    rule TEXT;
    v_event_id UUID;
BEGIN
    SELECT scoring_rule, current_event_id INTO rule, v_event_id FROM system_state WHERE id = 1;
    
    RETURN QUERY
    WITH score_data AS (
        SELECT 
            c.id AS contestant_id,
            c.name,
            c.number,
            c.department,
            s.score,
            s.judge_id,
            jg.weight AS group_weight
        FROM contestants c
        LEFT JOIN scores s ON c.id = s.contestant_id
        LEFT JOIN judges j ON s.judge_id = j.id
        LEFT JOIN judge_groups jg ON j.group_id = jg.id
        WHERE c.event_id = v_event_id OR v_event_id IS NULL
    )
    SELECT 
        sd.contestant_id,
        sd.name,
        sd.number,
        sd.department,
        CASE rule
            WHEN 'average_all' THEN COALESCE(AVG(sd.score), 0)
            WHEN 'average_trimmed' THEN
                CASE 
                    WHEN COUNT(sd.score) <= 2 THEN COALESCE(AVG(sd.score), 0)
                    ELSE (
                        SELECT AVG(score) FROM (
                            SELECT score FROM score_data sd2 
                            WHERE sd2.contestant_id = sd.contestant_id 
                            AND sd2.score IS NOT NULL
                            ORDER BY score
                            OFFSET 1 LIMIT NULLIF(COUNT(*) - 2, 0)
                        ) trimmed
                    )
                END
            WHEN 'median' THEN PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sd.score)
            WHEN 'weighted' THEN
                COALESCE(
                    (SELECT SUM(group_avg * total_weight) / NULLIF(SUM(total_weight), 0)
                     FROM (
                         SELECT 
                             AVG(sd3.score) AS group_avg,
                             SUM(COALESCE(sd3.group_weight, 1.0)) AS total_weight
                         FROM score_data sd3
                         WHERE sd3.contestant_id = sd.contestant_id
                         AND sd3.score IS NOT NULL
                         GROUP BY sd3.group_weight
                     ) group_scores
                    ),
                    0
                )
            ELSE COALESCE(AVG(sd.score), 0)
        END AS final_score,
        COUNT(DISTINCT sd.judge_id) AS total_judges
    FROM score_data sd
    GROUP BY sd.contestant_id, sd.name, sd.number, sd.department, rule
    ORDER BY final_score DESC, sd.number ASC;
END;
$$ LANGUAGE plpgsql;

-- 获取选手评分详情
CREATE OR REPLACE FUNCTION get_contestant_scores(p_contestant_id UUID)
RETURNS TABLE (
    judge_number INTEGER,
    score NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT j.judge_number, s.score
    FROM scores s
    JOIN judges j ON s.judge_id = j.id
    WHERE s.contestant_id = p_contestant_id
    ORDER BY j.judge_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. 启用行级安全策略 (RLS)
-- ============================================

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE contestants ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE judges ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
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

-- ============================================
-- 7. 启用 Realtime
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE admins;
ALTER PUBLICATION supabase_realtime ADD TABLE contestants;
ALTER PUBLICATION supabase_realtime ADD TABLE judge_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE judges;
ALTER PUBLICATION supabase_realtime ADD TABLE scores;
ALTER PUBLICATION supabase_realtime ADD TABLE system_state;

-- ============================================
-- 完成
-- ============================================

SELECT 'V2 初始化完成！' AS message;
