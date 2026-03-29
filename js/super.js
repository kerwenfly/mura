/**
 * 超级管理员管理脚本
 * 功能：登录验证、管理员账户管理、系统监控
 */

let superAdmin = null;
let admins = [];
let confirmCallback = null;

const SUPER_ADMIN_KEY = 'super_admin_session';

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
    initEventListeners();
    await checkAuth();
});

// 初始化事件监听器
function initEventListeners() {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('addAdminBtn').addEventListener('click', () => openAdminModal());
    document.getElementById('adminForm').addEventListener('submit', handleAdminSubmit);
    document.getElementById('confirmBtn').addEventListener('click', handleConfirm);
    document.getElementById('togglePassword').addEventListener('click', togglePasswordVisibility);
}

// 切换密码可见性
function togglePasswordVisibility() {
    const passwordInput = document.getElementById('password');
    const eyeIcon = document.getElementById('eyeIcon');

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        eyeIcon.innerHTML = `
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
        `;
    } else {
        passwordInput.type = 'password';
        eyeIcon.innerHTML = `
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
        `;
    }
}

// 检查登录状态
async function checkAuth() {
    const stored = localStorage.getItem(SUPER_ADMIN_KEY);
    if (stored) {
        try {
            superAdmin = JSON.parse(stored);
            showAdminSection();
            await loadData();
        } catch {
            localStorage.removeItem(SUPER_ADMIN_KEY);
        }
    }
}

// 处理登录
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('loginBtn');

    try {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span class="loading-spinner"></span> 登录中...';

        // 使用 Supabase Auth 登录
        const { data, error } = await auth.signIn(email, password);
        if (error) throw error;

        const user = await auth.getCurrentUser();
        if (!user) throw new Error('获取用户信息失败');

        // 验证超级管理员权限
        const isSuperAdmin = user.user_metadata?.role === 'super_admin' ||
                            user.user_metadata?.role === 'admin' ||
                            user.email?.toLowerCase().includes('admin') ||
                            user.email?.toLowerCase().includes('super');

        if (!isSuperAdmin) {
            await auth.signOut();
            throw new Error('您不是超级管理员，请使用包含 admin 或 super 的邮箱');
        }

        // 保存会话信息
        superAdmin = {
            id: user.id,
            email: user.email,
            username: user.user_metadata?.username || user.email.split('@')[0]
        };

        localStorage.setItem(SUPER_ADMIN_KEY, JSON.stringify(superAdmin));
        showAdminSection();
        await loadData();
        showToast('登录成功', 'success');
    } catch (error) {
        showToast(error.message || '登录失败', 'error');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = '登录';
    }
}

// 处理退出登录
function handleLogout() {
    auth.signOut();
    localStorage.removeItem(SUPER_ADMIN_KEY);
    superAdmin = null;
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('adminSection').classList.add('hidden');
    showToast('已退出登录', 'success');
}

// 显示管理面板
function showAdminSection() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('adminSection').classList.remove('hidden');
}

// 加载数据
async function loadData() {
    await Promise.all([
        loadAdmins(),
        loadOverview()
    ]);
}

