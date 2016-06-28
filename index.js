'use strict';

// Electron doesn't automatically show notifications in Windows yet, and it's not easy to polyfill.
// So we have to hijack the Notification API.
let ipc;
try {
	// Using electron >=0.35
	ipc = require('electron').ipcRenderer;
} catch (e) {
	// Assume it's electron <0.35
	ipc = require('ipc');
}

var notificationShimController = {
	overrides: {
		title: undefined,
		body: undefined,
		icon: undefined,
		requireInteraction: undefined,
		silent: undefined
	}
};

module.exports = () => {
	const OldNotification = Notification;

	Notification = function (title, options) {
		var originalTitle, originalOptions, notification, i;

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
		ipc.send('notification-shim', {
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
				ipc.send('notification-shim-onclick', notification);
				if (onclickOld) {
					onclickOld();
				}
			};
		}, 1);

		// Send the native Notification.
		// You can't catch it, that's why we're doing all of this. :)
		return notification = new OldNotification(title, options);
	};

	Notification.prototype = OldNotification.prototype;
	Notification.permission = OldNotification.permission;
	Notification.requestPermission = OldNotification.requestPermission;

	return notificationShimController;
};
