'use strict';

// Electron doesn't automatically show notifications in Windows yet, and it's not easy to polyfill.
// So we have to hijack the Notification API.
let UUID = require('uuid'),
	ipc;
try {
	// Using electron >=0.35
	ipc = require('electron').ipcRenderer;
} catch (e) {
	// Assume it's electron <0.35
	ipc = require('ipc');
}

var notificationShimController = {
	saveOnClickHandlers: false, // Save notification onclick handlers so main thread may trigger them. (Windows 7 support.)
	overrides: {
		title: undefined,
		body: undefined,
		icon: undefined,
		requireInteraction: undefined,
		silent: undefined
	}
}, savedNotifications = {};

module.exports = () => {
	const OldNotification = Notification;

	Notification = function (title, options) {
		var originalTitle, originalOptions, uuid, notification, i;

		// Apply overrides to the notification's options
		originalTitle = title;
		originalOptions = Object.assign({}, options);
		if (notificationShimController.overrides.title !== undefined) {
			title = notificationShimController.overrides.title;
		}
		for (i in notificationShimController.overrides) {
			if (notificationShimController.overrides[i] === undefined) {
				delete notificationShimController.overrides[i];
			}
		}
		options = Object.assign({}, options);
		options = Object.assign(options, notificationShimController.overrides);

		// Send this to main thread.
		// Catch it in your main 'app' instance with `ipc.on`.
		// Then send it back to the view, if you want, with `event.returnValue` or `event.sender.send()`.
		uuid = (notificationShimController.saveOnClickHandlers ? UUID.v4() : null);
		ipc.send('notification-shim', {
			uuid,
			title,
			options,
			originalTitle,
			originalOptions
		});

		// Send onclick events to main thread.
		setTimeout(function () {
			if (!notification) {
				return;
			}
			var onclickOld = notification.onclick;
			notification.onclick = function () {
				if (uuid && savedNotifications[uuid]) {
					delete savedNotifications[uuid];
				}
				ipc.send('notification-shim-onclick', notification);
				if (onclickOld) {
					onclickOld();
				}
			};
		}, 1);

		// Send the native Notification.
		// You can't catch it, that's why we're doing all of this. :)
		notification = new OldNotification(title, options);

		// Save Notification objects so main thread can invoke their onclick functions
		if (notificationShimController.saveOnClickHandlers) {
			if (notification && uuid) {
				savedNotifications[uuid] = notification;
			}
		}

		// Return browser-instantiated Notification
		return notification;
	};

	Notification.prototype = OldNotification.prototype;
	Notification.permission = OldNotification.permission;
	Notification.requestPermission = OldNotification.requestPermission;

	// Allow main thread to signal dismissed and/or clicked. (Windows 7 support)
	ipc.on('notification-shim-notification-dismissed', function handleNotificationShimResponse(sender, uuid, clicked) {
		if (!uuid) {
			return;
		}

		// Look up from (and remove from) saved handlers
		var notification = savedNotifications[uuid];
		if (!notification) {
			return;
		}
		delete savedNotifications[uuid];

		// Call handler
		if (clicked && notification.onclick) {
			notification.onclick();
		}
	});

	return notificationShimController;
};
