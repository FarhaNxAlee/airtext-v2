import "./style.css";

(function () {
      "use strict";

      var APP = window.__AIRTEXT_BOOT__;

      var state = {
        items: [],
        optimisticItems: Object.create(null),
        currentItem: null,
        currentSource: null,
        currentCode: null,
        currentVia: null,
        qrCode: null,
        scanner: null,
        scannerRunning: false,
        pollingTimer: null,
        adminData: null,
        files: [],
        currentFile: null,
        currentFileCode: null
      };

      var el = {};

      document.addEventListener("DOMContentLoaded", init);

      function init() {
        cacheElements();
        bindEvents();
        syncThemeButtons();

        if (APP.initialAdmin) {
          el.publicApp.classList.add("hidden-force");
          el.adminApp.classList.remove("hidden-force");
          initAdmin();
          return;
        }

        applyPublicSettings();
        switchTab("share");
        updateCounters();
        loadLocalItems(false);
        loadLocalFiles(false);
        startPolling();
        window.setInterval(updateCountdowns, 1000);
        updateCountdowns();

        if (APP.initialShareCode) {
          window.setTimeout(function () {
            openShareByCode(APP.initialShareCode, true, APP.initialShareVia || "link");
          }, 120);
        }
        if (APP.initialFileShareCode) {
          window.setTimeout(function () {
            openFileShareByCode(APP.initialFileShareCode, true, APP.initialShareVia || "link");
          }, 120);
        }
      }

      function cacheElements() {
        el.publicApp = document.getElementById("public-app");
        el.adminApp = document.getElementById("admin-app");
        el.createForm = document.getElementById("create-form");
        el.createSubmit = document.getElementById("create-submit");
        el.shareTitle = document.getElementById("share-title");
        el.shareText = document.getElementById("share-text");
        el.lockToggle = document.getElementById("lock-toggle");
        el.pinFieldWrap = document.getElementById("pin-field-wrap");
        el.sharePin = document.getElementById("share-pin");
        el.titleCounter = document.getElementById("title-counter");
        el.textCounter = document.getElementById("text-counter");
        el.lockControl = document.getElementById("lock-control");
        el.maintenanceBanner = document.getElementById("maintenance-banner");
        el.createExpiryCopy = document.getElementById("create-expiry-copy");

        el.joinForm = document.getElementById("join-form");
        el.joinCode = document.getElementById("join-code");

        el.fileUploadForm = document.getElementById("file-upload-form");
        el.fileUploadSubmit = document.getElementById("file-upload-submit");
        el.fileInput = document.getElementById("file-input");
        el.fileInputName = document.getElementById("file-input-name");
        el.fileTitle = document.getElementById("file-title");
        el.fileLockToggle = document.getElementById("file-lock-toggle");
        el.filePinFieldWrap = document.getElementById("file-pin-field-wrap");
        el.filePin = document.getElementById("file-pin");
        el.stagedFilesList = document.getElementById("staged-files-list");
        el.stagedFilesTotal = document.getElementById("staged-files-total");
        el.filesDropZone = document.getElementById("files-drop-zone");
        el.filesBoardEmpty = document.getElementById("files-board-empty");
        el.filesBoardList = document.getElementById("files-board-list");
        el.filesRefreshButton = document.getElementById("files-refresh-button");

        el.fileModal = document.getElementById("file-modal");
        el.fileModalLoading = document.getElementById("file-modal-loading");
        el.fileModalError = document.getElementById("file-modal-error");
        el.fileModalTitle = document.getElementById("file-modal-title");
        el.fileModalLockBadge = document.getElementById("file-modal-lock-badge");
        el.fileModalExpiry = document.getElementById("file-modal-expiry");
        el.fileUnlockForm = document.getElementById("file-unlock-form");
        el.fileUnlockPin = document.getElementById("file-unlock-pin");
        el.fileUnlockSubmit = document.getElementById("file-unlock-submit");
        el.fileModalContent = document.getElementById("file-modal-content");
        el.fileModalSharedBy = document.getElementById("file-modal-shared-by");
        el.fileModalList = document.getElementById("file-modal-list");
        el.deleteFileButton = document.getElementById("delete-file-button");

        el.qrtoolForm = document.getElementById("qrtool-form");
        el.qrtoolInput = document.getElementById("qrtool-input");
        el.qrtoolOutputWrap = document.getElementById("qrtool-output-wrap");
        el.qrtoolOutput = document.getElementById("qrtool-output");

        el.mainTabs = document.querySelectorAll("#main-tabs [data-tab]");
        el.tabPanels = document.querySelectorAll("[data-tab-panel]");
        el.mainTabAvailableCount = document.getElementById("main-tab-available-count");
        el.boardClock = document.getElementById("board-clock");

        el.boardLoading = document.getElementById("board-loading");
        el.boardEmpty = document.getElementById("board-empty");
        el.boardList = document.getElementById("board-list");
        el.itemCount = document.getElementById("item-count");
        el.lastRefreshed = document.getElementById("last-refreshed");
        el.refreshButton = document.getElementById("refresh-button");
        el.notesSearch = document.getElementById("notes-search");
        el.notesFilter = document.getElementById("notes-filter");

        el.itemModal = document.getElementById("item-modal");
        el.modalLoading = document.getElementById("modal-loading");
        el.modalError = document.getElementById("modal-error");
        el.modalTitle = document.getElementById("modal-title");
        el.modalLockBadge = document.getElementById("modal-lock-badge");
        el.modalExpiry = document.getElementById("modal-expiry");
        el.unlockForm = document.getElementById("unlock-form");
        el.unlockPin = document.getElementById("unlock-pin");
        el.unlockSubmit = document.getElementById("unlock-submit");
        el.modalContent = document.getElementById("modal-content");
        el.modalText = document.getElementById("modal-text");
        el.modalSharedBy = document.getElementById("modal-shared-by");
        el.deleteButton = document.getElementById("delete-item-button");

        el.qrModal = document.getElementById("qr-modal");
        el.qrOutput = document.getElementById("qr-output");
        el.qrCodeText = document.getElementById("qr-code-text");
        el.qrLinkInput = document.getElementById("qr-link-input");

        el.scannerModal = document.getElementById("scanner-modal");
        el.scannerStatus = document.getElementById("scanner-status");

        el.drawer = document.getElementById("side-drawer");
        el.drawerBackdrop = document.getElementById("drawer-backdrop");
        el.feedbackSection = document.getElementById("feedback-drawer-section");
        el.feedbackForm = document.getElementById("feedback-form");
        el.feedbackCategory = document.getElementById("feedback-category");
        el.feedbackMessage = document.getElementById("feedback-message");
        el.feedbackEmail = document.getElementById("feedback-email");
        el.feedbackRating = document.getElementById("feedback-rating");
        el.feedbackSubmit = document.getElementById("feedback-submit");

        el.adminUsers = document.getElementById("admin-users");
        el.adminRoles = document.getElementById("admin-roles");
        el.adminUserCreateForm = document.getElementById("admin-user-create-form");
        el.newUserEmail = document.getElementById("new-user-email");
        el.newUserName = document.getElementById("new-user-name");
        el.newUserPassword = document.getElementById("new-user-password");
        el.newUserRole = document.getElementById("new-user-role");
        el.adminUserCreateSubmit = document.getElementById("admin-user-create-submit");

        el.adminLoginCard = document.getElementById("admin-login-card");
        el.adminLoginHelp = document.getElementById("admin-login-help");
        el.adminLoginForm = document.getElementById("admin-login-form");
        el.adminEmail = document.getElementById("admin-email");
        el.adminPassword = document.getElementById("admin-password");
        el.adminLoginSubmit = document.getElementById("admin-login-submit");
        el.adminDashboard = document.getElementById("admin-dashboard");
        el.adminLogout = document.getElementById("admin-logout");
        el.adminRefresh = document.getElementById("admin-refresh");
        el.adminStats = document.getElementById("admin-stats");
        el.adminChart = document.getElementById("admin-chart");
        el.adminEventCounts = document.getElementById("admin-event-counts");
        el.adminSettingsForm = document.getElementById("admin-settings-form");
        el.adminSettingsSubmit = document.getElementById("admin-settings-submit");
        el.adminNotes = document.getElementById("admin-notes");
        el.adminFeedback = document.getElementById("admin-feedback");
        el.adminFiles = document.getElementById("admin-files");
        el.adminStorageBar = document.getElementById("admin-storage-bar");
        el.adminStorageFill = document.getElementById("admin-storage-fill");
        el.adminStorageLabel = document.getElementById("admin-storage-label");
        el.adminStorageWarning = document.getElementById("admin-storage-warning");
        el.adminTabs = document.querySelectorAll("[data-admin-tab]");
        el.adminTabPanels = document.querySelectorAll("[data-admin-panel]");
        el.adminContentFields = document.getElementById("admin-content-fields");
        el.adminStorageStatus = document.getElementById("admin-storage-status");

        el.settingAppName = document.getElementById("setting-app-name");
        el.settingTagline = document.getElementById("setting-tagline");
        el.settingAnnouncement = document.getElementById("setting-announcement");
        el.settingTtl = document.getElementById("setting-ttl");
        el.settingMaxItems = document.getElementById("setting-max-items");
        el.settingTitleLength = document.getElementById("setting-title-length");
        el.settingTextLength = document.getElementById("setting-text-length");
        el.settingCreateCooldown = document.getElementById("setting-create-cooldown");
        el.settingUnlockCooldown = document.getElementById("setting-unlock-cooldown");
        el.settingDefaultTheme = document.getElementById("setting-default-theme");
        el.settingNotesEnabled = document.getElementById("setting-notes-enabled");
        el.settingPinEnabled = document.getElementById("setting-pin-enabled");
        el.settingCrossNetwork = document.getElementById("setting-cross-network");
        el.settingFeedbackEnabled = document.getElementById("setting-feedback-enabled");
        el.settingAnalyticsEnabled = document.getElementById("setting-analytics-enabled");
        el.settingMaintenance = document.getElementById("setting-maintenance");
        el.settingHeroEnabled = document.getElementById("setting-hero-enabled");
        el.settingHeroPanelEnabled = document.getElementById("setting-hero-panel-enabled");
        el.settingAnnouncementEnabled = document.getElementById("setting-announcement-enabled");
        el.settingTickerEnabled = document.getElementById("setting-ticker-enabled");
        el.settingCreateSectionEnabled = document.getElementById("setting-create-section-enabled");
        el.settingAvailableSectionEnabled = document.getElementById("setting-available-section-enabled");
        el.settingOpenCodeSectionEnabled = document.getElementById("setting-open-code-section-enabled");
        el.settingGuideEnabled = document.getElementById("setting-guide-enabled");
        el.settingAboutEnabled = document.getElementById("setting-about-enabled");
        el.settingFooterEnabled = document.getElementById("setting-footer-enabled");
        el.settingSocialLinksEnabled = document.getElementById("setting-social-links-enabled");
        el.settingFooterShowYear = document.getElementById("setting-footer-show-year");
        el.settingFooterShowDeveloper = document.getElementById("setting-footer-show-developer");
      }

      function bindEvents() {
        el.mainTabs.forEach(function (tab) {
          tab.addEventListener("click", function () { switchTab(tab.getAttribute("data-tab")); });
        });
        el.createForm.addEventListener("submit", createShare);
        el.joinForm.addEventListener("submit", function (event) {
          event.preventDefault();
          var code = normalizeCode(el.joinCode.value);
          if (!code) return toast("Enter a valid share code.", "error");
          openAnyShareByCode(code, true, "code");
        });
        el.unlockForm.addEventListener("submit", unlockCurrentItem);
        el.feedbackForm.addEventListener("submit", submitFeedback);
        el.notesSearch.addEventListener("input", renderLocalItems);
        el.notesFilter.addEventListener("change", renderLocalItems);
        el.fileUploadForm.addEventListener("submit", createFileShare);
        el.fileUnlockForm.addEventListener("submit", unlockCurrentFile);
        el.fileLockToggle.addEventListener("change", function () {
          el.filePinFieldWrap.classList.toggle("hidden", !el.fileLockToggle.checked);
          if (el.fileLockToggle.checked) window.setTimeout(function () { el.filePin.focus(); }, 60);
          else el.filePin.value = "";
        });
        el.fileInput.addEventListener("change", function () { renderStagedFiles(); });
        el.filesDropZone.addEventListener("dragover", function (event) { event.preventDefault(); });
        el.filesDropZone.addEventListener("drop", function (event) {
          event.preventDefault();
          var dropped = event.dataTransfer && event.dataTransfer.files;
          if (dropped && dropped.length) {
            el.fileInput.files = dropped;
            renderStagedFiles();
          }
        });
        el.filesRefreshButton.addEventListener("click", function () { loadLocalFiles(true); });
        el.qrtoolForm.addEventListener("submit", generateLinkQrTool);
        el.adminLoginForm.addEventListener("submit", adminLogin);
        el.adminSettingsForm.addEventListener("submit", saveAdminSettings);
        el.adminLogout.addEventListener("click", adminLogout);
        el.adminRefresh.addEventListener("click", loadAdminDashboard);
        el.adminTabs.forEach(function (tab) {
          tab.addEventListener("click", function () {
            var name = tab.getAttribute("data-admin-tab");
            switchAdminTab(name);
            if (name === "users") loadAdminUsers();
          });
        });
        if (el.adminUserCreateForm) el.adminUserCreateForm.addEventListener("submit", createAdminUser);

        el.shareTitle.addEventListener("input", updateCounters);
        el.shareText.addEventListener("input", updateCounters);
        el.lockToggle.addEventListener("change", function () {
          el.pinFieldWrap.classList.toggle("hidden", !el.lockToggle.checked);
          if (el.lockToggle.checked) window.setTimeout(function () { el.sharePin.focus(); }, 60);
          else el.sharePin.value = "";
        });
        el.joinCode.addEventListener("input", function () {
          el.joinCode.value = normalizeCode(el.joinCode.value);
        });

        document.addEventListener("click", function (event) {
          var actionElement = event.target.closest("[data-action]");
          if (!actionElement) return;
          var action = actionElement.getAttribute("data-action");

          if (action === "focus-create") focusSection("create-card", "share-title");
          if (action === "focus-join") focusSection("join-card", "join-code");
          if (action === "focus-notes") focusSection("notes-section", "notes-search");
          if (action === "focus-files") focusSection("files-card", "file-title");
          if (action === "refresh-items") loadLocalItems(true);
          if (action === "refresh-files") loadLocalFiles(true);
          if (action === "open-scanner") {
            if (el.drawer.classList.contains("open")) closeDrawer();
            openScanner();
          }
          if (action === "close-scanner") closeScanner();
          if (action === "close-item-modal") closeItemModal();
          if (action === "close-file-modal") closeFileModal();
          if (action === "close-qr-modal") closeQrModal();
          if (action === "toggle-create-pin") togglePassword(el.sharePin);
          if (action === "copy-text") copyText(state.currentItem && state.currentItem.text, "Text copied.");
          if (action === "show-current-qr") showQrForCurrentItem();
          if (action === "show-current-file-qr") showQrForCurrentFile();
          if (action === "download-qrtool") downloadQrToolPng();
          if (action === "copy-link") copyText(el.qrLinkInput.value, "Share link copied.");
          if (action === "copy-code") copyText(el.qrCodeText.textContent, "Share code copied.");
          if (action === "delete-current-item") deleteCurrentItem();
          if (action === "delete-current-file") deleteCurrentFile();
          if (action === "toggle-theme") toggleTheme();
          if (action === "open-drawer") openDrawer();
          if (action === "open-drawer-section") {
            openDrawer(actionElement.getAttribute("data-drawer-target"));
          }
          if (action === "close-drawer") closeDrawer();
          if (action === "refresh-page") window.location.reload();
          if (action === "drawer-create") {
            closeDrawer();
            focusSection("create-card", "share-title");
          }
          if (action === "drawer-join") {
            closeDrawer();
            focusSection("join-card", "join-code");
          }

          var itemId = actionElement.getAttribute("data-item-id");
          if (action === "open-local-item" && itemId) openLocalItem(itemId);
          if (action === "share-local-item" && itemId) showQrForListItem(itemId);

          var fileId = actionElement.getAttribute("data-file-id");
          if (action === "open-local-file" && fileId) openLocalFile(fileId);
          if (action === "share-local-file" && fileId) showQrForListFile(fileId);

          var adminItemId = actionElement.getAttribute("data-admin-item-id");
          if (action === "admin-delete-note" && adminItemId) adminDeleteNote(adminItemId);
          var adminFileId = actionElement.getAttribute("data-admin-file-id");
          if (action === "admin-delete-file" && adminFileId) adminDeleteFile(adminFileId);
          var feedbackId = actionElement.getAttribute("data-feedback-id");
          if (action === "admin-feedback-status" && feedbackId) {
            updateFeedbackStatus(feedbackId, actionElement.getAttribute("data-feedback-status"));
          }
          if (action === "admin-delete-feedback" && feedbackId) deleteFeedback(feedbackId);

          var targetUserId = actionElement.getAttribute("data-user-id");
          if (action === "admin-toggle-user-status" && targetUserId) {
            toggleUserStatus(targetUserId, actionElement.getAttribute("data-user-status"));
          }
          if (action === "admin-delete-user" && targetUserId) deleteAdminUser(targetUserId);

          var targetRoleId = actionElement.getAttribute("data-role-id");
          if (action === "admin-save-role" && targetRoleId) saveRole(targetRoleId);
        });

        [el.itemModal, el.fileModal, el.qrModal, el.scannerModal].forEach(function (modal) {
          modal.addEventListener("click", function (event) {
            if (event.target !== modal) return;
            if (modal === el.itemModal) closeItemModal();
            if (modal === el.fileModal) closeFileModal();
            if (modal === el.qrModal) closeQrModal();
            if (modal === el.scannerModal) closeScanner();
          });
        });

        document.addEventListener("keydown", function (event) {
          if (event.key !== "Escape") return;
          if (!el.scannerModal.classList.contains("hidden")) closeScanner();
          else if (!el.qrModal.classList.contains("hidden")) closeQrModal();
          else if (!el.fileModal.classList.contains("hidden")) closeFileModal();
          else if (!el.itemModal.classList.contains("hidden")) closeItemModal();
          else if (el.drawer.classList.contains("open")) closeDrawer();
        });
      }

      async function createShare(event) {
        event.preventDefault();
        if (APP.maintenanceMode || !APP.notesEnabled) {
          return toast("New notes are currently disabled.", "error");
        }

        var title = el.shareTitle.value.trim();
        var text = el.shareText.value.trim();
        var locked = APP.pinEnabled && el.lockToggle.checked;
        var pin = el.sharePin.value.trim();

        if (!title) return fieldError(el.shareTitle, "Add a title.");
        if (!text) return fieldError(el.shareText, "Add some text to share.");
        if (locked && (pin.length < APP.minPinLength || pin.length > APP.maxPinLength)) {
          return fieldError(el.sharePin, "PIN must be " + APP.minPinLength + "–" + APP.maxPinLength + " characters.");
        }

        setButtonLoading(el.createSubmit, true, "Creating share…");

        try {
          var response = await apiFetch("/api/items", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: title, text: text, locked: locked, pin: pin })
          });

          saveDeleteToken(response.item.id, response.deleteToken);
          upsertLocalItem(response.item, true);
          renderLocalItems();
          el.lastRefreshed.textContent = "Added just now";
          resetCreateForm();
          showQr(response.item.code, response.shareUrl);
          toast("Note created instantly. It expires in " + formatDuration(APP.ttlSeconds) + ".", "success");
        } catch (error) {
          toast(error.message || "Unable to create share.", "error");
        } finally {
          setButtonLoading(el.createSubmit, false, APP.createButtonText);
        }
      }

      async function loadLocalItems(showFeedback) {
        if (el.refreshButton.disabled) return;
        el.refreshButton.disabled = true;
        var icon = el.refreshButton.querySelector("[data-refresh-icon]");
        if (icon) icon.classList.add("animate-spin");

        try {
          var response = await apiFetch("/api/local/items");
          state.items = reconcileLocalItems(Array.isArray(response.items) ? response.items : []);
          renderLocalItems();
          el.lastRefreshed.textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          if (showFeedback) toast("Local board refreshed.", "success");
        } catch (error) {
          el.boardLoading.classList.add("hidden");
          if (showFeedback || state.items.length === 0) toast(error.message || "Unable to load the local board.", "error");
        } finally {
          el.refreshButton.disabled = false;
          if (icon) icon.classList.remove("animate-spin");
        }
      }

      function renderLocalItems() {
        var now = Date.now();
        state.items = state.items.filter(function (item) { return Number(item.expiresAt) > now; });
        var query = String(el.notesSearch.value || "").trim().toLowerCase();
        var filter = el.notesFilter.value || "all";
        var visibleItems = state.items.filter(function (item) {
          var matchesText = !query || String(item.title || "").toLowerCase().indexOf(query) !== -1 ||
            String(item.code || "").toLowerCase().indexOf(query) !== -1;
          var matchesFilter = filter === "all" ||
            (filter === "mine" && item.source === "mine") ||
            (filter === "received" && item.source === "received") ||
            (filter === "open" && !item.locked) ||
            (filter === "locked" && item.locked);
          return matchesText && matchesFilter;
        });

        el.boardLoading.classList.add("hidden");
        el.itemCount.textContent = state.items.length + (state.items.length === 1 ? " item" : " items");
        updateActiveCountBadge();
        el.boardList.textContent = "";

        if (visibleItems.length === 0) {
          el.boardList.classList.add("hidden");
          el.boardEmpty.classList.remove("hidden");
          var emptyText = el.boardEmpty.querySelector("p");
          if (emptyText) emptyText.textContent = state.items.length ? "No notes match this view." : APP.availableEmptyText;
          return;
        }

        el.boardEmpty.classList.add("hidden");
        el.boardList.classList.remove("hidden");

        visibleItems.forEach(function (item) {
          var card = document.createElement("article");
          card.className = "note-row";

          var titleWrap = document.createElement("div");
          titleWrap.className = "note-main";

          var meta = document.createElement("div");
          meta.className = "note-meta";
          var sourceBadge = document.createElement("span");
          sourceBadge.className = "note-badge";
          sourceBadge.textContent = item.source === "received" ? "Received" : "Mine";
          var lockBadge = document.createElement("span");
          lockBadge.className = "note-badge";
          lockBadge.textContent = item.locked ? "PIN locked" : "Open";
          meta.appendChild(sourceBadge);
          meta.appendChild(lockBadge);
          var sharedByBadge = buildSharedByBadge(item.sharedBy);
          if (sharedByBadge) meta.appendChild(sharedByBadge);

          var title = document.createElement("h3");
          title.className = "note-title";
          title.textContent = item.title;

          var expiry = document.createElement("span");
          expiry.className = "note-expiry";
          expiry.setAttribute("data-expires", String(item.expiresAt));
          expiry.textContent = formatRemaining(item.expiresAt);

          titleWrap.appendChild(meta);
          titleWrap.appendChild(title);
          titleWrap.appendChild(expiry);

          var actions = document.createElement("div");
          actions.className = "note-actions";

          var openButton = document.createElement("button");
          openButton.type = "button";
          openButton.setAttribute("data-action", "open-local-item");
          openButton.setAttribute("data-item-id", item.id);
          openButton.className = "primary-action px-4 py-2 text-xs font-semibold";
          openButton.textContent = item.locked ? "Enter PIN" : "Open";

          var qrButton = document.createElement("button");
          qrButton.type = "button";
          qrButton.setAttribute("data-action", "share-local-item");
          qrButton.setAttribute("data-item-id", item.id);
          qrButton.className = "icon-button";
          qrButton.setAttribute("aria-label", "Show share code and QR");
          qrButton.innerHTML = '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7h.01M17 7h.01M7 17h.01"/><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v6h-2zM14 18h2v2h-2z"/></svg>';

          actions.appendChild(openButton);
          actions.appendChild(qrButton);
          card.appendChild(titleWrap);
          card.appendChild(actions);
          el.boardList.appendChild(card);
        });
      }

      async function openLocalItem(itemId) {
        state.currentSource = "local";
        state.currentCode = null;
        state.currentVia = "network";
        openItemModal();

        try {
          var response = await apiFetch("/api/local/item/" + encodeURIComponent(itemId));
          showItemResponse(response.item, "local", null);
        } catch (error) {
          showModalError(error.message || "Unable to open this item.");
        }
      }

      async function openAnyShareByCode(rawCode, updateUrl, via) {
        var code = normalizeCode(rawCode);
        if (!code) return toast("Invalid share code.", "error");
        try {
          var probe = await apiFetch("/api/share/" + encodeURIComponent(code) + "?via=" + encodeURIComponent(via || "link"));
          state.currentSource = "share";
          state.currentCode = code;
          state.currentVia = via;
          el.joinCode.value = code;
          openItemModal();
          if (updateUrl && window.location.pathname !== "/s/" + code) {
            window.history.pushState({}, "", "/s/" + code);
          }
          showItemResponse(probe.item, "share", code);
        } catch (error) {
          if (error.code === "CODE_NOT_FOUND") {
            return openFileShareByCode(code, updateUrl, via);
          }
          state.currentSource = "share";
          state.currentCode = code;
          el.joinCode.value = code;
          openItemModal();
          showModalError(error.message || "Unable to open this share code.");
        }
      }

      async function openShareByCode(rawCode, updateUrl, via) {
        var code = normalizeCode(rawCode);
        if (!code) return toast("Invalid share code.", "error");
        via = via === "qr" || via === "code" ? via : "link";

        state.currentSource = "share";
        state.currentCode = code;
        state.currentVia = via;
        el.joinCode.value = code;
        openItemModal();

        if (updateUrl && window.location.pathname !== "/s/" + code) {
          window.history.pushState({}, "", "/s/" + code);
        }

        try {
          var response = await apiFetch("/api/share/" + encodeURIComponent(code) + "?via=" + encodeURIComponent(via));
          showItemResponse(response.item, "share", code);
        } catch (error) {
          showModalError(error.message || "Unable to open this share code.");
        }
      }

      function showItemResponse(item, source, code) {
        state.currentItem = item;
        state.currentSource = source;
        state.currentCode = code || item.code;

        el.modalLoading.classList.add("hidden");
        el.modalError.classList.add("hidden");
        el.modalTitle.textContent = item.title;
        el.modalExpiry.setAttribute("data-expires", String(item.expiresAt));
        el.modalExpiry.textContent = formatRemaining(item.expiresAt);
        setLockBadge(item.locked);

        if (typeof item.text === "string") {
          el.unlockForm.classList.add("hidden");
          el.modalContent.classList.remove("hidden");
          if (item.sharedBy) {
            el.modalSharedBy.textContent = "Shared by " + item.sharedBy.name + " · " + item.sharedBy.role;
            el.modalSharedBy.classList.remove("hidden");
          } else {
            el.modalSharedBy.classList.add("hidden");
          }
          renderLinkedText(el.modalText, item.text);
          updateDeleteButton(item.id);
          if (source === "share") {
            upsertLocalItem(Object.assign({}, item, {
              source: getDeleteToken(item.id) ? "mine" : "received",
              addedAt: Date.now()
            }), true);
            renderLocalItems();
            el.lastRefreshed.textContent = "Added just now";
          }
        } else {
          el.modalContent.classList.add("hidden");
          el.unlockForm.classList.remove("hidden");
          el.unlockPin.value = "";
          window.setTimeout(function () { el.unlockPin.focus(); }, 120);
        }
      }

      async function unlockCurrentItem(event) {
        event.preventDefault();
        if (!state.currentItem) return;

        var pin = el.unlockPin.value.trim();
        if (!pin) return fieldError(el.unlockPin, "Enter the PIN.");

        el.unlockSubmit.disabled = true;
        el.unlockSubmit.textContent = "Checking PIN…";

        var path = state.currentSource === "local"
          ? "/api/local/item/" + encodeURIComponent(state.currentItem.id) + "/unlock"
          : "/api/share/" + encodeURIComponent(state.currentCode) + "/unlock?via=" + encodeURIComponent(state.currentVia || "link");

        try {
          var response = await apiFetch(path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pin: pin })
          });
          showItemResponse(response.item, state.currentSource, state.currentCode);
          toast("Text unlocked.", "success");
        } catch (error) {
          toast(error.message || "Unable to unlock text.", "error");
          el.unlockPin.select();
        } finally {
          el.unlockSubmit.disabled = false;
          el.unlockSubmit.textContent = "Unlock text";
        }
      }

      async function deleteCurrentItem() {
        if (!state.currentItem) return;
        var token = getDeleteToken(state.currentItem.id);
        if (!token) return toast("This browser does not own the delete token.", "error");
        if (!window.confirm("Delete this share now? This cannot be undone.")) return;

        el.deleteButton.disabled = true;
        try {
          await apiFetch("/api/item/" + encodeURIComponent(state.currentItem.id), {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ deleteToken: token })
          });
          removeDeleteToken(state.currentItem.id);
          delete state.optimisticItems[state.currentItem.id];
          state.items = state.items.filter(function (item) { return item.id !== state.currentItem.id; });
          renderLocalItems();
          closeItemModal();
          toast("Share deleted.", "success");
        } catch (error) {
          toast(error.message || "Unable to delete share.", "error");
        } finally {
          el.deleteButton.disabled = false;
        }
      }

      function openItemModal() {
        state.currentItem = null;
        el.modalTitle.textContent = "Opening share";
        el.modalLoading.classList.remove("hidden");
        el.modalError.classList.add("hidden");
        el.modalContent.classList.add("hidden");
        el.unlockForm.classList.add("hidden");
        el.deleteButton.classList.add("hidden");
        el.deleteButton.classList.remove("inline-flex");
        el.itemModal.classList.remove("hidden");
        el.itemModal.classList.add("flex");
        el.itemModal.setAttribute("aria-hidden", "false");
        lockBodyScroll();
      }

      function closeItemModal() {
        el.itemModal.classList.add("hidden");
        el.itemModal.classList.remove("flex");
        el.itemModal.setAttribute("aria-hidden", "true");
        state.currentItem = null;
        state.currentSource = null;
        state.currentCode = null;
        state.currentVia = null;
        unlockBodyScrollIfClear();
        if (/^\/s\//.test(window.location.pathname)) window.history.pushState({}, "", "/");
      }

      function showModalError(message) {
        el.modalLoading.classList.add("hidden");
        el.unlockForm.classList.add("hidden");
        el.modalContent.classList.add("hidden");
        el.modalError.textContent = message;
        el.modalError.classList.remove("hidden");
        el.modalTitle.textContent = "Unable to open share";
        setLockBadge(false, true);
      }

      function setLockBadge(locked, error) {
        el.modalLockBadge.className = "rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider";
        if (error) {
          el.modalLockBadge.classList.add("border-red-500/25", "bg-red-500/5", "text-red-300");
          el.modalLockBadge.textContent = "Unavailable";
        } else if (locked) {
          el.modalLockBadge.classList.add("border-violet-500/25", "bg-violet-500/10", "text-violet-300");
          el.modalLockBadge.textContent = "PIN locked";
        } else {
          el.modalLockBadge.classList.add("border-white/10", "bg-white/[.03]", "text-neutral-400");
          el.modalLockBadge.textContent = "Open text";
        }
      }

      function updateDeleteButton(itemId) {
        var token = getDeleteToken(itemId);
        el.deleteButton.classList.toggle("hidden", !token);
        el.deleteButton.classList.toggle("inline-flex", Boolean(token));
      }

      function showQrForCurrentItem() {
        if (!state.currentItem || !state.currentItem.code) return;
        showQr(state.currentItem.code, window.location.origin + "/s/" + state.currentItem.code);
      }

      function showQrForListItem(itemId) {
        var item = state.items.find(function (entry) { return entry.id === itemId; });
        if (!item) return toast("Share not found in the current board.", "error");
        showQr(item.code, window.location.origin + "/s/" + item.code);
      }

      /* ---------------------------------------------------------------- */
      /* File sharing (temporary, no account required)                    */
      /* ---------------------------------------------------------------- */

      async function createFileShare(event) {
        event.preventDefault();
        if (APP.maintenanceMode || !APP.fileSharingEnabled) {
          return toast("File sharing is currently disabled.", "error");
        }
        var files = el.fileInput.files ? Array.from(el.fileInput.files) : [];
        if (!files.length) return toast("Choose at least one file to share.", "error");

        var maxFileBytes = (APP.maxFileSizeMB || 2) * 1024 * 1024;
        var maxBatchBytes = (APP.maxBatchTotalMB || 30) * 1024 * 1024;
        var maxFiles = APP.maxFilesPerBatch || 15;
        if (files.length > maxFiles) {
          return toast("You can attach up to " + maxFiles + " files per share.", "error");
        }
        var total = 0;
        for (var i = 0; i < files.length; i += 1) {
          total += files[i].size;
          if (files[i].size > maxFileBytes) {
            return toast("Each file must be " + (APP.maxFileSizeMB || 2) + "MB or smaller (\"" + files[i].name + "\" is too large).", "error");
          }
        }
        if (total > maxBatchBytes) {
          return toast("This upload totals more than the " + (APP.maxBatchTotalMB || 30) + "MB batch limit.", "error");
        }

        var locked = APP.pinEnabled && el.fileLockToggle.checked;
        var pin = el.filePin.value.trim();
        if (locked && (pin.length < APP.minPinLength || pin.length > APP.maxPinLength)) {
          return fieldError(el.filePin, "PIN must be " + APP.minPinLength + "–" + APP.maxPinLength + " characters.");
        }

        var form = new FormData();
        files.forEach(function (file) { form.append("file", file); });
        form.append("title", el.fileTitle.value.trim());
        form.append("locked", locked ? "1" : "0");
        if (locked) form.append("pin", pin);

        setButtonLoading(el.fileUploadSubmit, true, "Uploading…");
        try {
          var response = await apiFetch("/api/files", { method: "POST", body: form });
          saveDeleteToken("file:" + response.group.id, response.deleteToken);
          upsertLocalFile(response.group);
          renderFilesBoard();
          resetFileUploadForm();
          showQr(response.group.code, response.shareUrl);
          toast(response.message || "Uploaded.", "success");
        } catch (error) {
          toast(error.message || "Unable to upload the file.", "error");
        } finally {
          setButtonLoading(el.fileUploadSubmit, false, APP.filesUploadButtonText || "Upload file");
        }
      }

      function resetFileUploadForm() {
        el.fileUploadForm.reset();
        el.fileInputName.textContent = "";
        el.filePinFieldWrap.classList.add("hidden");
        renderStagedFiles();
      }

      function renderStagedFiles() {
        var files = el.fileInput.files ? Array.from(el.fileInput.files) : [];
        el.fileInputName.textContent = files.length === 1 ? files[0].name : files.length ? files.length + " files selected" : "";
        el.stagedFilesList.textContent = "";

        if (!files.length) {
          el.stagedFilesList.classList.add("hidden");
          el.stagedFilesTotal.classList.add("hidden");
          return;
        }

        var total = 0;
        files.forEach(function (file) {
          total += file.size;
          var row = document.createElement("div");
          row.className = "flex items-center justify-between gap-3";
          var name = document.createElement("span");
          name.className = "truncate";
          name.textContent = file.name;
          var size = document.createElement("span");
          size.className = "shrink-0 text-neutral-600";
          size.textContent = formatBytes(file.size);
          row.appendChild(name);
          row.appendChild(size);
          el.stagedFilesList.appendChild(row);
        });
        el.stagedFilesList.classList.remove("hidden");

        var maxBatchMB = APP.maxBatchTotalMB || 30;
        var maxFiles = APP.maxFilesPerBatch || 15;
        el.stagedFilesTotal.textContent = files.length + " file" + (files.length === 1 ? "" : "s") + " · " +
          formatBytes(total) + " of " + maxBatchMB + "MB max, up to " + maxFiles + " files";
        el.stagedFilesTotal.classList.remove("hidden");
        el.stagedFilesTotal.classList.toggle("text-red-400", total > maxBatchMB * 1024 * 1024 || files.length > maxFiles);
      }

      function upsertLocalFile(file) {
        state.files = state.files.filter(function (entry) { return entry.id !== file.id; });
        state.files.unshift(file);
      }

      async function loadLocalFiles(showFeedback) {
        if (!el.filesRefreshButton) return;
        if (el.filesRefreshButton.disabled) return;
        el.filesRefreshButton.disabled = true;
        try {
          var response = await apiFetch("/api/local/files");
          var now = Date.now();
          state.files = (Array.isArray(response.files) ? response.files : [])
            .filter(function (item) { return Number(item.expiresAt) > now; });
          renderFilesBoard();
          if (showFeedback) toast("Files board refreshed.", "success");
        } catch (error) {
          if (showFeedback) toast(error.message || "Unable to load shared files.", "error");
        } finally {
          el.filesRefreshButton.disabled = false;
        }
      }

      function renderFilesBoard() {
        if (!el.filesBoardList) return;
        var now = Date.now();
        state.files = state.files.filter(function (item) { return Number(item.expiresAt) > now; });
        updateActiveCountBadge();
        el.filesBoardList.textContent = "";

        if (!state.files.length) {
          el.filesBoardList.classList.add("hidden");
          el.filesBoardEmpty.classList.remove("hidden");
          return;
        }
        el.filesBoardEmpty.classList.add("hidden");
        el.filesBoardList.classList.remove("hidden");

        state.files.forEach(function (item) {
          var card = document.createElement("article");
          card.className = "note-row";

          var titleWrap = document.createElement("div");
          titleWrap.className = "note-main";

          var meta = document.createElement("div");
          meta.className = "note-meta";
          var sourceBadge = document.createElement("span");
          sourceBadge.className = "note-badge";
          sourceBadge.textContent = item.source === "received" ? "Received" : "Mine";
          var lockBadge = document.createElement("span");
          lockBadge.className = "note-badge";
          lockBadge.textContent = item.locked ? "PIN locked" : "Open";
          var sizeBadge = document.createElement("span");
          sizeBadge.className = "note-badge";
          sizeBadge.textContent = (item.fileCount > 1 ? item.fileCount + " files · " : "") + formatBytes(item.totalSizeBytes);
          meta.appendChild(sourceBadge);
          meta.appendChild(lockBadge);
          meta.appendChild(sizeBadge);
          var sharedByBadge = buildSharedByBadge(item.sharedBy);
          if (sharedByBadge) meta.appendChild(sharedByBadge);

          var title = document.createElement("h3");
          title.className = "note-title";
          title.textContent = item.title;

          var expiry = document.createElement("span");
          expiry.className = "note-expiry";
          expiry.setAttribute("data-expires", String(item.expiresAt));
          expiry.textContent = formatRemaining(item.expiresAt);

          titleWrap.appendChild(meta);
          titleWrap.appendChild(title);
          titleWrap.appendChild(expiry);

          var actions = document.createElement("div");
          actions.className = "note-actions";

          var openButton = document.createElement("button");
          openButton.type = "button";
          openButton.setAttribute("data-action", "open-local-file");
          openButton.setAttribute("data-file-id", item.id);
          openButton.className = "primary-action px-4 py-2 text-xs font-semibold";
          openButton.textContent = item.locked ? "Enter PIN" : "Open";

          var qrButton = document.createElement("button");
          qrButton.type = "button";
          qrButton.setAttribute("data-action", "share-local-file");
          qrButton.setAttribute("data-file-id", item.id);
          qrButton.className = "icon-button";
          qrButton.setAttribute("aria-label", "Show share code and QR");
          qrButton.innerHTML = '<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7h.01M17 7h.01M7 17h.01"/><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v6h-2zM14 18h2v2h-2z"/></svg>';

          actions.appendChild(openButton);
          actions.appendChild(qrButton);
          card.appendChild(titleWrap);
          card.appendChild(actions);
          el.filesBoardList.appendChild(card);
        });
      }

      async function openLocalFile(fileId) {
        state.currentFileCode = null;
        openFileModal();
        try {
          var response = await apiFetch("/api/local/file/" + encodeURIComponent(fileId));
          showFileResponse(response.group, "local", null);
        } catch (error) {
          showFileModalError(error.message || "Unable to open this file.");
        }
      }

      async function openFileShareByCode(rawCode, updateUrl, via) {
        var code = normalizeCode(rawCode);
        if (!code) return toast("Invalid share code.", "error");
        via = via === "qr" || via === "code" ? via : "link";

        state.currentFileCode = code;
        openFileModal();

        if (updateUrl && window.location.pathname !== "/f/" + code) {
          window.history.pushState({}, "", "/f/" + code);
        }

        try {
          var response = await apiFetch("/api/share/file/" + encodeURIComponent(code) + "?via=" + encodeURIComponent(via));
          showFileResponse(response.group, "share", code);
        } catch (error) {
          showFileModalError(error.message || "Unable to open this share code.");
        }
      }

      function showFileResponse(group, source, code) {
        state.currentFile = group;
        state.currentFileCode = code || group.code;

        el.fileModalLoading.classList.add("hidden");
        el.fileModalError.classList.add("hidden");
        el.fileModalTitle.textContent = group.title;
        el.fileModalExpiry.setAttribute("data-expires", String(group.expiresAt));
        el.fileModalExpiry.textContent = formatRemaining(group.expiresAt);
        setFileLockBadge(group.locked);

        var isUnlocked = group.files && group.files.length && group.files[0].downloadUrl;
        if (isUnlocked) {
          el.fileUnlockForm.classList.add("hidden");
          el.fileModalContent.classList.remove("hidden");
          if (group.sharedBy) {
            el.fileModalSharedBy.textContent = "Shared by " + group.sharedBy.name + " · " + group.sharedBy.role;
            el.fileModalSharedBy.classList.remove("hidden");
          } else {
            el.fileModalSharedBy.classList.add("hidden");
          }
          renderFileModalList(group.files);
          updateFileDeleteButton(group.id);
          if (source === "share") {
            upsertLocalFile(Object.assign({}, group, {
              source: getDeleteToken("file:" + group.id) ? "mine" : "received",
              addedAt: Date.now()
            }));
            renderFilesBoard();
          }
        } else {
          el.fileModalContent.classList.add("hidden");
          el.fileUnlockForm.classList.remove("hidden");
          el.fileUnlockPin.value = "";
          window.setTimeout(function () { el.fileUnlockPin.focus(); }, 120);
        }
      }

      function renderFileModalList(files) {
        el.fileModalList.textContent = "";
        files.forEach(function (file) {
          var row = document.createElement("div");
          row.className = "flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-white/[.07] bg-black/20 p-4";
          var info = document.createElement("div");
          info.className = "min-w-0";
          var name = document.createElement("p");
          name.className = "truncate text-sm text-slate-200";
          name.textContent = file.filename;
          var meta = document.createElement("p");
          meta.className = "mt-1 text-xs text-neutral-500";
          meta.textContent = formatBytes(file.sizeBytes) + " · " + file.downloadCount + " downloads";
          info.appendChild(name);
          info.appendChild(meta);
          var download = document.createElement("a");
          download.href = file.downloadUrl;
          download.setAttribute("download", file.filename);
          download.className = "shrink-0 rounded-md bg-violet-500 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-violet-400";
          download.textContent = "Download";
          row.appendChild(info);
          row.appendChild(download);
          el.fileModalList.appendChild(row);
        });
      }

      async function unlockCurrentFile(event) {
        event.preventDefault();
        if (!state.currentFile) return;
        var pin = el.fileUnlockPin.value.trim();
        if (!pin) return fieldError(el.fileUnlockPin, "Enter the PIN.");

        el.fileUnlockSubmit.disabled = true;
        el.fileUnlockSubmit.textContent = "Checking PIN…";

        var path = state.currentFile && !state.currentFileCode
          ? "/api/local/file/" + encodeURIComponent(state.currentFile.id) + "/unlock"
          : "/api/share/file/" + encodeURIComponent(state.currentFileCode) + "/unlock";

        try {
          var response = await apiFetch(path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pin: pin })
          });
          showFileResponse(response.group, state.currentFileCode ? "share" : "local", state.currentFileCode);
          toast("File unlocked.", "success");
        } catch (error) {
          toast(error.message || "Unable to unlock file.", "error");
          el.fileUnlockPin.select();
        } finally {
          el.fileUnlockSubmit.disabled = false;
          el.fileUnlockSubmit.textContent = "Unlock";
        }
      }

      async function deleteCurrentFile() {
        if (!state.currentFile) return;
        var token = getDeleteToken("file:" + state.currentFile.id);
        if (!token) return toast("This browser does not own the delete token.", "error");
        if (!window.confirm("Delete this file now? This cannot be undone.")) return;

        el.deleteFileButton.disabled = true;
        try {
          await apiFetch("/api/file/" + encodeURIComponent(state.currentFile.id), {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ deleteToken: token })
          });
          removeDeleteToken("file:" + state.currentFile.id);
          state.files = state.files.filter(function (item) { return item.id !== state.currentFile.id; });
          renderFilesBoard();
          closeFileModal();
          toast("File deleted.", "success");
        } catch (error) {
          toast(error.message || "Unable to delete file.", "error");
        } finally {
          el.deleteFileButton.disabled = false;
        }
      }

      function openFileModal() {
        state.currentFile = null;
        el.fileModalTitle.textContent = "Opening file";
        el.fileModalLoading.classList.remove("hidden");
        el.fileModalError.classList.add("hidden");
        el.fileModalContent.classList.add("hidden");
        el.fileUnlockForm.classList.add("hidden");
        el.deleteFileButton.classList.add("hidden");
        el.deleteFileButton.classList.remove("inline-flex");
        el.fileModal.classList.remove("hidden");
        el.fileModal.classList.add("flex");
        el.fileModal.setAttribute("aria-hidden", "false");
        lockBodyScroll();
      }

      function closeFileModal() {
        el.fileModal.classList.add("hidden");
        el.fileModal.classList.remove("flex");
        el.fileModal.setAttribute("aria-hidden", "true");
        state.currentFile = null;
        state.currentFileCode = null;
        unlockBodyScrollIfClear();
        if (/^\/f\//.test(window.location.pathname)) window.history.pushState({}, "", "/");
      }

      function showFileModalError(message) {
        el.fileModalLoading.classList.add("hidden");
        el.fileUnlockForm.classList.add("hidden");
        el.fileModalContent.classList.add("hidden");
        el.fileModalError.textContent = message;
        el.fileModalError.classList.remove("hidden");
        el.fileModalTitle.textContent = "Unable to open file";
        setFileLockBadge(false, true);
      }

      function setFileLockBadge(locked, error) {
        el.fileModalLockBadge.className = "rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider";
        if (error) {
          el.fileModalLockBadge.classList.add("border-red-500/25", "bg-red-500/5", "text-red-300");
          el.fileModalLockBadge.textContent = "Unavailable";
        } else if (locked) {
          el.fileModalLockBadge.classList.add("border-violet-500/25", "bg-violet-500/10", "text-violet-300");
          el.fileModalLockBadge.textContent = "PIN locked";
        } else {
          el.fileModalLockBadge.classList.add("border-white/10", "bg-white/[.03]", "text-neutral-400");
          el.fileModalLockBadge.textContent = "Open file";
        }
      }

      function updateFileDeleteButton(fileId) {
        var token = getDeleteToken("file:" + fileId);
        el.deleteFileButton.classList.toggle("hidden", !token);
        el.deleteFileButton.classList.toggle("inline-flex", Boolean(token));
      }

      function showQrForCurrentFile() {
        if (!state.currentFile || !state.currentFile.code) return;
        showQr(state.currentFile.code, window.location.origin + "/f/" + state.currentFile.code);
      }

      function showQrForListFile(fileId) {
        var item = state.files.find(function (entry) { return entry.id === fileId; });
        if (!item) return toast("Shared file not found on this board.", "error");
        showQr(item.code, window.location.origin + "/f/" + item.code);
      }

      /* ---------------------------------------------------------------- */
      /* Standalone QR generator for links (client-side only)             */
      /* ---------------------------------------------------------------- */

      async function generateLinkQrTool(event) {
        event.preventDefault();
        var raw = el.qrtoolInput.value.trim();
        if (!raw) return fieldError(el.qrtoolInput, "Paste a link first.");
        var href = toSafeLinkHref(raw);
        if (!href) return fieldError(el.qrtoolInput, "Enter a valid http(s) link.");

        el.qrtoolOutput.textContent = "";
        try {
          await ensureScript("/vendor/qrcode.min.js", "QRCode");
        } catch (error) {}

        if (typeof window.QRCode === "function") {
          new window.QRCode(el.qrtoolOutput, {
            text: href,
            width: 220,
            height: 220,
            colorDark: "#11120f",
            colorLight: "#ffffff",
            correctLevel: window.QRCode.CorrectLevel.H
          });
          el.qrtoolOutputWrap.classList.remove("hidden");
        } else {
          toast("QR library did not load. Please try again.", "error");
        }
      }

      function downloadQrToolPng() {
        var canvas = el.qrtoolOutput.querySelector("canvas");
        if (!canvas) return toast("Generate a QR code first.", "error");
        var link = document.createElement("a");
        link.download = "qr-code.png";
        link.href = canvas.toDataURL("image/png");
        link.click();
      }

      async function showQr(code, link) {
        state.qrCode = code;
        el.qrCodeText.textContent = code;
        el.qrLinkInput.value = link;
        el.qrOutput.textContent = "";

        try {
          await ensureScript("/vendor/qrcode.min.js", "QRCode");
        } catch (error) {}

        if (typeof window.QRCode === "function") {
          new window.QRCode(el.qrOutput, {
            text: link + (link.indexOf("?") === -1 ? "?via=qr" : "&via=qr"),
            width: 220,
            height: 220,
            colorDark: "#11120f",
            colorLight: "#ffffff",
            correctLevel: window.QRCode.CorrectLevel.H
          });
        } else {
          var message = document.createElement("p");
          message.className = "py-12 text-center text-sm text-neutral-600";
          message.textContent = "QR library did not load. Copy the link below instead.";
          el.qrOutput.appendChild(message);
        }

        el.qrModal.classList.remove("hidden");
        el.qrModal.classList.add("flex");
        el.qrModal.setAttribute("aria-hidden", "false");
        lockBodyScroll();
      }

      function closeQrModal() {
        el.qrModal.classList.add("hidden");
        el.qrModal.classList.remove("flex");
        el.qrModal.setAttribute("aria-hidden", "true");
        unlockBodyScrollIfClear();
      }

      async function openScanner() {
        el.scannerModal.classList.remove("hidden");
        el.scannerModal.classList.add("flex");
        el.scannerModal.setAttribute("aria-hidden", "false");
        lockBodyScroll();
        el.scannerStatus.textContent = "Starting camera…";

        try {
          await ensureScript("/vendor/html5-qrcode.min.js", "Html5Qrcode");
        } catch (error) {}

        if (typeof window.Html5Qrcode !== "function") {
          el.scannerStatus.textContent = "Scanner library did not load. Enter the code manually.";
          return;
        }

        if (state.scannerRunning) return;

        try {
          state.scanner = new window.Html5Qrcode("qr-reader");
          state.scannerRunning = true;
          await state.scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
            function (decodedText) { handleScannedValue(decodedText); },
            function () {}
          );
          el.scannerStatus.textContent = "Point the camera at the QR code.";
        } catch (error) {
          console.error(error);
          state.scannerRunning = false;
          el.scannerStatus.textContent = "Camera could not start. Check permission or enter the code manually.";
        }
      }

      async function closeScanner() {
        if (state.scanner && state.scannerRunning) {
          try { await state.scanner.stop(); } catch (error) { console.warn(error); }
          try { await state.scanner.clear(); } catch (error) { console.warn(error); }
        }
        state.scanner = null;
        state.scannerRunning = false;
        document.getElementById("qr-reader").textContent = "";
        el.scannerModal.classList.add("hidden");
        el.scannerModal.classList.remove("flex");
        el.scannerModal.setAttribute("aria-hidden", "true");
        unlockBodyScrollIfClear();
      }

      async function handleScannedValue(decodedText) {
        var scanned = extractCodeFromScan(decodedText);
        if (!scanned.code) {
          el.scannerStatus.textContent = "That QR does not contain a valid share code.";
          return;
        }
        await closeScanner();
        if (scanned.kind === "file") {
          openFileShareByCode(scanned.code, true, "qr");
        } else if (scanned.kind === "note") {
          openShareByCode(scanned.code, true, "qr");
        } else {
          openAnyShareByCode(scanned.code, true, "qr");
        }
      }

      function ensureScript(src, globalName) {
        if (window[globalName]) return Promise.resolve();
        return new Promise(function (resolve, reject) {
          var existing = document.querySelector('script[data-airtext-src="' + src + '"]');
          if (existing) {
            existing.addEventListener("load", resolve, { once: true });
            existing.addEventListener("error", reject, { once: true });
            return;
          }
          var script = document.createElement("script");
          script.src = src;
          script.async = true;
          script.setAttribute("data-airtext-src", src);
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      function extractCodeFromScan(value) {
        var text = String(value || "").trim();
        try {
          var parsed = new URL(text, window.location.origin);
          var noteMatch = parsed.pathname.match(/^\/s\/([A-Za-z0-9]{4,12})\/?$/);
          if (noteMatch) return { code: normalizeCode(noteMatch[1]), kind: "note" };
          var fileMatch = parsed.pathname.match(/^\/f\/([A-Za-z0-9]{4,12})\/?$/);
          if (fileMatch) return { code: normalizeCode(fileMatch[1]), kind: "file" };
        } catch (error) {}
        var plain = normalizeCode(text);
        return { code: plain.length >= 4 ? plain : "", kind: "unknown" };
      }

      function applyPublicSettings() {
        var disabled = APP.maintenanceMode || !APP.notesEnabled || !APP.createSectionEnabled;
        var textMap = {
          "header-create-text": "headerCreateText",
          "header-available-text": "headerAvailableText",
          "header-open-code-text": "headerOpenCodeText",
          "header-guide-text": "headerGuideText",
          "header-feedback-text": "headerFeedbackText",
          "header-about-text": "headerAboutText",
          "header-new-note-text": "headerNewNoteText",
          "drawer-create-text": "drawerCreateText",
          "drawer-open-code-text": "drawerOpenCodeText",
          "drawer-scan-text": "drawerScanText",
          "announcement-label": "announcementLabel",
          "announcement-text": "announcement",
          "hero-eyebrow": "heroEyebrow",
          "hero-title-primary": "heroTitlePrimary",
          "hero-title-outline": "heroTitleOutline",
          "hero-description": "heroDescription",
          "hero-primary-button": "heroPrimaryButtonText",
          "hero-secondary-button": "heroSecondaryButtonText",
          "hero-panel-eyebrow": "heroPanelEyebrow",
          "hero-panel-title": "heroPanelTitle",
          "hero-panel-text": "heroPanelText",
          "hero-panel-step1": "heroPanelStep1",
          "hero-panel-step2": "heroPanelStep2",
          "hero-panel-step3": "heroPanelStep3",
          "hero-stat1-value": "heroPanelStat1Value",
          "hero-stat1-label": "heroPanelStat1Label",
          "hero-stat2-value": "heroPanelStat2Value",
          "hero-stat2-label": "heroPanelStat2Label",
          "create-section-title": "createSectionTitle",
          "create-temporary-badge": "createTemporaryBadge",
          "create-privacy-note": "createPrivacyNote",
          "pin-toggle-text": "pinToggleText",
          "available-title": "availableTitle",
          "available-empty-text": "availableEmptyText",
          "open-code-title": "openCodeTitle",
          "open-code-button-text": "openCodeButtonText",
          "scan-qr-text": "scanQrText",
          "guide-eyebrow": "guideEyebrow",
          "guide-title": "guideTitle",
          "guide-step1-title": "guideStep1Title",
          "guide-step1-text": "guideStep1Text",
          "guide-step2-title": "guideStep2Title",
          "guide-step2-text": "guideStep2Text",
          "guide-step3-title": "guideStep3Title",
          "guide-step3-text": "guideStep3Text",
          "guide-step4-title": "guideStep4Title",
          "guide-step4-text": "guideStep4Text",
          "feedback-eyebrow": "feedbackEyebrow",
          "feedback-title": "feedbackTitle",
          "feedback-intro": "feedbackIntro",
          "about-eyebrow": "aboutEyebrow",
          "about-title": "aboutTitle",
          "about-text": "aboutText",
          "developer-name": "developerName",
          "developer-role": "developerRole",
          "developer-bio": "developerBio",
          "footer-tagline": "footerTagline",
          "footer-explore-title": "footerExploreTitle",
          "footer-information-title": "footerInformationTitle",
          "footer-connect-title": "footerConnectTitle",
          "footer-create-text": "footerCreateText",
          "footer-available-text": "footerAvailableText",
          "footer-open-code-text": "footerOpenCodeText",
          "footer-guide-text": "footerGuideText",
          "footer-feedback-text": "footerFeedbackText",
          "footer-about-text": "footerAboutText",
          "footer-developer-name": "developerName",
          "privacy-text": "privacyText",
          "network-mode-text": "privacyText",
          "admin-link-text": "adminLinkText",
          "maintenance-eyebrow": "maintenanceEyebrow",
          "maintenance-title": "maintenanceTitle",
          "maintenance-message": "maintenanceMessage",
          "maintenance-button": "maintenanceButtonText",
          "header-files-text": "headerFilesText",
          "header-qrtool-text": "headerQrToolText",
          "files-section-title": "filesSectionTitle",
          "files-temporary-badge": "filesTemporaryBadge",
          "files-privacy-note": "filesPrivacyNote",
          "files-available-title": "filesAvailableTitle",
          "files-empty-text": "filesEmptyText",
          "files-drop-hint": "filesDropHint",
          "files-upload-button-text": "filesUploadButtonText",
          "qrtool-eyebrow": "qrLinkToolEyebrow",
          "qrtool-title": "qrLinkToolTitle",
          "qrtool-subtitle": "qrLinkToolSubtitle",
          "qrtool-button-text": "qrLinkToolButtonText",
          "qrtool-download-text": "qrLinkToolDownloadText"
        };
        Object.keys(textMap).forEach(function (id) {
          setNodeText(id, APP[textMap[id]]);
        });

        document.querySelectorAll('[data-ticker-item="1"]').forEach(function (node) { node.textContent = APP.tickerItem1; });
        document.querySelectorAll('[data-ticker-item="2"]').forEach(function (node) { node.textContent = APP.tickerItem2; });
        document.querySelectorAll('[data-ticker-item="3"]').forEach(function (node) { node.textContent = APP.tickerItem3; });
        document.querySelectorAll('[data-ticker-item="4"]').forEach(function (node) { node.textContent = APP.tickerItem4; });

        el.shareTitle.placeholder = APP.createTitlePlaceholder;
        el.shareText.placeholder = APP.createTextPlaceholder;
        el.notesSearch.placeholder = APP.availableSearchPlaceholder;
        el.joinCode.placeholder = APP.openCodePlaceholder;
        el.feedbackMessage.placeholder = APP.feedbackMessagePlaceholder;
        el.feedbackEmail.placeholder = APP.feedbackEmailPlaceholder;
        el.fileTitle.placeholder = APP.filesUploadPlaceholder;
        el.qrtoolInput.placeholder = APP.qrLinkToolPlaceholder;
        var createLabel = el.createSubmit.querySelector("[data-button-label]");
        if (createLabel) createLabel.textContent = APP.createButtonText;
        el.feedbackSubmit.textContent = APP.feedbackButtonText;
        el.createExpiryCopy.textContent = String(APP.createSectionSubtitle || "")
          .replace("{duration}", formatDuration(APP.ttlSeconds));
        var filesSubtitle = document.getElementById("files-section-subtitle");
        if (filesSubtitle) {
          filesSubtitle.textContent = String(APP.filesSectionSubtitle || "")
            .replace("{duration}", formatDuration(APP.fileTtlSeconds || APP.ttlSeconds));
        }
        var filesDropHint = document.getElementById("files-drop-hint");
        if (filesDropHint) {
          filesDropHint.textContent = (APP.filesDropHint || "Drag and drop a file here, or click to choose one.")
            + " (max " + (APP.maxFileSizeMB || 25) + "MB)";
        }

        setSectionVisibility("announcement-bar", APP.announcementEnabled);
        setSectionVisibility("hero-section", APP.heroEnabled);
        setSectionVisibility("hero-panel", APP.heroEnabled && APP.heroPanelEnabled);
        setSectionVisibility("ticker-section", APP.tickerEnabled);
        setSectionVisibility("create-card", APP.createSectionEnabled);
        setSectionVisibility("create-privacy-note", APP.createSectionEnabled);
        setSectionVisibility("notes-section", APP.availableSectionEnabled);
        setSectionVisibility("join-card", APP.openCodeSectionEnabled);
        setSectionVisibility("files-card", APP.fileSharingEnabled);
        setSectionVisibility("header-files-text", APP.fileSharingEnabled);
        setSectionVisibility("qrtool-drawer-section", APP.qrLinkToolEnabled);
        setSectionVisibility("header-qrtool-text", APP.qrLinkToolEnabled);
        setSectionVisibility("guide-drawer-section", APP.guideEnabled);
        setSectionVisibility("feedback-drawer-section", APP.feedbackEnabled);
        setSectionVisibility("about-drawer-section", APP.aboutEnabled);
        setSectionVisibility("site-footer", APP.footerEnabled);
        setSectionVisibility("header-guide-text", APP.guideEnabled);
        setSectionVisibility("header-feedback-text", APP.feedbackEnabled);
        setSectionVisibility("header-about-text", APP.aboutEnabled);
        setSectionVisibility("header-create-text", APP.createSectionEnabled);
        setSectionVisibility("header-available-text", APP.availableSectionEnabled);
        setSectionVisibility("header-open-code-text", APP.openCodeSectionEnabled);
        setSectionVisibility("header-new-note-text", APP.createSectionEnabled);
        setSectionVisibility("hero-primary-button", APP.createSectionEnabled);
        setSectionVisibility("hero-secondary-button", APP.openCodeSectionEnabled);
        setSectionVisibility("drawer-create-text", APP.createSectionEnabled);
        setSectionVisibility("drawer-open-code-text", APP.openCodeSectionEnabled);
        setSectionVisibility("drawer-scan-text", APP.openCodeSectionEnabled);
        setSectionVisibility("footer-create-text", APP.createSectionEnabled);
        setSectionVisibility("footer-available-text", APP.availableSectionEnabled);
        setSectionVisibility("footer-open-code-text", APP.openCodeSectionEnabled);
        setSectionVisibility("footer-guide-text", APP.guideEnabled);
        setSectionVisibility("footer-feedback-text", APP.feedbackEnabled);
        setSectionVisibility("footer-about-text", APP.aboutEnabled);

        renderSocialLinks();
        var year = APP.footerShowYear ? new Date().getFullYear() + " " : "";
        setNodeText("footer-copyright", "© " + year + APP.appName + ". " + APP.footerRightsText);
        var developerLine = document.getElementById("footer-developer-line");
        if (developerLine) {
          developerLine.classList.toggle("hidden", !APP.footerShowDeveloper);
          developerLine.textContent = APP.footerDeveloperPrefix + " ";
          var strong = document.createElement("strong");
          strong.textContent = APP.developerName;
          developerLine.appendChild(strong);
        }

        el.maintenanceBanner.classList.toggle("hidden", !APP.maintenanceMode);
        el.createSubmit.disabled = disabled;
        el.createSubmit.setAttribute("aria-disabled", disabled ? "true" : "false");
        if (disabled) {
          if (createLabel) createLabel.textContent = "New notes disabled";
        }
        var filesDisabled = APP.maintenanceMode || !APP.fileSharingEnabled;
        el.fileUploadSubmit.disabled = filesDisabled;
        el.fileUploadSubmit.setAttribute("aria-disabled", filesDisabled ? "true" : "false");
        var filesLabel = el.fileUploadSubmit.querySelector("[data-button-label]");
        if (filesLabel) filesLabel.textContent = filesDisabled ? "File sharing disabled" : APP.filesUploadButtonText;
        el.fileLockToggle && (el.fileLockToggle.closest("label").classList.toggle("hidden", !APP.pinEnabled));
        if (!APP.pinEnabled) {
          el.fileLockToggle.checked = false;
          el.filePinFieldWrap.classList.add("hidden");
        }
        el.lockControl.classList.toggle("hidden", !APP.pinEnabled);
        if (!APP.pinEnabled) {
          el.lockToggle.checked = false;
          el.pinFieldWrap.classList.add("hidden");
        }
        el.feedbackSection.classList.toggle("hidden", !APP.feedbackEnabled);
        if (APP.maintenanceMode) {
          document.getElementById("maintenance-modal").classList.remove("hidden-force");
          lockBodyScroll();
        }
      }

      function setNodeText(id, value) {
        var node = document.getElementById(id);
        if (node) node.textContent = String(value == null ? "" : value);
      }

      function setSectionVisibility(id, visible) {
        var node = document.getElementById(id);
        if (node) node.classList.toggle("hidden-force", !visible);
      }

      function renderSocialLinks() {
        var entries = [
          ["Facebook", APP.socialFacebook],
          ["Instagram", APP.socialInstagram],
          ["X", APP.socialX],
          ["LinkedIn", APP.socialLinkedIn],
          ["GitHub", APP.socialGitHub],
          ["YouTube", APP.socialYouTube]
        ].filter(function (entry) { return safeExternalUrl(entry[1]); });
        ["footer-social-links", "drawer-social-links"].forEach(function (id) {
          var container = document.getElementById(id);
          if (!container) return;
          container.textContent = "";
          entries.forEach(function (entry) {
            var link = document.createElement("a");
            link.className = "social-link";
            link.href = safeExternalUrl(entry[1]);
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = entry[0];
            container.appendChild(link);
          });
        });
        setSectionVisibility("footer-social-column", APP.socialLinksEnabled && entries.length > 0);
        setSectionVisibility("drawer-social-links", APP.socialLinksEnabled && entries.length > 0);

        var contacts = document.getElementById("developer-contact-links");
        if (contacts) {
          contacts.textContent = "";
          var website = safeExternalUrl(APP.developerWebsite);
          if (website) contacts.appendChild(createContactLink("Website", website));
          if (isEmailAddress(APP.developerEmail)) {
            contacts.appendChild(createContactLink("Email", "mailto:" + APP.developerEmail));
          }
        }
      }

      function createContactLink(label, href) {
        var link = document.createElement("a");
        link.className = "social-link";
        link.href = href;
        link.target = href.indexOf("mailto:") === 0 ? "_self" : "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = label;
        return link;
      }

      function safeExternalUrl(value) {
        var raw = String(value || "").trim();
        if (!raw) return "";
        try {
          var candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "https://" + raw;
          var parsed = new URL(candidate);
          return /^(?:https?:)$/i.test(parsed.protocol) ? parsed.href : "";
        } catch (error) {
          return "";
        }
      }

      function toggleTheme() {
        var current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
        var next = current === "light" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("airtext_theme", next);
        syncThemeButtons();
      }

      function syncThemeButtons() {
        var theme = document.documentElement.getAttribute("data-theme") || "dark";
        document.querySelectorAll('[data-action="toggle-theme"]').forEach(function (button) {
          button.setAttribute("aria-label", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
          button.setAttribute("title", theme === "light" ? "Dark mode" : "Light mode");
        });
      }

      function openDrawer(targetId) {
        el.drawer.classList.add("open");
        el.drawerBackdrop.classList.add("open");
        el.drawer.setAttribute("aria-hidden", "false");
        lockBodyScroll();
        if (targetId) {
          window.setTimeout(function () {
            var target = document.getElementById(targetId);
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 180);
        }
      }

      function closeDrawer() {
        el.drawer.classList.remove("open");
        el.drawerBackdrop.classList.remove("open");
        el.drawer.setAttribute("aria-hidden", "true");
        unlockBodyScrollIfClear();
      }

      async function submitFeedback(event) {
        event.preventDefault();
        var message = el.feedbackMessage.value.trim();
        if (message.length < 5) return fieldError(el.feedbackMessage, "Please add a little more detail.");

        el.feedbackSubmit.disabled = true;
        el.feedbackSubmit.textContent = "Submitting…";
        try {
          var response = await apiFetch("/api/feedback", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              category: el.feedbackCategory.value,
              message: message,
              email: el.feedbackEmail.value.trim(),
              rating: Number(el.feedbackRating.value || 0)
            })
          });
          el.feedbackForm.reset();
          toast(response.message || "Thank you for the feedback.", "success");
        } catch (error) {
          toast(error.message || "Unable to submit feedback.", "error");
        } finally {
          el.feedbackSubmit.disabled = false;
          el.feedbackSubmit.textContent = APP.feedbackButtonText;
        }
      }

      async function initAdmin() {
        try {
          var session = await apiFetch("/api/admin/session");
          if (!session.configured) {
            el.adminLoginHelp.textContent = "Admin is disabled. Add an ADMIN_PASSWORD Worker secret with at least 8 characters, then refresh this page.";
            el.adminPassword.disabled = true;
            el.adminLoginSubmit.disabled = true;
            return;
          }
          if (session.authenticated) {
            showAdminDashboard();
            await loadAdminDashboard();
          } else {
            el.adminPassword.focus();
          }
        } catch (error) {
          el.adminLoginHelp.textContent = error.message || "Unable to check the administrator session.";
        }
      }

      async function adminLogin(event) {
        event.preventDefault();
        var email = el.adminEmail.value.trim();
        var password = el.adminPassword.value;
        if (!email) return fieldError(el.adminEmail, "Enter your email.");
        if (!password) return fieldError(el.adminPassword, "Enter your password.");
        el.adminLoginSubmit.disabled = true;
        el.adminLoginSubmit.textContent = "Signing in…";
        try {
          await apiFetch("/api/admin/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: email, password: password })
          });
          el.adminPassword.value = "";
          showAdminDashboard();
          await loadAdminDashboard();
          toast("Signed in.", "success");
        } catch (error) {
          toast(error.message || "Unable to sign in.", "error");
          el.adminPassword.select();
        } finally {
          el.adminLoginSubmit.disabled = false;
          el.adminLoginSubmit.textContent = "Sign in";
        }
      }

      async function adminLogout() {
        try {
          await apiFetch("/api/admin/logout", { method: "POST" });
        } catch (error) {}
        state.adminData = null;
        el.adminDashboard.classList.add("hidden");
        el.adminLoginCard.classList.remove("hidden");
        el.adminLogout.classList.add("hidden");
        el.adminPassword.focus();
        toast("Signed out.", "success");
      }

      function showAdminDashboard() {
        el.adminLoginCard.classList.add("hidden");
        el.adminDashboard.classList.remove("hidden");
        el.adminLogout.classList.remove("hidden");
        switchAdminTab("overview");
      }

      function switchAdminTab(tabName) {
        el.adminTabs.forEach(function (tab) {
          var active = tab.getAttribute("data-admin-tab") === tabName;
          tab.classList.toggle("active", active);
          tab.setAttribute("aria-selected", active ? "true" : "false");
        });
        el.adminTabPanels.forEach(function (panel) {
          panel.classList.toggle("hidden", panel.getAttribute("data-admin-panel") !== tabName);
        });
      }

      async function loadAdminDashboard() {
        el.adminRefresh.disabled = true;
        el.adminRefresh.textContent = "Refreshing…";
        try {
          var data = await adminFetch("/api/admin/dashboard");
          state.adminData = data;
          renderAdminDashboard(data);
        } catch (error) {
          if (error.status === 401) {
            el.adminDashboard.classList.add("hidden");
            el.adminLoginCard.classList.remove("hidden");
            el.adminLogout.classList.add("hidden");
          }
          toast(error.message || "Unable to load dashboard.", "error");
        } finally {
          el.adminRefresh.disabled = false;
          el.adminRefresh.textContent = "Refresh data";
        }
      }

      function renderAdminDashboard(data) {
        if (el.adminStorageStatus) {
          el.adminStorageStatus.textContent = data.storage && data.storage.primary === "D1"
            ? "D1 primary storage · 0 routine KV writes"
            : "Storage status unavailable";
        }
        renderAdminStats(data.stats || {});
        renderAdminChart(data.chart || []);
        renderAdminEventCounts(data.eventCounts || {});
        renderAdminNotes(data.notes || []);
        renderAdminFeedback(data.feedback || []);
        renderAdminFiles(data.files || [], data.storage || {});
        fillAdminSettings(data.settings || {});
      }

      function renderAdminStats(stats) {
        var cards = [
          ["Active notes", stats.activeNotes || 0],
          ["Created notes", stats.createdNotes || 0],
          ["Note opens", stats.noteOpens || 0],
          ["Unique networks", stats.uniqueNetworks || 0],
          ["Received opens", stats.receivedOpens || 0],
          ["New feedback", stats.feedbackNew || 0],
          ["Total feedback", stats.feedbackTotal || 0],
          ["Failed PINs", stats.pinFailures || 0]
        ];
        el.adminStats.textContent = "";
        cards.forEach(function (card) {
          var node = document.createElement("article");
          node.className = "stat-card";
          var label = document.createElement("p");
          label.className = "text-xs font-semibold uppercase tracking-wider text-slate-500";
          label.textContent = card[0];
          var value = document.createElement("p");
          value.className = "stat-value";
          value.textContent = Number(card[1]).toLocaleString();
          node.appendChild(label);
          node.appendChild(value);
          el.adminStats.appendChild(node);
        });
      }

      function renderAdminChart(chart) {
        el.adminChart.textContent = "";
        var maximum = Math.max.apply(Math, chart.map(function (entry) { return Number(entry.count || 0); }).concat([1]));
        chart.forEach(function (entry) {
          var column = document.createElement("div");
          column.className = "bar-column";
          var count = document.createElement("strong");
          count.textContent = String(entry.count || 0);
          var fill = document.createElement("span");
          fill.className = "bar-fill";
          fill.style.height = Math.max(4, Math.round((Number(entry.count || 0) / maximum) * 135)) + "px";
          var date = document.createElement("span");
          date.textContent = new Date(entry.date + "T00:00:00").toLocaleDateString([], { weekday: "short" });
          column.appendChild(count);
          column.appendChild(fill);
          column.appendChild(date);
          el.adminChart.appendChild(column);
        });
      }

      function renderAdminEventCounts(counts) {
        var labels = {
          note_created: "Notes created",
          note_opened: "Local opens",
          shared_note_opened: "Link, QR and code opens",
          pin_unlocked: "Successful PIN unlocks",
          pin_failed: "Failed PIN attempts",
          note_deleted: "Notes deleted",
          feedback_submitted: "Feedback submitted",
          settings_updated: "Settings updates",
          admin_login: "Admin logins",
          admin_login_failed: "Failed admin logins"
        };
        var keys = Object.keys(counts).sort(function (a, b) { return Number(counts[b]) - Number(counts[a]); });
        el.adminEventCounts.textContent = "";
        if (!keys.length) {
          el.adminEventCounts.textContent = "No analytics events yet.";
          return;
        }
        keys.forEach(function (key) {
          var row = document.createElement("div");
          row.className = "flex items-center justify-between gap-4 border-b border-[var(--line)] pb-3";
          var label = document.createElement("span");
          label.textContent = labels[key] || key.replace(/_/g, " ");
          var value = document.createElement("strong");
          value.textContent = Number(counts[key]).toLocaleString();
          row.appendChild(label);
          row.appendChild(value);
          el.adminEventCounts.appendChild(row);
        });
      }

      var adminRolesCache = [];

      async function loadAdminUsers() {
        if (!el.adminUsers) return;
        try {
          var usersData = await adminFetch("/api/admin/users");
          var rolesData = await adminFetch("/api/admin/roles");
          adminRolesCache = rolesData.roles;
          renderAdminUsers(usersData.users, rolesData.roles);
          renderAdminRoles(rolesData.roles);
          populateRoleSelect(rolesData.roles);
        } catch (error) {
          toast(error.message || "Unable to load accounts.", "error");
        }
      }

      function populateRoleSelect(roles) {
        if (!el.newUserRole) return;
        el.newUserRole.textContent = "";
        roles.forEach(function (role) {
          var option = document.createElement("option");
          option.value = String(role.id);
          option.textContent = role.name;
          el.newUserRole.appendChild(option);
        });
      }

      function renderAdminUsers(users, roles) {
        el.adminUsers.textContent = "";
        if (!users.length) {
          el.adminUsers.textContent = "No accounts yet.";
          return;
        }
        users.forEach(function (user) {
          var row = document.createElement("div");
          row.className = "admin-list-row";

          var body = document.createElement("div");
          body.className = "min-w-0";
          var title = document.createElement("strong");
          title.className = "block truncate";
          title.textContent = user.displayName + " · " + user.email;
          var meta = document.createElement("p");
          meta.className = "mt-1 text-xs text-slate-500";
          meta.textContent = (user.status === "active" ? "Active" : "Disabled") +
            (user.lastLoginAt ? " · last login " + formatDate(user.lastLoginAt) : " · never logged in");
          body.appendChild(title);
          body.appendChild(meta);

          var controls = document.createElement("div");
          controls.className = "flex items-center gap-2";

          var roleSelect = document.createElement("select");
          roleSelect.className = "filter-select";
          roles.forEach(function (role) {
            var option = document.createElement("option");
            option.value = String(role.id);
            option.textContent = role.name;
            option.selected = role.id === user.roleId;
            roleSelect.appendChild(option);
          });
          roleSelect.addEventListener("change", function () { changeUserRole(user.id, roleSelect.value); });

          var toggleButton = document.createElement("button");
          toggleButton.type = "button";
          toggleButton.className = "rounded-md border border-white/10 px-3 py-2 text-xs text-slate-300";
          toggleButton.setAttribute("data-action", "admin-toggle-user-status");
          toggleButton.setAttribute("data-user-id", user.id);
          toggleButton.setAttribute("data-user-status", user.status === "active" ? "disabled" : "active");
          toggleButton.textContent = user.status === "active" ? "Disable" : "Enable";

          var deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.className = "rounded-md border border-red-500/30 px-3 py-2 text-xs text-red-300";
          deleteButton.setAttribute("data-action", "admin-delete-user");
          deleteButton.setAttribute("data-user-id", user.id);
          deleteButton.textContent = "Delete";

          controls.appendChild(roleSelect);
          controls.appendChild(toggleButton);
          controls.appendChild(deleteButton);

          row.appendChild(body);
          row.appendChild(controls);
          el.adminUsers.appendChild(row);
        });
      }

      function renderAdminRoles(roles) {
        el.adminRoles.textContent = "";
        roles.forEach(function (role) {
          var card = document.createElement("div");
          card.className = "rounded-lg border border-[var(--line)] p-4";
          card.setAttribute("data-role-card", String(role.id));

          var nameRow = document.createElement("div");
          nameRow.className = "flex items-center gap-3";
          var nameInput = document.createElement("input");
          nameInput.className = "form-field";
          nameInput.value = role.name;
          nameInput.setAttribute("data-role-field", "name");
          var rankBadge = document.createElement("span");
          rankBadge.className = "note-badge";
          rankBadge.textContent = "rank " + role.rank;
          nameRow.appendChild(nameInput);
          nameRow.appendChild(rankBadge);
          card.appendChild(nameRow);

          if (role.rank === 0) {
            var fixedNote = document.createElement("p");
            fixedNote.className = "mt-2 text-xs text-slate-500";
            fixedNote.textContent = "Admin limits are fixed and not configurable.";
            card.appendChild(fixedNote);
          } else {
            var limits = role.defaultLimits || {};
            var grid = document.createElement("div");
            grid.className = "content-field-grid mt-3";
            [
              ["ttlSeconds", "Note expiry (seconds)"],
              ["maxTextLength", "Max text length"],
              ["maxFileSizeMB", "Max file size (MB)"],
              ["maxBatchTotalMB", "Max batch total (MB)"],
              ["maxFilesPerBatch", "Max files per batch"],
              ["fileTtlSeconds", "File expiry (seconds)"]
            ].forEach(function (pair) {
              var label = document.createElement("label");
              label.className = "grid gap-1 text-xs";
              label.textContent = pair[1];
              var input = document.createElement("input");
              input.className = "form-field mt-1";
              input.type = "number";
              input.min = "1";
              input.value = limits[pair[0]] != null ? limits[pair[0]] : "";
              input.setAttribute("data-role-field", pair[0]);
              label.appendChild(input);
              grid.appendChild(label);
            });
            card.appendChild(grid);
          }

          var saveButton = document.createElement("button");
          saveButton.type = "button";
          saveButton.className = "primary-action mt-3 px-4 py-2 text-sm font-semibold";
          saveButton.setAttribute("data-action", "admin-save-role");
          saveButton.setAttribute("data-role-id", String(role.id));
          saveButton.textContent = "Save role";
          card.appendChild(saveButton);

          el.adminRoles.appendChild(card);
        });
      }

      async function createAdminUser(event) {
        event.preventDefault();
        var email = el.newUserEmail.value.trim();
        var displayName = el.newUserName.value.trim();
        var password = el.newUserPassword.value;
        var roleId = Number(el.newUserRole.value);
        if (!email) return fieldError(el.newUserEmail, "Enter an email address.");
        if (!displayName) return fieldError(el.newUserName, "Enter a display name.");
        if (password.length < 10) return fieldError(el.newUserPassword, "Password must be at least 10 characters.");

        el.adminUserCreateSubmit.disabled = true;
        try {
          await adminFetch("/api/admin/users", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: email, password: password, displayName: displayName, roleId: roleId })
          });
          el.adminUserCreateForm.reset();
          toast("Account created.", "success");
          await loadAdminUsers();
        } catch (error) {
          toast(error.message || "Unable to create account.", "error");
        } finally {
          el.adminUserCreateSubmit.disabled = false;
        }
      }

      async function changeUserRole(userId, roleId) {
        try {
          await adminFetch("/api/admin/users/" + userId, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ roleId: Number(roleId) })
          });
          toast("Role updated.", "success");
        } catch (error) {
          toast(error.message || "Unable to update role.", "error");
          await loadAdminUsers();
        }
      }

      async function toggleUserStatus(userId, nextStatus) {
        try {
          await adminFetch("/api/admin/users/" + userId, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: nextStatus })
          });
          toast(nextStatus === "active" ? "Account enabled." : "Account disabled.", "success");
          await loadAdminUsers();
        } catch (error) {
          toast(error.message || "Unable to update account.", "error");
        }
      }

      async function deleteAdminUser(userId) {
        try {
          await adminFetch("/api/admin/users/" + userId, { method: "DELETE" });
          toast("Account deleted.", "success");
          await loadAdminUsers();
        } catch (error) {
          toast(error.message || "Unable to delete account.", "error");
        }
      }

      async function saveRole(roleId) {
        var role = adminRolesCache.filter(function (entry) { return String(entry.id) === String(roleId); })[0];
        if (!role) return;
        var card = document.querySelector('[data-role-card="' + roleId + '"]');
        if (!card) return;
        var payload = {};
        var nameField = card.querySelector('[data-role-field="name"]');
        if (nameField) payload.name = nameField.value;
        if (role.rank !== 0) {
          var limits = {};
          card.querySelectorAll("[data-role-field]").forEach(function (field) {
            var key = field.getAttribute("data-role-field");
            if (key === "name") return;
            var num = Number(field.value);
            if (Number.isFinite(num)) limits[key] = num;
          });
          payload.defaultLimits = limits;
        }
        try {
          await adminFetch("/api/admin/roles/" + roleId, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          });
          toast("Role saved.", "success");
          await loadAdminUsers();
        } catch (error) {
          toast(error.message || "Unable to save role.", "error");
        }
      }

      function renderAdminNotes(notes) {
        el.adminNotes.textContent = "";
        if (!notes.length) {
          el.adminNotes.textContent = "No active notes.";
          return;
        }
        notes.forEach(function (item) {
          var row = document.createElement("div");
          row.className = "admin-list-row";
          var body = document.createElement("div");
          body.className = "min-w-0";
          var title = document.createElement("strong");
          title.className = "block truncate";
          title.textContent = item.title;
          var meta = document.createElement("p");
          meta.className = "mt-1 text-xs text-slate-500";
          meta.textContent = item.code + " · " + (item.locked ? "PIN locked" : "Open") + " · " + formatRemaining(item.expiresAt);
          body.appendChild(title);
          body.appendChild(meta);
          var button = document.createElement("button");
          button.type = "button";
          button.className = "rounded-md border border-red-500/30 px-3 py-2 text-xs text-red-300";
          button.setAttribute("data-action", "admin-delete-note");
          button.setAttribute("data-admin-item-id", item.id);
          button.textContent = "Delete";
          row.appendChild(body);
          row.appendChild(button);
          el.adminNotes.appendChild(row);
        });
      }

      function renderAdminFiles(files, storage) {
        if (el.adminStorageFill && el.adminStorageLabel) {
          var used = Number((storage && storage.fileStorageBytes) || 0);
          var cap = Number((storage && storage.fileStorageLimitBytes) || 1);
          var pct = Math.min(100, Math.round((used / cap) * 100));
          el.adminStorageFill.style.width = pct + "%";
          el.adminStorageLabel.textContent = formatBytes(used) + " used of " + formatBytes(cap) + " (" + pct + "%)";
          if (el.adminStorageWarning) {
            if (!storage || !storage.filesBucketConfigured) {
              el.adminStorageWarning.textContent = "No R2 bucket bound as FILES_BUCKET yet — file sharing will return an error until one is added in Cloudflare.";
              el.adminStorageWarning.classList.remove("hidden");
            } else if (pct >= 90) {
              el.adminStorageWarning.textContent = "Storage is nearly full. Raise the cap or clear old files below.";
              el.adminStorageWarning.classList.remove("hidden");
            } else {
              el.adminStorageWarning.classList.add("hidden");
            }
          }
        }
        if (!el.adminFiles) return;
        el.adminFiles.textContent = "";
        if (!files.length) {
          el.adminFiles.textContent = "No active files.";
          return;
        }
        files.forEach(function (item) {
          var row = document.createElement("div");
          row.className = "admin-list-row";
          var body = document.createElement("div");
          body.className = "min-w-0";
          var title = document.createElement("strong");
          title.className = "block truncate";
          title.textContent = item.title;
          var meta = document.createElement("p");
          meta.className = "mt-1 text-xs text-slate-500";
          meta.textContent = item.code + " · " + formatBytes(item.sizeBytes) + " · "
            + (item.locked ? "PIN locked" : "Open") + " · " + item.downloadCount + " downloads · "
            + formatRemaining(item.expiresAt);
          body.appendChild(title);
          body.appendChild(meta);
          var button = document.createElement("button");
          button.type = "button";
          button.className = "rounded-md border border-red-500/30 px-3 py-2 text-xs text-red-300";
          button.setAttribute("data-action", "admin-delete-file");
          button.setAttribute("data-admin-file-id", item.id);
          button.textContent = "Delete";
          row.appendChild(body);
          row.appendChild(button);
          el.adminFiles.appendChild(row);
        });
      }

      var SHARED_BY_RANK_COLORS = { 0: "#f5c94a", 1: "#c9c9d6", 2: "#c98a4a" };

      function buildSharedByBadge(sharedBy) {
        if (!sharedBy || !sharedBy.name) return null;
        var badge = document.createElement("span");
        badge.className = "note-badge";
        badge.textContent = sharedBy.name + " · " + sharedBy.role;
        var color = SHARED_BY_RANK_COLORS[sharedBy.rank];
        if (color) {
          badge.style.color = color;
          badge.style.borderColor = color;
        }
        return badge;
      }

      function formatBytes(bytes) {
        var value = Number(bytes) || 0;
        if (value < 1024) return value + " B";
        if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
        if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + " MB";
        return (value / (1024 * 1024 * 1024)).toFixed(2) + " GB";
      }

      function renderAdminFeedback(feedback) {
        el.adminFeedback.textContent = "";
        if (!feedback.length) {
          el.adminFeedback.textContent = "No feedback submitted yet.";
          return;
        }
        feedback.forEach(function (item) {
          var row = document.createElement("article");
          row.className = "border-b border-[var(--line)] py-4 first:pt-0 last:border-0 last:pb-0";
          var top = document.createElement("div");
          top.className = "flex flex-wrap items-center justify-between gap-2";
          var label = document.createElement("strong");
          label.textContent = String(item.category || "other") + (item.rating ? " · " + item.rating + "/5" : "");
          var status = document.createElement("span");
          status.className = "note-badge";
          status.textContent = item.status || "new";
          top.appendChild(label);
          top.appendChild(status);
          var message = document.createElement("p");
          message.className = "mt-3 whitespace-pre-wrap text-sm leading-6";
          message.textContent = item.message || "";
          var details = document.createElement("p");
          details.className = "mt-2 text-xs text-slate-500";
          details.textContent = (item.email || "No email") + " · " + formatDate(item.createdAt);
          var actions = document.createElement("div");
          actions.className = "mt-3 flex flex-wrap gap-2";
          ["new", "reviewed", "resolved"].forEach(function (nextStatus) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "rounded-md border border-[var(--line)] px-3 py-1.5 text-xs";
            button.setAttribute("data-action", "admin-feedback-status");
            button.setAttribute("data-feedback-id", item.id);
            button.setAttribute("data-feedback-status", nextStatus);
            button.disabled = item.status === nextStatus;
            button.textContent = nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1);
            actions.appendChild(button);
          });
          var remove = document.createElement("button");
          remove.type = "button";
          remove.className = "rounded-md border border-red-500/30 px-3 py-1.5 text-xs text-red-300";
          remove.setAttribute("data-action", "admin-delete-feedback");
          remove.setAttribute("data-feedback-id", item.id);
          remove.textContent = "Delete";
          actions.appendChild(remove);
          row.appendChild(top);
          row.appendChild(message);
          row.appendChild(details);
          row.appendChild(actions);
          el.adminFeedback.appendChild(row);
        });
      }

      function fillAdminSettings(settings) {
        el.settingAppName.value = settings.appName || "";
        el.settingTagline.value = settings.tagline || "";
        el.settingAnnouncement.value = settings.announcement || "";
        el.settingTtl.value = Math.round(Number(settings.ttlSeconds || 3600) / 60);
        el.settingMaxItems.value = settings.maxLocalItems || 50;
        el.settingTitleLength.value = settings.maxTitleLength || 80;
        el.settingTextLength.value = settings.maxTextLength || 10000;
        el.settingCreateCooldown.value = settings.createCooldownSeconds || 3;
        el.settingUnlockCooldown.value = settings.unlockCooldownSeconds || 2;
        el.settingDefaultTheme.value = settings.defaultTheme || "system";
        el.settingNotesEnabled.checked = Boolean(settings.notesEnabled);
        el.settingPinEnabled.checked = Boolean(settings.pinEnabled);
        el.settingCrossNetwork.checked = Boolean(settings.crossNetworkAddEnabled);
        el.settingFeedbackEnabled.checked = Boolean(settings.feedbackEnabled);
        el.settingAnalyticsEnabled.checked = Boolean(settings.analyticsEnabled);
        el.settingMaintenance.checked = Boolean(settings.maintenanceMode);
        el.settingHeroEnabled.checked = Boolean(settings.heroEnabled);
        el.settingHeroPanelEnabled.checked = Boolean(settings.heroPanelEnabled);
        el.settingAnnouncementEnabled.checked = Boolean(settings.announcementEnabled);
        el.settingTickerEnabled.checked = Boolean(settings.tickerEnabled);
        el.settingCreateSectionEnabled.checked = Boolean(settings.createSectionEnabled);
        el.settingAvailableSectionEnabled.checked = Boolean(settings.availableSectionEnabled);
        el.settingOpenCodeSectionEnabled.checked = Boolean(settings.openCodeSectionEnabled);
        el.settingGuideEnabled.checked = Boolean(settings.guideEnabled);
        el.settingAboutEnabled.checked = Boolean(settings.aboutEnabled);
        el.settingFooterEnabled.checked = Boolean(settings.footerEnabled);
        el.settingSocialLinksEnabled.checked = Boolean(settings.socialLinksEnabled);
        el.settingFooterShowYear.checked = Boolean(settings.footerShowYear);
        el.settingFooterShowDeveloper.checked = Boolean(settings.footerShowDeveloper);
        renderAdminContentFields(settings);
      }

      function renderAdminContentFields(settings) {
        var groups = [
          ["Header labels", [
            ["headerCreateText", "Create link"], ["headerAvailableText", "Available link"],
            ["headerOpenCodeText", "Open-code link"], ["headerGuideText", "Guide link"],
            ["headerFeedbackText", "Feedback link"], ["headerAboutText", "About link"],
            ["headerNewNoteText", "New-note button"], ["drawerCreateText", "Drawer create button"],
            ["drawerOpenCodeText", "Drawer open-code button"], ["drawerScanText", "Drawer QR button"]
          ]],
          ["Hero section", [
            ["heroEyebrow", "Eyebrow"], ["heroTitlePrimary", "Main title"],
            ["heroTitleOutline", "Outlined title"], ["heroDescription", "Description", "textarea"],
            ["heroPrimaryButtonText", "Primary button"], ["heroSecondaryButtonText", "Secondary button"],
            ["heroPanelEyebrow", "Panel eyebrow"], ["heroPanelTitle", "Panel title"],
            ["heroPanelText", "Panel description", "textarea"], ["heroPanelStep1", "Flow step 1"],
            ["heroPanelStep2", "Flow step 2"], ["heroPanelStep3", "Flow step 3"],
            ["heroPanelStat1Value", "Stat 1 value"], ["heroPanelStat1Label", "Stat 1 label"],
            ["heroPanelStat2Value", "Stat 2 value"], ["heroPanelStat2Label", "Stat 2 label"]
          ]],
          ["Announcement and ticker", [
            ["announcementLabel", "Announcement badge"],
            ["tickerItem1", "Ticker item 1"], ["tickerItem2", "Ticker item 2"],
            ["tickerItem3", "Ticker item 3"], ["tickerItem4", "Ticker item 4"]
          ]],
          ["Create and available notes", [
            ["createSectionTitle", "Create heading"], ["createSectionSubtitle", "Create subtitle"],
            ["createTitlePlaceholder", "Title placeholder"], ["createTextPlaceholder", "Text placeholder"],
            ["createButtonText", "Save button"], ["createTemporaryBadge", "Temporary badge"],
            ["createPrivacyNote", "Privacy note", "textarea"], ["pinToggleText", "PIN toggle label"],
            ["availableTitle", "Available heading"],
            ["availableSearchPlaceholder", "Search placeholder"], ["availableEmptyText", "Empty message"],
            ["openCodeTitle", "Open-code heading"], ["openCodePlaceholder", "Code placeholder"],
            ["openCodeButtonText", "Open-code button"],
            ["scanQrText", "QR scanner button"]
          ]],
          ["Guide and feedback", [
            ["guideEyebrow", "Guide eyebrow"], ["guideTitle", "Guide heading"],
            ["guideStep1Title", "Step 1 title"], ["guideStep1Text", "Step 1 text", "textarea"],
            ["guideStep2Title", "Step 2 title"], ["guideStep2Text", "Step 2 text", "textarea"],
            ["guideStep3Title", "Step 3 title"], ["guideStep3Text", "Step 3 text", "textarea"],
            ["guideStep4Title", "Step 4 title"], ["guideStep4Text", "Step 4 text", "textarea"],
            ["feedbackEyebrow", "Feedback eyebrow"], ["feedbackTitle", "Feedback heading"],
            ["feedbackIntro", "Feedback introduction", "textarea"], ["feedbackButtonText", "Feedback button"]
          ]],
          ["About and developer", [
            ["aboutEyebrow", "About eyebrow"], ["aboutTitle", "About heading"],
            ["aboutText", "About description", "textarea"], ["developerName", "Developer name"],
            ["developerRole", "Developer role"], ["developerBio", "Developer bio", "textarea"],
            ["developerWebsite", "Developer website", "url"], ["developerEmail", "Developer email", "email"],
            ["privacyText", "Privacy statement", "textarea"], ["adminLinkText", "Admin link label"]
          ]],
          ["Footer, social and maintenance", [
            ["footerTagline", "Footer tagline"], ["footerExploreTitle", "Explore heading"],
            ["footerInformationTitle", "Information heading"], ["footerConnectTitle", "Connect heading"],
            ["footerCreateText", "Footer create link"], ["footerAvailableText", "Footer available link"],
            ["footerOpenCodeText", "Footer open-code link"], ["footerGuideText", "Footer guide link"],
            ["footerFeedbackText", "Footer feedback link"], ["footerAboutText", "Footer about link"],
            ["footerRightsText", "Rights text"],
            ["footerDeveloperPrefix", "Developer credit prefix"],
            ["socialFacebook", "Facebook URL", "url"], ["socialInstagram", "Instagram URL", "url"],
            ["socialX", "X URL", "url"], ["socialLinkedIn", "LinkedIn URL", "url"],
            ["socialGitHub", "GitHub URL", "url"], ["socialYouTube", "YouTube URL", "url"],
            ["maintenanceEyebrow", "Maintenance eyebrow"], ["maintenanceTitle", "Maintenance title"], ["maintenanceMessage", "Maintenance message", "textarea"],
            ["feedbackMessagePlaceholder", "Feedback message placeholder"],
            ["feedbackEmailPlaceholder", "Feedback email placeholder"],
            ["maintenanceButtonText", "Maintenance button"]
          ]],
          ["File sharing limits", [
            ["fileSharingEnabled", "Enable file sharing", "checkbox"],
            ["maxFileSizeMB", "Max file size (MB)", "number", 1, 200],
            ["maxTotalStorageMB", "Total storage cap (MB)", "number", 50, 20000],
            ["fileTtlSeconds", "File retention (seconds)", "number", 300, 604800],
            ["fileUploadCooldownSeconds", "Upload cooldown (seconds)", "number", 1, 120],
            ["maxActiveFiles", "Max active files per network", "number", 10, 2000],
            ["allowedFileExtensions", "Allowed extensions (comma-separated, blank = all)"],
            ["blockedFileExtensions", "Blocked extensions (comma-separated)"],
            ["headerFilesText", "Files nav link"], ["filesSectionTitle", "Files section heading"],
            ["filesSectionSubtitle", "Files section subtitle"],
            ["filesUploadPlaceholder", "Title placeholder"], ["filesUploadButtonText", "Upload button"],
            ["filesTemporaryBadge", "Temporary badge"], ["filesPrivacyNote", "Privacy note", "textarea"],
            ["filesAvailableTitle", "Available files heading"], ["filesEmptyText", "Empty message"],
            ["filesDropHint", "Drop-zone hint text"]
          ]],
          ["QR link generator", [
            ["qrLinkToolEnabled", "Enable standalone QR tool", "checkbox"],
            ["headerQrToolText", "Nav link label"], ["qrLinkToolEyebrow", "Eyebrow"],
            ["qrLinkToolTitle", "Heading"], ["qrLinkToolSubtitle", "Subtitle", "textarea"],
            ["qrLinkToolPlaceholder", "URL input placeholder"],
            ["qrLinkToolButtonText", "Generate button"], ["qrLinkToolDownloadText", "Download button"]
          ]],
          ["SEO", [
            ["seoEnabled", "Enable SEO tags", "checkbox"],
            ["seoSiteTitle", "Site title (<title> tag)"],
            ["seoMetaDescription", "Meta description", "textarea"],
            ["seoKeywords", "Keywords (comma-separated)", "textarea"],
            ["seoOgImageUrl", "Social share image URL", "url"],
            ["seoTwitterHandle", "Twitter/X handle"],
            ["seoCanonicalBaseUrl", "Canonical base URL (blank = auto-detect)", "url"],
            ["seoGoogleSiteVerification", "Google site verification code"],
            ["seoRobotsDirective", "Robots directive", "select", ["index, follow", "noindex, follow", "index, nofollow", "noindex, nofollow"]]
          ]]
        ];
        el.adminContentFields.textContent = "";
        groups.forEach(function (group) {
          var section = document.createElement("section");
          section.className = "content-field-group";
          var heading = document.createElement("h3");
          heading.className = "font-bold text-white";
          heading.textContent = group[0];
          var grid = document.createElement("div");
          grid.className = "content-field-grid";
          group[1].forEach(function (field) {
            var key = field[0], caption = field[1], type = field[2] || "text";
            var label = document.createElement("label");
            var input;
            if (type === "textarea") {
              input = document.createElement("textarea");
              input.rows = 3;
              input.maxLength = 1000;
              input.value = settings[key] == null ? "" : String(settings[key]);
              label.className = "grid gap-2 text-sm";
            } else if (type === "checkbox") {
              input = document.createElement("input");
              input.type = "checkbox";
              input.checked = Boolean(settings[key]);
              label.className = "setting-toggle";
            } else if (type === "number") {
              input = document.createElement("input");
              input.type = "number";
              if (field[3] != null) input.min = field[3];
              if (field[4] != null) input.max = field[4];
              input.value = settings[key] == null ? "" : String(settings[key]);
              input.className = "form-field";
              label.className = "grid gap-2 text-sm";
            } else if (type === "select") {
              input = document.createElement("select");
              (field[3] || []).forEach(function (optionValue) {
                var option = document.createElement("option");
                option.value = optionValue;
                option.textContent = optionValue;
                if (settings[key] === optionValue) option.selected = true;
                input.appendChild(option);
              });
              input.className = "form-field";
              label.className = "grid gap-2 text-sm";
            } else {
              input = document.createElement("input");
              input.type = type === "url" || type === "email" ? type : "text";
              input.maxLength = type === "url" ? 500 : 200;
              input.value = settings[key] == null ? "" : String(settings[key]);
              input.className = "form-field";
              label.className = "grid gap-2 text-sm";
            }
            input.setAttribute("data-setting-key", key);
            var captionNode = document.createElement("span");
            captionNode.textContent = caption;
            if (type === "checkbox") {
              label.appendChild(captionNode);
              label.appendChild(input);
            } else {
              label.appendChild(captionNode);
              label.appendChild(input);
            }
            grid.appendChild(label);
          });
          section.appendChild(heading);
          section.appendChild(grid);
          el.adminContentFields.appendChild(section);
        });
      }

      async function saveAdminSettings(event) {
        event.preventDefault();
        el.adminSettingsSubmit.disabled = true;
        el.adminSettingsSubmit.textContent = "Saving…";
        try {
          var payload = {
            appName: el.settingAppName.value.trim(),
            tagline: el.settingTagline.value.trim(),
            announcement: el.settingAnnouncement.value.trim(),
            ttlSeconds: Number(el.settingTtl.value) * 60,
            maxLocalItems: Number(el.settingMaxItems.value),
            maxTitleLength: Number(el.settingTitleLength.value),
            maxTextLength: Number(el.settingTextLength.value),
            createCooldownSeconds: Number(el.settingCreateCooldown.value),
            unlockCooldownSeconds: Number(el.settingUnlockCooldown.value),
            defaultTheme: el.settingDefaultTheme.value,
            notesEnabled: el.settingNotesEnabled.checked,
            pinEnabled: el.settingPinEnabled.checked,
            crossNetworkAddEnabled: el.settingCrossNetwork.checked,
            feedbackEnabled: el.settingFeedbackEnabled.checked,
            analyticsEnabled: el.settingAnalyticsEnabled.checked,
            maintenanceMode: el.settingMaintenance.checked,
            heroEnabled: el.settingHeroEnabled.checked,
            heroPanelEnabled: el.settingHeroPanelEnabled.checked,
            announcementEnabled: el.settingAnnouncementEnabled.checked,
            tickerEnabled: el.settingTickerEnabled.checked,
            createSectionEnabled: el.settingCreateSectionEnabled.checked,
            availableSectionEnabled: el.settingAvailableSectionEnabled.checked,
            openCodeSectionEnabled: el.settingOpenCodeSectionEnabled.checked,
            guideEnabled: el.settingGuideEnabled.checked,
            aboutEnabled: el.settingAboutEnabled.checked,
            footerEnabled: el.settingFooterEnabled.checked,
            socialLinksEnabled: el.settingSocialLinksEnabled.checked,
            footerShowYear: el.settingFooterShowYear.checked,
            footerShowDeveloper: el.settingFooterShowDeveloper.checked
          };
          el.adminContentFields.querySelectorAll("[data-setting-key]").forEach(function (input) {
            var key = input.getAttribute("data-setting-key");
            if (input.type === "checkbox") {
              payload[key] = input.checked;
            } else if (input.type === "number") {
              payload[key] = Number(input.value);
            } else {
              payload[key] = input.value.trim();
            }
          });
          await adminFetch("/api/admin/settings", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          });
          toast("Settings saved. Public pages will use them immediately.", "success");
          await loadAdminDashboard();
        } catch (error) {
          toast(error.message || "Unable to save settings.", "error");
        } finally {
          el.adminSettingsSubmit.disabled = false;
          el.adminSettingsSubmit.textContent = "Save settings";
        }
      }

      async function adminDeleteNote(itemId) {
        if (!window.confirm("Delete this active note now?")) return;
        try {
          await adminFetch("/api/admin/item/" + encodeURIComponent(itemId), { method: "DELETE" });
          toast("Note deleted.", "success");
          await loadAdminDashboard();
        } catch (error) {
          toast(error.message || "Unable to delete note.", "error");
        }
      }

      async function adminDeleteFile(fileId) {
        if (!window.confirm("Delete this file now?")) return;
        try {
          await adminFetch("/api/admin/file/" + encodeURIComponent(fileId), { method: "DELETE" });
          toast("File deleted.", "success");
          await loadAdminDashboard();
        } catch (error) {
          toast(error.message || "Unable to delete file.", "error");
        }
      }

      async function updateFeedbackStatus(feedbackId, status) {
        try {
          await adminFetch("/api/admin/feedback/" + encodeURIComponent(feedbackId), {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status: status })
          });
          await loadAdminDashboard();
        } catch (error) {
          toast(error.message || "Unable to update feedback.", "error");
        }
      }

      async function deleteFeedback(feedbackId) {
        if (!window.confirm("Delete this feedback submission?")) return;
        try {
          await adminFetch("/api/admin/feedback/" + encodeURIComponent(feedbackId), { method: "DELETE" });
          toast("Feedback deleted.", "success");
          await loadAdminDashboard();
        } catch (error) {
          toast(error.message || "Unable to delete feedback.", "error");
        }
      }

      function adminFetch(url, options) {
        var config = Object.assign({}, options || {});
        config.headers = Object.assign({}, (options && options.headers) || {}, { "x-airtext-admin": "1" });
        return apiFetch(url, config);
      }

      async function apiFetch(url, options) {
        var response;
        try {
          var config = Object.assign({}, options || {});
          config.headers = Object.assign({ "accept": "application/json" }, (options && options.headers) || {});
          response = await fetch(url, config);
        } catch (error) {
          throw new Error("Network error. Check your connection and try again.");
        }

        var data = null;
        try { data = await response.json(); } catch (error) {}

        if (!response.ok || !data || data.ok === false) {
          var message = data && data.error ? data.error : "Request failed with status " + response.status + ".";
          var requestError = new Error(message);
          requestError.status = response.status;
          requestError.code = data && data.code;
          throw requestError;
        }

        return data;
      }

      function startPolling() {
        if (state.pollingTimer) window.clearInterval(state.pollingTimer);
        state.pollingTimer = window.setInterval(function () {
          if (document.visibilityState === "visible") loadLocalItems(false);
        }, 10000);
      }

      function updateCountdowns() {
        document.querySelectorAll("[data-expires]").forEach(function (node) {
          var expiresAt = Number(node.getAttribute("data-expires"));
          if (!expiresAt) return;
          node.textContent = formatRemaining(expiresAt);
        });

        var before = state.items.length;
        state.items = state.items.filter(function (item) { return Number(item.expiresAt) > Date.now(); });
        if (state.items.length !== before) renderLocalItems();

        updateBoardClock();
      }

      function updateActiveCountBadge() {
        if (!el.mainTabAvailableCount) return;
        var total = state.items.length + state.files.length;
        el.mainTabAvailableCount.textContent = String(total);
        el.mainTabAvailableCount.classList.toggle("hidden", total === 0);
      }

      function updateBoardClock() {
        if (!el.boardClock) return;
        var soonest = null;
        state.items.concat(state.files).forEach(function (entry) {
          var expiresAt = Number(entry.expiresAt);
          if (expiresAt && (soonest === null || expiresAt < soonest)) soonest = expiresAt;
        });
        if (soonest === null) {
          el.boardClock.classList.add("hidden");
          return;
        }
        var seconds = Math.max(0, Math.ceil((soonest - Date.now()) / 1000));
        el.boardClock.classList.remove("hidden");
        el.boardClock.textContent = seconds <= 0
          ? "Board clears now"
          : "Board clears in " + formatBoardDuration(seconds);
      }

      function formatBoardDuration(seconds) {
        var hours = Math.floor(seconds / 3600);
        var minutes = Math.floor((seconds % 3600) / 60);
        var remainder = seconds % 60;
        if (hours >= 1) return hours + "h " + minutes + "m";
        if (minutes >= 1) return minutes + "m " + remainder + "s";
        return remainder + "s";
      }

      function formatRemaining(expiresAt) {
        var seconds = Math.max(0, Math.ceil((Number(expiresAt) - Date.now()) / 1000));
        if (seconds <= 0) return "Expired";
        var days = Math.floor(seconds / 86400);
        if (days >= 1) return "Expires in " + days + "d " + Math.floor((seconds % 86400) / 3600) + "h";
        var hours = Math.floor(seconds / 3600);
        if (hours >= 1) return "Expires in " + hours + "h " + Math.floor((seconds % 3600) / 60) + "m";
        var minutes = Math.floor(seconds / 60);
        var remainder = seconds % 60;
        if (minutes >= 1) return "Expires in " + minutes + "m " + remainder + "s";
        return "Expires in " + remainder + "s";
      }

      function formatDuration(seconds) {
        var value = Math.max(1, Number(seconds || 0));
        if (value % 86400 === 0) return (value / 86400) + (value === 86400 ? " day" : " days");
        if (value % 3600 === 0) return (value / 3600) + (value === 3600 ? " hour" : " hours");
        if (value % 60 === 0) return (value / 60) + (value === 60 ? " minute" : " minutes");
        return value + " seconds";
      }

      function formatDate(value) {
        var date = new Date(Number(value || 0));
        return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
      }

      function updateCounters() {
        el.titleCounter.textContent = el.shareTitle.value.length + " / " + APP.maxTitleLength;
        el.textCounter.textContent = el.shareText.value.length.toLocaleString() + " / " + APP.maxTextLength.toLocaleString();
      }

      function resetCreateForm() {
        el.createForm.reset();
        el.pinFieldWrap.classList.add("hidden");
        el.sharePin.type = "password";
        updateCounters();
      }

      function upsertLocalItem(item, optimistic) {
        state.items = state.items.filter(function (entry) { return entry.id !== item.id; });
        state.items.unshift(item);
        if (optimistic) {
          state.optimisticItems[item.id] = { item: item, addedAt: Date.now() };
        }
      }

      function reconcileLocalItems(remoteItems) {
        var now = Date.now();
        var merged = [];
        var seen = Object.create(null);

        remoteItems.forEach(function (item) {
          if (!item || !item.id || Number(item.expiresAt) <= now || seen[item.id]) return;
          if (!item.source) item.source = getDeleteToken(item.id) ? "mine" : "received";
          if (!item.addedAt) item.addedAt = item.createdAt;
          seen[item.id] = true;
          merged.push(item);
          if (state.optimisticItems[item.id]) delete state.optimisticItems[item.id];
        });

        Object.keys(state.optimisticItems).forEach(function (itemId) {
          var pending = state.optimisticItems[itemId];
          if (!pending || !pending.item || Number(pending.item.expiresAt) <= now) {
            delete state.optimisticItems[itemId];
            return;
          }
          if (!seen[itemId]) {
            seen[itemId] = true;
            merged.push(pending.item);
          }
        });

        merged.sort(function (a, b) { return Number(b.addedAt || b.createdAt) - Number(a.addedAt || a.createdAt); });
        return merged.slice(0, APP.maxLocalItems || 50);
      }

      function renderLinkedText(container, value) {
        var text = String(value || "");
        var linkPattern = /(?:https?|ftp):\/\/[^\s<>"']+|\/\/[^\s<>"']+|www\.[^\s<>"']+|mailto:[^\s<>"']+|(?:tel|sms):\+?[0-9][0-9(). -]{5,}?[0-9](?=\s+(?:[a-z]|(?:\d{1,3}\.){3}\d)|[.,!?;:]?(?:\s|$))|[a-z0-9.!#$%&'*+/=?^_{|}~-]+@(?:[a-z0-9-]+\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})|(?:localhost|(?:\d{1,3}\.){3}\d{1,3})(?::\d{1,5})?(?:[/?#][^\s<>"']*)?|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})(?::\d{1,5})?(?:[/?#][^\s<>"']*)?/gi;
        var lastIndex = 0;
        var match;

        container.textContent = "";
        while ((match = linkPattern.exec(text)) !== null) {
          if (match.index > lastIndex) {
            container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
          }

          var rawUrl = match[0];
          var trimmed = trimLinkPunctuation(rawUrl);
          rawUrl = trimmed.url;

          var safeHref = toSafeLinkHref(rawUrl);
          if (rawUrl && safeHref) {
            var link = document.createElement("a");
            link.href = safeHref;
            link.target = "_blank";
            link.rel = "noopener noreferrer nofollow";
            link.textContent = rawUrl;
            link.title = "Open link in a new tab";
            container.appendChild(link);
          } else if (rawUrl) {
            container.appendChild(document.createTextNode(rawUrl));
          }
          if (trimmed.trailing) {
            container.appendChild(document.createTextNode(trimmed.trailing));
          }
          lastIndex = match.index + match[0].length;
        }

        if (lastIndex < text.length) {
          container.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
      }

      function trimLinkPunctuation(value) {
        var url = String(value || "");
        var trailing = "";
        var pairs = { ")": "(", "]": "[", "}": "{" };

        while (/[.,!?;:]$/.test(url)) {
          trailing = url.slice(-1) + trailing;
          url = url.slice(0, -1);
        }

        while (/[)\]}]$/.test(url)) {
          var closer = url.slice(-1);
          var opener = pairs[closer];
          var openCount = url.split(opener).length - 1;
          var closeCount = url.split(closer).length - 1;
          if (closeCount <= openCount) break;
          trailing = closer + trailing;
          url = url.slice(0, -1);
        }

        return { url: url, trailing: trailing };
      }

      function toSafeLinkHref(value) {
        var raw = String(value || "").trim();
        if (!raw) return "";

        if (/^mailto:/i.test(raw)) {
          return isEmailAddress(raw.slice(7)) ? raw : "";
        }
        if (/^tel:/i.test(raw)) {
          return /^tel:\+?[0-9][0-9(). -]{5,}[0-9]$/i.test(raw) ? raw : "";
        }
        if (/^sms:/i.test(raw)) {
          return /^sms:\+?[0-9][0-9(). -]{5,}[0-9]$/i.test(raw) ? raw : "";
        }
        if (isEmailAddress(raw)) return "mailto:" + raw;

        var href = raw;
        if (/^\/\//.test(raw)) {
          href = (window.location.protocol === "http:" ? "http:" : "https:") + raw;
        } else if (/^www\./i.test(raw)) {
          href = "https://" + raw;
        } else if (/^(?:localhost|(?:\d{1,3}\.){3}\d{1,3})(?::\d{1,5})?(?:[/?#]|$)/i.test(raw)) {
          href = "http://" + raw;
        } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
          href = "https://" + raw;
        }

        try {
          var parsed = new URL(href);
          if (!/^(?:https?:|ftp:)$/i.test(parsed.protocol)) return "";
          if (!parsed.hostname) return "";

          if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(parsed.hostname)) {
            var parts = parsed.hostname.split(".");
            if (parts.some(function (part) { return Number(part) > 255; })) return "";
          }
          return parsed.href;
        } catch (error) {
          return "";
        }
      }

      function isEmailAddress(value) {
        return /^[a-z0-9.!#$%&'*+/=?^_{|}~-]+@(?:[a-z0-9-]+\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(String(value || ""));
      }

      function normalizeCode(value) {
        return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
      }

      var SECTION_TO_TAB = {
        "create-card": "share",
        "notes-section": "available",
        "join-card": "open-code",
        "files-card": "files"
      };
      var MAIN_TAB_NAMES = ["share", "available", "open-code", "files"];

      function switchTab(name) {
        if (MAIN_TAB_NAMES.indexOf(name) === -1) name = "share";
        el.tabPanels.forEach(function (panel) {
          panel.classList.toggle("tab-hidden", panel.getAttribute("data-tab-panel") !== name);
        });
        el.mainTabs.forEach(function (tab) {
          var active = tab.getAttribute("data-tab") === name;
          tab.classList.toggle("active", active);
          tab.setAttribute("aria-current", active ? "true" : "false");
        });
      }

      function focusSection(sectionId, inputId) {
        var tab = SECTION_TO_TAB[sectionId];
        if (tab) switchTab(tab);
        var section = document.getElementById(sectionId);
        var input = document.getElementById(inputId);
        if (section) {
          window.setTimeout(function () {
            section.scrollIntoView({ behavior: "smooth", block: "center" });
          }, tab ? 30 : 0);
        }
        if (input) window.setTimeout(function () { input.focus(); }, 500);
      }

      function fieldError(field, message) {
        toast(message, "error");
        field.focus();
        field.classList.add("border-red-500/70", "ring-2", "ring-red-500/10");
        window.setTimeout(function () {
          field.classList.remove("border-red-500/70", "ring-2", "ring-red-500/10");
        }, 1800);
      }

      function setButtonLoading(button, loading, label) {
        button.disabled = loading;
        var labelNode = button.querySelector("[data-button-label]");
        var icon = button.querySelector("[data-button-icon]");
        if (labelNode) labelNode.textContent = label;
        if (icon) icon.classList.toggle("animate-pulse", loading);
      }

      function togglePassword(input) {
        input.type = input.type === "password" ? "text" : "password";
        input.focus();
      }

      async function copyText(value, successMessage) {
        if (!value) return toast("Nothing to copy.", "error");
        try {
          await navigator.clipboard.writeText(String(value));
          toast(successMessage || "Copied.", "success");
        } catch (error) {
          var temp = document.createElement("textarea");
          temp.value = String(value);
          temp.style.position = "fixed";
          temp.style.opacity = "0";
          document.body.appendChild(temp);
          temp.select();
          document.execCommand("copy");
          temp.remove();
          toast(successMessage || "Copied.", "success");
        }
      }

      function toast(message, type) {
        var container = document.getElementById("toast-container");
        var item = document.createElement("div");
        var isError = type === "error";
        item.className = "toast-enter pointer-events-auto flex items-start gap-3 rounded-md border p-3 shadow-2xl " + (isError
          ? "border-red-500/25 bg-[#2a1b1b] text-red-100"
          : "border-violet-500/25 bg-[#242033] text-violet-100");

        var dot = document.createElement("span");
        dot.className = "mt-1 h-2.5 w-2.5 shrink-0 rounded-full " + (isError ? "bg-red-400" : "bg-violet-400");
        var text = document.createElement("p");
        text.className = "flex-1 text-sm leading-6";
        text.textContent = message;
        var close = document.createElement("button");
        close.type = "button";
        close.className = "text-current opacity-50 transition hover:opacity-100";
        close.textContent = "×";
        close.addEventListener("click", function () { item.remove(); });

        item.appendChild(dot);
        item.appendChild(text);
        item.appendChild(close);
        container.appendChild(item);
        window.setTimeout(function () { item.remove(); }, 4500);
      }

      function ownerTokenMap() {
        try {
          var parsed = JSON.parse(localStorage.getItem("airtext_owner_tokens") || "{}");
          return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
          return {};
        }
      }

      function saveDeleteToken(itemId, token) {
        var map = ownerTokenMap();
        map[itemId] = token;
        localStorage.setItem("airtext_owner_tokens", JSON.stringify(map));
      }

      function getDeleteToken(itemId) {
        return ownerTokenMap()[itemId] || "";
      }

      function removeDeleteToken(itemId) {
        var map = ownerTokenMap();
        delete map[itemId];
        localStorage.setItem("airtext_owner_tokens", JSON.stringify(map));
      }

      function lockBodyScroll() {
        document.documentElement.classList.add("overflow-hidden");
      }

      function unlockBodyScrollIfClear() {
        var anyOpen = [el.itemModal, el.fileModal, el.qrModal, el.scannerModal].some(function (modal) {
          return !modal.classList.contains("hidden");
        });
        if (el.drawer && el.drawer.classList.contains("open")) anyOpen = true;
        if (!anyOpen) document.documentElement.classList.remove("overflow-hidden");
      }
    })();
