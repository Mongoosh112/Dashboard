// Helper functions for UI, avatars, formatting

export const AVATAR_PRESETS = [
  'https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Gizmo&backgroundColor=ffd5dc',
  'https://api.dicebear.com/7.x/lorelei/svg?seed=Luna&backgroundColor=c0aede',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Sparky&backgroundColor=ffdfbf',
  'https://api.dicebear.com/7.x/notionists/svg?seed=Milo&backgroundColor=d1d4f9',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/croodles/svg?seed=Coco&backgroundColor=ffd5dc',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Cosmo&backgroundColor=d1d4f9'
];

export function generateRandomCartoonAvatars(count = 8) {
  const styles = ['bottts', 'adventurer', 'avataaars', 'fun-emoji', 'lorelei', 'notionists', 'croodles', 'thumbs'];
  const bgColors = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'];
  const randomWords = [
    'Pixel', 'Cyber', 'Rocket', 'Spark', 'Comet', 'Cosmo', 'Echo', 'Neon',
    'Orbit', 'Zenith', 'Quark', 'Nova', 'Pulse', 'Astro', 'Blaze', 'Sonic'
  ];
  
  const avatars = [];
  for (let i = 0; i < count; i++) {
    const style = styles[i % styles.length];
    const bg = bgColors[Math.floor(Math.random() * bgColors.length)];
    const seed = `${randomWords[Math.floor(Math.random() * randomWords.length)]}_${Math.floor(Math.random() * 1000)}`;
    avatars.push(`https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${bg}`);
  }
  return avatars;
}

export function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function getInitials(name) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function getGradientForName(name = '') {
  const gradients = [
    'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
    'linear-gradient(135deg, #3b82f6 0%, #2dd4bf 100%)',
    'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
    'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
    'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
    'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
}

const SAFE_ATTACHMENT_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif'
]);

export function dataURItoBlob(dataURI) {
  if (!dataURI) return null;
  if (dataURI.startsWith('blob:')) return null;
  try {
    const parts = dataURI.split(',');
    if (parts.length < 2) return null;
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = (mimeMatch ? mimeMatch[1] : 'application/pdf').toLowerCase().trim();
    if (!SAFE_ATTACHMENT_MIMES.has(mime)) {
      console.warn('[Security] Blocked untrusted attachment mime type:', mime);
      return null;
    }
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (err) {
    console.error('Failed to convert dataURI to Blob:', err);
    return null;
  }
}

export function getAuthenticatedMediaUrl(url, explicitToken) {
  if (!url || typeof url !== 'string') return url;
  if (!url.startsWith('/api/files/')) return url;
  const token = explicitToken || (typeof localStorage !== 'undefined' ? (localStorage.getItem('QuantumPropAI_token') || localStorage.getItem('token')) : null);
  if (!token) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

export function openPdfInNewTab(mediaUrl, fileName = 'document.pdf') {
  if (!mediaUrl) return;

  try {
    let targetUrl = mediaUrl;
    if (typeof mediaUrl === 'string' && mediaUrl.startsWith('data:')) {
      const blob = dataURItoBlob(mediaUrl);
      if (blob) {
        targetUrl = URL.createObjectURL(blob);
      }
    } else if (typeof mediaUrl === 'string' && mediaUrl.startsWith('/api/files/')) {
      targetUrl = getAuthenticatedMediaUrl(mediaUrl);
    }

    const newWindow = window.open(targetUrl, '_blank', 'noopener,noreferrer');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      const a = document.createElement('a');
      a.href = targetUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } catch (err) {
    console.error('Failed to open PDF in new tab:', err);
    downloadPdfFile(mediaUrl, fileName);
  }
}

export function downloadPdfFile(dataUrl, fileName = 'document.pdf') {
  if (!dataUrl) return;
  try {
    let url = dataUrl;
    let shouldRevoke = false;

    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
      const blob = dataURItoBlob(dataUrl);
      if (blob) {
        url = URL.createObjectURL(blob);
        shouldRevoke = true;
      }
    } else if (typeof dataUrl === 'string' && dataUrl.startsWith('/api/files/')) {
      url = getAuthenticatedMediaUrl(dataUrl);
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'document.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (shouldRevoke) {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  } catch (e) {
    console.error('Download failed:', e);
  }
}

/**
 * Generates a strong, complex password of exact length (default 12 characters).
 * Guarantees a mix of uppercase letters, lowercase letters, numbers, and special characters.
 */
export function generateSecurePassword(length = 12) {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%^&*()_+-=';
  const allChars = uppercase + lowercase + numbers + symbols;

  const getRandomChar = (charset) => {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      return charset[arr[0] % charset.length];
    }
    return charset[Math.floor(Math.random() * charset.length)];
  };

  // Guarantee complexity: at least 2 uppercase, 2 lowercase, 2 numbers, 2 symbols
  const chars = [
    getRandomChar(uppercase),
    getRandomChar(uppercase),
    getRandomChar(lowercase),
    getRandomChar(lowercase),
    getRandomChar(numbers),
    getRandomChar(numbers),
    getRandomChar(symbols),
    getRandomChar(symbols),
  ];

  // Fill the remainder (4 characters to reach 12) from the full character pool
  while (chars.length < length) {
    chars.push(getRandomChar(allChars));
  }

  // Fisher-Yates shuffle with cryptographic random values
  for (let i = chars.length - 1; i > 0; i--) {
    let j;
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      j = arr[0] % (i + 1);
    } else {
      j = Math.floor(Math.random() * (i + 1));
    }
    const temp = chars[i];
    chars[i] = chars[j];
    chars[j] = temp;
  }

  return chars.join('');
}
