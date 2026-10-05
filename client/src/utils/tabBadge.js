// Dynamic Tab Title and Favicon Notification Dot Utility for QuantumPropAI

const BASE_TITLE = 'QuantumPropAI • Dashboard';

// Default base SVG favicon
export const BASE_FAVICON = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%236366f1'/><stop offset='100%' stop-color='%23a855f7'/></linearGradient></defs><rect width='100' height='100' rx='24' fill='url(%23g)'/><path d='M30 42c0-8.837 8.954-16 20-16s20 7.163 20 16-8.954 16-20 16c-3.13 0-6.077-.574-8.665-1.597L30 60l3.14-8.082C31.18 49.333 30 45.834 30 42z' fill='white'/></svg>";

// Favicon with a vibrant red notification dot in the top-right corner with a crisp white border
export const UNREAD_FAVICON = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%236366f1'/><stop offset='100%' stop-color='%23a855f7'/></linearGradient></defs><rect width='100' height='100' rx='24' fill='url(%23g)'/><path d='M30 42c0-8.837 8.954-16 20-16s20 7.163 20 16-8.954 16-20 16c-3.13 0-6.077-.574-8.665-1.597L30 60l3.14-8.082C31.18 49.333 30 45.834 30 42z' fill='white'/><circle cx='76' cy='24' r='18' fill='%23ef4444' stroke='%23ffffff' stroke-width='5'/></svg>";

let lastKnownCount = -1;

/**
 * Updates the browser tab title and favicon with a red notification dot
 * @param {number} unreadCount - Number of unread messages across conversations
 */
export function updateTabBadge(unreadCount = 0) {
  if (typeof document === 'undefined') return;

  const count = Math.max(0, Number(unreadCount) || 0);

  // Avoid redundant DOM updates if count hasn't changed
  if (count === lastKnownCount) return;
  lastKnownCount = count;

  // 1. Update Document Title
  if (count > 0) {
    const displayCount = count > 99 ? '99+' : count;
    document.title = `🔴 (${displayCount}) ${BASE_TITLE}`;
  } else {
    document.title = BASE_TITLE;
  }

  // 2. Update Browser Favicon
  const targetHref = count > 0 ? UNREAD_FAVICON : BASE_FAVICON;

  let link = document.getElementById('app-favicon') || document.querySelector("link[rel*='icon']");
  if (!link) {
    link = document.createElement('link');
    link.id = 'app-favicon';
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    document.head.appendChild(link);
  }

  if (link.getAttribute('href') !== targetHref) {
    link.setAttribute('href', targetHref);
    // Node replacement triggers instant repainting in Chromium, WebKit, and Gecko tab bars
    const freshLink = link.cloneNode(true);
    if (link.parentNode) {
      link.parentNode.replaceChild(freshLink, link);
    }
  }
}

/**
 * Resets tab badge and title back to default state
 */
export function resetTabBadge() {
  updateTabBadge(0);
}
