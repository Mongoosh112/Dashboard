import React, { useState, useRef } from 'react';
import { Send, Smile, Paperclip, X } from 'lucide-react';
import { soundManager } from '../utils/sound';

const QUICK_EMOJIS = ['😊', '😂', '🔥', '❤️', '👍', '🎉', '🚀', '✨', '👏', '👀', '💯', '🙌'];

export default function MessageInput({ onSendMessage, onTypingStart, onTypingStop, onInteract }) {
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachment, setAttachment] = useState(null); // { name, size, type, dataUrl }
  const [isReadingFile, setIsReadingFile] = useState(false);
  
  const typingTimerRef = useRef(null);
  const isTypingRef = useRef(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleChange = (e) => {
    if (onInteract) onInteract();
    const val = e.target.value;
    setText(val);

    if (val.trim()) {
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        onTypingStart();
      }
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        isTypingRef.current = false;
        onTypingStop();
      }, 2000);
    } else {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        onTypingStop();
      }
    }
  };

  // Handle local PDF or document file selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 30 * 1024 * 1024) {
      alert('Selected file exceeds the 30MB size limit. Please choose a smaller document or image.');
      e.target.value = '';
      return;
    }

    let fileType = file.type || '';
    if (!fileType) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (['png', 'x-png'].includes(ext)) fileType = 'image/png';
      else if (['jpg', 'jpeg', 'pjpeg'].includes(ext)) fileType = 'image/jpeg';
      else if (['webp'].includes(ext)) fileType = 'image/webp';
      else if (['gif'].includes(ext)) fileType = 'image/gif';
      else if (['svg'].includes(ext)) fileType = 'image/svg+xml';
      else if (['pdf'].includes(ext)) fileType = 'application/pdf';
      else fileType = 'image/png';
    }

    setIsReadingFile(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      setIsReadingFile(false);
      const dataUrl = event.target.result;
      const sizeFormatted = file.size > 1024 * 1024 
        ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
        : `${(file.size / 1024).toFixed(1)} KB`;

      setAttachment({
        name: file.name,
        size: sizeFormatted,
        type: fileType,
        dataUrl
      });
    };
    reader.onerror = () => {
      setIsReadingFile(false);
      alert('Unable to load file. Please try again.');
    };
    reader.readAsDataURL(file);

    // Reset input
    e.target.value = '';
  };



  const handleSend = (e) => {
    if (e) e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed && !attachment) return;

    onSendMessage({
      text: trimmed,
      mediaUrl: attachment?.dataUrl || null,
      mediaType: attachment?.type || null,
      fileName: attachment?.name || null,
      fileSize: attachment?.size || null
    });

    soundManager.playMessageSent();
    setText('');
    setAttachment(null);
    setShowEmojiPicker(false);

    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTypingStop();
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAddEmoji = (emoji) => {
    setText(prev => prev + emoji);
    inputRef.current?.focus();
  };

  return (
    <div className="chat-input-bar-container">
      {/* Hidden File Input for PDF / Images / Attachments */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf,image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Attachment Preview Chip */}
      {attachment && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: attachment.type?.startsWith('image/') ? 'rgba(99, 102, 241, 0.14)' : 'rgba(239, 68, 68, 0.12)',
          border: `1px solid ${attachment.type?.startsWith('image/') ? 'rgba(99, 102, 241, 0.4)' : 'rgba(239, 68, 68, 0.35)'}`,
          padding: '8px 14px',
          borderRadius: '12px',
          marginBottom: 10,
          width: 'fit-content',
          animation: 'slideUp 0.15s ease'
        }}>
          {attachment.type?.startsWith('image/') ? (
            <img
              src={attachment.dataUrl}
              alt={attachment.name}
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                objectFit: 'cover',
                border: '1px solid rgba(255, 255, 255, 0.2)'
              }}
            />
          ) : (
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: '0.65rem'
            }}>
              PDF
            </div>
          )}

          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>{attachment.name}</div>
            <div style={{ fontSize: '0.72rem', color: attachment.type?.startsWith('image/') ? '#c7d2fe' : '#fca5a5' }}>
              {attachment.size} • Ready to send
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            style={{ width: 24, height: 24, border: 'none', background: 'rgba(255, 255, 255, 0.1)' }}
            onClick={() => setAttachment(null)}
            title="Remove attachment"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div className="emoji-popover">
          {QUICK_EMOJIS.map((emoji, idx) => (
            <button
              key={idx}
              type="button"
              className="emoji-btn"
              onClick={() => handleAddEmoji(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <form className="chat-input-form" onSubmit={handleSend}>
        {/* Emoji Button */}
        <button
          type="button"
          className="icon-btn"
          style={{ width: 34, height: 34, border: 'none', background: 'transparent' }}
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          title="Emojis"
        >
          <Smile size={20} color="var(--text-muted)" />
        </button>

        {/* Attachment upload button */}
        <button
          type="button"
          className="icon-btn"
          style={{ width: 34, height: 34, border: 'none', background: 'transparent' }}
          onClick={() => fileInputRef.current?.click()}
          title="Attach PDF or Image"
        >
          <Paperclip size={19} color="var(--accent-cyan)" />
        </button>

        <input
          ref={inputRef}
          type="text"
          className="chat-text-input"
          placeholder={attachment ? "Add an optional caption..." : "Type a message, attach PDF or image..."}
          value={text}
          onFocus={onInteract}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />

        <button
          type="submit"
          className="send-btn"
          disabled={(!text.trim() && !attachment) || isReadingFile}
          title={isReadingFile ? "Loading attachment..." : "Send message"}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
