-- 迁移脚本：添加 round_ranking 显示模式
-- 执行此脚本以支持新的"轮次排名"显示模式

-- 删除旧的约束
ALTER TABLE system_state DROP CONSTRAINT IF EXISTS system_state_display_mode_check;

-- 添加新的约束，包含 round_ranking 模式
ALTER TABLE system_state ADD CONSTRAINT system_state_display_mode_check 
    CHECK (display_mode IN ('waiting', 'scoring', 'result', 'round_ranking', 'contestant_final', 'final'));
