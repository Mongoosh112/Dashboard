// Desktop / OS System Notification Utility for Windows & Mac
// Triggers native Windows Action Center & taskbar popup notifications

export function isDesktopNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission() {
  if (!isDesktopNotificationSupported()) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function requestDesktopNotificationPermission() {
  if (!isDesktopNotificationSupported()) return 'unsupported';
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch (err) {
    console.error('Failed to request notification permission:', err);
    return Notification.permission;
  }
}

export function showDesktopNotification({
  title,
  body,
  icon,
  tag,
  requireInteraction = true,
  onClick
} = {}) {
  if (!isDesktopNotificationSupported()) return null;

  if (Notification.permission === 'granted') {
    try {
      const fallbackIcon = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80';
      
      // Make each notification uniquely identified by timestamp so Windows never suppresses
      // repeated notifications or considers them duplicates if the user clicked X or dismissed.
      const uniqueTag = tag 
        ? `${tag}-${Date.now()}-${Math.floor(Math.random() * 1000)}` 
        : `QuantumPropAI-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const options = {
        body: body || 'You have an important notification.',
        icon: icon || fallbackIcon,
        badge: icon || fallbackIcon,
        tag: uniqueTag,
        renotify: true, // Forces Windows to re-alert the user even if from the same source
        requireInteraction: !!requireInteraction, // Keep visible on Windows screen until user interacts
        silent: true // Silent because QuantumPropAI's Web Audio synthesizer handles the high-definition crystal chime
      };

      const notification = new Notification(title, options);

      notification.onclick = (event) => {
        event.preventDefault();
        try {
          window.focus();
        } catch (e) {
          // ignore
        }
        try {
          notification.close();
        } catch (e) {
          // ignore
        }
        if (typeof onClick === 'function') {
          onClick();
        }
      };

      notification.onclose = () => {
        // Notification closed by user clicking X
      };

      // Auto-close after 35 seconds if neglected
      setTimeout(() => {
        try {
          notification.close();
        } catch (e) {
          // ignore
        }
      }, 35000);

      return notification;
    } catch (err) {
      console.error('Failed to create native desktop notification:', err);
      return null;
    }
  } else if (Notification.permission === 'default') {
    // Attempt to request permission on the fly
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        showDesktopNotification({ title, body, icon, tag, requireInteraction, onClick });
      }
    });
  }

  return null;
}
