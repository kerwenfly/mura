-- 添加评分满分设置字段
-- 在 system_state 表中添加 max_score 字段，用于设置评分的满分分值

DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'system_state' AND column_name = 'max_score') THEN
        NULL;
    ELSE
        ALTER TABLE system_state ADD COLUMN max_score DECIMAL(6,2) DEFAULT 100.00 CHECK (max_score > 0 AND max_score <= 9999.99);
    END IF;
END $$;

-- 更新 scores 表的约束，使其支持动态最大分值
-- 注意：原有的 CHECK 约束 score >= 0 AND score <= 100 需要保留，
-- 因为数据库层面的约束无法引用其他表的值，实际的最大分值限制在应用层实现

SELECT 'max_score 字段添加完成' AS message;
