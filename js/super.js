let superAdmin = null;
let admins = [];
let confirmCallback = null;

const SUPER_ADMIN_KEY = 'super_admin_session';

document.addEventListener('DOMContentLoaded', async () => {
    initEventListeners();
    await checkAuth();
});

function initEventListeners() {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('addAdminBtn').addEventListener('click', () => openAdminModal());
    document.getElementById('adminForm').addEventListener('submit', handleAdminSubmit);
    document.getElementById('confirmBtn').addEventListener('click', handleConfirm);
}

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

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
        const { data, error } = await auth.signIn(email, password);
        if (error) throw error;
        
        const user = await auth.getCurrentUser();
        if (!user) throw new Error('获取用户信息失败');
        
        const isAdmin = user.user_metadata?.role === 'super_admin' || 
                        user.user_metadata?.role === 'admin' ||
                        user.email?.toLowerCase().includes('admin') ||
                        user.email?.toLowerCase().includes('super');
        
        if (!isAdmin) {
            await auth.signOut();
            throw new Error('您不是超级管理员，请使用包含 admin 或 super 的邮箱注册');
        }
        
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
    }
}

function handleLogout() {
    auth.signOut();
    localStorage.removeItem(SUPER_ADMIN_KEY);
    superAdmin = null;
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('adminSection').classList.add('hidden');
    showToast('已退出登录', 'success');
}

function showAdminSection() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('adminSection').classList.remove('hidden');
    document.getElementById('superAdminName').textContent = superAdmin?.username || '超级管理员';
}

async function loadData() {
    await Promise.all([
        loadAdmins(),
        loadOverview()
    ]);
}

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
    }
}

function updateAdminList() {
    const container = document.getElementById('adminList');
    
    if (admins.length === 0) {
        container.innerHTML = `
            <div class="empty-state py-4">
                <p class="text-muted">暂无管理员</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = admins.map(admin => {
        const isExpired = admin.expires_at && new Date(admin.expires_at) < new Date();
        const statusClass = !admin.is_active || isExpired ? 'badge-error' : 'badge-success';
        const statusText = !admin.is_active ? '已禁用' : (isExpired ? '已过期' : '正常');
        
        return `
            <div class="flex items-center justify-between p-3 rounded-lg bg-background">
                <div class="flex items-center gap-3">
                    <div class="avatar">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                    </div>
                    <div>
                        <div class="font-medium">${admin.username}</div>
                        <div class="text-muted text-sm">${admin.email}</div>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <div class="text-right hidden md:block">
                        <span class="badge ${statusClass}">${statusText}</span>
                        ${admin.expires_at ? `<div class="text-muted text-sm mt-1">有效期: ${new Date(admin.expires_at).toLocaleString('zh-CN')}</div>` : '<div class="text-muted text-sm mt-1">永久有效</div>'}
                    </div>
                    <div class="flex gap-2">
                        <button class="btn btn-secondary btn-sm" onclick="editAdmin('${admin.id}')" title="编辑">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="btn btn-${admin.is_active ? 'warning' : 'success'} btn-sm" onclick="toggleAdmin('${admin.id}', ${!admin.is_active})" title="${admin.is_active ? '禁用' : '启用'}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                ${admin.is_active 
                                    ? '<circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>'
                                    : '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'
                                }
                            </svg>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteAdmin('${admin.id}')" title="删除">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

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

function openAdminModal(admin = null) {
    const modal = document.getElementById('adminModal');
    const title = document.getElementById('adminModalTitle');
    const passwordHint = document.getElementById('passwordHint');
    
    if (admin) {
        title.textContent = '编辑管理员';
        document.getElementById('adminId').value = admin.id;
        document.getElementById('adminUsername').value = admin.username;
        document.getElementById('adminEmail').value = admin.email;
        document.getElementById('adminPassword').value = '';
        document.getElementById('adminPassword').required = false;
        passwordHint.classList.remove('hidden');
        document.getElementById('adminExpires').value = admin.expires_at ? new Date(admin.expires_at).toISOString().slice(0, 16) : '';
        document.getElementById('adminActive').checked = admin.is_active;
    } else {
        title.textContent = '添加管理员';
        document.getElementById('adminForm').reset();
        document.getElementById('adminId').value = '';
        document.getElementById('adminPassword').required = true;
        passwordHint.classList.add('hidden');
        document.getElementById('adminActive').checked = true;
    }
    
    modal.classList.add('active');
}

function closeAdminModal() {
    document.getElementById('adminModal').classList.remove('active');
}

function editAdmin(id) {
    const admin = admins.find(a => a.id === id);
    if (admin) {
        openAdminModal(admin);
    }
}

async function handleAdminSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('adminId').value;
    const username = document.getElementById('adminUsername').value;
    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPassword').value;
    const expiresAt = document.getElementById('adminExpires').value;
    const isActive = document.getElementById('adminActive').checked;
    
    try {
        const supabase = getSupabase();
        
        if (id) {
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
            if (!password) {
                throw new Error('请输入密码');
            }
            
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

function openConfirmModal(title, message, callback) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    confirmCallback = callback;
    document.getElementById('confirmModal').classList.add('active');
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('active');
    confirmCallback = null;
}

async function handleConfirm() {
    if (confirmCallback) {
        await confirmCallback();
    }
    closeConfirmModal();
}

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

window.editAdmin = editAdmin;
window.toggleAdmin = toggleAdmin;
window.deleteAdmin = deleteAdmin;
window.closeAdminModal = closeAdminModal;
window.closeConfirmModal = closeConfirmModal;
