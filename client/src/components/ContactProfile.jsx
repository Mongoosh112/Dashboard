import React, { useState, useEffect } from 'react';
import { 
  X, Calendar, Shield, Sparkles, MessageSquare, Camera, RefreshCw, 
  Check, CheckCircle2, Lock, Eye, EyeOff, Copy, Edit3, User, Mail, AlertCircle, AtSign, Key 
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { AVATAR_PRESETS, generateRandomCartoonAvatars, generateSecurePassword } from '../utils/helpers';
import { soundManager } from '../utils/sound';

export default function ContactProfile({ contact, isOpen, onClose, onOpenOnboardingGuide }) {
  const { user, updateProfile, token } = useAuth();
  const { isUserOnline } = useSocket();

  const [displayContact, setDisplayContact] = useState(contact);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [avatarOptions, setAvatarOptions] = useState(AVATAR_PRESETS);
  const [selectedAvatar, setSelectedAvatar] = useState(contact?.avatar || AVATAR_PRESETS[0]);
  const [customSeed, setCustomSeed] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [isPasswordRevealed, setIsPasswordRevealed] = useState(false);
  const [isCopiedPassword, setIsCopiedPassword] = useState(false);
  const [isCopiedUsername, setIsCopiedUsername] = useState(false);

  // Admin Password Reset State
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [newPasswordVal, setNewPasswordVal] = useState('');
  const [passwordResetSaving, setPasswordResetSaving] = useState(false);
  const [passwordResetError, setPasswordResetError] = useState('');

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState(contact?.displayName || '');
  const [editEmail, setEditEmail] = useState(contact?.email || '');
  const [editBio, setEditBio] = useState(contact?.bio || '');
  const [editCreatedAt, setEditCreatedAt] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Keep state updated when contact changes
  useEffect(() => {
    if (contact) {
      setDisplayContact(contact);
      setSelectedAvatar(contact.avatar || AVATAR_PRESETS[0]);
      setIsPickerOpen(false);
      setSuccessMsg('');
      setIsPasswordRevealed(false);
      setIsCopiedPassword(false);
      setIsCopiedUsername(false);

      setEditDisplayName(contact.displayName || '');
      setEditEmail(contact.email || '');
      setEditBio(contact.bio || '');

      if (contact.createdAt) {
        try {
          const d = new Date(contact.createdAt);
          if (!isNaN(d.getTime())) {
            setEditCreatedAt(d.toISOString().split('T')[0]);
          } else {
            setEditCreatedAt('');
          }
        } catch {
          setEditCreatedAt('');
        }
      } else {
        setEditCreatedAt('');
      }

      setIsEditingProfile(false);
      setProfileError('');
    }
  }, [contact?.id, contact?.avatar, contact?.displayName, contact?.email, contact?.createdAt, contact?.bio]);

  if (!isOpen || !contact) return null;

  const activeContact = (displayContact && displayContact.id === contact.id) ? displayContact : contact;
  const isSelf = user?.id === activeContact?.id;
  const canEdit = isSelf || !!user?.isAdmin;
  const online = isUserOnline(activeContact?.id);
  const currentAvatar = isSelf ? (user?.avatar || activeContact?.avatar) : activeContact?.avatar;

  const handleCopyUsername = () => {
    const un = activeContact?.username || contact?.username || '';
    if (!un) return;
    navigator.clipboard.writeText(un);
    setIsCopiedUsername(true);
    soundManager.playMessageSent();
    setTimeout(() => setIsCopiedUsername(false), 2000);
  };

  const handleCopyPassword = () => {
    const p = activeContact?.password || contact?.password || '';
    if (!p) {
      setSuccessMsg('No password recorded yet. Click Reset to assign one.');
      setTimeout(() => setSuccessMsg(''), 3000);
      return;
    }
    navigator.clipboard.writeText(p);
    setIsCopiedPassword(true);
    soundManager.playMessageSent();
    setTimeout(() => setIsCopiedPassword(false), 2000);
  };

  const handleStartPasswordReset = () => {
    setNewPasswordVal(generateSecurePassword());
    setIsResettingPassword(true);
    setPasswordResetError('');
  };

  const handleSaveNewPassword = async () => {
    if (!newPasswordVal || newPasswordVal.trim().length < 4) {
      setPasswordResetError('Password must be at least 4 characters');
      return;
    }
    setPasswordResetSaving(true);
    setPasswordResetError('');
    try {
      const res = await fetch(`/api/admin/employees/${activeContact.id}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: newPasswordVal.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password');
      }

      setDisplayContact(prev => ({
        ...(prev || activeContact),
        password: newPasswordVal.trim()
      }));
      if (contact) {
        contact.password = newPasswordVal.trim();
      }

      setIsPasswordRevealed(true);
      setIsResettingPassword(false);
      soundManager.playMessageReceived();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 }
      });
      setSuccessMsg('Password updated & synchronized! ✨');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setPasswordResetError(err.message || 'Failed to update password');
    } finally {
      setPasswordResetSaving(false);
    }
  };

  const handleRandomizeAvatars = () => {
    const newSet = generateRandomCartoonAvatars(8);
    setAvatarOptions(newSet);
    setSelectedAvatar(newSet[0]);
    soundManager.playMessageSent();
  };

  const handleGenerateFromSeed = () => {
    if (customSeed.trim()) {
      const styles = ['bottts', 'adventurer', 'avataaars', 'fun-emoji', 'lorelei', 'notionists', 'croodles', 'thumbs'];
      const bgColors = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'];
      const s = styles[Math.floor(Math.random() * styles.length)];
      const b = bgColors[Math.floor(Math.random() * bgColors.length)];
      const url = `https://api.dicebear.com/7.x/${s}/svg?seed=${encodeURIComponent(customSeed.trim())}&backgroundColor=${b}`;
      setAvatarOptions(prev => [url, ...prev.slice(0, 7)]);
      setSelectedAvatar(url);
      soundManager.playMessageSent();
    }
  };

  const handleSaveAvatar = async () => {
    if (!selectedAvatar || saving || !activeContact) return;
    setSaving(true);
    try {
      const updated = await updateProfile({ userId: activeContact.id, avatar: selectedAvatar });
      if (contact) contact.avatar = selectedAvatar;
      setDisplayContact(prev => ({ ...(prev || activeContact), avatar: selectedAvatar }));
      soundManager.playMessageReceived();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 }
      });
      setSuccessMsg('Profile picture updated! 🎉');
      setIsPickerOpen(false);
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) {
      alert(err.message || 'Failed to update avatar');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault();
    if (profileSaving || !activeContact) return;

    if (!editDisplayName.trim()) {
      setProfileError('Display Name cannot be empty');
      return;
    }
    if (!editEmail.trim()) {
      setProfileError('Email address cannot be empty');
      return;
    }

    setProfileSaving(true);
    setProfileError('');
    try {
      let isoCreatedAt = undefined;
      if (editCreatedAt.trim()) {
        const parsed = new Date(editCreatedAt.trim() + 'T00:00:00.000Z');
        if (!isNaN(parsed.getTime())) {
          isoCreatedAt = parsed.toISOString();
        }
      }

      const updates = {
        userId: activeContact.id,
        displayName: editDisplayName.trim(),
        email: editEmail.trim(),
        bio: editBio.trim(),
        createdAt: isoCreatedAt
      };

      const updatedUser = await updateProfile(updates);

      setDisplayContact(prev => ({
        ...(prev || activeContact),
        ...updatedUser,
        displayName: updatedUser.displayName,
        email: updatedUser.email,
        bio: updatedUser.bio,
        createdAt: updatedUser.createdAt
      }));

      if (contact) {
        contact.displayName = updatedUser.displayName;
        contact.email = updatedUser.email;
        contact.bio = updatedUser.bio;
        contact.createdAt = updatedUser.createdAt;
      }

      soundManager.playMessageReceived();
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 }
      });
      setSuccessMsg('Profile details updated successfully! ✨');
      setIsEditingProfile(false);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setProfileError(err.message || 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditDisplayName(activeContact?.displayName || '');
    setEditEmail(activeContact?.email || '');
    setEditBio(activeContact?.bio || '');
    if (activeContact?.createdAt) {
      try {
        const d = new Date(activeContact.createdAt);
        setEditCreatedAt(isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0]);
      } catch {
        setEditCreatedAt('');
      }
    } else {
      setEditCreatedAt('');
    }
    setProfileError('');
    setIsEditingProfile(false);
  };

  return (
    <div className="contact-drawer-backdrop">
      <div className="contact-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="contact-drawer-header">
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
            {isSelf ? 'My Profile' : 'Profile Information'}
          </span>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="contact-drawer-body">
          {/* Avatar with status and edit button */}
          <div className="contact-drawer-avatar-wrapper">
            <img
              src={currentAvatar}
              alt={activeContact?.displayName || contact?.displayName || 'User'}
              className="contact-drawer-avatar"
            />
            <span 
              className={`status-dot ${online ? 'online' : 'offline'}`}
              style={{ width: 16, height: 16, right: 4, bottom: 4 }}
            />
            {isSelf && (
              <button
                type="button"
                className="avatar-edit-badge-btn"
                onClick={() => setIsPickerOpen(!isPickerOpen)}
                title="Change your profile picture"
              >
                <Camera size={14} />
              </button>
            )}
          </div>

          {/* Quick trigger button for self */}
          {isSelf && (
            <button
              type="button"
              className="btn-change-avatar-trigger"
              onClick={() => setIsPickerOpen(!isPickerOpen)}
            >
              <Camera size={13} />
              <span>{isPickerOpen ? 'Hide Avatar Picker' : 'Change Profile Picture'}</span>
            </button>
          )}

          {/* Success message toast */}
          {successMsg && (
            <div className="profile-update-toast">
              <CheckCircle2 size={15} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Interactive Avatar Picker Card */}
          {isSelf && isPickerOpen && (
            <div className="drawer-avatar-picker-card">
              <div className="drawer-avatar-picker-header">
                <span className="drawer-picker-title">Pick Cartoon Avatar</span>
                <button
                  type="button"
                  className="generator-action-btn"
                  onClick={handleRandomizeAvatars}
                  title="Roll 8 new random cartoon drawings"
                >
                  <RefreshCw size={12} />
                  🎲 Randomize
                </button>
              </div>

              {/* 8 Preset Grid */}
              <div className="drawer-avatar-grid">
                {avatarOptions.map((preset, idx) => (
                  <img
                    key={idx}
                    src={preset}
                    alt={`Cartoon Avatar ${idx + 1}`}
                    className={`drawer-avatar-option ${selectedAvatar === preset ? 'selected' : ''}`}
                    onClick={() => setSelectedAvatar(preset)}
                  />
                ))}
              </div>

              {/* Custom seed input */}
              <div className="drawer-avatar-custom-row">
                <input
                  type="text"
                  className="form-input"
                  placeholder="Type nickname for custom cartoon..."
                  value={customSeed}
                  onChange={(e) => setCustomSeed(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleGenerateFromSeed(); }}
                  style={{ fontSize: '0.74rem', padding: '6px 8px' }}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleGenerateFromSeed}
                  style={{ padding: '6px 10px', fontSize: '0.72rem', whiteSpace: 'nowrap' }}
                >
                  Generate
                </button>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ flex: 1, padding: '7px 10px', fontSize: '0.78rem' }}
                  onClick={() => {
                    setSelectedAvatar(currentAvatar);
                    setIsPickerOpen(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary btn-emerald"
                  style={{
                    flex: 1.5,
                    padding: '8px 14px',
                    fontSize: '0.8rem'
                  }}
                  onClick={handleSaveAvatar}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                      <Check size={14} /> Save Picture
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}

          {!isEditingProfile ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}>
                <h3 className="contact-drawer-name" style={{ margin: 0 }}>
                  {activeContact?.displayName || contact?.displayName || 'User Profile'}
                </h3>
                {canEdit && (
                  <button
                    type="button"
                    className="btn-edit-profile-icon"
                    onClick={() => {
                      setIsEditingProfile(true);
                      setIsPickerOpen(false);
                    }}
                    title="Edit Name, Email, Member Since & Bio"
                  >
                    <Edit3 size={14} />
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4, marginBottom: 2 }}>
                <span className="contact-drawer-handle" style={{ margin: 0 }}>
                  @{activeContact?.username || contact?.username || 'user'}
                </span>
                <button
                  type="button"
                  onClick={handleCopyUsername}
                  style={{
                    background: isCopiedUsername ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                    border: isCopiedUsername ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.16)',
                    borderRadius: 6,
                    color: isCopiedUsername ? '#10b981' : 'var(--text-muted)',
                    padding: '2px 7px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    transition: 'all 0.15s ease'
                  }}
                  title="Copy Username"
                >
                  {isCopiedUsername ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                  <span>{isCopiedUsername ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="contact-drawer-bio">
                {activeContact?.bio || contact?.bio || 'Hey there! I am using QuantumPropAI 💬'}
              </div>

              {canEdit && (
                <button
                  type="button"
                  className="btn-edit-profile-action"
                  onClick={() => {
                    setIsEditingProfile(true);
                    setIsPickerOpen(false);
                  }}
                >
                  <Edit3 size={13} />
                  <span>Edit Name, Email & Info</span>
                </button>
              )}

              <div className="drawer-details-list">
                {/* Username Row with Copy Button */}
                <div className="drawer-detail-row">
                  <span className="drawer-detail-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <AtSign size={13} color="var(--text-muted)" /> Username
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="drawer-detail-val" style={{ color: '#e2e8f0', fontWeight: 600 }}>
                      @{activeContact?.username || contact?.username || 'user'}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyUsername}
                      style={{
                        background: isCopiedUsername ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                        border: isCopiedUsername ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.16)',
                        borderRadius: 6,
                        color: isCopiedUsername ? '#10b981' : 'var(--text-muted)',
                        padding: '2px 7px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        transition: 'all 0.15s ease'
                      }}
                      title="Copy Username"
                    >
                      {isCopiedUsername ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                      <span>{isCopiedUsername ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="drawer-detail-row">
                  <span className="drawer-detail-label">Email</span>
                  <span className="drawer-detail-val" style={{ color: '#c7d2fe', wordBreak: 'break-all' }}>
                    {activeContact?.email || contact?.email || `${activeContact?.username || contact?.username}@QuantumPropAI.io`}
                  </span>
                </div>

                <div className="drawer-detail-row">
                  <span className="drawer-detail-label">Status</span>
                  <span className="drawer-detail-val" style={{ color: online ? 'var(--accent-emerald)' : 'var(--text-dim)' }}>
                    {online ? 'Active now' : 'Offline'}
                  </span>
                </div>

                <div className="drawer-detail-row">
                  <span className="drawer-detail-label">Role</span>
                  <span className="drawer-detail-val" style={{ color: (activeContact?.isAdmin ?? contact?.isAdmin) ? '#fbbf24' : 'var(--accent-cyan)' }}>
                    {(activeContact?.isAdmin ?? contact?.isAdmin) ? 'Administrator' : (activeContact?.role || contact?.role || 'Team Member')}
                  </span>
                </div>

                <div className="drawer-detail-row">
                  <span className="drawer-detail-label">Member Since</span>
                  <span className="drawer-detail-val">
                    {(activeContact?.createdAt || contact?.createdAt) ? new Date(activeContact?.createdAt || contact?.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    }) : 'Recent'}
                  </span>
                </div>

                {/* Admin Password View & Reset Card */}
                {user?.isAdmin && !isSelf && (
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.05) 100%)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    marginTop: 6,
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fbbf24', fontWeight: 700, fontSize: '0.8rem' }}>
                        <Lock size={13} color="#fbbf24" /> Employee Password
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {!isResettingPassword && (
                          <>
                            <button
                              type="button"
                              onClick={() => setIsPasswordRevealed(!isPasswordRevealed)}
                              style={{
                                background: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: 6,
                                color: '#fbbf24',
                                padding: '3px 8px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                transition: 'all 0.15s ease'
                              }}
                              title={isPasswordRevealed ? 'Hide Password' : 'Show Password'}
                            >
                              {isPasswordRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                              <span>{isPasswordRevealed ? 'Hide' : 'Reveal'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleCopyPassword}
                              style={{
                                background: isCopiedPassword ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.18)',
                                border: isCopiedPassword ? '1px solid #10b981' : '1px solid rgba(245, 158, 11, 0.35)',
                                borderRadius: 6,
                                color: isCopiedPassword ? '#10b981' : '#fbbf24',
                                padding: '3px 9px',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                transition: 'all 0.15s ease'
                              }}
                              title="Copy Password"
                            >
                              {isCopiedPassword ? <Check size={12} /> : <Copy size={12} />}
                              <span>{isCopiedPassword ? 'Copied' : 'Copy'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleStartPasswordReset}
                              style={{
                                background: 'rgba(56, 189, 248, 0.15)',
                                border: '1px solid rgba(56, 189, 248, 0.35)',
                                borderRadius: 6,
                                color: '#38bdf8',
                                padding: '3px 9px',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                transition: 'all 0.15s ease'
                              }}
                              title="Reset or Change Password"
                            >
                              <Key size={12} />
                              <span>Reset</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {isResettingPassword ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            type="text"
                            value={newPasswordVal}
                            onChange={(e) => setNewPasswordVal(e.target.value)}
                            placeholder="Enter new password"
                            style={{
                              flex: 1,
                              background: 'rgba(0, 0, 0, 0.5)',
                              border: '1px solid rgba(245, 158, 11, 0.4)',
                              borderRadius: 6,
                              padding: '5px 8px',
                              color: '#fff',
                              fontSize: '0.82rem',
                              fontFamily: 'monospace'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setNewPasswordVal(generateSecurePassword())}
                            style={{
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.2)',
                              borderRadius: 6,
                              color: '#fbbf24',
                              padding: '4px 8px',
                              fontSize: '0.72rem',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                            title="Generate secure random password"
                          >
                            <RefreshCw size={12} /> Gen
                          </button>
                        </div>
                        {passwordResetError && (
                          <div style={{ fontSize: '0.72rem', color: '#f87171' }}>{passwordResetError}</div>
                        )}
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 2 }}>
                          <button
                            type="button"
                            onClick={() => setIsResettingPassword(false)}
                            style={{
                              background: 'transparent',
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              borderRadius: 6,
                              color: 'var(--text-muted)',
                              padding: '4px 10px',
                              fontSize: '0.74rem',
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveNewPassword}
                            disabled={passwordResetSaving}
                            style={{
                              background: '#10b981',
                              border: 'none',
                              borderRadius: 6,
                              color: '#fff',
                              padding: '4px 12px',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            {passwordResetSaving ? 'Updating...' : 'Save Password'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        background: 'rgba(0, 0, 0, 0.45)',
                        border: '1px solid rgba(245, 158, 11, 0.2)',
                        borderRadius: 6,
                        padding: '7px 10px',
                        color: (activeContact?.password || contact?.password) ? '#fef3c7' : 'var(--text-muted)',
                        fontFamily: isPasswordRevealed ? 'var(--font-mono, monospace)' : 'monospace',
                        letterSpacing: isPasswordRevealed ? 'normal' : '3px',
                        fontWeight: 700,
                        fontSize: '0.86rem',
                        wordBreak: 'break-all',
                        userSelect: 'all',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        minHeight: 32
                      }}>
                        <span>
                          {isPasswordRevealed 
                            ? ((activeContact?.password || contact?.password) || 'Not recorded yet')
                            : '••••••••••••'}
                        </span>
                        {isPasswordRevealed && !(activeContact?.password || contact?.password) && (
                          <button
                            type="button"
                            onClick={handleStartPasswordReset}
                            style={{
                              background: 'rgba(56, 189, 248, 0.2)',
                              border: '1px solid #38bdf8',
                              borderRadius: 4,
                              color: '#38bdf8',
                              padding: '2px 6px',
                              fontSize: '0.68rem',
                              cursor: 'pointer'
                            }}
                          >
                            Set Now
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <form onSubmit={handleSaveProfile} className="profile-edit-card">
              <div className="profile-edit-header-row">
                <span className="profile-edit-title">
                  <Edit3 size={14} color="#38bdf8" /> Edit Personal Profile
                </span>
                <span className="profile-edit-badge">Live Sync</span>
              </div>

              {profileError && (
                <div className="profile-edit-error-alert">
                  <AlertCircle size={15} />
                  <span>{profileError}</span>
                </div>
              )}

              {/* Display Name Input */}
              <div className="profile-edit-group">
                <label className="profile-edit-label">
                  <User size={13} color="#94a3b8" /> Display Name
                </label>
                <input
                  type="text"
                  className="profile-edit-input"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="e.g. Mohanlal Sharma"
                  required
                />
              </div>

              {/* Email Input */}
              <div className="profile-edit-group">
                <label className="profile-edit-label">
                  <Mail size={13} color="#94a3b8" /> Email Address
                </label>
                <input
                  type="email"
                  className="profile-edit-input"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="e.g. name@QuantumPropAI.io"
                  required
                />
              </div>

              {/* Member Since Date Picker */}
              <div className="profile-edit-group">
                <label className="profile-edit-label">
                  <Calendar size={13} color="#94a3b8" /> Member Since
                </label>
                <input
                  type="date"
                  className="profile-edit-input profile-date-field"
                  value={editCreatedAt}
                  onChange={(e) => setEditCreatedAt(e.target.value)}
                />
                <span className="profile-edit-hint">Customize your join date displayed in directory</span>
              </div>

              {/* Bio Textarea */}
              <div className="profile-edit-group">
                <label className="profile-edit-label">
                  <Sparkles size={13} color="#94a3b8" /> Bio / Status
                </label>
                <textarea
                  className="profile-edit-input profile-edit-textarea"
                  rows={2}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Write a brief bio or role description..."
                />
              </div>

              {/* Action Buttons */}
              <div className="profile-edit-actions-row">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCancelEdit}
                  disabled={profileSaving}
                  style={{ flex: 1, padding: '9px 12px', fontSize: '0.82rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary btn-emerald"
                  disabled={profileSaving}
                  style={{ flex: 1.5, padding: '9px 14px', fontSize: '0.82rem' }}
                >
                  {profileSaving ? 'Saving...' : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                      <Check size={14} /> Save Profile
                    </span>
                  )}
                </button>
              </div>
            </form>
          )}

          {!(activeContact?.isAdmin ?? contact?.isAdmin) && onOpenOnboardingGuide && (
            <button
              type="button"
              className="btn-secondary"
              style={{
                width: '100%',
                marginTop: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 14px',
                fontSize: '0.84rem'
              }}
              onClick={() => {
                onClose();
                onOpenOnboardingGuide();
              }}
            >
              <Sparkles size={16} color="#fbbf24" />
              <span>View Employee Welcome Guide</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
