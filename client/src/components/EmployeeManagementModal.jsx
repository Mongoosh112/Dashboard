import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Key, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  Sparkles, 
  ShieldCheck, 
  MessageSquare, 
  Trash2, 
  Search, 
  X, 
  RefreshCw, 
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  AtSign,
  Lock,
  Mail,
  Share2
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useAuth } from '../context/AuthContext';
import { AVATAR_PRESETS, generateRandomCartoonAvatars, formatRelativeTime, generateSecurePassword } from '../utils/helpers';
import { soundManager } from '../utils/sound';

const POPULAR_ROLES = [
  'UI/UX Reviewer',
  'Frontend Developer',
  'QA Specialist',
  'Product Designer',
  'Fullstack Engineer',
  'Content Evaluator',
  'Product Manager'
];

export default function EmployeeManagementModal({ 
  isOpen, 
  onClose, 
  onOpenChatWithUser, 
  initialTab = 'create' 
}) {
  const { token, user } = useAuth();

  // Tabs: 'create' | 'directory' | 'credentials'
  const [activeTab, setActiveTab] = useState(initialTab);
  
  // Create Form State
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(true);
  const [role, setRole] = useState(POPULAR_ROLES[0]);
  const [customRole, setCustomRole] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_PRESETS[0]);
  const [avatarOptions, setAvatarOptions] = useState(AVATAR_PRESETS);

  const handleRandomizeAvatars = () => {
    const newBatch = generateRandomCartoonAvatars(8);
    setAvatarOptions(newBatch);
    setSelectedAvatar(newBatch[0]);
  };
  
  // Status states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Close modal on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  
  // Created / Active Credentials Card
  const [activeCredentials, setActiveCredentials] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  
  // Directory State
  const [employees, setEmployees] = useState([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Reset Password Sub-Modal / State
  const [resettingEmployee, setResettingEmployee] = useState(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // Directory Password Controls (Admin only)
  const [showAllPasswords, setShowAllPasswords] = useState(false);
  const [revealedPasswordIds, setRevealedPasswordIds] = useState(new Set());
  const [copiedPasswordId, setCopiedPasswordId] = useState(null);

  const togglePasswordReveal = (id) => {
    setRevealedPasswordIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCopyPassword = (empId, pass) => {
    if (!pass) return;
    navigator.clipboard.writeText(pass);
    setCopiedPasswordId(empId);
    soundManager.playMessageSent();
    setTimeout(() => setCopiedPasswordId(null), 2200);
  };

  // Sync tab with initialTab prop
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setError('');
      if (!password) {
        setPassword(generateSecurePassword());
      }
    }
  }, [isOpen, initialTab]);

  // Fetch employees list
  const fetchEmployees = async () => {
    if (!token) return;
    setDirectoryLoading(true);
    try {
      const res = await fetch('/api/admin/employees', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees || []);
      }
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    } finally {
      setDirectoryLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && token) {
      fetchEmployees();
    }
  }, [isOpen, activeTab, token]);

  if (!isOpen) return null;

  const handleGeneratePassword = () => {
    const newPass = generateSecurePassword();
    setPassword(newPass);
    soundManager.playMessageSent();
  };

  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const effectiveRole = role === 'Custom...' ? (customRole.trim() || 'Employee') : role;
    const cleanUsername = username.trim().toLowerCase().replace(/^@/, '');

    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: cleanUsername,
          displayName: displayName.trim() || cleanUsername,
          password: password.trim(),
          role: effectiveRole,
          email: email.trim(),
          bio: bio.trim(),
          avatar: selectedAvatar
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create employee');
      }

      // Success!
      soundManager.playMessageReceived();
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });

      const webAppUrl = window.location.origin;

      // Reset create form so switching back doesn't re-submit the same employee
      setUsername('');
      setDisplayName('');
      setPassword(generateSecurePassword());
      setEmail('');
      setBio('');

      setActiveCredentials({
        employee: data.employee,
        username: data.credentials.username,
        password: data.credentials.password,
        loginUrl: webAppUrl,
        isNew: true
      });
      setActiveTab('credentials');
      fetchEmployees();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Copy helper
  const handleCopy = (text, fieldKey) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(fieldKey);
      soundManager.playMessageSent();
      setTimeout(() => setCopiedField(null), 2500);
    }
  };

  // Copy complete formatted invite message
  const handleCopyFullMessage = () => {
    if (!activeCredentials) return;
    const { employee, username, password, loginUrl } = activeCredentials;
    const msg = 
`👋 Welcome to QuantumPropAI, ${employee?.displayName || username}!

Here are your credentials to access your employee workspace:

🌐 Login URL: ${loginUrl || window.location.origin}
👤 Username: ${username}
🔑 Password: ${password}
💼 Role: ${employee?.role || 'Employee Reviewer'}

Once logged in, you can chat directly with Administrator and evaluate design questionnaires in the Employee Review Dashboard.`;

    handleCopy(msg, 'full_message');
  };

  // Handle password reset for existing employee
  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!resettingEmployee || !resetPasswordVal) return;
    setResetLoading(true);

    try {
      const res = await fetch(`/api/admin/employees/${resettingEmployee.id}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: resetPasswordVal.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password');
      }

      soundManager.playMessageReceived();
      setActiveCredentials({
        employee: data.employee,
        username: data.credentials.username,
        password: data.credentials.password,
        loginUrl: window.location.origin,
        isNew: false
      });
      setResettingEmployee(null);
      setResetPasswordVal('');
      setActiveTab('credentials');
      fetchEmployees();
    } catch (err) {
      alert(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  // Handle employee delete
  const handleDeleteEmployee = async (emp) => {
    if (!window.confirm(`Are you sure you want to delete employee "${emp.displayName}" (@${emp.username})? This cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/employees/${emp.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        soundManager.playMessageSent();
        setEmployees(prev => prev.filter(e => e.id !== emp.id));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete employee');
      }
    } catch (err) {
      console.error('Failed to delete employee:', err);
    }
  };

  // Filtered employees in directory
  const filteredEmployees = employees.filter(e => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (e.displayName || '').toLowerCase().includes(q) ||
      (e.username || '').toLowerCase().includes(q) ||
      (e.role || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="modal-overlay" style={{ zIndex: 400 }}>
      <div 
        className="modal-dialog employee-modal-dialog" 
        style={{ maxWidth: activeTab === 'credentials' ? 560 : activeTab === 'directory' ? 820 : 660, width: '94%' }}
      >
        {/* Modal Header */}
        <div className="modal-header" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(245, 158, 11, 0.35)',
              flexShrink: 0
            }}>
              <Users size={22} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 className="modal-title" style={{ fontSize: '1.25rem' }}>
                  Team & Employee Hub
                </h3>
                <span className="admin-pill-tag">ADMIN ONLY</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Create employees, set credentials, and share connection details
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Top Navigation Tabs */}
        <div className="auth-switch-tabs" style={{ marginBottom: 20 }}>
          <button
            type="button"
            className={`auth-tab-btn ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => { setActiveTab('create'); setError(''); }}
          >
            <UserPlus size={15} style={{ marginRight: 6, display: 'inline' }} />
            Create Employee
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${activeTab === 'directory' ? 'active' : ''}`}
            onClick={() => { setActiveTab('directory'); setError(''); }}
          >
            <Users size={15} style={{ marginRight: 6, display: 'inline' }} />
            Team Directory ({employees.length})
          </button>
          {activeCredentials && (
            <button
              type="button"
              className={`auth-tab-btn ${activeTab === 'credentials' ? 'active' : ''}`}
              onClick={() => setActiveTab('credentials')}
            >
              <Share2 size={15} style={{ marginRight: 6, display: 'inline' }} />
              Credentials Card
            </button>
          )}
        </div>

        {/* TAB 1: CREATE EMPLOYEE */}
        {activeTab === 'create' && (
          <form onSubmit={handleCreateEmployee} className="employee-create-form">
            {error && (
              <div className="form-error" style={{ marginBottom: 14 }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* Username Field */}
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AtSign size={13} color="var(--accent-cyan)" />
                  Username <span style={{ color: 'var(--accent-rose)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-dim)',
                    fontWeight: 700,
                    fontSize: '0.88rem'
                  }}>@</span>
                  <input
                    type="text"
                    className="form-input"
                    style={{ paddingLeft: 30 }}
                    placeholder="e.g. john_doe"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                    required
                  />
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 3, display: 'block' }}>
                  Employee will use this to sign in
                </span>
              </div>

              {/* Display / Full Name */}
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">
                  Full Name / Display Name <span style={{ color: 'var(--accent-rose)' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. John Doe"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 3, display: 'block' }}>
                  Visible to Admin and in evaluations
                </span>
              </div>
            </div>

            {/* Password Field with Generator */}
            <div className="form-group" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Lock size={13} color="#fbbf24" />
                  Password <span style={{ color: 'var(--accent-rose)' }}>*</span>
                </label>
                <button
                  type="button"
                  className="generator-action-btn"
                  onClick={handleGeneratePassword}
                  title="Generate a complicated 12-character password (numbers, uppercase, lowercase, special characters)"
                >
                  <RefreshCw size={12} />
                  🎲 Generate Random Password
                </button>
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Enter employee password..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingRight: 40, fontFamily: showPassword ? 'inherit' : 'monospace', letterSpacing: showPassword ? 'normal' : '2px' }}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Hide Password' : 'Show Password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: '0.72rem', color: '#fbbf24' }}>
                  🔑 You can copy & share this password immediately after creation
                </span>
              </div>
            </div>

            {/* Role / Department Selection */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Briefcase size={13} color="var(--accent-emerald)" />
                  Role / Department
                </label>
                <select
                  className="form-input"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  {POPULAR_ROLES.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                  <option value="Custom...">Custom Role...</option>
                </select>
              </div>

              {role === 'Custom...' ? (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Custom Role Title</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Lead QA Engineer"
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value)}
                    required
                  />
                </div>
              ) : (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Mail size={13} color="var(--text-dim)" />
                    Work Email (Optional)
                  </label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="e.g. employee@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Cartoon / Drawing Avatar Selector */}
            <div className="form-group" style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label className="form-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={13} color="#fbbf24" />
                  Choose Cartoon / Drawing Avatar
                </label>
                <button
                  type="button"
                  className="generator-action-btn"
                  onClick={handleRandomizeAvatars}
                  title="Generate a new set of random cartoon drawings"
                >
                  <RefreshCw size={12} />
                  🎲 Randomize Cartoons
                </button>
              </div>
              <div className="avatar-preset-grid" style={{ gridTemplateColumns: 'repeat(8, 1fr)', gap: 8 }}>
                {avatarOptions.map((preset, idx) => (
                  <img
                    key={idx}
                    src={preset}
                    alt={`Cartoon Avatar ${idx + 1}`}
                    className={`avatar-preset-item ${selectedAvatar === preset ? 'selected' : ''}`}
                    onClick={() => setSelectedAvatar(preset)}
                    style={{ width: 44, height: 44, objectFit: 'contain' }}
                  />
                ))}
              </div>
            </div>

            {/* Submit Action */}
            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ flex: 1 }}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary btn-amber"
                style={{ flex: 2 }}
                disabled={loading}
              >
                {loading ? 'Creating Employee...' : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                    <Sparkles size={17} /> Create Employee & Get Credentials
                  </span>
                )}
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: SHAREABLE CREDENTIALS CARD */}
        {activeTab === 'credentials' && activeCredentials && (
          <div className="credentials-card-container">
            <div className="credentials-success-badge">
              <CheckCircle2 size={24} color="#10b981" />
              <div>
                <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#10b981', margin: 0 }}>
                  {activeCredentials.isNew ? '🎉 Employee Account Created!' : '🔑 Credentials Updated!'}
                </h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                  Share the details below with the employee so they can connect right away:
                </p>
              </div>
            </div>

            {/* Employee Preview Header */}
            <div className="credential-employee-header">
              <img 
                src={activeCredentials.employee?.avatar} 
                alt={activeCredentials.employee?.displayName}
                className="credential-avatar"
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>
                  {activeCredentials.employee?.displayName}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  @{activeCredentials.username} • <span className="employee-role-pill">{activeCredentials.employee?.role || 'Employee'}</span>
                </div>
              </div>
            </div>

            {/* Interactive Copy Rows */}
            <div className="credential-fields-group">
              {/* Web App Link */}
              <div className="credential-field-row">
                <div className="credential-field-info">
                  <span className="field-tag">WEB APP URL</span>
                  <span className="field-value link-style">
                    {activeCredentials.loginUrl || window.location.origin}
                  </span>
                </div>
                <button
                  type="button"
                  className="copy-badge-btn"
                  onClick={() => handleCopy(activeCredentials.loginUrl || window.location.origin, 'url')}
                >
                  {copiedField === 'url' ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  {copiedField === 'url' ? 'Copied!' : 'Copy URL'}
                </button>
              </div>

              {/* Username */}
              <div className="credential-field-row">
                <div className="credential-field-info">
                  <span className="field-tag">USERNAME</span>
                  <span className="field-value highlight">
                    @{activeCredentials.username}
                  </span>
                </div>
                <button
                  type="button"
                  className="copy-badge-btn"
                  onClick={() => handleCopy(activeCredentials.username, 'username')}
                >
                  {copiedField === 'username' ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  {copiedField === 'username' ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {/* Password */}
              <div className="credential-field-row">
                <div className="credential-field-info">
                  <span className="field-tag">PASSWORD</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="field-value password-font">
                      {showPassword ? activeCredentials.password : '••••••••••••'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="eye-inline-btn"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className="copy-badge-btn primary"
                  onClick={() => handleCopy(activeCredentials.password, 'password')}
                >
                  {copiedField === 'password' ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  {copiedField === 'password' ? 'Copied!' : 'Copy Password'}
                </button>
              </div>
            </div>

            {/* Big 1-Click Copy Full Message */}
            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                className="copy-all-message-btn"
                onClick={handleCopyFullMessage}
              >
                {copiedField === 'full_message' ? (
                  <>
                    <Check size={18} color="#ffffff" />
                    <span>Copied Complete Welcome Message to Clipboard! 🚀</span>
                  </>
                ) : (
                  <>
                    <Share2 size={18} />
                    <span>📋 Copy Ready-to-Send Welcome Message (Slack / Email / WhatsApp)</span>
                  </>
                )}
              </button>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ flex: 1 }}
                onClick={() => {
                  setActiveTab('create');
                  setUsername('');
                  setDisplayName('');
                  setPassword(generateSecurePassword());
                  setError('');
                }}
              >
                <UserPlus size={15} /> Add Another Employee
              </button>

              <button
                type="button"
                className="btn-primary"
                style={{ flex: 1 }}
                onClick={() => {
                  onClose();
                  if (onOpenChatWithUser && activeCredentials.employee) {
                    onOpenChatWithUser(activeCredentials.employee);
                  }
                }}
              >
                <MessageSquare size={16} /> Open Chat with Employee
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: TEAM DIRECTORY */}
        {activeTab === 'directory' && (
          <div className="employee-directory-container">
            {/* Search & Master Password Toggle */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={16} className="search-icon-inside" />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search team members by name, username, or role..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="roster-toggle-all-pass-btn"
                onClick={() => setShowAllPasswords(!showAllPasswords)}
                title={showAllPasswords ? 'Mask all passwords' : 'Admin: Show all employee passwords'}
              >
                {showAllPasswords ? <EyeOff size={14} /> : <Eye size={14} />}
                <span>{showAllPasswords ? 'Mask Passwords' : 'Show All Passwords'}</span>
              </button>
            </div>

            {/* List */}
            <div style={{ maxHeight: 440, overflowY: 'auto', paddingRight: 4 }}>
              {directoryLoading ? (
                <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
                  <div className="circular-loader-ring sm" style={{ margin: '0 auto 10px auto' }} />
                  <div style={{ fontSize: '0.86rem', color: '#f1f5f9', fontWeight: 600 }}>Loading...</div>
                </div>
              ) : filteredEmployees.length === 0 ? (
                <div className="empty-list" style={{ padding: '30px 0', textAlign: 'center' }}>
                  <p>No employees found. Click "Create Employee" to add team members!</p>
                </div>
              ) : (
                filteredEmployees.map((emp) => (
                  <div key={emp.id} className="employee-roster-card">
                    {/* Left: Avatar & Identity */}
                    <div className="roster-user-info">
                      <div className="avatar-wrapper" style={{ width: 44, height: 44, flexShrink: 0 }}>
                        <img src={emp.avatar} alt={emp.displayName} className="avatar-img" />
                        <span className={`status-dot ${emp.isOnline ? 'online' : 'offline'}`} />
                      </div>
                      <div className="roster-names-col">
                        <div className="roster-names-row">
                          <span className="roster-display-name">
                            {emp.displayName}
                          </span>
                          <span className="employee-role-pill">{emp.role || 'Employee'}</span>
                        </div>
                        <div className="roster-meta-row">
                          <span className="roster-handle">@{emp.username}</span>
                          <span className="roster-dot">•</span>
                          <span>Joined {formatRelativeTime(emp.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Password Pill & Action Buttons */}
                    <div className="roster-right-section">
                      {/* Password Pill */}
                      <div className="roster-password-pill">
                        <Lock size={12} color="#fbbf24" style={{ flexShrink: 0 }} />
                        <span className="roster-password-label">Pass:</span>
                        <span className={`roster-password-text ${(showAllPasswords || revealedPasswordIds.has(emp.id)) ? 'revealed' : 'masked'}`}>
                          {(showAllPasswords || revealedPasswordIds.has(emp.id)) ? (emp.password || 'Not set') : '••••••••'}
                        </span>
                        <button
                          type="button"
                          className="roster-pass-icon-btn"
                          onClick={() => togglePasswordReveal(emp.id)}
                          title={(showAllPasswords || revealedPasswordIds.has(emp.id)) ? 'Hide password' : 'Show password'}
                        >
                          {(showAllPasswords || revealedPasswordIds.has(emp.id)) ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        <button
                          type="button"
                          className={`roster-pass-copy-btn ${copiedPasswordId === emp.id ? 'copied' : ''}`}
                          onClick={() => handleCopyPassword(emp.id, emp.password)}
                          disabled={!emp.password}
                          title="Copy password to clipboard"
                        >
                          {copiedPasswordId === emp.id ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                          <span>{copiedPasswordId === emp.id ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>

                      {/* Action Buttons */}
                      <div className="employee-roster-actions">
                        <button
                          type="button"
                          className="roster-btn chat"
                          title="Chat with employee"
                          onClick={() => {
                            onClose();
                            if (onOpenChatWithUser) onOpenChatWithUser(emp);
                          }}
                        >
                          <MessageSquare size={14} />
                          <span>Chat</span>
                        </button>

                        <button
                          type="button"
                          className="roster-btn key"
                          title="Reset password & share credentials"
                          onClick={() => {
                            setResettingEmployee(emp);
                            setResetPasswordVal(generateSecurePassword());
                          }}
                        >
                          <Key size={13} />
                          <span>Reset Pass</span>
                        </button>

                        <button
                          type="button"
                          className="roster-btn delete"
                          title="Delete employee account"
                          onClick={() => handleDeleteEmployee(emp)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Reset Password Modal Overlay */}
        {resettingEmployee && (
          <div className="modal-overlay" style={{ zIndex: 450 }}>
            <div className="modal-dialog" style={{ maxWidth: 440 }}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 38,
                    height: 38,
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Key size={18} color="#fff" />
                  </div>
                  <div>
                    <h3 className="modal-title" style={{ fontSize: '1.15rem' }}>Reset Employee Password</h3>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      For @{resettingEmployee.username} ({resettingEmployee.displayName})
                    </p>
                  </div>
                </div>
                <button className="modal-close-btn" onClick={() => setResettingEmployee(null)}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleResetPasswordSubmit}>
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className="form-label" style={{ margin: 0 }}>New Password</label>
                    <button
                      type="button"
                      className="generator-action-btn"
                      onClick={() => setResetPasswordVal(generateSecurePassword())}
                      title="Generate a complicated 12-character password (numbers, uppercase, lowercase, special characters)"
                    >
                      <RefreshCw size={12} /> Generate
                    </button>
                  </div>
                  <input
                    type="text"
                    className="form-input"
                    value={resetPasswordVal}
                    onChange={(e) => setResetPasswordVal(e.target.value)}
                    required
                    autoFocus
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 4, display: 'block' }}>
                    You will receive a shareable credentials card immediately upon updating.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => setResettingEmployee(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary btn-amber"
                    style={{ flex: 1.2 }}
                    disabled={resetLoading}
                  >
                    {resetLoading ? 'Updating...' : 'Save & Share'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