// 加载管理员列表
async function loadAdmins() {
    try {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('admins')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        admins = data || [];
        updateAdminList();
    } catch (error) {
        console.error('加载管理员列表失败:', error);
        document.getElementById('adminList').innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-slate-500 py-8">加载失败</td>
            </tr>
        `;
    }
}

// 更新管理员列表显示
function updateAdminList() {
    const container = document.getElementById('adminList');

    if (admins.length === 0) {
        container.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-slate-500 py-8">暂无管理员账户</td>
            </tr>
        `;
        return;
    }

    container.innerHTML = admins.map(admin => {
        const isExpired = admin.expires_at && new Date(admin.expires_at) < new Date();
        const isActive = admin.is_active && !isExpired;

        let statusClass, statusText, statusIcon;
        if (!admin.is_active) {
            statusClass = 'status-disabled';
            statusText = '已禁用';
            statusIcon = '<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
        } else if (isExpired) {
            statusClass = 'status-expired';
            statusText = '已过期';
            statusIcon = '<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
        } else {
            statusClass = 'status-active';
            statusText = '正常';
            statusIcon = '<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
        }

        return `
            <tr>
                <td class="font-medium text-white">${admin.username}</td>
                <td class="text-slate-400 text-sm">${admin.email || '—'}</td>
                <td>
                    <span class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${statusClass}">
                        ${statusIcon}
                        ${statusText}
                    </span>
                </td>
                <td class="text-slate-400 text-sm">
                    ${admin.expires_at ? new Date(admin.expires_at).toLocaleDateString('zh-CN') : '永久有效'}
                </td>
                <td class="text-slate-500 text-sm">
                    ${new Date(admin.created_at).toLocaleDateString('zh-CN')}
                </td>
                <td>
                    <div class="flex items-center gap-1.5">
                        <button class="action-btn ${isActive ? '' : 'success'}" onclick="toggleAdmin('${admin.id}', ${!admin.is_active})" title="${admin.is_active ? '禁用' : '启用'}">
                            ${admin.is_active
                                ? '<svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
                                : '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
                            }
                        </button>
                        <button class="action-btn" onclick="editAdmin('${admin.id}')" title="编辑">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                        </button>
                        <button class="action-btn danger" onclick="deleteAdmin('${admin.id}')" title="删除">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// 加载概览数据
async function loadOverview() {
    try {
        const supabase = getSupabase();

        const [eventsResult, contestantsResult, judgesResult] = await Promise.all([
            supabase.from('events').select('id, status'),
            supabase.from('contestants').select('id'),
            supabase.from('judges').select('id')
        ]);

        const events = eventsResult.data || [];
        document.getElementById('totalEvents').textContent = events.length;
        document.getElementById('activeEvents').textContent = events.filter(e => e.status === 'active').length;
        document.getElementById('totalContestants').textContent = contestantsResult.data?.length || 0;
        document.getElementById('totalJudges').textContent = judgesResult.data?.length || 0;
    } catch (error) {
        console.error('加载概览数据失败:', error);
    }
}

// 打开管理员模态框
function openAdminModal(admin = null) {
    const modal = document.getElementById('adminModal');
    const title = document.getElementById('adminModalTitle');
    const passwordHint = document.getElementById('passwordHint');
    const passwordInput = document.getElementById('adminPassword');
    const passwordConfirmInput = document.getElementById('adminPasswordConfirm');

    if (admin) {
        title.textContent = '编辑管理员';
        document.getElementById('adminId').value = admin.id;
        document.getElementById('adminUsername').value = admin.username;
        document.getElementById('adminEmail').value = admin.email || '';
        passwordInput.value = '';
        passwordInput.required = false;
        passwordConfirmInput.value = '';
        passwordConfirmInput.required = false;
        passwordHint.classList.remove('hidden');
        document.getElementById('adminExpires').value = admin.expires_at
            ? new Date(admin.expires_at).toISOString().slice(0, 16)
            : '';
        document.getElementById('adminActive').checked = admin.is_active;
    } else {
        title.textContent = '添加管理员';
        document.getElementById('adminForm').reset();
        document.getElementById('adminId').value = '';
        passwordInput.required = true;
        passwordConfirmInput.required = true;
        passwordHint.classList.add('hidden');
        document.getElementById('adminActive').checked = true;
    }

    modal.classList.add('active');
}

// 关闭管理员模态框
function closeAdminModal() {
    document.getElementById('adminModal').classList.remove('active');
}

// 编辑管理员
function editAdmin(id) {
    const admin = admins.find(a => a.id === id);
    if (admin) {
        openAdminModal(admin);
    }
}

// 处理管理员表单提交
async function handleAdminSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('adminId').value;
    const username = document.getElementById('adminUsername').value.trim();
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const passwordConfirm = document.getElementById('adminPasswordConfirm').value;
    const expiresAt = document.getElementById('adminExpires').value;
    const isActive = document.getElementById('adminActive').checked;

    // 验证
    if (!username) {
        showToast('请输入用户名', 'error');
        return;
    }

    if (!email) {
        showToast('请输入邮箱', 'error');
        return;
    }

    // 创建模式需要密码
    if (!id && !password) {
        showToast('请输入密码', 'error');
        return;
    }

    // 密码确认
    if (password && password !== passwordConfirm) {
        showToast('两次输入的密码不一致', 'error');
        return;
    }

    try {
        const supabase = getSupabase();

        if (id) {
            // 更新管理员
            const updates = {
                username,
                email,
                is_active: isActive,
                expires_at: expiresAt ? new Date(expiresAt).toISOString() : null
            };

            if (password) {
                updates.password = password;
            }

            const { error } = await supabase
                .from('admins')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
            showToast('管理员已更新', 'success');
        } else {
            // 创建管理员
            const { error } = await supabase
                .from('admins')
                .insert({
                    username,
                    email,
                    password,
                    is_active: isActive,
                    expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
                    created_by: superAdmin?.id
                });

            if (error) throw error;
            showToast('管理员已添加', 'success');
        }

        closeAdminModal();
        await loadAdmins();
    } catch (error) {
        showToast(error.message || '操作失败', 'error');
    }
}

// 切换管理员状态
async function toggleAdmin(id, newStatus) {
    try {
        const supabase = getSupabase();
        const { error } = await supabase
            .from('admins')
            .update({ is_active: newStatus })
            .eq('id', id);

        if (error) throw error;
        showToast(newStatus ? '管理员已启用' : '管理员已禁用', 'success');
        await loadAdmins();
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

// 删除管理员
function deleteAdmin(id) {
    openConfirmModal('删除管理员', '确定要删除该管理员吗？此操作不可恢复。', async () => {
        try {
            const supabase = getSupabase();
            const { error } = await supabase
                .from('admins')
                .delete()
                .eq('id', id);

            if (error) throw error;
            showToast('管理员已删除', 'success');
            await loadAdmins();
        } catch (error) {
            showToast('删除失败', 'error');
        }
    });
}

// 打开确认模态框
function openConfirmModal(title, message, callback) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    confirmCallback = callback;
    document.getElementById('confirmModal').classList.add('active');
}

// 关闭确认模态框
function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('active');
    confirmCallback = null;
}

// 处理确认操作
async function handleConfirm() {
    if (confirmCallback) {
        await confirmCallback();
    }
    closeConfirmModal();
}

// 显示 Toast 提示
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${type === 'success'
                ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'
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

// 全局函数暴露
window.editAdmin = editAdmin;
window.toggleAdmin = toggleAdmin;
window.deleteAdmin = deleteAdmin;
window.closeAdminModal = closeAdminModal;
window.closeConfirmModal = closeConfirmModal;
